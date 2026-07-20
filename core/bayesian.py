"""
Bayesian updating for GLPM Rating Vectors (Chapter 3.19 / 4.21.4).

Each primary dimension is a Gaussian state. New engine observations update
the posterior with precision weighting; time decay inflates prior variance
so stale evidence does not dominate.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Optional

import numpy as np

from core.vector import (
    PRIMARY_ORDER,
    PrimaryKey,
    RatingMetadata,
    RatingVector,
    classify_trend,
)

DEFAULT_PRIOR_MEAN = 50.0
DEFAULT_PRIOR_VARIANCE = 400.0  # sigma = 20
DEFAULT_HALF_LIFE_DAYS = 90.0
MAX_VARIANCE_INFLATION = 25.0  # cap exp(lambda * dt) factor
MIN_VARIANCE = 1e-6
OBS_VARIANCE_FLOOR = 1.0


def _parse_date(value: str | date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _days_between(earlier: str, later: str) -> float:
    d0 = _parse_date(earlier)
    d1 = _parse_date(later)
    return max(0.0, float((d1 - d0).days))


def decay_lambda(half_life_days: float = DEFAULT_HALF_LIFE_DAYS) -> float:
    """lambda such that variance doubles every half_life_days."""
    hl = max(float(half_life_days), 1e-6)
    return math.log(2.0) / hl


def inflate_prior_variance(
    variance: float,
    *,
    delta_days: float,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> float:
    """
    Time-decay: sigma^2_prior <- sigma^2 * exp(lambda * delta_days), capped.
    """
    lam = decay_lambda(half_life_days)
    factor = math.exp(lam * max(0.0, delta_days))
    factor = min(factor, MAX_VARIANCE_INFLATION)
    return max(float(variance) * factor, MIN_VARIANCE)


def confidence_from_state(variance: float, matches_used: int) -> float:
    """Match primary-engine confidence shape: 1/(1+sigma) * clip(n/20, 0.2, 1)."""
    sigma = math.sqrt(max(float(variance), MIN_VARIANCE))
    n_factor = float(np.clip(matches_used / 20.0, 0.2, 1.0))
    return float(np.clip((1.0 / (1.0 + sigma)) * n_factor, 0.0, 1.0))


def update_dimension(
    prior_mu: float,
    prior_var: float,
    obs_mu: float,
    obs_var: float,
    *,
    obs_confidence: float = 1.0,
    delta_days: float = 0.0,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    prior_matches: int = 0,
) -> tuple[float, float, float, int]:
    """
    Gaussian conjugate update with time-decayed prior.

    Returns (posterior_mu, posterior_var, posterior_confidence, matches_used).
    """
    if not np.isfinite(obs_mu):
        # No observation: only inflate uncertainty
        var_out = inflate_prior_variance(
            prior_var, delta_days=delta_days, half_life_days=half_life_days
        )
        conf = confidence_from_state(var_out, prior_matches)
        return float(np.clip(prior_mu, 0.0, 100.0)), var_out, conf, prior_matches

    var_prior = inflate_prior_variance(
        prior_var, delta_days=delta_days, half_life_days=half_life_days
    )
    var_obs = max(float(obs_var), OBS_VARIANCE_FLOOR)
    conf_obs = float(np.clip(obs_confidence, 0.05, 1.0))

    tau_prior = 1.0 / var_prior
    tau_obs = (conf_obs / var_obs)

    tau_post = tau_prior + tau_obs
    mu_post = (tau_prior * prior_mu + tau_obs * obs_mu) / tau_post
    var_post = 1.0 / tau_post

    mu_post = float(np.clip(mu_post, 0.0, 100.0))
    matches = int(prior_matches) + 1
    conf_post = confidence_from_state(var_post, matches)
    return mu_post, float(var_post), conf_post, matches


def initial_prior_vector(
    *,
    team_sm_id: int,
    season_id: int,
    as_of_date: str,
    mean: float = DEFAULT_PRIOR_MEAN,
    variance: float = DEFAULT_PRIOR_VARIANCE,
    model_version: str = "vector_v1",
) -> RatingVector:
    """Season-start prior: league-mean with wide variance on every dimension."""
    values = {k: float(mean) for k in PRIMARY_ORDER}
    metadata = {
        k: RatingMetadata(
            current_value=float(mean),
            confidence=confidence_from_state(variance, 0),
            matches_used=0,
            last_updated=as_of_date,
            variance=float(variance),
            recent_trend="flat",
            trend_delta=0.0,
            historical_peak=float(mean),
            historical_low=float(mean),
        )
        for k in PRIMARY_ORDER
    }
    return RatingVector(
        team_sm_id=team_sm_id,
        season_id=season_id,
        as_of_date=as_of_date,
        values=values,
        metadata=metadata,
        model_version=model_version,
    )


def update_vector(
    prior: RatingVector,
    observation: RatingVector,
    *,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    as_of_date: Optional[str] = None,
) -> RatingVector:
    """
    Elementwise Bayesian update. Missing observation dimensions keep the
    time-decayed prior (no match increment).
    """
    target_date = as_of_date or observation.as_of_date
    delta_days = _days_between(prior.as_of_date, target_date)

    values: dict[PrimaryKey, float] = {}
    metadata: dict[PrimaryKey, RatingMetadata] = {}

    for key in PRIMARY_ORDER:
        p_meta = prior.metadata[key]
        o_meta = observation.metadata.get(key, RatingMetadata.missing())
        obs_mu = observation.get(key)

        # Skip update if observation missing — decay uncertainty only
        if not np.isfinite(obs_mu):
            if np.isfinite(prior.get(key)):
                var_out = inflate_prior_variance(
                    p_meta.variance,
                    delta_days=delta_days,
                    half_life_days=half_life_days,
                )
                values[key] = prior.get(key)
                metadata[key] = RatingMetadata(
                    current_value=prior.get(key),
                    confidence=confidence_from_state(var_out, p_meta.matches_used),
                    matches_used=p_meta.matches_used,
                    last_updated=target_date,
                    variance=var_out,
                    recent_trend="flat",
                    trend_delta=0.0,
                    historical_peak=p_meta.historical_peak,
                    historical_low=p_meta.historical_low,
                )
            else:
                values[key] = float("nan")
                metadata[key] = RatingMetadata.missing()
            continue

        prior_mu = prior.get(key)
        if not np.isfinite(prior_mu):
            prior_mu = DEFAULT_PRIOR_MEAN
            prior_var = DEFAULT_PRIOR_VARIANCE
            prior_matches = 0
        else:
            prior_var = max(p_meta.variance, MIN_VARIANCE)
            prior_matches = p_meta.matches_used

        mu, var, conf, matches = update_dimension(
            prior_mu,
            prior_var,
            float(obs_mu),
            max(o_meta.variance, OBS_VARIANCE_FLOOR),
            obs_confidence=o_meta.confidence if o_meta.confidence > 0 else 0.5,
            delta_days=delta_days,
            half_life_days=half_life_days,
            prior_matches=prior_matches,
        )
        delta = mu - prior_mu
        peak = p_meta.historical_peak
        low = p_meta.historical_low
        if peak is None or mu > peak:
            peak = mu
        if low is None or mu < low:
            low = mu

        values[key] = mu
        metadata[key] = RatingMetadata(
            current_value=mu,
            confidence=conf,
            matches_used=matches,
            last_updated=target_date,
            variance=var,
            recent_trend=classify_trend(delta),
            trend_delta=delta,
            historical_peak=peak,
            historical_low=low,
        )

    return RatingVector(
        team_sm_id=observation.team_sm_id,
        season_id=observation.season_id,
        as_of_date=target_date,
        values=values,
        metadata=metadata,
        model_version=observation.model_version or prior.model_version,
    )
