"""Tests for rating discrimination + degenerate calibrator."""

from __future__ import annotations

import numpy as np

from models.ratings.discrimination import scores_discriminate, team_summary_discriminates
from models.ratings.scale import GlpmCalibrator
import pandas as pd


def test_calibrator_degenerate_maps_to_average_band():
    cal = GlpmCalibrator().fit([1.0, 1.0, 1.0, 1.0])
    out = cal.transform([1.0, 1.0])
    assert np.allclose(out, [60.0, 60.0])


def test_scores_discriminate():
    assert scores_discriminate([50.0, 70.0, 90.0]) is True
    assert scores_discriminate([92.9, 92.9, 92.9]) is False


def test_team_summary_discriminates():
    ok = pd.DataFrame({"rating_attack": [40.0, 60.0, 80.0]})
    flat = pd.DataFrame({"rating_attack": [92.9, 92.9, 92.9]})
    assert team_summary_discriminates(ok, "rating_attack") is True
    assert team_summary_discriminates(flat, "rating_attack") is False
