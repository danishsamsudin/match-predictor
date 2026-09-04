/**
 * Hand-maintained Supabase table types for GLPM Layer 1 / Layer 2.
 * Canonical IDs are SportMonks (`sm_id`); Wyscout IDs live in glpm_provider_entity_map.
 */

export type GlpmValidationStatus = "pending" | "passed" | "flagged" | "warned";
export type GlpmDataProvider = "sportmonks" | "wyscout" | "understat";
export type GlpmMetricSource = "sportmonks" | "wyscout";

export type GlpmProviderPayloadsTable = {
  Row: {
    provider: GlpmDataProvider;
    endpoint: string;
    entity_type: string;
    entity_key: string;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    provider: GlpmDataProvider;
    endpoint: string;
    entity_type: string;
    entity_key: string;
    payload: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmProviderPayloadsTable["Insert"]>;
  Relationships: [];
};

export type GlpmProviderEntityMapTable = {
  Row: {
    entity_type: "competition" | "season" | "team" | "player" | "match";
    sm_id: number;
    provider: "wyscout";
    provider_entity_id: number;
    notes: string | null;
    synced_at: string;
  };
  Insert: {
    entity_type: "competition" | "season" | "team" | "player" | "match";
    sm_id: number;
    provider: "wyscout";
    provider_entity_id: number;
    notes?: string | null;
    synced_at?: string;
  };
  Update: Partial<GlpmProviderEntityMapTable["Insert"]>;
  Relationships: [];
};

export type GlpmCompetitionsTable = {
  Row: {
    sm_id: number;
    name: string;
    area_id: number | null;
    area_name: string | null;
    format: string | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    name: string;
    area_id?: number | null;
    area_name?: string | null;
    format?: string | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmCompetitionsTable["Insert"]>;
  Relationships: [];
};

export type GlpmSeasonsTable = {
  Row: {
    sm_id: number;
    competition_id: number;
    name: string | null;
    start_date: string | null;
    end_date: string | null;
    active: boolean;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    competition_id: number;
    name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    active?: boolean;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmSeasonsTable["Insert"]>;
  Relationships: [];
};

export type GlpmTeamsTable = {
  Row: {
    sm_id: number;
    name: string;
    official_name: string | null;
    city: string | null;
    area_name: string | null;
    stadium_name: string | null;
    stadium_capacity: number | null;
    altitude: number | null;
    promotion_status: string | null;
    manager_sm_id: number | null;
    manager_name: string | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    name: string;
    official_name?: string | null;
    city?: string | null;
    area_name?: string | null;
    stadium_name?: string | null;
    stadium_capacity?: number | null;
    altitude?: number | null;
    promotion_status?: string | null;
    manager_sm_id?: number | null;
    manager_name?: string | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmTeamsTable["Insert"]>;
  Relationships: [];
};

export type GlpmVenuesTable = {
  Row: {
    sm_id: number;
    name: string;
    city_name: string | null;
    country_id: number | null;
    country_name: string | null;
    address: string | null;
    capacity: number | null;
    latitude: number;
    longitude: number;
    altitude_m: number | null;
    image_path: string | null;
    source: string;
    source_notes: string | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    name: string;
    city_name?: string | null;
    country_id?: number | null;
    country_name?: string | null;
    address?: string | null;
    capacity?: number | null;
    latitude: number;
    longitude: number;
    altitude_m?: number | null;
    image_path?: string | null;
    source?: string;
    source_notes?: string | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmVenuesTable["Insert"]>;
  Relationships: [];
};

export type GlpmPlayersTable = {
  Row: {
    sm_id: number;
    current_team_sm_id: number | null;
    short_name: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    height_cm: number | null;
    foot: string | null;
    role_code: string | null;
    role_name: string | null;
    status: string | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    current_team_sm_id?: number | null;
    short_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    birth_date?: string | null;
    height_cm?: number | null;
    foot?: string | null;
    role_code?: string | null;
    role_name?: string | null;
    status?: string | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmPlayersTable["Insert"]>;
  Relationships: [];
};

export type GlpmCoachesTable = {
  Row: {
    sm_id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
    nationality: string | null;
    birth_date: string | null;
    current_team_sm_id: number | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    nationality?: string | null;
    birth_date?: string | null;
    current_team_sm_id?: number | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmCoachesTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchesTable = {
  Row: {
    sm_id: number;
    competition_id: number | null;
    season_id: number | null;
    league_sm_id: number | null;
    state_id: number | null;
    venue_sm_id: number | null;
    round_sm_id: number | null;
    gameweek: number | null;
    match_date: string | null;
    kickoff_at: string | null;
    home_team_sm_id: number;
    away_team_sm_id: number;
    venue: string | null;
    referee_sm_id: number | null;
    status: string | null;
    home_score: number | null;
    away_score: number | null;
    duration_minutes: number | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    sm_id: number;
    competition_id?: number | null;
    season_id?: number | null;
    league_sm_id?: number | null;
    state_id?: number | null;
    venue_sm_id?: number | null;
    round_sm_id?: number | null;
    gameweek?: number | null;
    match_date?: string | null;
    kickoff_at?: string | null;
    home_team_sm_id: number;
    away_team_sm_id: number;
    venue?: string | null;
    referee_sm_id?: number | null;
    status?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    duration_minutes?: number | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmMatchesTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchTeamStatsTable = {
  Row: {
    match_sm_id: number;
    team_sm_id: number;
    is_home: boolean;
    goals: number | null;
    xg: number | null;
    npxg: number | null;
    open_play_xg: number | null;
    set_piece_xg: number | null;
    shots: number | null;
    shots_on_target: number | null;
    big_chances: number | null;
    box_entries: number | null;
    touches_in_box: number | null;
    progressive_passes: number | null;
    progressive_carries: number | null;
    final_third_entries: number | null;
    crosses: number | null;
    through_balls: number | null;
    passes: number | null;
    successful_passes: number | null;
    xg_conceded: number | null;
    shots_conceded: number | null;
    big_chances_conceded: number | null;
    box_entries_allowed: number | null;
    blocks: number | null;
    interceptions: number | null;
    tackles: number | null;
    clearances: number | null;
    pressures: number | null;
    pressing_duels: number | null;
    ppda: number | null;
    ppda_allowed: number | null;
    ball_recoveries: number | null;
    high_turnovers: number | null;
    defensive_actions: number | null;
    possession_pct: number | null;
    pass_completion_pct: number | null;
    field_tilt: number | null;
    territory_pct: number | null;
    psxg_faced: number | null;
    gk_saves: number | null;
    goals_prevented: number | null;
    corners: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    fouls: number | null;
    xg_source: GlpmMetricSource | null;
    psxg_source: GlpmMetricSource | null;
    ppda_source: "wyscout" | "understat" | "sportmonks_proxy" | null;
    validation_status: GlpmValidationStatus;
    source_endpoint: string | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    match_sm_id: number;
    team_sm_id: number;
    is_home: boolean;
    goals?: number | null;
    xg?: number | null;
    npxg?: number | null;
    open_play_xg?: number | null;
    set_piece_xg?: number | null;
    shots?: number | null;
    shots_on_target?: number | null;
    big_chances?: number | null;
    box_entries?: number | null;
    touches_in_box?: number | null;
    progressive_passes?: number | null;
    progressive_carries?: number | null;
    final_third_entries?: number | null;
    crosses?: number | null;
    through_balls?: number | null;
    passes?: number | null;
    successful_passes?: number | null;
    xg_conceded?: number | null;
    shots_conceded?: number | null;
    big_chances_conceded?: number | null;
    box_entries_allowed?: number | null;
    blocks?: number | null;
    interceptions?: number | null;
    tackles?: number | null;
    clearances?: number | null;
    pressures?: number | null;
    pressing_duels?: number | null;
    ppda?: number | null;
    ppda_allowed?: number | null;
    ball_recoveries?: number | null;
    high_turnovers?: number | null;
    defensive_actions?: number | null;
    possession_pct?: number | null;
    pass_completion_pct?: number | null;
    field_tilt?: number | null;
    territory_pct?: number | null;
    psxg_faced?: number | null;
    gk_saves?: number | null;
    goals_prevented?: number | null;
    corners?: number | null;
    yellow_cards?: number | null;
    red_cards?: number | null;
    fouls?: number | null;
    xg_source?: GlpmMetricSource | null;
    psxg_source?: GlpmMetricSource | null;
    ppda_source?: "wyscout" | "understat" | "sportmonks_proxy" | null;
    validation_status?: GlpmValidationStatus;
    source_endpoint?: string | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmMatchTeamStatsTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchEventsTable = {
  Row: {
    event_id: number;
    match_sm_id: number;
    team_sm_id: number | null;
    player_sm_id: number | null;
    source: GlpmDataProvider;
    match_period: string | null;
    event_sec: number | null;
    event_id_type: number | null;
    event_name: string | null;
    sub_event_id: number | null;
    sub_event_name: string | null;
    pos_x: number | null;
    pos_y: number | null;
    tags: unknown;
    xg: number | null;
    psxg: number | null;
    synced_at: string;
  };
  Insert: {
    event_id: number;
    match_sm_id: number;
    team_sm_id?: number | null;
    player_sm_id?: number | null;
    source?: GlpmDataProvider;
    match_period?: string | null;
    event_sec?: number | null;
    event_id_type?: number | null;
    event_name?: string | null;
    sub_event_id?: number | null;
    sub_event_name?: string | null;
    pos_x?: number | null;
    pos_y?: number | null;
    tags?: unknown;
    xg?: number | null;
    psxg?: number | null;
    synced_at?: string;
  };
  Update: Partial<GlpmMatchEventsTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchShotsTable = {
  Row: {
    event_id: number;
    match_sm_id: number;
    team_sm_id: number;
    player_sm_id: number | null;
    gk_player_sm_id: number | null;
    source: GlpmDataProvider;
    match_period: string | null;
    event_sec: number | null;
    pos_x: number | null;
    pos_y: number | null;
    pre_shot_xg: number | null;
    post_shot_xg: number | null;
    is_on_target: boolean | null;
    is_goal: boolean;
    is_penalty: boolean;
    is_set_piece: boolean;
    is_blocked: boolean;
    is_opportunity: boolean;
    is_counter_attack: boolean;
    body_part_tag: number | null;
    goal_zone_tag: number | null;
    tags: unknown;
    synced_at: string;
  };
  Insert: {
    event_id: number;
    match_sm_id: number;
    team_sm_id: number;
    player_sm_id?: number | null;
    gk_player_sm_id?: number | null;
    source?: GlpmDataProvider;
    match_period?: string | null;
    event_sec?: number | null;
    pos_x?: number | null;
    pos_y?: number | null;
    pre_shot_xg?: number | null;
    post_shot_xg?: number | null;
    is_on_target?: boolean | null;
    is_goal?: boolean;
    is_penalty?: boolean;
    is_set_piece?: boolean;
    is_blocked?: boolean;
    is_opportunity?: boolean;
    is_counter_attack?: boolean;
    body_part_tag?: number | null;
    goal_zone_tag?: number | null;
    tags?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmMatchShotsTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchPlayerStatsTable = {
  Row: {
    match_sm_id: number;
    player_sm_id: number;
    team_sm_id: number;
    minutes_played: number | null;
    goals: number | null;
    assists: number | null;
    shots: number | null;
    xg: number | null;
    psxg_faced: number | null;
    gk_saves: number | null;
    is_goalkeeper: boolean;
    goals_conceded: number | null;
    shots_faced: number | null;
    sot_faced: number | null;
    crosses_faced: number | null;
    claims_attempted: number | null;
    claims_successful: number | null;
    punches: number | null;
    aerial_duels_won: number | null;
    passes: number | null;
    passes_completed: number | null;
    long_passes: number | null;
    long_passes_completed: number | null;
    progressive_passes: number | null;
    progressive_pass_distance: number | null;
    passes_under_pressure: number | null;
    passes_under_pressure_completed: number | null;
    def_actions_outside_box: number | null;
    sweeper_clearances: number | null;
    through_ball_interceptions: number | null;
    recoveries_outside_box: number | null;
    avg_defensive_action_x: number | null;
    penalties_faced: number | null;
    penalties_saved: number | null;
    penalty_psxg_faced: number | null;
    payload: unknown;
    synced_at: string;
  };
  Insert: {
    match_sm_id: number;
    player_sm_id: number;
    team_sm_id: number;
    minutes_played?: number | null;
    goals?: number | null;
    assists?: number | null;
    shots?: number | null;
    xg?: number | null;
    psxg_faced?: number | null;
    gk_saves?: number | null;
    is_goalkeeper?: boolean;
    goals_conceded?: number | null;
    shots_faced?: number | null;
    sot_faced?: number | null;
    crosses_faced?: number | null;
    claims_attempted?: number | null;
    claims_successful?: number | null;
    punches?: number | null;
    aerial_duels_won?: number | null;
    passes?: number | null;
    passes_completed?: number | null;
    long_passes?: number | null;
    long_passes_completed?: number | null;
    progressive_passes?: number | null;
    progressive_pass_distance?: number | null;
    passes_under_pressure?: number | null;
    passes_under_pressure_completed?: number | null;
    def_actions_outside_box?: number | null;
    sweeper_clearances?: number | null;
    through_ball_interceptions?: number | null;
    recoveries_outside_box?: number | null;
    avg_defensive_action_x?: number | null;
    penalties_faced?: number | null;
    penalties_saved?: number | null;
    penalty_psxg_faced?: number | null;
    payload?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmMatchPlayerStatsTable["Insert"]>;
  Relationships: [];
};

export type GlpmGkComponent =
  | "shot_stopping"
  | "area_command"
  | "distribution"
  | "sweeper"
  | "penalty";

export type GlpmGkDomain = "goal_prevention" | "goalkeeper_involvement";

export type GlpmRatingTrend = "up" | "down" | "flat";

export type GlpmPlayerPrimaryRatingsTable = {
  Row: {
    player_sm_id: number;
    team_sm_id: number | null;
    season_id: number;
    rating_type: "goalkeeper";
    as_of_date: string;
    rating: number;
    confidence: number;
    variance: number;
    matches_used: number;
    recent_trend: GlpmRatingTrend;
    trend_delta: number;
    historical_peak: number | null;
    historical_low: number | null;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    player_sm_id: number;
    team_sm_id?: number | null;
    season_id: number;
    rating_type: "goalkeeper";
    as_of_date: string;
    rating: number;
    confidence?: number;
    variance?: number;
    matches_used?: number;
    recent_trend?: GlpmRatingTrend;
    trend_delta?: number;
    historical_peak?: number | null;
    historical_low?: number | null;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmPlayerPrimaryRatingsTable["Insert"]>;
  Relationships: [];
};

export type GlpmPlayerDomainRatingsTable = {
  Row: {
    player_sm_id: number;
    team_sm_id: number | null;
    season_id: number;
    domain: GlpmGkDomain;
    as_of_date: string;
    rating: number;
    confidence: number;
    variance: number;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    player_sm_id: number;
    team_sm_id?: number | null;
    season_id: number;
    domain: GlpmGkDomain;
    as_of_date: string;
    rating: number;
    confidence?: number;
    variance?: number;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmPlayerDomainRatingsTable["Insert"]>;
  Relationships: [];
};

export type GlpmPlayerComponentRatingsTable = {
  Row: {
    player_sm_id: number;
    team_sm_id: number | null;
    season_id: number;
    component: GlpmGkComponent;
    as_of_date: string;
    rating: number;
    confidence: number;
    variance: number;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    player_sm_id: number;
    team_sm_id?: number | null;
    season_id: number;
    component: GlpmGkComponent;
    as_of_date: string;
    rating: number;
    confidence?: number;
    variance?: number;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmPlayerComponentRatingsTable["Insert"]>;
  Relationships: [];
};

export type GlpmPlayerRatingHistoryTable = {
  Row: {
    id: number;
    player_sm_id: number;
    team_sm_id: number | null;
    season_id: number | null;
    as_of_date: string;
    layer: "primary" | "domain" | "component";
    name: string;
    rating: number;
    confidence: number | null;
    variance: number | null;
    model_version: string;
    recorded_at: string;
  };
  Insert: {
    id?: number;
    player_sm_id: number;
    team_sm_id?: number | null;
    season_id?: number | null;
    as_of_date: string;
    layer: "primary" | "domain" | "component";
    name: string;
    rating: number;
    confidence?: number | null;
    variance?: number | null;
    model_version?: string;
    recorded_at?: string;
  };
  Update: Partial<GlpmPlayerRatingHistoryTable["Insert"]>;
  Relationships: [];
};

export type GlpmTeamStyleSnapshotsTable = {
  Row: {
    team_sm_id: number;
    season_id: number;
    as_of_match_sm_id: number | null;
    as_of_date: string;
    style_labels: string[];
    possession_avg: number | null;
    ppda_avg: number | null;
    directness_avg: number | null;
    threshold_version: string;
    metrics: unknown;
    synced_at: string;
  };
  Insert: {
    team_sm_id: number;
    season_id: number;
    as_of_match_sm_id?: number | null;
    as_of_date: string;
    style_labels?: string[];
    possession_avg?: number | null;
    ppda_avg?: number | null;
    directness_avg?: number | null;
    threshold_version?: string;
    metrics?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmTeamStyleSnapshotsTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchVsStyleTable = {
  Row: {
    match_sm_id: number;
    team_sm_id: number;
    opponent_style: string;
    xg_for: number | null;
    xg_against: number | null;
    shots: number | null;
    ppda: number | null;
    field_tilt: number | null;
    metrics: unknown;
    synced_at: string;
  };
  Insert: {
    match_sm_id: number;
    team_sm_id: number;
    opponent_style: string;
    xg_for?: number | null;
    xg_against?: number | null;
    shots?: number | null;
    ppda?: number | null;
    field_tilt?: number | null;
    metrics?: unknown;
    synced_at?: string;
  };
  Update: Partial<GlpmMatchVsStyleTable["Insert"]>;
  Relationships: [];
};

export type GlpmMatchTeamFeaturesTable = {
  Row: {
    match_sm_id: number;
    team_sm_id: number;
    xg_per_shot: number | null;
    shot_conversion: number | null;
    big_chance_rate: number | null;
    box_shot_pct: number | null;
    progressive_pass_rate: number | null;
    field_tilt: number | null;
    ppda: number | null;
    ppda_allowed: number | null;
    ppda_event: number | null;
    psxg_faced: number | null;
    goals_prevented: number | null;
    psxg_save_pct: number | null;
    npxg: number | null;
    counter_efficiency: number | null;
    goals_conceded: number | null;
    feature_version: string;
    computed_at: string;
  };
  Insert: {
    match_sm_id: number;
    team_sm_id: number;
    xg_per_shot?: number | null;
    shot_conversion?: number | null;
    big_chance_rate?: number | null;
    box_shot_pct?: number | null;
    progressive_pass_rate?: number | null;
    field_tilt?: number | null;
    ppda?: number | null;
    ppda_allowed?: number | null;
    ppda_event?: number | null;
    psxg_faced?: number | null;
    goals_prevented?: number | null;
    psxg_save_pct?: number | null;
    npxg?: number | null;
    counter_efficiency?: number | null;
    goals_conceded?: number | null;
    feature_version?: string;
    computed_at?: string;
  };
  Update: Partial<GlpmMatchTeamFeaturesTable["Insert"]>;
  Relationships: [];
};

export type GlpmValidationLayer = "L1" | "L2" | "VAL";
export type GlpmValidationSeverity = "error" | "warn" | "info";

export type GlpmValidationLogsTable = {
  Row: {
    id: number;
    layer: GlpmValidationLayer;
    entity_type: string;
    entity_key: string;
    rule_code: string;
    severity: GlpmValidationSeverity;
    message: string;
    observed: unknown;
    created_at: string;
  };
  Insert: {
    id?: number;
    layer: GlpmValidationLayer;
    entity_type: string;
    entity_key: string;
    rule_code: string;
    severity: GlpmValidationSeverity;
    message: string;
    observed?: unknown;
    created_at?: string;
  };
  Update: Partial<GlpmValidationLogsTable["Insert"]>;
  Relationships: [];
};

export type GlpmOverUnderLine = {
  over: number;
  under: number;
};

export type GlpmPredictionHistoryTable = {
  Row: {
    id: string;
    match_sm_id: number | null;
    home_team_sm_id: number | null;
    away_team_sm_id: number | null;
    season_id: number | null;
    home_xg: number;
    away_xg: number;
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    btts_yes_pct: number;
    btts_no_pct: number;
    over_under: Record<string, GlpmOverUnderLine>;
    score_matrix: number[][];
    rho: number;
    model_version: string;
    executed_at: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    match_sm_id?: number | null;
    home_team_sm_id?: number | null;
    away_team_sm_id?: number | null;
    season_id?: number | null;
    home_xg: number;
    away_xg: number;
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    btts_yes_pct: number;
    btts_no_pct: number;
    over_under?: Record<string, GlpmOverUnderLine>;
    score_matrix: number[][];
    rho?: number;
    model_version?: string;
    executed_at?: string;
    created_at?: string;
  };
  Update: Partial<GlpmPredictionHistoryTable["Insert"]>;
  Relationships: [];
};

export type GlpmCxPredictionHistoryTable = {
  Row: {
    id: string;
    match_sm_id: number | null;
    home_team_sm_id: number | null;
    away_team_sm_id: number | null;
    season_id: number | null;
    base_home_xg: number;
    base_away_xg: number;
    home_xg: number;
    away_xg: number;
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    btts_yes_pct: number;
    btts_no_pct: number;
    over_under: Record<string, GlpmOverUnderLine>;
    score_matrix: number[][];
    breakdown: unknown;
    rho: number;
    model_version: string;
    executed_at: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    match_sm_id?: number | null;
    home_team_sm_id?: number | null;
    away_team_sm_id?: number | null;
    season_id?: number | null;
    base_home_xg: number;
    base_away_xg: number;
    home_xg: number;
    away_xg: number;
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    btts_yes_pct: number;
    btts_no_pct: number;
    over_under?: Record<string, GlpmOverUnderLine>;
    score_matrix: number[][];
    breakdown?: unknown;
    rho?: number;
    model_version?: string;
    executed_at?: string;
    created_at?: string;
  };
  Update: Partial<GlpmCxPredictionHistoryTable["Insert"]>;
  Relationships: [];
};

export type GlpmCxSeasonSimRunsTable = {
  Row: {
    id: string;
    season_id: number;
    model_source: string;
    iterations: number;
    summary: unknown;
    executed_at: string;
  };
  Insert: {
    id?: string;
    season_id: number;
    model_source?: string;
    iterations: number;
    summary?: unknown;
    executed_at?: string;
  };
  Update: Partial<GlpmCxSeasonSimRunsTable["Insert"]>;
  Relationships: [];
};

export type GlpmPrimaryRatingType =
  | "attack"
  | "defence"
  | "goalkeeper"
  | "finishing"
  | "pressing"
  | "build_up"
  | "possession";

export type GlpmAttackComponent =
  | "chance_volume"
  | "chance_quality"
  | "ball_progression"
  | "territorial_control"
  | "transition_threat"
  | "set_piece_threat";

export type GlpmAttackDomain = "creation" | "progression" | "situational";

export type GlpmRatingDimensionMetadata = {
  current_value: number | null;
  confidence: number;
  matches_used: number;
  last_updated: string | null;
  variance: number;
  recent_trend: GlpmRatingTrend;
  trend_delta: number;
  historical_peak: number | null;
  historical_low: number | null;
};

export type GlpmTeamPrimaryRatingsTable = {
  Row: {
    team_sm_id: number;
    season_id: number;
    rating_type: GlpmPrimaryRatingType;
    as_of_date: string;
    rating: number;
    confidence: number;
    variance: number;
    matches_used: number;
    recent_trend: GlpmRatingTrend;
    trend_delta: number;
    historical_peak: number | null;
    historical_low: number | null;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    team_sm_id: number;
    season_id: number;
    rating_type: GlpmPrimaryRatingType;
    as_of_date: string;
    rating: number;
    confidence?: number;
    variance?: number;
    matches_used?: number;
    recent_trend?: GlpmRatingTrend;
    trend_delta?: number;
    historical_peak?: number | null;
    historical_low?: number | null;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmTeamPrimaryRatingsTable["Insert"]>;
  Relationships: [];
};

export type GlpmTeamRatingVectorsTable = {
  Row: {
    team_sm_id: number;
    season_id: number;
    as_of_date: string;
    r_attack: number | null;
    r_defence: number | null;
    r_goalkeeper: number | null;
    r_build_up: number | null;
    r_possession: number | null;
    r_pressing: number | null;
    r_finishing: number | null;
    metadata: Partial<Record<GlpmPrimaryRatingType, GlpmRatingDimensionMetadata>>;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    team_sm_id: number;
    season_id: number;
    as_of_date: string;
    r_attack?: number | null;
    r_defence?: number | null;
    r_goalkeeper?: number | null;
    r_build_up?: number | null;
    r_possession?: number | null;
    r_pressing?: number | null;
    r_finishing?: number | null;
    metadata?: Partial<Record<GlpmPrimaryRatingType, GlpmRatingDimensionMetadata>>;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmTeamRatingVectorsTable["Insert"]>;
  Relationships: [];
};

export type GlpmTeamComponentRatingsTable = {
  Row: {
    team_sm_id: number;
    season_id: number;
    rating_type: GlpmPrimaryRatingType;
    component: string;
    as_of_date: string;
    rating: number;
    confidence: number;
    variance: number;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    team_sm_id: number;
    season_id: number;
    rating_type: GlpmPrimaryRatingType;
    component: string;
    as_of_date: string;
    rating: number;
    confidence?: number;
    variance?: number;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmTeamComponentRatingsTable["Insert"]>;
  Relationships: [];
};

export type GlpmTeamDomainRatingsTable = {
  Row: {
    team_sm_id: number;
    season_id: number;
    rating_type: GlpmPrimaryRatingType;
    domain: string;
    as_of_date: string;
    rating: number;
    confidence: number;
    variance: number;
    model_version: string;
    updated_at: string;
  };
  Insert: {
    team_sm_id: number;
    season_id: number;
    rating_type: GlpmPrimaryRatingType;
    domain: string;
    as_of_date: string;
    rating: number;
    confidence?: number;
    variance?: number;
    model_version?: string;
    updated_at?: string;
  };
  Update: Partial<GlpmTeamDomainRatingsTable["Insert"]>;
  Relationships: [];
};

export type GlpmRatingHistoryTable = {
  Row: {
    id: number;
    team_sm_id: number;
    season_id: number | null;
    as_of_date: string;
    layer: "primary" | "domain" | "component";
    name: string;
    rating: number;
    confidence: number | null;
    variance: number | null;
    model_version: string;
    recorded_at: string;
  };
  Insert: {
    id?: number;
    team_sm_id: number;
    season_id?: number | null;
    as_of_date: string;
    layer: "primary" | "domain" | "component";
    name: string;
    rating: number;
    confidence?: number | null;
    variance?: number | null;
    model_version?: string;
    recorded_at?: string;
  };
  Update: Partial<GlpmRatingHistoryTable["Insert"]>;
  Relationships: [];
};

export type GlpmStandingsCurrentTable = {
  Row: {
    season_id: number;
    team_sm_id: number;
    rank: number;
    previous_rank: number | null;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
    form: string[];
    results_fingerprint: string;
    computed_at: string;
  };
  Insert: {
    season_id: number;
    team_sm_id: number;
    rank: number;
    previous_rank?: number | null;
    played?: number;
    won?: number;
    drawn?: number;
    lost?: number;
    goals_for?: number;
    goals_against?: number;
    goal_difference?: number;
    points?: number;
    form?: string[];
    results_fingerprint: string;
    computed_at?: string;
  };
  Update: Partial<GlpmStandingsCurrentTable["Insert"]>;
  Relationships: [];
};

export type GlpmStandingsSnapshotsTable = {
  Row: {
    season_id: number;
    snapshot_at: string;
    trigger: string;
    results_fingerprint: string;
    rows: unknown;
  };
  Insert: {
    season_id: number;
    snapshot_at?: string;
    trigger?: string;
    results_fingerprint: string;
    rows: unknown;
  };
  Update: Partial<GlpmStandingsSnapshotsTable["Insert"]>;
  Relationships: [];
};

export type GlpmDailySyncWindowsTable = {
  Row: {
    match_date: string;
    time_zone: string;
    fixture_ids: number[];
    first_kickoff_at: string | null;
    last_kickoff_at: string | null;
    lineup_due_at: string | null;
    results_due_at: string | null;
    refresh_due_at: string | null;
    empty_matchday: boolean;
    lineup_done: boolean;
    results_done: boolean;
    refresh_done: boolean;
    lineup_confirmed_count: number;
    morning_summary: unknown | null;
    lineup_summary: unknown | null;
    results_summary: unknown | null;
    refresh_summary: unknown | null;
    updated_at: string;
    created_at: string;
  };
  Insert: {
    match_date: string;
    time_zone: string;
    fixture_ids?: number[];
    first_kickoff_at?: string | null;
    last_kickoff_at?: string | null;
    lineup_due_at?: string | null;
    results_due_at?: string | null;
    refresh_due_at?: string | null;
    empty_matchday?: boolean;
    lineup_done?: boolean;
    results_done?: boolean;
    refresh_done?: boolean;
    lineup_confirmed_count?: number;
    morning_summary?: unknown | null;
    lineup_summary?: unknown | null;
    results_summary?: unknown | null;
    refresh_summary?: unknown | null;
    updated_at?: string;
    created_at?: string;
  };
  Update: Partial<GlpmDailySyncWindowsTable["Insert"]>;
  Relationships: [];
};

export type GlpmTables = {
  glpm_provider_payloads: GlpmProviderPayloadsTable;
  glpm_provider_entity_map: GlpmProviderEntityMapTable;
  glpm_competitions: GlpmCompetitionsTable;
  glpm_seasons: GlpmSeasonsTable;
  glpm_teams: GlpmTeamsTable;
  glpm_venues: GlpmVenuesTable;
  glpm_players: GlpmPlayersTable;
  glpm_coaches: GlpmCoachesTable;
  glpm_matches: GlpmMatchesTable;
  glpm_match_team_stats: GlpmMatchTeamStatsTable;
  glpm_match_events: GlpmMatchEventsTable;
  glpm_match_shots: GlpmMatchShotsTable;
  glpm_match_player_stats: GlpmMatchPlayerStatsTable;
  glpm_team_style_snapshots: GlpmTeamStyleSnapshotsTable;
  glpm_match_vs_style: GlpmMatchVsStyleTable;
  glpm_match_team_features: GlpmMatchTeamFeaturesTable;
  glpm_validation_logs: GlpmValidationLogsTable;
  glpm_prediction_history: GlpmPredictionHistoryTable;
  glpm_cx_prediction_history: GlpmCxPredictionHistoryTable;
  glpm_cx_season_sim_runs: GlpmCxSeasonSimRunsTable;
  glpm_team_primary_ratings: GlpmTeamPrimaryRatingsTable;
  glpm_team_rating_vectors: GlpmTeamRatingVectorsTable;
  glpm_team_component_ratings: GlpmTeamComponentRatingsTable;
  glpm_team_domain_ratings: GlpmTeamDomainRatingsTable;
  glpm_rating_history: GlpmRatingHistoryTable;
  glpm_player_primary_ratings: GlpmPlayerPrimaryRatingsTable;
  glpm_player_domain_ratings: GlpmPlayerDomainRatingsTable;
  glpm_player_component_ratings: GlpmPlayerComponentRatingsTable;
  glpm_player_rating_history: GlpmPlayerRatingHistoryTable;
  glpm_standings_current: GlpmStandingsCurrentTable;
  glpm_standings_snapshots: GlpmStandingsSnapshotsTable;
  glpm_daily_sync_windows: GlpmDailySyncWindowsTable;
};
