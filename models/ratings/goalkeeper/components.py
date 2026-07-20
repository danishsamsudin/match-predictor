"""
Goalkeeper Component Rating estimators (Chapter 5 Part III).

Five specialised models: Shot Stopping, Area Command, Distribution, Sweeper, Penalty.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler

from features.goalkeeper import COMPONENT_FEATURE_GROUPS
from models.ratings.attack.components import LIGHTGBM_MIN_ROWS, future_rolling_mean
from models.ratings.goalkeeper.penalty import shrink_penalty_features

COMPONENT_TARGET_MAP: dict[str, str] = {
    "shot_stopping": "goals_prevented_adj",
    "area_command": "cross_claim_success_adj",
    "distribution": "pass_completion_adj",
    "sweeper": "def_actions_outside_box_p90_adj",
    "penalty": "penalty_save_pct_shrunk",
}

COMPONENT_NAMES = tuple(COMPONENT_FEATURE_GROUPS.keys())


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
        mat = df[cols].astype(float).to_numpy() if cols else np.zeros((len(df), 1))
        if mat.ndim == 1:
            mat = mat.reshape(-1, 1)
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
        X = self.scaler.transform(self._X(df))
        return np.asarray(self.estimator.predict(X), dtype=float)

    def predict_with_uncertainty(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        pred = self.predict(df)
        if isinstance(self.estimator, BayesianRidge):
            X = self.scaler.transform(self._X(df))
            _, std = self.estimator.predict(X, return_std=True)
            return pred, np.asarray(std, dtype=float)
        return pred, np.full_like(pred, 0.15, dtype=float)


@dataclass
class ComponentRatingSuite:
    models: dict[str, ComponentModel] = field(default_factory=dict)
    future_window: int = 5
    group_col: str = "player_sm_id"

    def __post_init__(self) -> None:
        if not self.models:
            for name, feats in COMPONENT_FEATURE_GROUPS.items():
                if name == "penalty":
                    # Use shrunk rates (not _adj) as features + target
                    feature_cols = [
                        "penalty_save_pct_shrunk",
                        "goals_prevented_from_penalties_shrunk",
                        "penalty_psxg_saved_rate_adj",
                    ]
                else:
                    feature_cols = [f"{f}_adj" for f in feats]
                self.models[name] = ComponentModel(
                    name=name,
                    feature_cols=feature_cols,
                    target_col=COMPONENT_TARGET_MAP[name],
                )

    def prepare_targets(self, df: pd.DataFrame) -> pd.DataFrame:
        out = shrink_penalty_features(df, group_col=self.group_col)
        # Ensure adj copies of shrunk cols when defence adjust produced raw adj
        if "penalty_save_pct_adj" in out.columns and "penalty_save_pct_shrunk" in out.columns:
            pass
        for name, model in self.models.items():
            target_raw = model.target_col
            if target_raw not in out.columns:
                base = target_raw.replace("_adj", "").replace("_shrunk", "")
                if f"{base}_shrunk" in out.columns:
                    out[target_raw] = out[f"{base}_shrunk"]
                elif base in out.columns:
                    out[target_raw] = out[base]
                else:
                    out[target_raw] = np.nan
            out[f"{name}__y"] = future_rolling_mean(
                out,
                target_raw,
                group_col=self.group_col,
                window=self.future_window,
            )
        return out

    def fit(self, df: pd.DataFrame) -> "ComponentRatingSuite":
        frame = self.prepare_targets(df)
        for name, model in self.models.items():
            y = frame[f"{name}__y"].astype(float).to_numpy()
            model.fit(frame, y)
        return self

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        out = shrink_penalty_features(df, group_col=self.group_col)
        for name, model in self.models.items():
            pred, std = model.predict_with_uncertainty(out)
            out[f"comp_{name}"] = pred
            out[f"comp_{name}_std"] = std
        return out

    def fit_score(self, df: pd.DataFrame) -> pd.DataFrame:
        self.fit(df)
        return self.score(df)
