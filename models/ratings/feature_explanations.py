"""
Plain-English labels and impact descriptions for GLPM model variables.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

CONTEXT_FEATURE_NAMES = ("home_flag", "rest_days_centered", "congestion")


@dataclass(frozen=True)
class FeatureExplanation:
    label: str
    what_it_is: str
    if_increased_weight: str


# Explicit overrides for engineered stats and internal model inputs.
_OVERRIDES: dict[str, FeatureExplanation] = {
    "home_flag": FeatureExplanation(
        label="Home advantage (context)",
        what_it_is="How much playing at home inflates raw stats before opponent adjustment.",
        if_increased_weight="Home teams get more credit for the same underlying performance in this feature group.",
    ),
    "rest_days_centered": FeatureExplanation(
        label="Rest days (context)",
        what_it_is="Days since the previous match, centred on a typical weekly schedule.",
        if_increased_weight="Extra rest is treated as boosting this stat; short turnarounds penalise it.",
    ),
    "congestion": FeatureExplanation(
        label="Fixture congestion (context)",
        what_it_is="Whether the team played within four days of their last match.",
        if_increased_weight="Congested schedules are penalised more heavily for this feature.",
    ),
    "league_def_mean": FeatureExplanation(
        label="League average goals conceded (opponent scale)",
        what_it_is="Baseline defensive concession rate used to scale opponent strength.",
        if_increased_weight="Higher league scoring environments reduce how much elite defences shrink attack credit.",
    ),
    "league_att_mean": FeatureExplanation(
        label="League average xG created (opponent scale)",
        what_it_is="Baseline attacking output used to scale opponent strength for defence ratings.",
        if_increased_weight="Higher-scoring leagues make elite attacks count more against defences.",
    ),
    "league_xga_mean": FeatureExplanation(
        label="League average xGA (defence scale for GK)",
        what_it_is="Baseline concession rate used to strip team-defence credit from goalkeeper stats.",
        if_increased_weight="Keepers behind elite defences get less individual credit when this rises.",
    ),
    "mu": FeatureExplanation(
        label="Baseline goals per team (μ)",
        what_it_is="Neutral expected goals before strength gaps — locked xG engine constant.",
        if_increased_weight="Evenly matched fixtures produce higher total expected goals.",
    ),
    "strength_exponent": FeatureExplanation(
        label="Strength gap exponent (c)",
        what_it_is="How sharply rating edges convert into extra xG — locked xG engine constant.",
        if_increased_weight="Favourites are trusted more; upsets become rarer.",
    ),
    "attack_defence": FeatureExplanation(
        label="Attack vs Defence interaction weight",
        what_it_is="Share of matchup strength from chance creation vs chance prevention.",
        if_increased_weight="Attacking quality and defensive solidity drive predictions more.",
    ),
    "finishing_goalkeeper": FeatureExplanation(
        label="Finishing vs Goalkeeper interaction weight",
        what_it_is="Share of matchup strength from conversion vs shot-stopping.",
        if_increased_weight="Clinical finishers and elite keepers swing xG more.",
    ),
    "build_up_pressing": FeatureExplanation(
        label="Build-Up vs Pressing interaction weight",
        what_it_is="Share of matchup strength from progression vs press resistance.",
        if_increased_weight="Midfield build-up and pressing traps matter more for xG.",
    ),
    "possession_pressing": FeatureExplanation(
        label="Possession vs Pressing interaction weight",
        what_it_is="Share of matchup strength from ball control vs press intensity.",
        if_increased_weight="Territorial dominance and pressing duels weigh more on predictions.",
    ),
    "home_advantage": FeatureExplanation(
        label="Home xG multiplier",
        what_it_is="Fixed boost applied to the home team's expected goals after strength mapping.",
        if_increased_weight="Home sides score more in the model across all fixtures.",
    ),
    "goals_minus_xg": FeatureExplanation(
        label="Goals minus xG",
        what_it_is="Over- or under-performance vs chance quality — core finishing signal.",
        if_increased_weight="Teams that consistently beat their xG are rated as better finishers.",
    ),
    "ppda_inv": FeatureExplanation(
        label="Inverse PPDA (pressing intensity)",
        what_it_is="Higher = more aggressive pressing (fewer opponent passes per defensive action).",
        if_increased_weight="High-press teams recover the ball faster and disrupt build-up.",
    ),
    "goals_prevented": FeatureExplanation(
        label="Goals prevented (PSxG − goals)",
        what_it_is="How many goals a keeper saved vs expected from shot quality.",
        if_increased_weight="Shot-stopping above expectation lifts goalkeeper ratings.",
    ),
}


def _humanize(name: str) -> str:
    return name.replace("_adj", "").replace("_", " ").strip()


def _default_explanation(name: str) -> FeatureExplanation:
    base = _humanize(name)
    if name.startswith("comp_"):
        comp = name.replace("comp_", "").replace("_", " ")
        return FeatureExplanation(
            label=f"Component latent: {comp}",
            what_it_is=f"Learned sub-skill score for {comp}, fed into the domain layer.",
            if_increased_weight=f"Higher {comp} pushes the domain and primary rating up.",
        )
    if name.startswith("domain_"):
        dom = name.replace("domain_", "").replace("_", " ")
        return FeatureExplanation(
            label=f"Domain latent: {dom}",
            what_it_is=f"Mid-level {dom} ability combining two components.",
            if_increased_weight=f"Stronger {dom} increases the headline skill rating.",
        )
    if name.endswith("_adj"):
        return FeatureExplanation(
            label=f"{base} (opponent-adjusted)",
            what_it_is=f"Opponent- and context-adjusted version of {base}.",
            if_increased_weight=f"Better adjusted {base} predicts stronger future performance in this component.",
        )
    return FeatureExplanation(
        label=base,
        what_it_is=f"Engineered match statistic: {base}.",
        if_increased_weight=f"Higher {base} increases predicted future performance when the model weight rises.",
    )


def explain_feature(name: str) -> FeatureExplanation:
    key = name.replace("_adj", "") if name in _OVERRIDES else name
    if name in _OVERRIDES:
        return _OVERRIDES[name]
    if key in _OVERRIDES:
        return _OVERRIDES[key]
    return _default_explanation(name)


def explain_weight_change(
    name: str,
    *,
    before: Optional[float],
    after: float,
    layer: str,
) -> str:
    exp = explain_feature(name)
    if before is None:
        return (
            f"**{exp.label}** ({layer}): first baseline weight **{after:.4f}**. "
            f"{exp.what_it_is}"
        )
    delta = after - before
    direction = "rose" if delta > 0 else "fell" if delta < 0 else "stayed flat"
    pct = (abs(delta) / max(abs(before), 1e-9)) * 100 if before != 0 else 0.0
    impact = exp.if_increased_weight if delta >= 0 else exp.if_increased_weight.replace(
        "more", "less"
    ).replace("Higher", "Lower").replace("boosting", "reducing")
    return (
        f"**{exp.label}** ({layer}): {before:.4f} → {after:.4f} "
        f"({direction}, {pct:.1f}% relative). {impact}"
    )
