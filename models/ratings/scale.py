"""
Universal GLPM Rating Scale calibration (Chapter 3.15).

Maps latent model scores onto the 0–100 GLPM scale using empirical percentile
bands defined in Section 3.15.3.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

import numpy as np

# Percentile breakpoints (ascending) → target score midpoints / edges.
# Top 5% → 90–100 Elite; 80–95% → 80–89 Excellent; … Bottom 5% → <40 Very Poor.
PERCENTILE_EDGES = np.array([0.0, 5.0, 20.0, 40.0, 60.0, 80.0, 95.0, 100.0])
SCORE_EDGES = np.array([20.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0])

BAND_LABELS = (
    (90.0, "Elite"),
    (80.0, "Excellent"),
    (70.0, "Strong"),
    (60.0, "Average"),
    (50.0, "Below Average"),
    (40.0, "Poor"),
    (0.0, "Very Poor"),
)


def classify_rating(score: float) -> str:
    for threshold, label in BAND_LABELS:
        if score >= threshold:
            return label
    return "Very Poor"


@dataclass
class GlpmCalibrator:
    """Fit empirical CDF knots and map latent scores → GLPM 0–100."""

    reference_scores: np.ndarray = field(default_factory=lambda: np.array([]))
    version: str = "v1"

    def fit(self, scores: Sequence[float] | np.ndarray) -> "GlpmCalibrator":
        arr = np.asarray(list(scores), dtype=float)
        arr = arr[np.isfinite(arr)]
        if arr.size == 0:
            raise ValueError("Cannot fit calibrator on empty score set")
        self.reference_scores = np.sort(arr)
        return self

    def percentile_of(self, score: float) -> float:
        if self.reference_scores.size == 0:
            raise RuntimeError("Calibrator is not fitted")
        # Empirical CDF percentile in [0, 100]
        return float(np.searchsorted(self.reference_scores, score, side="right")) / float(
            self.reference_scores.size
        ) * 100.0

    def transform_one(self, score: float) -> float:
        pct = self.percentile_of(score)
        # Piecewise-linear map from percentile → GLPM score edges
        return float(np.interp(pct, PERCENTILE_EDGES, SCORE_EDGES))

    def transform(self, scores: Sequence[float] | np.ndarray) -> np.ndarray:
        return np.asarray([self.transform_one(float(s)) for s in scores], dtype=float)

    def fit_transform(self, scores: Sequence[float] | np.ndarray) -> np.ndarray:
        self.fit(scores)
        return self.transform(scores)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "reference_scores": self.reference_scores.tolist(),
            "percentile_edges": PERCENTILE_EDGES.tolist(),
            "score_edges": SCORE_EDGES.tolist(),
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "GlpmCalibrator":
        cal = cls(version=str(payload.get("version", "v1")))
        cal.reference_scores = np.asarray(payload["reference_scores"], dtype=float)
        return cal

    def save(self, path: Path | str) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path | str) -> "GlpmCalibrator":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls.from_dict(payload)
