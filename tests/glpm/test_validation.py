"""Unit tests for GLPM validation metrics and matchweek backtesting (Chapter 13)."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.vector import PRIMARY_ORDER, RatingMetadata, RatingVector
from core.validation import (
    OUTLIER_BRIER_1X2,
    OUTLIER_FAVORITE_P,
    OUTLIER_SCORELINE_LL,
    OUTLIER_XG_ABS,
    brier_1x2,
    brier_binary,
    build_validation_log_rows,
    detect_outliers,
    log_loss_1x2,
    log_loss_binary,
    log_loss_scoreline,
    mae,
    mean_error,
    rating_stability_index,
    reliability_diagram,
    rmse,
    run_matchweek_backtest,
    variance_progression,
)
from engine.predictions import build_score_matrix


def test_brier_perfect_prediction() -> None:
    assert brier_1x2(1.0, 0.0, 0.0, "home") == pytest.approx(0.0)
    assert brier_binary(1.0, 1.0) == pytest.approx(0.0)
    assert brier_binary(0.0, 0.0) == pytest.approx(0.0)


def test_brier_worst_wrong() -> None:
    # p=(0,0,1) on home win → (0-1)²+(0-0)²+(1-0)² = 2
    assert brier_1x2(0.0, 0.0, 1.0, "home") == pytest.approx(2.0)
    assert brier_binary(1.0, 0.0) == pytest.approx(1.0)


def test_log_loss_perfect_and_clamped() -> None:
    assert log_loss_1x2(1.0, 0.0, 0.0, "home") == pytest.approx(0.0, abs=1e-6)
    # Near-zero wrong probability is heavily penalised but finite
    ll = log_loss_1x2(1e-12, 0.5, 0.5, "home")
    assert math.isfinite(ll)
    assert ll > 10.0
    assert log_loss_binary(0.8, 1.0) == pytest.approx(-math.log(0.8), rel=1e-9)


def test_xg_mae_rmse_on_fixture_batch() -> None:
    preds = [1.5, 1.2, 2.0]
    actuals = [2.0, 0.0, 2.0]
    assert mae(preds, actuals) == pytest.approx((0.5 + 1.2 + 0.0) / 3.0)
    assert rmse(preds, actuals) == pytest.approx(
        math.sqrt((0.25 + 1.44 + 0.0) / 3.0)
    )
    assert mean_error(preds, actuals) == pytest.approx((-0.5 + 1.2 + 0.0) / 3.0)


def test_log_loss_scoreline_matches_matrix() -> None:
    matrix = build_score_matrix(1.5, 1.2)
    p = float(matrix[2, 1])
    assert log_loss_scoreline(matrix, 2, 1) == pytest.approx(-math.log(p), rel=1e-9)


def test_reliability_bins_monotonic_on_calibrated_data() -> None:
    rng = np.random.default_rng(7)
    probs = np.concatenate(
        [
            rng.uniform(0.05, 0.25, 200),
            rng.uniform(0.35, 0.55, 200),
            rng.uniform(0.70, 0.90, 200),
        ]
    )
    # Sample outcomes from the predicted probabilities (well-calibrated)
    outcomes = (rng.random(len(probs)) < probs).astype(float)
    bins = reliability_diagram(probs.tolist(), outcomes.tolist(), n_bins=5)
    occupied = [b for b in bins if b.count >= 20]
    assert len(occupied) >= 2
    # Higher predicted bin → higher empirical rate (weak monotonicity)
    for a, b in zip(occupied, occupied[1:]):
        assert b.predicted_mean >= a.predicted_mean - 1e-9
        # Allow sampling noise but expect overall upward trend across ends
    assert occupied[-1].empirical_freq > occupied[0].empirical_freq


def test_rating_stability_and_variance_progression() -> None:
    def _vec(tid: int, as_of: str, attack: float, var: float) -> RatingVector:
        ratings = {k: 60.0 for k in PRIMARY_ORDER}
        ratings["attack"] = attack
        meta = {
            k: RatingMetadata(current_value=ratings[k], variance=var, matches_used=5)
            for k in PRIMARY_ORDER
        }
        return RatingVector.from_mapping(
            team_sm_id=tid,
            season_id=1,
            as_of_date=as_of,
            ratings=ratings,
            metadata=meta,
        )

    prev = [_vec(1, "2025-01-01", 70.0, 10.0), _vec(2, "2025-01-01", 65.0, 12.0)]
    curr = [_vec(1, "2025-01-08", 72.0, 8.0), _vec(2, "2025-01-08", 64.0, 9.0)]
    stab = rating_stability_index(prev, curr)
    assert 0.0 <= stab["overall"] <= 1.0
    assert stab["attack"] < 1.0  # some movement

    series = variance_progression(
        [
            (1, prev),
            (2, curr),
        ]
    )
    assert len(series["attack"]) == 2
    assert series["attack"][0]["mean_variance"] == pytest.approx(11.0)
    assert series["attack"][1]["mean_variance"] == pytest.approx(8.5)


def test_outlier_favorite_loss_and_xg() -> None:
    flags = detect_outliers(
        p_home=0.70,
        p_draw=0.20,
        p_away=0.10,
        outcome="away",
        home_xg_pred=2.0,
        away_xg_pred=0.8,
        home_xg_actual=0.3,
        away_xg_actual=0.9,
        scoreline_ll=1.0,
        brier=0.5,
        home_score=0,
        away_score=2,
    )
    codes = {f.rule_code for f in flags}
    assert "OUTLIER_FAVORITE_LOSS" in codes
    assert "OUTLIER_XG_ABS" in codes

    quiet = detect_outliers(
        p_home=0.40,
        p_draw=0.30,
        p_away=0.30,
        outcome="home",
        home_xg_pred=1.4,
        away_xg_pred=1.2,
        home_xg_actual=1.3,
        away_xg_actual=1.1,
        scoreline_ll=1.0,
        brier=0.2,
        home_score=2,
        away_score=1,
    )
    assert quiet == []


def test_outlier_scoreline_and_brier_thresholds() -> None:
    flags = detect_outliers(
        p_home=0.5,
        p_draw=0.3,
        p_away=0.2,
        outcome="draw",
        home_xg_pred=1.0,
        away_xg_pred=1.0,
        home_xg_actual=1.0,
        away_xg_actual=1.0,
        scoreline_ll=OUTLIER_SCORELINE_LL,
        brier=OUTLIER_BRIER_1X2,
        home_score=1,
        away_score=1,
    )
    codes = {f.rule_code for f in flags}
    assert "OUTLIER_SCORELINE_LL" in codes
    assert "OUTLIER_BRIER_1X2" in codes
    assert OUTLIER_FAVORITE_P == 0.65
    assert OUTLIER_XG_ABS == 1.5


def _primary_rows(
    *,
    team_sm_id: int,
    season_id: int,
    as_of_date: str,
    base: float,
    matches_used: int = 5,
) -> list[dict]:
    rows = []
    for i, key in enumerate(PRIMARY_ORDER):
        rows.append(
            {
                "team_sm_id": team_sm_id,
                "season_id": season_id,
                "rating_type": key,
                "as_of_date": as_of_date,
                "rating": base + i * 0.5,
                "confidence": 0.8,
                "variance": 10.0 - i,
                "matches_used": matches_used,
                "recent_trend": "flat",
                "trend_delta": 0.0,
                "historical_peak": base + 5,
                "historical_low": base - 5,
            }
        )
    return rows


def test_synthetic_matchweek_backtest_smoke_no_leakage() -> None:
    """4 teams × 3 matchweeks; ratings dated strictly before each fixture."""
    season_id = 99
    teams = [1, 2, 3, 4]
    # Ratings evolve weekly; always dated the day before the weekend fixtures
    primary_rows: list[dict] = []
    for week, as_of in enumerate(["2025-08-10", "2025-08-17", "2025-08-24"], start=1):
        for tid in teams:
            primary_rows.extend(
                _primary_rows(
                    team_sm_id=tid,
                    season_id=season_id,
                    as_of_date=as_of,
                    base=55.0 + tid + week,
                    matches_used=3 + week,
                )
            )
    primaries = pd.DataFrame(primary_rows)

    matches = pd.DataFrame(
        [
            # GW1 — 2025-08-11
            {
                "sm_id": 1001,
                "season_id": season_id,
                "gameweek": 1,
                "match_date": "2025-08-11",
                "kickoff_at": "2025-08-11T15:00:00Z",
                "home_team_sm_id": 1,
                "away_team_sm_id": 2,
                "home_score": 2,
                "away_score": 1,
                "status": "FT",
            },
            {
                "sm_id": 1002,
                "season_id": season_id,
                "gameweek": 1,
                "match_date": "2025-08-11",
                "kickoff_at": "2025-08-11T17:00:00Z",
                "home_team_sm_id": 3,
                "away_team_sm_id": 4,
                "home_score": 0,
                "away_score": 0,
                "status": "FT",
            },
            # GW2 — 2025-08-18
            {
                "sm_id": 1003,
                "season_id": season_id,
                "gameweek": 2,
                "match_date": "2025-08-18",
                "kickoff_at": "2025-08-18T15:00:00Z",
                "home_team_sm_id": 1,
                "away_team_sm_id": 3,
                "home_score": 1,
                "away_score": 2,
                "status": "FT",
            },
            {
                "sm_id": 1004,
                "season_id": season_id,
                "gameweek": 2,
                "match_date": "2025-08-18",
                "kickoff_at": "2025-08-18T17:00:00Z",
                "home_team_sm_id": 2,
                "away_team_sm_id": 4,
                "home_score": 3,
                "away_score": 1,
                "status": "FT",
            },
            # GW3 — 2025-08-25
            {
                "sm_id": 1005,
                "season_id": season_id,
                "gameweek": 3,
                "match_date": "2025-08-25",
                "kickoff_at": "2025-08-25T15:00:00Z",
                "home_team_sm_id": 4,
                "away_team_sm_id": 1,
                "home_score": 1,
                "away_score": 1,
                "status": "FT",
            },
            {
                "sm_id": 1006,
                "season_id": season_id,
                "gameweek": 3,
                "match_date": "2025-08-25",
                "kickoff_at": "2025-08-25T17:00:00Z",
                "home_team_sm_id": 2,
                "away_team_sm_id": 3,
                "home_score": 0,
                "away_score": 2,
                "status": "FT",
            },
        ]
    )

    match_xg = pd.DataFrame(
        [
            {"match_sm_id": int(sm_id), "team_sm_id": int(home), "xg": 1.4}
            for sm_id, home, _away in matches[
                ["sm_id", "home_team_sm_id", "away_team_sm_id"]
            ].values
        ]
        + [
            {"match_sm_id": int(sm_id), "team_sm_id": int(away), "xg": 1.1}
            for sm_id, _home, away in matches[
                ["sm_id", "home_team_sm_id", "away_team_sm_id"]
            ].values
        ]
    )

    report = run_matchweek_backtest(
        season_id,
        matches=matches,
        team_primaries=primaries,
        match_xg=match_xg,
        min_matches=3,
        dry_run=True,
        persist_predictions=False,
        persist_validation_logs=False,
    )

    assert report.n_fixtures == 6
    assert report.skipped == 0
    assert len(report.matchweeks) == 3
    for fx in report.fixtures:
        assert fx.as_of_date < fx.match_date
        assert fx.brier_1x2 >= 0.0
        assert math.isfinite(fx.log_loss_1x2)

    agg = report.aggregate()
    assert agg["n_fixtures"] == 6
    assert math.isfinite(agg["mae_xg"])
    assert math.isfinite(agg["brier_1x2"])

    logs = build_validation_log_rows(report)
    assert any(r["rule_code"] == "RUN_SUMMARY" for r in logs)
    assert any(r["rule_code"] == "FIXTURE_SCORE" for r in logs)
    assert all(r["layer"] == "VAL" for r in logs)
    # Stability should appear from GW2 onward
    assert report.matchweeks[1].stability
    assert "overall" in report.matchweeks[1].stability
