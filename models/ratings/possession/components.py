"""
Possession Component Rating estimators (Chapter 7).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler

from features.midfield import POSSESSION_COMPONENT_FEATURE_GROUPS
from models.ratings.attack.components import LIGHTGBM_MIN_ROWS, future_rolling_mean

COMPONENT_TARGET_MAP: dict[str, str] = {
    "possession_security": "ball_security_index_adj",
    "ball_circulation": "circulation_index_adj",
    "territorial_dominance": "field_tilt_adj",
    "space_control": "spatial_control_score_adj",
    "game_control": "match_control_index_adj",
    "possession_tempo": "pass_frequency_adj",
}

COMPONENT_NAMES = tuple(POSSESSION_COMPONENT_FEATURE_GROUPS.keys())


def _make_estimator(n_rows: int) -> Any:
    if n_rows >= LIGHTGBM_MIN_ROWS:
        try:
            import lightgbm as lgb

            return lgb.LGBMRegressor(
                n_estimators=100,
                learning_rate=0.05,
                max_depth=4,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbosity=-1,
            )
        except ImportError:
            pass
    return BayesianRidge()


@dataclass
class ComponentModel:
    name: str
    feature_cols: list[str]
    target_col: str
    estimator: Any = None
    scaler: StandardScaler = field(default_factory=StandardScaler)
    fitted: bool = False

    def _X(self, df: pd.DataFrame) -> np.ndarray:
        cols = [c for c in self.feature_cols if c in df.columns]
        mat = df[cols].astype(float).to_numpy()
        for j in range(mat.shape[1]):
            col = mat[:, j]
            med = np.nanmedian(col) if np.isfinite(col).any() else 0.0
            col[~np.isfinite(col)] = med if np.isfinite(med) else 0.0
            mat[:, j] = col
        return mat

    def fit(self, df: pd.DataFrame, y: np.ndarray) -> "ComponentModel":
        X = self._X(df)
        mask = np.isfinite(y)
        if mask.sum() < 5:
            self.estimator = BayesianRidge()
            y_fill = np.nan_to_num(y, nan=0.0)
            self.scaler.fit(X)
            self.estimator.fit(self.scaler.transform(X), y_fill)
            self.fitted = True
            return self
        self.estimator = _make_estimator(int(mask.sum()))
        Xs = self.scaler.fit_transform(X[mask])
        self.estimator.fit(Xs, y[mask])
        self.fitted = True
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if not self.fitted or self.estimator is None:
            raise RuntimeError(f"Component model {self.name} is not fitted")
        return np.asarray(self.estimator.predict(self.scaler.transform(self._X(df))), dtype=float)

    def predict_with_uncertainty(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        pred = self.predict(df)
        if isinstance(self.estimator, BayesianRidge):
            _, std = self.estimator.predict(self.scaler.transform(self._X(df)), return_std=True)
            return pred, np.asarray(std, dtype=float)
        return pred, np.full_like(pred, 0.15, dtype=float)


@dataclass
class ComponentRatingSuite:
    models: dict[str, ComponentModel] = field(default_factory=dict)
    future_window: int = 5

    def __post_init__(self) -> None:
        if not self.models:
            for name, feats in POSSESSION_COMPONENT_FEATURE_GROUPS.items():
                self.models[name] = ComponentModel(
                    name=name,
                    feature_cols=[f"{f}_adj" for f in feats],
                    target_col=COMPONENT_TARGET_MAP[name],
                )

    def prepare_targets(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for name, model in self.models.items():
            target_raw = model.target_col
            if target_raw not in out.columns:
                base = target_raw.replace("_adj", "")
                out[target_raw] = out[base] if base in out.columns else np.nan
            out[f"{name}__y"] = future_rolling_mean(out, target_raw, window=self.future_window)
        return out

    def fit(self, df: pd.DataFrame) -> "ComponentRatingSuite":
        frame = self.prepare_targets(df)
        for name, model in self.models.items():
            model.fit(frame, frame[f"{name}__y"].astype(float).to_numpy())
        return self

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for name, model in self.models.items():
            pred, std = model.predict_with_uncertainty(out)
            out[f"comp_{name}"] = pred
            out[f"comp_{name}_std"] = std
        return out

    def fit_score(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.score(df)
