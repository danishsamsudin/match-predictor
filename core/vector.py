"""
GLPM Rating Vector data objects (Chapter 10.14.2).

R = [A, D, GK, BU, PO, PR, FR]^T
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal, Mapping, Optional, Sequence

import numpy as np

PrimaryKey = Literal[
    "attack",
    "defence",
    "goalkeeper",
    "build_up",
    "possession",
    "pressing",
    "finishing",
]

PRIMARY_ORDER: tuple[PrimaryKey, ...] = (
    "attack",
    "defence",
    "goalkeeper",
    "build_up",
    "possession",
    "pressing",
    "finishing",
)

# Short symbols used in docs / DB column prefixes
PRIMARY_SYMBOLS: dict[PrimaryKey, str] = {
    "attack": "A",
    "defence": "D",
    "goalkeeper": "GK",
    "build_up": "BU",
    "possession": "PO",
    "pressing": "PR",
    "finishing": "FR",
}

TrendFlag = Literal["up", "down", "flat"]

TREND_FLAT_EPS = 0.5  # rating points; smaller deltas count as flat


def _as_date_str(value: Any) -> str:
    if value is None:
        return date.today().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def classify_trend(delta: float, *, eps: float = TREND_FLAT_EPS) -> TrendFlag:
    if delta > eps:
        return "up"
    if delta < -eps:
        return "down"
    return "flat"


@dataclass
class RatingMetadata:
    """Level 4 rating metadata (Chapter 2.9)."""

    current_value: float
    confidence: float = 0.0
    matches_used: int = 0
    last_updated: Optional[str] = None
    variance: float = 0.0
    recent_trend: TrendFlag = "flat"
    trend_delta: float = 0.0
    historical_peak: Optional[float] = None
    historical_low: Optional[float] = None

    def __post_init__(self) -> None:
        self.confidence = float(np.clip(self.confidence, 0.0, 1.0))
        self.matches_used = int(max(0, self.matches_used))
        if self.historical_peak is None and np.isfinite(self.current_value):
            self.historical_peak = float(self.current_value)
        if self.historical_low is None and np.isfinite(self.current_value):
            self.historical_low = float(self.current_value)

    @classmethod
    def missing(cls) -> RatingMetadata:
        return cls(
            current_value=float("nan"),
            confidence=0.0,
            matches_used=0,
            variance=0.0,
            recent_trend="flat",
            trend_delta=0.0,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "current_value": None
            if not np.isfinite(self.current_value)
            else round(float(self.current_value), 4),
            "confidence": round(float(self.confidence), 5),
            "matches_used": int(self.matches_used),
            "last_updated": self.last_updated,
            "variance": round(float(self.variance), 6),
            "recent_trend": self.recent_trend,
            "trend_delta": round(float(self.trend_delta), 4),
            "historical_peak": None
            if self.historical_peak is None
            else round(float(self.historical_peak), 2),
            "historical_low": None
            if self.historical_low is None
            else round(float(self.historical_low), 2),
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> RatingMetadata:
        value = data.get("current_value", data.get("rating", float("nan")))
        return cls(
            current_value=float(value) if value is not None else float("nan"),
            confidence=float(data.get("confidence", 0.0) or 0.0),
            matches_used=int(data.get("matches_used", 0) or 0),
            last_updated=_as_date_str(data.get("last_updated") or data.get("as_of_date"))
            if data.get("last_updated") or data.get("as_of_date")
            else None,
            variance=float(data.get("variance", 0.0) or 0.0),
            recent_trend=data.get("recent_trend", "flat") or "flat",  # type: ignore[arg-type]
            trend_delta=float(data.get("trend_delta", 0.0) or 0.0),
            historical_peak=(
                float(data["historical_peak"])
                if data.get("historical_peak") is not None
                else None
            ),
            historical_low=(
                float(data["historical_low"])
                if data.get("historical_low") is not None
                else None
            ),
        )


@dataclass
class RatingVector:
    """
    Official GLPM Rating Vector R = [A, D, GK, BU, PO, PR, FR]^T.
    """

    team_sm_id: int
    season_id: int
    as_of_date: str
    values: dict[PrimaryKey, float] = field(default_factory=dict)
    metadata: dict[PrimaryKey, RatingMetadata] = field(default_factory=dict)
    model_version: str = "vector_v1"

    def __post_init__(self) -> None:
        self.as_of_date = _as_date_str(self.as_of_date)
        for key in PRIMARY_ORDER:
            if key not in self.values:
                self.values[key] = float("nan")
            if key not in self.metadata:
                self.metadata[key] = RatingMetadata.missing()
            else:
                # Keep value and metadata current_value aligned when both present
                meta = self.metadata[key]
                if np.isfinite(self.values[key]):
                    meta.current_value = float(self.values[key])

    def get(self, key: PrimaryKey) -> float:
        return float(self.values.get(key, float("nan")))

    def to_array(self) -> np.ndarray:
        """Return R as a length-7 numpy vector in PRIMARY_ORDER."""
        return np.array([self.get(k) for k in PRIMARY_ORDER], dtype=float)

    def is_complete(self) -> bool:
        return bool(np.all(np.isfinite(self.to_array())))

    @classmethod
    def from_mapping(
        cls,
        *,
        team_sm_id: int,
        season_id: int,
        as_of_date: str,
        ratings: Mapping[str, float],
        metadata: Optional[Mapping[str, RatingMetadata | Mapping[str, Any]]] = None,
        model_version: str = "vector_v1",
    ) -> RatingVector:
        values: dict[PrimaryKey, float] = {}
        meta_out: dict[PrimaryKey, RatingMetadata] = {}
        for key in PRIMARY_ORDER:
            raw = ratings.get(key, float("nan"))
            values[key] = float(raw) if raw is not None else float("nan")
            if metadata and key in metadata:
                m = metadata[key]
                meta_out[key] = (
                    m if isinstance(m, RatingMetadata) else RatingMetadata.from_dict(m)
                )
            elif np.isfinite(values[key]):
                meta_out[key] = RatingMetadata(current_value=values[key])
            else:
                meta_out[key] = RatingMetadata.missing()
        return cls(
            team_sm_id=int(team_sm_id),
            season_id=int(season_id),
            as_of_date=as_of_date,
            values=values,
            metadata=meta_out,
            model_version=model_version,
        )

    @classmethod
    def from_array(
        cls,
        arr: Sequence[float],
        *,
        team_sm_id: int,
        season_id: int,
        as_of_date: str,
        model_version: str = "vector_v1",
    ) -> RatingVector:
        if len(arr) != len(PRIMARY_ORDER):
            raise ValueError(
                f"Rating vector must have length {len(PRIMARY_ORDER)}, got {len(arr)}"
            )
        ratings = {k: float(arr[i]) for i, k in enumerate(PRIMARY_ORDER)}
        return cls.from_mapping(
            team_sm_id=team_sm_id,
            season_id=season_id,
            as_of_date=as_of_date,
            ratings=ratings,
            model_version=model_version,
        )

    def to_db_row(self) -> dict[str, Any]:
        """Wide-table row for glpm_team_rating_vectors."""
        row: dict[str, Any] = {
            "team_sm_id": int(self.team_sm_id),
            "season_id": int(self.season_id),
            "as_of_date": self.as_of_date,
            "model_version": self.model_version,
        }
        meta_json: dict[str, Any] = {}
        for key in PRIMARY_ORDER:
            col = f"r_{key}"
            val = self.get(key)
            row[col] = None if not np.isfinite(val) else round(float(val), 2)
            meta_json[key] = self.metadata[key].to_dict()
        row["metadata"] = meta_json
        return row

    def primary_upsert_rows(self) -> list[dict[str, Any]]:
        """Long-form rows for glpm_team_primary_ratings (Level 1 + Level 4)."""
        rows: list[dict[str, Any]] = []
        for key in PRIMARY_ORDER:
            val = self.get(key)
            if not np.isfinite(val):
                continue
            meta = self.metadata[key]
            rows.append(
                {
                    "team_sm_id": int(self.team_sm_id),
                    "season_id": int(self.season_id),
                    "rating_type": key,
                    "as_of_date": self.as_of_date,
                    "rating": round(float(val), 2),
                    "confidence": round(float(meta.confidence), 5),
                    "variance": round(float(meta.variance), 6),
                    "matches_used": int(meta.matches_used),
                    "recent_trend": meta.recent_trend,
                    "trend_delta": round(float(meta.trend_delta), 4),
                    "historical_peak": (
                        None
                        if meta.historical_peak is None
                        else round(float(meta.historical_peak), 2)
                    ),
                    "historical_low": (
                        None
                        if meta.historical_low is None
                        else round(float(meta.historical_low), 2)
                    ),
                    "model_version": self.model_version,
                }
            )
        return rows
