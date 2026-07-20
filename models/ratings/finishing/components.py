"""
Finishing Component Rating estimators (Chapter 9.9–9.14).

Six specialised models map adjusted feature groups → latent component scores.
Default estimator: BayesianRidge. LightGBM used when train rows ≥ threshold.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler

from features.finishing import COMPONENT_FEATURE_GROUPS

LIGHTGBM_MIN_ROWS = 500

COMPONENT_TARGET_MAP: dict[str, str] = {
    "shot_accuracy": "shot_accuracy_pct_adj",
    "shot_technique": "close_range_finish_rate_adj",
    "finishing_efficiency": "goals_minus_xg_adj",
    "clinical_finishing": "big_chance_conversion_adj",
    "one_on_one_finishing": "one_v_one_conversion_adj",
    "pressure_finishing": "pressure_conversion_adj",
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


def future_rolling_mean(
    df: pd.DataFrame,
    value_col: str,
    *,
    group_col: str = "team_sm_id",
    date_col: str = "match_date",
    window: int = 5,
) -> pd.Series:
    """Forward-looking mean of value_col over the next ``window`` matches per team."""
    work = df.reset_index(drop=True)
    result = pd.Series(np.nan, index=work.index, dtype="Float64")
    for _, idx in work.groupby(group_col, sort=False).groups.items():
        order = work.loc[list(idx)].sort_values(date_col).index.tolist()
        vals = work.loc[order, value_col].astype(float).to_numpy()
        fut = np.full(len(vals), np.nan)
        for i in range(len(vals)):
            window_vals = vals[i + 1 : i + 1 + window]
            window_vals = window_vals[np.isfinite(window_vals)]
            if len(window_vals):
                fut[i] = float(np.mean(window_vals))
        result.loc[order] = fut
    return result


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

    def __post_init__(self) -> None:
        if not self.models:
            for name, feats in COMPONENT_FEATURE_GROUPS.items():
                adj_cols = [f"{f}_adj" for f in feats]
                self.models[name] = ComponentModel(
                    name=name,
                    feature_cols=adj_cols,
                    target_col=COMPONENT_TARGET_MAP[name],
                )

    def prepare_targets(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for name, model in self.models.items():
            target_raw = model.target_col
            if target_raw not in out.columns:
                base = target_raw.replace("_adj", "")
                if base in out.columns:
                    out[target_raw] = out[base]
                else:
                    out[target_raw] = np.nan
            out[f"{name}__y"] = future_rolling_mean(
                out, target_raw, window=self.future_window
            )
        return out

    def fit(self, df: pd.DataFrame) -> "ComponentRatingSuite":
        frame = self.prepare_targets(df)
        for name, model in self.models.items():
            y = frame[f"{name}__y"].astype(float).to_numpy()
            model.fit(frame, y)
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
