"""Tests for GLPM model introspection."""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(
    not (REPO_ROOT / "models/ratings/attack/artifacts/attack_models.joblib").exists(),
    reason="attack artifacts not trained locally",
)
def test_build_introspection_from_local_artifacts():
    from models.ratings.introspection import build_introspection

    result = build_introspection(
        season_id=25583,
        current_root=REPO_ROOT / "models/ratings",
        before_root=None,
    )
    assert result.summary["total_variables"] > 100
    assert result.summary["engines_trained"] >= 1
    assert any(v.engine == "xg_engine" for v in result.variables)
    assert any(v.engine == "attack" for v in result.variables)


def test_explain_weight_change_first_run():
    from models.ratings.feature_explanations import explain_weight_change

    text = explain_weight_change(
        "shots_p90_adj",
        before=None,
        after=0.42,
        layer="attack/component/chance_volume",
    )
    assert "0.4200" in text
    assert "first baseline" in text.lower() or "baseline" in text.lower()
