"""Unit tests for GLPM Match Prediction Models (Chapter 12)."""

from __future__ import annotations

import pytest

from engine import PredictionConfig, PredictionResult, XgEngineResult, predict_match
from engine.predictions import (
    build_score_matrix,
    derive_1x2,
    derive_btts,
    derive_over_under,
    dixon_coles_tau,
    score_probability,
)


def test_score_matrix_is_10x10_and_sums_to_one() -> None:
    matrix = build_score_matrix(1.5, 1.2)
    assert matrix.shape == (10, 10)
    assert float(matrix.sum()) == pytest.approx(1.0, abs=1e-9)


def test_1x2_probabilities_sum_to_one() -> None:
    result = predict_match(1.6, 1.1)
    total = result.home_win + result.draw + result.away_win
    assert total == pytest.approx(1.0, abs=1e-9)


def test_higher_home_xg_raises_home_win() -> None:
    home_fav = predict_match(2.2, 0.8)
    away_fav = predict_match(0.8, 2.2)
    assert home_fav.home_win > home_fav.away_win
    assert away_fav.away_win > away_fav.home_win
    assert home_fav.home_win > away_fav.home_win


def test_negative_rho_inflates_low_score_draws_vs_rho_zero() -> None:
    hx, ax = 1.3, 1.2
    with_rho = build_score_matrix(hx, ax, rho=-0.13)
    no_rho = build_score_matrix(hx, ax, rho=0.0)

    # τ(0,0) = 1 - λh·λa·ρ → with negative ρ, 0-0 mass increases before renorm
    assert with_rho[0, 0] > no_rho[0, 0]
    assert with_rho[1, 1] > no_rho[1, 1]

    # Cells outside Dixon–Coles set keep relative Poisson shape (τ=1);
    # after renorm they differ slightly, but unnormalized raw τ is 1.
    assert dixon_coles_tau(2, 1, hx, ax, -0.13) == 1.0
    assert score_probability(2, 1, hx, ax, -0.13) == pytest.approx(
        score_probability(2, 1, hx, ax, 0.0),
        rel=1e-12,
    )


def test_over_under_and_btts_consistent_with_matrix() -> None:
    matrix = build_score_matrix(1.7, 1.4, rho=-0.13)
    ou = derive_over_under(matrix)
    btts_yes, btts_no = derive_btts(matrix)

    assert set(ou.keys()) == {"0.5", "1.5", "2.5", "3.5", "4.5"}
    for line, probs in ou.items():
        assert probs["over"] + probs["under"] == pytest.approx(1.0, abs=1e-9)

    # Recompute O/U 2.5 directly from matrix
    over_25 = sum(
        float(matrix[h, a])
        for h in range(matrix.shape[0])
        for a in range(matrix.shape[1])
        if h + a > 2.5
    )
    assert ou["2.5"]["over"] == pytest.approx(over_25, abs=1e-12)

    yes_direct = sum(
        float(matrix[h, a])
        for h in range(matrix.shape[0])
        for a in range(matrix.shape[1])
        if h > 0 and a > 0
    )
    assert btts_yes == pytest.approx(yes_direct, abs=1e-12)
    assert btts_yes + btts_no == pytest.approx(1.0, abs=1e-9)


def test_predict_match_accepts_xg_engine_result() -> None:
    xg = XgEngineResult(home_xg=1.8, away_xg=1.0)
    result = predict_match(xg)
    assert result.home_xg == 1.8
    assert result.away_xg == 1.0
    assert result.model_version == "glpm_pred_v1"


def test_to_upsert_row_includes_model_version_and_executed_at() -> None:
    result = predict_match(
        1.5,
        1.2,
        config=PredictionConfig(rho=-0.1),
        executed_at="2026-07-19T12:00:00Z",
    )
    row = result.to_upsert_row(
        match_sm_id=42,
        home_team_sm_id=1,
        away_team_sm_id=2,
        season_id=99,
    )
    assert row["model_version"] == "glpm_pred_v1"
    assert row["executed_at"] == "2026-07-19T12:00:00Z"
    assert row["match_sm_id"] == 42
    assert row["home_team_sm_id"] == 1
    assert row["away_team_sm_id"] == 2
    assert row["season_id"] == 99
    assert len(row["score_matrix"]) == 10
    assert len(row["score_matrix"][0]) == 10
    assert "2.5" in row["over_under"]
    assert "4.5" in row["over_under"]


def test_derive_1x2_matches_predict_match() -> None:
    matrix = build_score_matrix(1.4, 1.4)
    hw, d, aw = derive_1x2(matrix)
    result = predict_match(1.4, 1.4)
    assert hw == pytest.approx(result.home_win)
    assert d == pytest.approx(result.draw)
    assert aw == pytest.approx(result.away_win)


def test_prediction_result_to_dict_roundtrip_keys() -> None:
    result = predict_match(1.1, 0.9)
    data = result.to_dict()
    assert isinstance(data["score_matrix"], list)
    rebuilt = PredictionResult(
        home_xg=data["home_xg"],
        away_xg=data["away_xg"],
        score_matrix=result.score_matrix,
        home_win=data["home_win"],
        draw=data["draw"],
        away_win=data["away_win"],
        btts_yes=data["btts_yes"],
        btts_no=data["btts_no"],
        over_under=data["over_under"],
        rho=data["rho"],
        model_version=data["model_version"],
        executed_at=data["executed_at"],
    )
    assert rebuilt.home_win == result.home_win
