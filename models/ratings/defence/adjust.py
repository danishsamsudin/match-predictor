"""
Opponent & context adjustment for Defence features (Chapter 4.8).

Isolates underlying defensive ability by scaling raw engineered features against
opponent attacking strength and subtracting contextual effects (home, rest, congestion).

Until a full Attack Rating exists on the frame, opponent strength is bootstrapped
from rolling attacking proxies (xg, shots). An ``attack_rating`` column is preferred
when present.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from features.context import build_context_frame, context_feature_matrix
from features.defence import ALL_DEFENCE_FEATURES

EPS = 1e-6
DEFAULT_ROLLING_WINDOW = 5


def _attack_strength_proxy(raw: pd.Series, league_mean: float) -> pd.Series:
    """
    Higher rolling xG created ⇒ stronger attack ⇒ s_opp > 1.

    s_opp = max(eps, rolling_xg) / league_mean
    """
    numer = raw.astype(float).clip(lower=EPS)
    mean = league_mean if league_mean and np.isfinite(league_mean) else 1.0
    return numer / mean


@dataclass
class OpponentContextAdjuster:
    """Fit context offsets and apply opponent-attack-strength scaling."""

    feature_cols: Sequence[str] = field(default_factory=lambda: list(ALL_DEFENCE_FEATURES))
    rolling_window: int = DEFAULT_ROLLING_WINDOW
    context_coefs: dict[str, np.ndarray] = field(default_factory=dict)
    context_intercepts: dict[str, float] = field(default_factory=dict)
    league_att_mean: float = 1.0
    fitted: bool = False

    def _opponent_strength(self, df: pd.DataFrame) -> pd.Series:
        """Return s_opp aligned to df index (1.0 = league-average attack)."""
        if "attack_rating" in df.columns and df["attack_rating"].notna().any():
            rating = df["attack_rating"].astype(float)
            return (rating / 50.0).fillna(1.0).clip(lower=0.5, upper=2.0)

        work = df.copy()
        work = work.sort_values(["team_sm_id", "match_date"])

        # Team's own attacking creation history → used as that team's strength when opposing.
        xg_col = "xg" if "xg" in work.columns else None
        if xg_col is None:
            return pd.Series(1.0, index=df.index)

        team_att = work[["team_sm_id", "match_date", xg_col]].copy()
        team_att[xg_col] = team_att[xg_col].astype(float)
        team_att["roll_xg"] = (
            team_att.groupby("team_sm_id")[xg_col]
            .transform(lambda s: s.shift(1).rolling(self.rolling_window, min_periods=1).mean())
        )

        opp_lookup = (
            team_att.rename(
                columns={
                    "team_sm_id": "opponent_team_sm_id",
                    "roll_xg": "opp_roll_xg",
                }
            )[["opponent_team_sm_id", "match_date", "opp_roll_xg"]]
            .drop_duplicates(subset=["opponent_team_sm_id", "match_date"], keep="last")
        )

        merged = work.merge(
            opp_lookup,
            on=["opponent_team_sm_id", "match_date"],
            how="left",
            validate="many_to_one",
        )
        if "opp_xg" in merged.columns:
            merged["opp_roll_xg"] = merged["opp_roll_xg"].fillna(merged["opp_xg"])

        league_mean = float(
            np.nanmean(merged["opp_roll_xg"].astype(float))
            if merged["opp_roll_xg"].notna().any()
            else self.league_att_mean
        )
        self.league_att_mean = league_mean if np.isfinite(league_mean) else 1.0

        s_opp = _attack_strength_proxy(
            merged["opp_roll_xg"].fillna(self.league_att_mean),
            self.league_att_mean,
        )
        s_opp = s_opp.clip(lower=0.5, upper=2.0)
        s_opp.index = work.index
        return s_opp.reindex(df.index).fillna(1.0)

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

        where s_opp is opponent attacking strength (A_opp).
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
            raw = out[col].astype(float)
            c_hat_ctx = X @ coef
            adj = (raw - c_hat_ctx) / s_opp
            out[f"{col}_adj"] = adj
            _ = intercept
        return out

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.transform(df)


def adjusted_feature_names(feature_cols: Iterable[str] | None = None) -> list[str]:
    cols = list(feature_cols) if feature_cols is not None else list(ALL_DEFENCE_FEATURES)
    return [f"{c}_adj" for c in cols]
