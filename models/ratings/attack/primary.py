"""
Primary Attack Rating A_i (Chapter 3.17).

A_i = f(Creation, Progression, Situational)
Supervised on future adjusted non-penalty / open-play xG per 90.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler

from models.ratings.attack.components import LIGHTGBM_MIN_ROWS, future_rolling_mean

DOMAIN_INPUT_COLS = ("domain_creation", "domain_progression", "domain_situational")
PRIMARY_TARGET_CANDIDATES = ("npxg_p90_adj", "npxg_p90", "open_play_xg_p90", "xg")


def _make_estimator(n_rows: int) -> Any:
    if n_rows >= LIGHTGBM_MIN_ROWS:
        try:
            import lightgbm as lgb

            return lgb.LGBMRegressor(
                n_estimators=120,
                learning_rate=0.05,
                max_depth=3,
                random_state=42,
                verbosity=-1,
            )
        except ImportError:
            pass
    return BayesianRidge()


def resolve_primary_target(df: pd.DataFrame) -> str:
    for col in PRIMARY_TARGET_CANDIDATES:
        if col in df.columns and df[col].notna().any():
            return col
    raise ValueError("No primary attack target column available")


@dataclass
class PrimaryAttackModel:
    estimator: Any = None
    scaler: StandardScaler = field(default_factory=StandardScaler)
    target_col: str = "npxg_p90"
    future_window: int = 5
    fitted: bool = False
    model_version: str = "attack_v1"

    def _X(self, df: pd.DataFrame) -> np.ndarray:
        mat = df[list(DOMAIN_INPUT_COLS)].astype(float).to_numpy()
        for j in range(mat.shape[1]):
            col = mat[:, j]
            med = np.nanmedian(col) if np.isfinite(col).any() else 0.0
            col[~np.isfinite(col)] = med if np.isfinite(med) else 0.0
            mat[:, j] = col
        return mat

    def prepare_target(self, df: pd.DataFrame) -> pd.Series:
        self.target_col = resolve_primary_target(df)
        return future_rolling_mean(df, self.target_col, window=self.future_window)

    def fit(self, df: pd.DataFrame) -> "PrimaryAttackModel":
        y = self.prepare_target(df).astype(float).to_numpy()
        X = self._X(df)
        mask = np.isfinite(y)
        self.estimator = _make_estimator(int(mask.sum()))
        if mask.sum() < 3:
            y = np.nan_to_num(y, nan=0.0)
            mask = np.ones(len(y), dtype=bool)
        self.scaler.fit(X[mask])
        self.estimator.fit(self.scaler.transform(X[mask]), y[mask])
        self.fitted = True
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if not self.fitted or self.estimator is None:
            raise RuntimeError("Primary Attack model is not fitted")
        return np.asarray(
            self.estimator.predict(self.scaler.transform(self._X(df))), dtype=float
        )

    def predict_with_uncertainty(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        pred = self.predict(df)
        if isinstance(self.estimator, BayesianRidge):
            _, std = self.estimator.predict(self.scaler.transform(self._X(df)), return_std=True)
            return pred, np.asarray(std, dtype=float)
        return pred, np.full_like(pred, 0.1, dtype=float)

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        pred, std = self.predict_with_uncertainty(out)
        out["attack_latent"] = pred
        out["attack_latent_std"] = std
        # Confidence rises with sample size and falls with predictive std
        n_by_team = out.groupby("team_sm_id")["match_sm_id"].transform("count").astype(float)
        conf = 1.0 / (1.0 + std) * np.clip(n_by_team / 20.0, 0.2, 1.0)
        out["attack_confidence"] = conf
        out["attack_variance"] = std ** 2
        return out

    def fit_score(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.score(df)
