"""GLPM core aggregation: Rating Vector assembly and Bayesian evolution."""

from core.bayesian import (
    DEFAULT_HALF_LIFE_DAYS,
    DEFAULT_PRIOR_MEAN,
    DEFAULT_PRIOR_VARIANCE,
    initial_prior_vector,
    update_dimension,
    update_vector,
)
from core.vector import (
    PRIMARY_ORDER,
    PrimaryKey,
    RatingMetadata,
    RatingVector,
    TrendFlag,
)
from core.vector_assembly import (
    assemble_matchweek_vectors,
    assemble_rating_vector,
    assemble_season_vectors,
    aggregate_team_goalkeeper,
)

__all__ = [
    "PRIMARY_ORDER",
    "PrimaryKey",
    "RatingMetadata",
    "RatingVector",
    "TrendFlag",
    "DEFAULT_HALF_LIFE_DAYS",
    "DEFAULT_PRIOR_MEAN",
    "DEFAULT_PRIOR_VARIANCE",
    "initial_prior_vector",
    "update_dimension",
    "update_vector",
    "assemble_rating_vector",
    "assemble_season_vectors",
    "assemble_matchweek_vectors",
    "aggregate_team_goalkeeper",
]
