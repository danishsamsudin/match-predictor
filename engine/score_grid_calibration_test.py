"""Unit tests for margin-first score-grid metrics (no DB)."""

from __future__ import annotations

from datetime import date

from engine.predictions import predict_match
from engine.score_grid_calibration import (
    CachedFixture,
    ScoreGridParams,
    _asian_home_cover_prob,
    _european_handicap_probs,
    _margin_bucket,
    _margin_primary_objective,
    evaluate_params_on_cache,
)


def test_margin_bucket_edges():
    assert _margin_bucket(-3) == "le_m2"
    assert _margin_bucket(-1) == "m1"
    assert _margin_bucket(0) == "draw"
    assert _margin_bucket(1) == "p1"
    assert _margin_bucket(4) == "ge_p2"


def test_ah_and_eh_helpers_sum():
    pred = predict_match(1.4, 1.1)
    p_home = _asian_home_cover_prob(pred.score_matrix, -0.5)
    assert 0.0 < p_home < 1.0
    h, d, a = _european_handicap_probs(pred.score_matrix, -1)
    assert abs((h + d + a) - 1.0) < 1e-6


def test_evaluate_params_includes_margin_metrics():
    fixtures = [
        CachedFixture(
            match_sm_id=i,
            season_id=1,
            match_date=date(2026, 9, 1),
            home_score=2 if i % 2 == 0 else 1,
            away_score=1 if i % 2 == 0 else 1,
            home_xg0=1.5,
            away_xg0=1.1,
            weight=1.0,
        )
        for i in range(12)
    ]
    metrics = evaluate_params_on_cache(fixtures, ScoreGridParams())
    assert metrics["n"] == 12
    assert metrics["brier_margin"] >= 0
    assert metrics["brier_ah"] >= 0
    assert metrics["brier_eh"] >= 0
    obj = _margin_primary_objective(metrics, mode_11_penalty=0.12)
    assert obj > 0
