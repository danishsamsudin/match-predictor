"""Tests for gap-aware Dixon–Coles and score-grid calibration helpers."""

from __future__ import annotations

import pytest

from engine.predictions import (
    attenuate_rho_for_expected_goal_gap,
    build_score_matrix,
    predict_match,
    resolve_effective_rho,
)
from engine.score_grid_calibration import ScoreGridParams, transform_lambdas


def test_attenuate_rho_fades_on_large_gap() -> None:
    assert attenuate_rho_for_expected_goal_gap(-0.13, 1.4, 1.35) == pytest.approx(-0.13)
    faded = attenuate_rho_for_expected_goal_gap(-0.13, 2.5, 0.8)
    assert faded == pytest.approx(0.0, abs=1e-9)


def test_effective_rho_positive_floor_on_mismatch() -> None:
    rho = resolve_effective_rho(-0.13, 2.4, 0.9)
    assert rho >= 0.06


def test_gap_scale_widens_lambda_spread() -> None:
    hx, ax = transform_lambdas(1.6, 1.2, mu=1.35, mu0=1.35, gap_scale=2.0)
    assert abs(hx - ax) == pytest.approx(0.8, abs=1e-9)


def test_calibrated_style_params_reduce_11_mode_vs_locked() -> None:
    locked = predict_match(
        1.55,
        1.35,
        config=ScoreGridParams(
            mu=1.35,
            rho=-0.13,
            attenuate_rho_for_gap=False,
            gap_positive_rho=False,
        ).prediction_config(),
    )
    calibrated = predict_match(
        1.55,
        1.35,
        config=ScoreGridParams(
            mu=1.2,
            rho=0.04,
            goal_overdispersion_k=12.0,
            attenuate_rho_for_gap=True,
            gap_positive_rho=True,
        ).prediction_config(),
    )
    # Locked should put more mass on 1-1 than the calibrated PL-style params.
    assert locked.score_matrix[1, 1] > calibrated.score_matrix[1, 1]


def test_build_score_matrix_with_nb_sums_to_one() -> None:
    matrix = build_score_matrix(
        1.7, 1.1, rho=0.0, goal_overdispersion_k=12.0, apply_effective_rho=False
    )
    assert float(matrix.sum()) == pytest.approx(1.0, abs=1e-9)
