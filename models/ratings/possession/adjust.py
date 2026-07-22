"""
Opponent & context adjustment for Possession features (Chapter 7.8).

Scales engineered features against opposition pressing strength and subtracts
contextual effects (home, rest, congestion).

Preferred counterpart: ``pressing_rating / 50``.
Bootstrap: rolling opponent ``1/ppda`` and high-turnover intensity.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from features.context import build_context_frame, context_feature_matrix
from features.midfield import ALL_POSSESSION_FEATURES

EPS = 1e-6
DEFAULT_ROLLING_WINDOW = 5


@dataclass
class OpponentContextAdjuster:
    """Fit context offsets and apply opponent pressing-strength scaling."""

    feature_cols: Sequence[str] = field(default_factory=lambda: list(ALL_POSSESSION_FEATURES))
    rolling_window: int = DEFAULT_ROLLING_WINDOW
    context_coefs: dict[str, np.ndarray] = field(default_factory=dict)
    context_intercepts: dict[str, float] = field(default_factory=dict)
    league_press_mean: float = 1.0
    fitted: bool = False

    def _opponent_strength(self, df: pd.DataFrame) -> pd.Series:
        if "pressing_rating" in df.columns and df["pressing_rating"].notna().any():
            rating = df["pressing_rating"].astype(float)
            return (rating / 50.0).fillna(1.0).clip(lower=0.5, upper=2.0)

        work = df.copy().sort_values(["team_sm_id", "match_date"])

        # Team's own pressing intensity proxy: 1/ppda (higher = stronger press)
        ppda = work["ppda"].astype(float) if "ppda" in work.columns else pd.Series(np.nan, index=work.index)
        press_proxy = 1.0 / ppda.clip(lower=EPS)
        if "high_turnovers" in work.columns:
            ht = work["high_turnovers"].astype(float).fillna(0.0)
            press_proxy = press_proxy.fillna(0.0) + ht / 10.0

        team_press = work[["team_sm_id", "match_date"]].copy()
        team_press["press_proxy"] = press_proxy
        team_press["roll_press"] = (
            team_press.groupby("team_sm_id")["press_proxy"]
            .transform(lambda s: s.shift(1).rolling(self.rolling_window, min_periods=1).mean())
        )

        opp_lookup = (
            team_press.rename(
                columns={"team_sm_id": "opponent_team_sm_id", "roll_press": "opp_roll_press"}
            )[["opponent_team_sm_id", "match_date", "opp_roll_press"]]
            .drop_duplicates(subset=["opponent_team_sm_id", "match_date"], keep="last")
        )

        merged = work.merge(
            opp_lookup,
            on=["opponent_team_sm_id", "match_date"],
            how="left",
            validate="many_to_one",
        )
        if "opp_ppda" in merged.columns:
            opp_ppda = merged["opp_ppda"].astype(float)
            merged["opp_roll_press"] = merged["opp_roll_press"].fillna(1.0 / opp_ppda.clip(lower=EPS))

        league_mean = float(
            np.nanmean(merged["opp_roll_press"].astype(float))
            if merged["opp_roll_press"].notna().any()
            else self.league_press_mean
        )
        self.league_press_mean = league_mean if np.isfinite(league_mean) else 1.0

        raw = merged["opp_roll_press"].fillna(self.league_press_mean).astype(float)
        s_opp = (raw / max(EPS, self.league_press_mean)).clip(lower=0.5, upper=2.0)
        s_opp.index = work.index
        return s_opp.reindex(df.index).fillna(1.0)

    def fit(self, df: pd.DataFrame) -> "OpponentContextAdjuster":
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
        _ = self._opponent_strength(frame)
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.fitted:
            self.fit(df)
        frame = build_context_frame(df)
        X = context_feature_matrix(frame)
        s_opp = self._opponent_strength(frame).astype(float).clip(lower=EPS)
        frame["s_opp"] = s_opp
        out = frame.copy()
        for col in self.feature_cols:
            if col not in out.columns:
                continue
            coef = self.context_coefs.get(col, np.zeros(X.shape[1]))
            c_hat_ctx = X @ coef
            raw = out[col].astype(float)
            out[f"{col}_adj"] = (raw - c_hat_ctx) / s_opp
        return out

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.transform(df)


def adjusted_feature_names(feature_cols: Iterable[str] | None = None) -> list[str]:
    cols = list(feature_cols) if feature_cols is not None else list(ALL_POSSESSION_FEATURES)
    return [f"{c}_adj" for c in cols]
