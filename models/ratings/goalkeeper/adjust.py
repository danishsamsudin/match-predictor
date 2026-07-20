"""
Own-team Defence & context adjustment for Goalkeeper features (Chapter 5.8).

Isolates individual shot-stopping / involvement from the defensive unit in front
of the keeper by scaling engineered features against team Defence Rating:

    x_adj = (x − ĉ(home, rest, congestion)) / s_def

where s_def = clip(defence_rating / 50, 0.5, 2.0). Stronger defensive units
shrink attributed GK credit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from features.context import build_context_frame, context_feature_matrix
from features.goalkeeper import ALL_GK_FEATURES

EPS = 1e-6
DEFAULT_ROLLING_WINDOW = 5


def _defence_strength_from_xga(raw: pd.Series, league_mean: float) -> pd.Series:
    """
    Lower rolling xGA ⇒ stronger defence ⇒ s_def > 1.

    s_def = league_mean / max(eps, rolling_xga)
    """
    denom = raw.astype(float).clip(lower=EPS)
    mean = league_mean if league_mean and np.isfinite(league_mean) else 1.0
    return mean / denom


@dataclass
class DefenceContextAdjuster:
    """Fit context offsets and apply own-team defence-strength scaling."""

    feature_cols: Sequence[str] = field(default_factory=lambda: list(ALL_GK_FEATURES))
    rolling_window: int = DEFAULT_ROLLING_WINDOW
    context_coefs: dict[str, np.ndarray] = field(default_factory=dict)
    context_intercepts: dict[str, float] = field(default_factory=dict)
    league_xga_mean: float = 1.0
    fitted: bool = False

    def _defence_strength(self, df: pd.DataFrame) -> pd.Series:
        """Return s_def aligned to df index (1.0 = league-average defence)."""
        if "defence_rating" in df.columns and df["defence_rating"].notna().any():
            rating = df["defence_rating"].astype(float)
            return (rating / 50.0).fillna(1.0).clip(lower=0.5, upper=2.0)

        # Blend domain ratings when primary missing
        domain_cols = [c for c in ("prevention_rating", "protection_rating", "control_rating") if c in df.columns]
        if domain_cols:
            blend = df[domain_cols].astype(float).mean(axis=1)
            if blend.notna().any():
                return (blend / 50.0).fillna(1.0).clip(lower=0.5, upper=2.0)

        work = df.copy()
        work = work.sort_values(["team_sm_id", "match_date"])
        xga_col = "xg_conceded" if "xg_conceded" in work.columns else None
        if xga_col is None:
            return pd.Series(1.0, index=df.index)

        work["roll_xga"] = (
            work.groupby("team_sm_id")[xga_col]
            .transform(lambda s: s.shift(1).rolling(self.rolling_window, min_periods=1).mean())
        )
        league_mean = float(
            np.nanmean(work["roll_xga"].astype(float))
            if work["roll_xga"].notna().any()
            else self.league_xga_mean
        )
        self.league_xga_mean = league_mean if np.isfinite(league_mean) else 1.0
        s_def = _defence_strength_from_xga(
            work["roll_xga"].fillna(self.league_xga_mean),
            self.league_xga_mean,
        )
        s_def = s_def.clip(lower=0.5, upper=2.0)
        s_def.index = work.index
        return s_def.reindex(df.index).fillna(1.0)

    def fit(self, df: pd.DataFrame) -> "DefenceContextAdjuster":
        frame = build_context_frame(df)
        X = context_feature_matrix(frame)
        for col in self.feature_cols:
            if col not in frame.columns:
                continue
            y = frame[col].astype(float)
            mask = y.notna() & np.isfinite(X).all(axis=1)
            if mask.sum() < 5:
                self.context_coefs[col] = np.zeros(X.shape[1])
                self.context_intercepts[col] = 0.0
                continue
            model = Ridge(alpha=1.0)
            model.fit(X[mask], y[mask])
            self.context_coefs[col] = model.coef_.astype(float)
            self.context_intercepts[col] = float(model.intercept_)
        self.fitted = True
        _ = self._defence_strength(frame)
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.fitted:
            self.fit(df)

        frame = build_context_frame(df)
        X = context_feature_matrix(frame)
        s_def = self._defence_strength(frame).astype(float).clip(lower=EPS)
        frame["s_def"] = s_def

        out = frame.copy()
        for col in self.feature_cols:
            if col not in out.columns:
                continue
            coef = self.context_coefs.get(col, np.zeros(X.shape[1]))
            intercept = self.context_intercepts.get(col, 0.0)
            raw = out[col].astype(float)
            c_hat_ctx = X @ coef
            adj = (raw - c_hat_ctx) / s_def
            out[f"{col}_adj"] = adj
            _ = intercept
        return out

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.transform(df)


def adjusted_feature_names(feature_cols: Iterable[str] | None = None) -> list[str]:
    cols = list(feature_cols) if feature_cols is not None else list(ALL_GK_FEATURES)
    return [f"{c}_adj" for c in cols]
