export const SOCCERDATA_SOURCES = [
  "ClubElo",
  "ESPN",
  "FBref",
  "MatchHistory",
  "Sofascore",
  "SoFIFA",
  "Understat",
  "WhoScored",
] as const;

export type SoccerdataSource = (typeof SOCCERDATA_SOURCES)[number];

export type SoccerdataConstructorOptions = {
  leagues?: string | string[];
  seasons?: string | number | Array<string | number>;
  versions?: string | number | Array<string | number>;
  proxy?: string | Record<string, string> | Array<Record<string, string>>;
  no_cache?: boolean;
  no_store?: boolean;
  data_dir?: string;
  path_to_browser?: string;
  headless?: boolean;
};

export type SoccerdataFetchRequest = {
  source: SoccerdataSource;
  method: string;
  constructor?: SoccerdataConstructorOptions;
  params?: Record<string, unknown>;
  /** Persist result in synced_api_payloads (requires Supabase service role). */
  persist?: boolean;
  /** Skip Supabase cache read (still writes when persist=true). */
  skipCache?: boolean;
};

export type SoccerdataDataFrame = {
  kind: "dataframe";
  rowCount: number;
  columns: string[];
  records: Record<string, unknown>[];
};

export type SoccerdataSerializedData =
  | SoccerdataDataFrame
  | { kind: "list"; value: unknown[] }
  | { kind: "dict"; value: Record<string, unknown> }
  | { kind: "scalar"; value: string | number | boolean }
  | { kind: "null"; value: null }
  | { kind: "unknown"; value: string };

export type SoccerdataRunnerSuccess = {
  ok: true;
  data: SoccerdataSerializedData;
};

export type SoccerdataRunnerFailure = {
  ok: false;
  error: string;
  traceback?: string;
};

export type SoccerdataRunnerResponse = SoccerdataRunnerSuccess | SoccerdataRunnerFailure;

export type SoccerdataFetchResult = {
  source: SoccerdataSource;
  method: string;
  cached: boolean;
  syncedAt?: string;
  data: SoccerdataSerializedData;
};

export type SoccerdataMethodMeta = {
  name: string;
  description: string;
  classMethod?: boolean;
  params?: Record<string, string>;
};

export type SoccerdataSourceMeta = {
  id: SoccerdataSource;
  label: string;
  description: string;
  docsUrl: string;
  requiresLeagues: boolean;
  requiresChrome?: boolean;
  methods: SoccerdataMethodMeta[];
};
