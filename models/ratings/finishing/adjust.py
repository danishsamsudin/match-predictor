"""
Opponent & context adjustment for Finishing features (Chapter 9.8).

Isolates underlying finishing ability by scaling raw engineered features against
opponent defensive + goalkeeper strength and subtracting contextual effects
(home, rest, congestion).

s_opp = geometric_mean(defence_rating/50, goalkeeper_rating/50), clipped to [0.5, 2.0].
When ratings are missing, bootstrap from rolling opponent xg_conceded (defence)
and goals_prevented / save-quality proxies (GK).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from features.context import build_context_frame, context_feature_matrix
from features.finishing import ALL_FINISHING_FEATURES

EPS = 1e-6
DEFAULT_ROLLING_WINDOW = 5


def _geo_mean(a: pd.Series, b: pd.Series) -> pd.Series:
    return np.sqrt(a.astype(float).clip(lower=EPS) * b.astype(float).clip(lower=EPS))


@dataclass
class OpponentContextAdjuster:
    """Fit context offsets and apply opponent Defence+GK strength scaling."""

    feature_cols: Sequence[str] = field(default_factory=lambda: list(ALL_FINISHING_FEATURES))
    rolling_window: int = DEFAULT_ROLLING_WINDOW
    context_coefs: dict[str, np.ndarray] = field(default_factory=dict)
    context_intercepts: dict[str, float] = field(default_factory=dict)
    league_def_mean: float = 1.0
    league_gk_mean: float = 0.0
    fitted: bool = False

    def _rating_strength(self, rating: pd.Series) -> pd.Series:
        return (rating.astype(float) / 50.0).fillna(1.0).clip(lower=0.5, upper=2.0)

    def _bootstrap_defence_strength(self, df: pd.DataFrame) -> pd.Series:
        """Higher s = stronger opp defence (harder to finish against)."""
        work = df.copy().sort_values(["team_sm_id", "match_date"])
        team_def = work[["team_sm_id", "match_date"]].copy()
        xgc = (
            work["xg_conceded"].astype(float)
            if "xg_conceded" in work.columns
            else pd.Series(np.nan, index=work.index)
        )
        team_def["xg_conceded"] = xgc
        team_def["roll_xg_conc"] = (
            team_def.groupby("team_sm_id")["xg_conceded"]
            .transform(lambda s: s.shift(1).rolling(self.rolling_window, min_periods=1).mean())
        )

        opp_lookup = team_def.rename(
            columns={
                "team_sm_id": "opponent_team_sm_id",
                "roll_xg_conc": "opp_roll_xg_conc",
            }
        )[["opponent_team_sm_id", "match_date", "opp_roll_xg_conc"]]

        merged = work.merge(opp_lookup, on=["opponent_team_sm_id", "match_date"], how="left")
        if "opp_xg_conceded" in merged.columns:
            merged["opp_roll_xg_conc"] = merged["opp_roll_xg_conc"].fillna(
                merged["opp_xg_conceded"]
            )

        league_mean = float(
            np.nanmean(merged["opp_roll_xg_conc"].astype(float))
            if merged["opp_roll_xg_conc"].notna().any()
            else self.league_def_mean
        )
        self.league_def_mean = league_mean if np.isfinite(league_mean) else 1.0

        # Invert: low xGA conceded ⇒ strong defence ⇒ high s
        denom = merged["opp_roll_xg_conc"].fillna(self.league_def_mean).astype(float).clip(
            lower=EPS
        )
        s_def = (self.league_def_mean / denom).clip(lower=0.5, upper=2.0)
        s_def.index = work.index
        return s_def.reindex(df.index).fillna(1.0)

    def _bootstrap_gk_strength(self, df: pd.DataFrame) -> pd.Series:
        """Higher s = stronger opp GK (goals_prevented overperformance)."""
        work = df.copy().sort_values(["team_sm_id", "match_date"])
        team_gk = work[["team_sm_id", "match_date"]].copy()
        gp = (
            work["goals_prevented"].astype(float)
            if "goals_prevented" in work.columns
            else pd.Series(np.nan, index=work.index)
        )
        team_gk["goals_prevented"] = gp
        team_gk["roll_gp"] = (
            team_gk.groupby("team_sm_id")["goals_prevented"]
            .transform(lambda s: s.shift(1).rolling(self.rolling_window, min_periods=1).mean())
        )

        opp_lookup = team_gk.rename(
            columns={
                "team_sm_id": "opponent_team_sm_id",
                "roll_gp": "opp_roll_gp",
            }
        )[["opponent_team_sm_id", "match_date", "opp_roll_gp"]]

        merged = work.merge(opp_lookup, on=["opponent_team_sm_id", "match_date"], how="left")
        if "opp_goals_prevented" in merged.columns:
            merged["opp_roll_gp"] = merged["opp_roll_gp"].fillna(merged["opp_goals_prevented"])

        league_mean = float(
            np.nanmean(merged["opp_roll_gp"].astype(float))
            if merged["opp_roll_gp"].notna().any()
            else self.league_gk_mean
        )
        self.league_gk_mean = league_mean if np.isfinite(league_mean) else 0.0

        raw = merged["opp_roll_gp"].fillna(self.league_gk_mean).astype(float)
        # Map goals_prevented around league mean → strength near 1.0
        # Positive GP (strong GK) → s > 1
        centered = raw - self.league_gk_mean
        s_gk = (1.0 + centered).clip(lower=0.5, upper=2.0)
        s_gk.index = work.index
        return s_gk.reindex(df.index).fillna(1.0)

    def _opponent_strength(self, df: pd.DataFrame) -> pd.Series:
        """Return s_opp aligned to df index (1.0 = league-average opposition)."""
        has_def = "defence_rating" in df.columns and df["defence_rating"].notna().any()
        has_gk = "goalkeeper_rating" in df.columns and df["goalkeeper_rating"].notna().any()

        if has_def:
            s_def = self._rating_strength(df["defence_rating"])
        else:
            s_def = self._bootstrap_defence_strength(df)

        if has_gk:
            s_gk = self._rating_strength(df["goalkeeper_rating"])
        else:
            s_gk = self._bootstrap_gk_strength(df)

        return _geo_mean(s_def, s_gk).clip(lower=0.5, upper=2.0)

    def fit(self, df: pd.DataFrame) -> "OpponentContextAdjuster":
        """Estimate additive context effects ĉ(home, rest, congestion) per feature."""
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
        """
        Return a copy with ``{feature}_adj`` columns:

            x_adj = (x - ĉ(context)) / max(ε, s_opp)
        """
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
            intercept = self.context_intercepts.get(col, 0.0)
            c_hat_ctx = X @ coef
            raw = out[col].astype(float)
            adj = (raw - c_hat_ctx) / s_opp
            out[f"{col}_adj"] = adj
            _ = intercept
        return out

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.transform(df)


def adjusted_feature_names(feature_cols: Iterable[str] | None = None) -> list[str]:
    cols = list(feature_cols) if feature_cols is not None else list(ALL_FINISHING_FEATURES)
    return [f"{c}_adj" for c in cols]
