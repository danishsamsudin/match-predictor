"""
End-to-end Goalkeeper Rating pipeline (Chapter 5).

load → engineer → adjust → components → domains → primary → calibrate → persist
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from features.goalkeeper import build_goalkeeper_features
from models.ratings.goalkeeper.adjust import DefenceContextAdjuster
from models.ratings.goalkeeper.components import COMPONENT_NAMES, ComponentRatingSuite
from models.ratings.goalkeeper.domains import DOMAIN_COMPONENT_MAP, DomainRatingSuite
from models.ratings.goalkeeper.primary import PrimaryGoalkeeperModel
from models.ratings.scale import GlpmCalibrator

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "gk_v1"


@dataclass
class GoalkeeperPipelineResult:
    match_frame: pd.DataFrame
    player_summary: pd.DataFrame
    calibrators: dict[str, GlpmCalibrator] = field(default_factory=dict)
    model_version: str = MODEL_VERSION


class GoalkeeperRatingPipeline:
    def __init__(
        self,
        *,
        artifact_dir: Path | str = ARTIFACT_DIR,
        model_version: str = MODEL_VERSION,
        future_window: int = 5,
    ) -> None:
        self.artifact_dir = Path(artifact_dir)
        self.model_version = model_version
        self.adjuster = DefenceContextAdjuster()
        self.components = ComponentRatingSuite(future_window=future_window)
        self.domains = DomainRatingSuite(future_window=future_window)
        self.primary = PrimaryGoalkeeperModel(
            future_window=future_window, model_version=model_version
        )
        self.calibrators: dict[str, GlpmCalibrator] = {}

    def run_from_frames(
        self,
        player_frame: pd.DataFrame,
        *,
        shots_by_gk: Optional[dict[tuple[int, int], list[dict[str, Any]]]] = None,
        persist_artifacts: bool = True,
    ) -> GoalkeeperPipelineResult:
        if player_frame.empty:
            raise ValueError("player_frame is empty")

        feats = build_goalkeeper_features(player_frame, shots_by_gk=shots_by_gk)
        for col in (
            "defence_rating",
            "prevention_rating",
            "protection_rating",
            "control_rating",
            "xg_conceded",
            "season_id",
            "penalties_faced",
        ):
            if col in player_frame.columns and col not in feats.columns:
                feats[col] = player_frame[col].to_numpy()

        adjusted = self.adjuster.fit_transform(feats)
        if "goals_prevented" in adjusted.columns and "s_def" in adjusted.columns:
            adjusted["goals_prevented_adj"] = adjusted["goals_prevented"].astype(float) / adjusted[
                "s_def"
            ].astype(float).clip(lower=1e-6)

        scored = self.components.fit_score(adjusted)
        scored = self.domains.fit_score(scored)
        scored = self.primary.fit_score(scored)

        scored, calibrators = self._calibrate_all(scored)
        self.calibrators = calibrators

        player_summary = self._aggregate_player_ratings(scored)

        if persist_artifacts:
            self._save_artifacts(scored)

        return GoalkeeperPipelineResult(
            match_frame=scored,
            player_summary=player_summary,
            calibrators=calibrators,
            model_version=self.model_version,
        )

    def run_from_supabase(
        self,
        client,
        *,
        season_id: Optional[int] = None,
        dry_run: bool = False,
        persist_artifacts: bool = True,
    ) -> GoalkeeperPipelineResult:
        from models.ratings.goalkeeper.io import (
            load_gk_player_frame,
            load_shots_by_gk,
            upsert_goalkeeper_ratings,
        )

        player_frame = load_gk_player_frame(client, season_id=season_id)
        if player_frame.empty:
            raise ValueError("No GLPM goalkeeper player stats found for the requested season")

        match_ids = player_frame["match_sm_id"].astype(int).unique().tolist()
        shots = load_shots_by_gk(client, match_ids)

        result = self.run_from_frames(
            player_frame,
            shots_by_gk=shots,
            persist_artifacts=persist_artifacts,
        )
        upsert_goalkeeper_ratings(
            client,
            result.player_summary,
            model_version=self.model_version,
            dry_run=dry_run,
        )
        return result

    def _calibrate_all(
        self, df: pd.DataFrame
    ) -> tuple[pd.DataFrame, dict[str, GlpmCalibrator]]:
        out = df.copy()
        calibrators: dict[str, GlpmCalibrator] = {}

        for name in COMPONENT_NAMES:
            latent_col = f"comp_{name}"
            cal = GlpmCalibrator(version=self.model_version)
            scores = out[latent_col].astype(float).to_numpy()
            finite = scores[np.isfinite(scores)]
            if finite.size == 0:
                out[f"rating_comp_{name}"] = np.nan
                continue
            cal.fit(finite)
            out[f"rating_comp_{name}"] = [
                cal.transform_one(float(s)) if np.isfinite(s) else np.nan for s in scores
            ]
            calibrators[f"comp_{name}"] = cal

        for name in DOMAIN_COMPONENT_MAP:
            latent_col = f"domain_{name}"
            cal = GlpmCalibrator(version=self.model_version)
            scores = out[latent_col].astype(float).to_numpy()
            finite = scores[np.isfinite(scores)]
            if finite.size == 0:
                out[f"rating_domain_{name}"] = np.nan
                continue
            cal.fit(finite)
            out[f"rating_domain_{name}"] = [
                cal.transform_one(float(s)) if np.isfinite(s) else np.nan for s in scores
            ]
            calibrators[f"domain_{name}"] = cal

        cal = GlpmCalibrator(version=self.model_version)
        scores = out["gk_latent"].astype(float).to_numpy()
        finite = scores[np.isfinite(scores)]
        cal.fit(finite)
        out["rating_goalkeeper"] = [
            cal.transform_one(float(s)) if np.isfinite(s) else np.nan for s in scores
        ]
        calibrators["goalkeeper"] = cal
        return out, calibrators

    def _aggregate_player_ratings(self, df: pd.DataFrame) -> pd.DataFrame:
        """Latest-match calibrated ratings per goalkeeper."""
        work = df.sort_values(["player_sm_id", "match_date"]).copy()
        latest = work.groupby("player_sm_id", as_index=False).tail(1).copy()

        rows: list[dict[str, Any]] = []
        for _, row in latest.iterrows():
            player_id = int(row["player_sm_id"])
            hist = work[work["player_sm_id"] == player_id]
            rec: dict[str, Any] = {
                "player_sm_id": player_id,
                "team_sm_id": row.get("team_sm_id"),
                "season_id": row.get("season_id"),
                "as_of_date": row.get("match_date"),
                "rating_goalkeeper": float(row["rating_goalkeeper"]),
                "conf_goalkeeper": float(row.get("gk_confidence", 0.5)),
                "var_goalkeeper": float(row.get("gk_variance", 0.0)),
            }
            for name in DOMAIN_COMPONENT_MAP:
                rec[f"rating_domain_{name}"] = float(row[f"rating_domain_{name}"])
                std = hist[f"domain_{name}_std"].astype(float)
                rec[f"conf_domain_{name}"] = float(1.0 / (1.0 + std.mean()))
                rec[f"var_domain_{name}"] = float((std ** 2).mean())
            for name in COMPONENT_NAMES:
                rec[f"rating_comp_{name}"] = float(row[f"rating_comp_{name}"])
                std = hist[f"comp_{name}_std"].astype(float)
                rec[f"conf_comp_{name}"] = float(1.0 / (1.0 + std.mean()))
                rec[f"var_comp_{name}"] = float((std ** 2).mean())
            rows.append(rec)
        return pd.DataFrame(rows)

    def _save_artifacts(self, scored: pd.DataFrame) -> None:
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        for name, cal in self.calibrators.items():
            cal.save(self.artifact_dir / f"calibrator_{name}.json")
        joblib.dump(
            {
                "adjuster": self.adjuster,
                "components": self.components,
                "domains": self.domains,
                "primary": self.primary,
                "model_version": self.model_version,
            },
            self.artifact_dir / "goalkeeper_models.joblib",
        )
        scored[
            [
                c
                for c in scored.columns
                if c.startswith("rating_")
                or c in ("player_sm_id", "team_sm_id", "match_sm_id", "match_date")
            ]
        ].to_csv(self.artifact_dir / "last_scored_sample.csv", index=False)
