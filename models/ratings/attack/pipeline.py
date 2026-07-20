"""
End-to-end Attack Rating pipeline (Chapter 3).

load → engineer → adjust → components → domains → primary → calibrate → persist
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from features.attack import build_attack_features
from models.ratings.attack.adjust import OpponentContextAdjuster
from models.ratings.attack.components import COMPONENT_NAMES, ComponentRatingSuite
from models.ratings.attack.domains import DOMAIN_COMPONENT_MAP, DomainRatingSuite
from models.ratings.attack.primary import PrimaryAttackModel
from models.ratings.scale import GlpmCalibrator

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "attack_v1"


@dataclass
class AttackPipelineResult:
    match_frame: pd.DataFrame
    team_summary: pd.DataFrame
    calibrators: dict[str, GlpmCalibrator] = field(default_factory=dict)
    model_version: str = MODEL_VERSION


class AttackRatingPipeline:
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
        self.primary = PrimaryAttackModel(future_window=future_window, model_version=model_version)
        self.calibrators: dict[str, GlpmCalibrator] = {}

    def run_from_frames(
        self,
        match_frame: pd.DataFrame,
        *,
        l2_frame: Optional[pd.DataFrame] = None,
        shots_by_match_team: Optional[dict[tuple[int, int], list[dict[str, Any]]]] = None,
        persist_artifacts: bool = True,
    ) -> AttackPipelineResult:
        if match_frame.empty:
            raise ValueError("match_frame is empty")

        feats = build_attack_features(
            match_frame,
            shots_by_match_team=shots_by_match_team,
            l2_frame=l2_frame,
        )
        # Carry defensive columns needed for opponent adjustment
        for col in (
            "xg_conceded",
            "shots_conceded",
            "box_entries_allowed",
            "opp_xg_conceded",
            "defence_rating",
            "season_id",
        ):
            if col in match_frame.columns and col not in feats.columns:
                feats[col] = match_frame[col].to_numpy()

        adjusted = self.adjuster.fit_transform(feats)
        # Also create npxg_p90_adj for primary target when possible
        if "npxg_p90" in adjusted.columns and "s_opp" in adjusted.columns:
            adjusted["npxg_p90_adj"] = adjusted["npxg_p90"].astype(float) / adjusted[
                "s_opp"
            ].astype(float).clip(lower=1e-6)

        scored = self.components.fit_score(adjusted)
        scored = self.domains.fit_score(scored)
        scored = self.primary.fit_score(scored)

        scored, calibrators = self._calibrate_all(scored)
        self.calibrators = calibrators

        team_summary = self._aggregate_team_ratings(scored)

        if persist_artifacts:
            self._save_artifacts(scored)

        return AttackPipelineResult(
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
    ) -> AttackPipelineResult:
        from models.ratings.attack.io import (
            load_l2_features,
            load_match_team_frame,
            load_shots_by_match_team,
            upsert_attack_ratings,
        )

        match_frame = load_match_team_frame(client, season_id=season_id)
        if match_frame.empty:
            raise ValueError("No GLPM match team stats found for the requested season")

        match_ids = match_frame["match_sm_id"].astype(int).unique().tolist()
        l2 = load_l2_features(client, match_ids)
        shots = load_shots_by_match_team(client, match_ids)

        result = self.run_from_frames(
            match_frame,
            l2_frame=l2 if not l2.empty else None,
            shots_by_match_team=shots,
            persist_artifacts=persist_artifacts,
        )
        upsert_attack_ratings(
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

        # Components
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

        # Domains
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

        # Primary
        cal = GlpmCalibrator(version=self.model_version)
        scores = out["attack_latent"].astype(float).to_numpy()
        finite = scores[np.isfinite(scores)]
        cal.fit(finite)
        out["rating_attack"] = [
            cal.transform_one(float(s)) if np.isfinite(s) else np.nan for s in scores
        ]
        calibrators["attack"] = cal
        return out, calibrators

    def _aggregate_team_ratings(self, df: pd.DataFrame) -> pd.DataFrame:
        """Latest-match calibrated ratings per team (as-of most recent match_date)."""
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
                "rating_attack": float(row["rating_attack"]),
                "conf_attack": float(row.get("attack_confidence", 0.5)),
                "var_attack": float(row.get("attack_variance", 0.0)),
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
            self.artifact_dir / "attack_models.joblib",
        )
        # Lightweight summary for inspection
        scored[
            [
                c
                for c in scored.columns
                if c.startswith("rating_") or c in ("team_sm_id", "match_sm_id", "match_date")
            ]
        ].to_csv(self.artifact_dir / "last_scored_sample.csv", index=False)
