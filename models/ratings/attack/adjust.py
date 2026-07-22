"""
Opponent & context adjustment for Attack features (Chapter 3.8).

Isolates underlying attacking ability by scaling raw engineered features against
opponent defensive strength and subtracting contextual effects (home, rest, congestion).

Until a full Defence Rating exists, opponent strength is bootstrapped from rolling
defensive proxies (xg_conceded, shots_conceded, box_entries_allowed). A future
``defence_rating`` column is preferred when present.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional, Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from features.attack import ALL_ATTACK_FEATURES
from features.context import build_context_frame, context_feature_matrix

EPS = 1e-6
DEFAULT_ROLLING_WINDOW = 5
LIGHTGBM_MIN_ROWS = 500  # documented threshold; adjust module stays ridge-based


def _invert_defence_proxy(raw: pd.Series, league_mean: float) -> pd.Series:
    """
    Higher xg_conceded ⇒ weaker defence ⇒ s_opp < 1 (inflate attack less harshly).
    Lower xg_conceded ⇒ stronger defence ⇒ s_opp > 1 (scale attack down).

    s_opp = league_mean / max(eps, rolling_xg_conceded)
    """
    denom = raw.astype(float).clip(lower=EPS)
    mean = league_mean if league_mean and np.isfinite(league_mean) else 1.0
    return mean / denom


@dataclass
class OpponentContextAdjuster:
    """Fit context offsets and apply opponent-strength scaling."""

    feature_cols: Sequence[str] = field(default_factory=lambda: list(ALL_ATTACK_FEATURES))
    rolling_window: int = DEFAULT_ROLLING_WINDOW
    context_coefs: dict[str, np.ndarray] = field(default_factory=dict)
    context_intercepts: dict[str, float] = field(default_factory=dict)
    league_def_mean: float = 1.0
    fitted: bool = False

    def _opponent_strength(self, df: pd.DataFrame) -> pd.Series:
        """Return s_opp aligned to df index (1.0 = league-average defence)."""
        if "defence_rating" in df.columns and df["defence_rating"].notna().any():
            # Prefer explicit defence rating when available (higher = stronger).
            # Map 0–100 scale ≈ 50 average → s_opp = rating / 50.
            rating = df["defence_rating"].astype(float)
            return (rating / 50.0).fillna(1.0).clip(lower=0.5, upper=2.0)

        # Build rolling opponent defensive weakness from match history of opponents.
        # Expect opponent_* columns already joined onto the attack frame, OR
        # compute from each team's own defensive stats as a proxy history.
        work = df.copy()
        work = work.sort_values(["team_sm_id", "match_date"])

        # Team's own defensive concession history → used as that team's strength when opposing.
        team_def = work[["team_sm_id", "match_date", "xg_conceded"]].copy()
        team_def["xg_conceded"] = team_def["xg_conceded"].astype(float)
        team_def["roll_xg_conc"] = (
            team_def.groupby("team_sm_id")["xg_conceded"]
            .transform(lambda s: s.shift(1).rolling(self.rolling_window, min_periods=1).mean())
        )

        opp_id = work["opponent_team_sm_id"]
        # Map opponent → their rolling concession mean as of this match date (approx via merge)
        opp_lookup = (
            team_def.rename(
                columns={
                    "team_sm_id": "opponent_team_sm_id",
                    "roll_xg_conc": "opp_roll_xg_conc",
                }
            )[["opponent_team_sm_id", "match_date", "opp_roll_xg_conc"]]
            # Duplicate team-date rows (e.g. remapped fixtures) would cartesian-expand
            # the merge and break index alignment below.
            .drop_duplicates(subset=["opponent_team_sm_id", "match_date"], keep="last")
        )

        merged = work.merge(
            opp_lookup,
            on=["opponent_team_sm_id", "match_date"],
            how="left",
            validate="many_to_one",
        )
        # Fallback: use contemporaneous opponent row's xg_conceded if present as opp columns
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

        s_opp = _invert_defence_proxy(
            merged["opp_roll_xg_conc"].fillna(self.league_def_mean),
            self.league_def_mean,
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
        # Warm league mean via opponent strength pass
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
            c_hat = X @ coef + intercept
            raw = out[col].astype(float)
            # Only subtract the context portion beyond intercept-free prediction of context
            # Using c_hat as full predicted contextual contribution relative to mean.
            # Simpler form matching plan: x_adj = (x - ĉ) / s_opp where ĉ is context design @ coef
            # (intercept absorbed into league baseline — subtract only X@coef for home/rest/cong)
            c_hat_ctx = X @ coef
            adj = (raw - c_hat_ctx) / s_opp
            out[f"{col}_adj"] = adj
            _ = intercept  # retained for audit / future use
        return out

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.transform(df)


def adjusted_feature_names(feature_cols: Iterable[str] | None = None) -> list[str]:
    cols = list(feature_cols) if feature_cols is not None else list(ALL_ATTACK_FEATURES)
    return [f"{c}_adj" for c in cols]
