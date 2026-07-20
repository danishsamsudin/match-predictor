"""
End-to-end Build-Up Rating pipeline (Chapter 6).

load → engineer → adjust → components → domains → primary → calibrate → persist
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from features.midfield import build_build_up_features
from models.ratings.build_up.adjust import OpponentContextAdjuster
from models.ratings.build_up.components import COMPONENT_NAMES, ComponentRatingSuite
from models.ratings.build_up.domains import DOMAIN_COMPONENT_MAP, DomainRatingSuite
from models.ratings.build_up.primary import PrimaryBuildUpModel
from models.ratings.scale import GlpmCalibrator

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "build_up_v1"


@dataclass
class BuildUpPipelineResult:
    match_frame: pd.DataFrame
    team_summary: pd.DataFrame
    calibrators: dict[str, GlpmCalibrator] = field(default_factory=dict)
    model_version: str = MODEL_VERSION


class BuildUpRatingPipeline:
    def __init__(
        self,
        *,
        artifact_dir: Path | str = ARTIFACT_DIR,
        model_version: str = MODEL_VERSION,
        future_window: int = 5,
    ) -> None:
        self.artifact_dir = Path(artifact_dir)
        self.model_version = model_version
        self.adjuster = OpponentContextAdjuster()
        self.components = ComponentRatingSuite(future_window=future_window)
        self.domains = DomainRatingSuite(future_window=future_window)
        self.primary = PrimaryBuildUpModel(future_window=future_window, model_version=model_version)
        self.calibrators: dict[str, GlpmCalibrator] = {}

    def run_from_frames(
        self,
        match_frame: pd.DataFrame,
        *,
        l2_frame: Optional[pd.DataFrame] = None,
        persist_artifacts: bool = True,
    ) -> BuildUpPipelineResult:
        if match_frame.empty:
            raise ValueError("match_frame is empty")

        feats = build_build_up_features(match_frame, l2_frame=l2_frame)
        for col in (
            "ppda",
            "high_turnovers",
            "opp_ppda",
            "opp_high_turnovers",
            "pressing_rating",
            "season_id",
        ):
            if col in match_frame.columns and col not in feats.columns:
                feats[col] = match_frame[col].to_numpy()

        adjusted = self.adjuster.fit_transform(feats)
        if "final_third_entry_rate" in adjusted.columns and "s_opp" in adjusted.columns:
            adjusted["final_third_entry_rate_adj"] = adjusted["final_third_entry_rate"].astype(
                float
            ) / adjusted["s_opp"].astype(float).clip(lower=1e-6)

        scored = self.components.fit_score(adjusted)
        scored = self.domains.fit_score(scored)
        scored = self.primary.fit_score(scored)

        scored, calibrators = self._calibrate_all(scored)
        self.calibrators = calibrators
        team_summary = self._aggregate_team_ratings(scored)

        if persist_artifacts:
            self._save_artifacts(scored)

        return BuildUpPipelineResult(
            match_frame=scored,
            team_summary=team_summary,
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
    ) -> BuildUpPipelineResult:
        from models.ratings.build_up.io import (
            load_l2_features,
            load_match_team_frame,
            upsert_build_up_ratings,
        )

        match_frame = load_match_team_frame(client, season_id=season_id)
        if match_frame.empty:
            raise ValueError("No GLPM match team stats found for the requested season")

        match_ids = match_frame["match_sm_id"].astype(int).unique().tolist()
        l2 = load_l2_features(client, match_ids)
        result = self.run_from_frames(
            match_frame,
            l2_frame=l2 if not l2.empty else None,
            persist_artifacts=persist_artifacts,
        )
        upsert_build_up_ratings(
            client,
            result.team_summary,
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
        scores = out["build_up_latent"].astype(float).to_numpy()
        finite = scores[np.isfinite(scores)]
        cal.fit(finite)
        out["rating_build_up"] = [
            cal.transform_one(float(s)) if np.isfinite(s) else np.nan for s in scores
        ]
        calibrators["build_up"] = cal
        return out, calibrators

    def _aggregate_team_ratings(self, df: pd.DataFrame) -> pd.DataFrame:
        work = df.sort_values(["team_sm_id", "match_date"]).copy()
        latest = work.groupby("team_sm_id", as_index=False).tail(1).copy()
        rows: list[dict[str, Any]] = []
        for _, row in latest.iterrows():
            team_id = int(row["team_sm_id"])
            team_hist = work[work["team_sm_id"] == team_id]
            rec: dict[str, Any] = {
                "team_sm_id": team_id,
                "season_id": row.get("season_id"),
                "as_of_date": row.get("match_date"),
                "rating_build_up": float(row["rating_build_up"]),
                "conf_build_up": float(row.get("build_up_confidence", 0.5)),
                "var_build_up": float(row.get("build_up_variance", 0.0)),
            }
            for name in DOMAIN_COMPONENT_MAP:
                rec[f"rating_domain_{name}"] = float(row[f"rating_domain_{name}"])
                std = team_hist[f"domain_{name}_std"].astype(float)
                rec[f"conf_domain_{name}"] = float(1.0 / (1.0 + std.mean()))
                rec[f"var_domain_{name}"] = float((std ** 2).mean())
            for name in COMPONENT_NAMES:
                rec[f"rating_comp_{name}"] = float(row[f"rating_comp_{name}"])
                std = team_hist[f"comp_{name}_std"].astype(float)
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
            self.artifact_dir / "build_up_models.joblib",
        )
        scored[
            [
                c
                for c in scored.columns
                if c.startswith("rating_") or c in ("team_sm_id", "match_sm_id", "match_date")
            ]
        ].to_csv(self.artifact_dir / "last_scored_sample.csv", index=False)
