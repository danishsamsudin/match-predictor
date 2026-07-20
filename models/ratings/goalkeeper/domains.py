"""
Goalkeeper Domain Ratings (Chapter 5 Part V).

Goal Prevention           = f(Shot Stopping, Penalty)
Goalkeeper Involvement    = f(Area Command, Distribution, Sweeper)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler

from models.ratings.attack.components import LIGHTGBM_MIN_ROWS, future_rolling_mean

DOMAIN_COMPONENT_MAP: dict[str, tuple[str, ...]] = {
    "goal_prevention": ("shot_stopping", "penalty"),
    "goalkeeper_involvement": ("area_command", "distribution", "sweeper"),
}

DOMAIN_TARGET_MAP: dict[str, str] = {
    "goal_prevention": "goals_prevented_adj",
    "goalkeeper_involvement": "pass_completion_adj",
}


def _make_estimator(n_rows: int) -> Any:
    if n_rows >= LIGHTGBM_MIN_ROWS:
        try:
            import lightgbm as lgb

            return lgb.LGBMRegressor(
                n_estimators=80,
                learning_rate=0.05,
                max_depth=3,
                random_state=42,
                verbosity=-1,
            )
        except ImportError:
            pass
    return BayesianRidge()


@dataclass
class DomainModel:
    name: str
    component_cols: list[str]
    target_col: str
    estimator: Any = None
    scaler: StandardScaler = field(default_factory=StandardScaler)
    fitted: bool = False

    def _X(self, df: pd.DataFrame) -> np.ndarray:
        mat = df[self.component_cols].astype(float).to_numpy()
        for j in range(mat.shape[1]):
            col = mat[:, j]
            med = np.nanmedian(col) if np.isfinite(col).any() else 0.0
            col[~np.isfinite(col)] = med if np.isfinite(med) else 0.0
            mat[:, j] = col
        return mat

    def fit(self, df: pd.DataFrame, y: np.ndarray) -> "DomainModel":
        X = self._X(df)
        mask = np.isfinite(y)
        self.estimator = _make_estimator(int(mask.sum()))
        if mask.sum() < 3:
            y = np.nan_to_num(y, nan=float(np.nanmean(y)) if np.isfinite(y).any() else 0.0)
            mask = np.ones(len(y), dtype=bool)
        self.scaler.fit(X[mask])
        self.estimator.fit(self.scaler.transform(X[mask]), y[mask])
        self.fitted = True
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if not self.fitted or self.estimator is None:
            raise RuntimeError(f"Domain model {self.name} is not fitted")
        return np.asarray(
            self.estimator.predict(self.scaler.transform(self._X(df))), dtype=float
        )

    def predict_with_uncertainty(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        pred = self.predict(df)
        if isinstance(self.estimator, BayesianRidge):
            _, std = self.estimator.predict(self.scaler.transform(self._X(df)), return_std=True)
            return pred, np.asarray(std, dtype=float)
        return pred, np.full_like(pred, 0.12, dtype=float)


@dataclass
class DomainRatingSuite:
    models: dict[str, DomainModel] = field(default_factory=dict)
    future_window: int = 5
    group_col: str = "player_sm_id"

    def __post_init__(self) -> None:
        if not self.models:
            for name, comps in DOMAIN_COMPONENT_MAP.items():
                self.models[name] = DomainModel(
                    name=name,
                    component_cols=[f"comp_{c}" for c in comps],
                    target_col=DOMAIN_TARGET_MAP[name],
                )

    def prepare_targets(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for name, model in self.models.items():
            col = model.target_col
            if col not in out.columns:
                base = col.replace("_adj", "")
                out[col] = out[base] if base in out.columns else np.nan
            out[f"domain_{name}__y"] = future_rolling_mean(
                out, col, group_col=self.group_col, window=self.future_window
            )
        return out

    def fit(self, df: pd.DataFrame) -> "DomainRatingSuite":
        frame = self.prepare_targets(df)
        for name, model in self.models.items():
            y = frame[f"domain_{name}__y"].astype(float).to_numpy()
            model.fit(frame, y)
        return self

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for name, model in self.models.items():
            pred, std = model.predict_with_uncertainty(out)
            out[f"domain_{name}"] = pred
            out[f"domain_{name}_std"] = std
        return out

    def fit_score(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.score(df)
