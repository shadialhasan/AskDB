import type {
  AskDbDialectId,
  AskDbLogLevel,
  AskDbModeV1,
  AskDbRagEmbedder,
  AskDbRagStore,
  AskDbReasoningEffort,
  AskDbStudioExecuteProvider,
} from "./constants.js";

/**
 * Authoring-time AskDB configuration: nested groups (`ai`, `introspection`, `rag`, …)
 * passed to {@link defineConfig} in `askdb.config.*`, then flattened to canonical env keys for the runtime snapshot.
 *
 * Use with TypeScript's `satisfies` operator to validate the object literal without widening it, e.g.
 * `defineConfig({ ... } satisfies AskDbConfig)` or `const cfg = { ... } satisfies AskDbConfig`.
 *
 */

// ---------------------------------------------------------------------------
// AI provider connections and functional sections
// ---------------------------------------------------------------------------

export type NamedConnection<T> = T & {
  /** Defaults to "default". Unique within its provider. */
  name?: string;
};

export type Connections<T> = NamedConnection<T> | readonly NamedConnection<T>[];

export type OpenaiConnection = {
  apiKey?: string;
  baseUrl?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
};

export type AzureConnection = {
  apiKey?: string;
  secondaryApiKey?: string;
  /**
   * Azure resource name — the subdomain of your endpoint, e.g. `"my-foundry"`
   * for `https://my-foundry.openai.azure.com`. One of `resourceName` or
   * `baseUrl` is required.
   */
  resourceName?: string;
  /** Full endpoint URL. Overrides `resourceName` when both are set. */
  baseUrl?: string;
  apiVersion?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
  /**
   * Underlying model id backing `model` (the deployment name), e.g. `"gpt-5"`
   * or `"o3-mini"`. Deployment names are arbitrary aliases chosen at deploy
   * time, so AskDB can't always infer reasoning-model support from `model`
   * alone — set this when your deployment name doesn't match the model id.
   *
   * @deprecated Use `ai.language.modelFamily`. Removed at 1.0.
   */
  modelFamily?: string;
};

export type FoundryConnection = {
  apiKey?: string;
  secondaryApiKey?: string;
  /** See {@link AzureConnection.resourceName}. */
  resourceName?: string;
  /** See {@link AzureConnection.baseUrl}. */
  baseUrl?: string;
  apiVersion?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
  /** See {@link AzureConnection.modelFamily}. @deprecated Use `ai.language.modelFamily`. Removed at 1.0. */
  modelFamily?: string;
};

export type AnthropicConnection = {
  apiKey?: string;
  baseUrl?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
};

export type GoogleConnection = {
  apiKey?: string;
  baseUrl?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
};

/** Vercel AI Gateway (`ai.provider: "gateway"`), built into `ai` — no extra provider package. */
export type GatewayConnection = {
  /** AI Gateway API key. Flattened to `AI_GATEWAY_API_KEY`. */
  apiKey?: string;
  baseUrl?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
};

export type CustomConnection = {
  apiKey?: string;
  baseUrl?: string;
  resourceName?: string;
  secondaryApiKey?: string;
  apiVersion?: string;
  /** @deprecated Use `ai.language.model`. Removed at 1.0. */
  model?: string;
  /** @deprecated Use `ai.language.modelFamily`. Removed at 1.0. */
  modelFamily?: string;
  [extra: string]: unknown;
};

/** @deprecated Use {@link OpenaiConnection}. Removed at 1.0. */
export type OpenaiConfig = OpenaiConnection;
/** @deprecated Use {@link AzureConnection}. Removed at 1.0. */
export type AzureConfig = AzureConnection;
/** @deprecated Use {@link FoundryConnection}. Removed at 1.0. */
export type FoundryConfig = FoundryConnection;
/** @deprecated Use {@link AnthropicConnection}. Removed at 1.0. */
export type AnthropicConfig = AnthropicConnection;
/** @deprecated Use {@link GoogleConnection}. Removed at 1.0. */
export type GoogleConfig = GoogleConnection;
/** @deprecated Use {@link GatewayConnection}. Removed at 1.0. */
export type GatewayConfig = GatewayConnection;
/** @deprecated Use {@link CustomConnection}. Removed at 1.0. */
export type CustomProviderConfig = CustomConnection;

/**
 * Provider-portable reasoning/latency effort for AskDB model calls. Unset
 * (the default) preserves current behavior: no reasoning `providerOptions`
 * are sent, so the provider/model's own default applies.
 */
export type AskDbAiReasoningConfig = {
  /** Global default applied to every AskDB model-call site unless overridden below. */
  effort?: AskDbReasoningEffort;
  /**
   * Override for NL→SQL generation calls. This is the accuracy-sensitive
   * path — leave unset (provider default) or use `"medium"`/`"high"`.
   */
  nlToSql?: AskDbReasoningEffort;
  /**
   * Override for enrichment/suggestion calls. These are non-critical, so
   * it's safe to bias toward `"low"`/`"minimal"` for latency/cost.
   */
  enrichment?: AskDbReasoningEffort;
};

export type AiProviderConnections = {
  openai?: Connections<OpenaiConnection>;
  azure?: Connections<AzureConnection>;
  foundry?: Connections<FoundryConnection>;
  anthropic?: Connections<AnthropicConnection>;
  google?: Connections<GoogleConnection>;
  gateway?: Connections<GatewayConnection>;
  /** @deprecated Use provider id directly under providerConfig. Removed at 1.0. */
  custom?: CustomConnection;
  /** Any other key is a custom provider id (an adapter registered under that name). */
  [provider: string]: Connections<CustomConnection> | undefined;
};

/** @deprecated Use {@link AiProviderConnections}. Removed at 1.0. */
export type AiProviderConfigs = AiProviderConnections;

export type AskDbAiLanguageConfig = {
  /** Provider for language queries. Default: `ai.provider`. */
  provider?: string;
  /** Named connection inside `ai.providerConfig.<provider>`. Default: `"default"`. */
  connection?: string;
  /** Language model identifier. Default: the provider's default language model. */
  model?: string;
  /** The underlying model id when `model` is an alias (e.g. Azure deployment names). */
  modelFamily?: string;
  reasoning?: AskDbAiReasoningConfig;
};

export type AskDbAiEmbeddingConfig = {
  /** Provider for embeddings. Default: `ai.provider`. */
  provider?: string;
  /** Named connection inside `ai.providerConfig.<provider>`. Default: `"default"`. */
  connection?: string;
  /** Embedding model identifier (required when rag.embedder is "ai"). */
  model: string;
  /** Dimensions of the embedding vector. Optional when known to AskDB. */
  dimensions?: string | number;
};

export type AskDbAiConfig = {
  /** Default provider for language and embedding sections. */
  provider?: string;
  /** Provider connections (credentials, endpoints). */
  providerConfig?: AiProviderConnections;
  /** Language model selection and reasoning options. */
  language?: AskDbAiLanguageConfig;
  /** Embedding model selection for RAG. */
  embedding?: AskDbAiEmbeddingConfig;
  /** @deprecated Use `ai.language.reasoning`. Removed at 1.0. */
  reasoning?: AskDbAiReasoningConfig;
};

/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type OpenaiAiConfig = AskDbAiConfig & { provider?: "openai" };
/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type AzureAiConfig = AskDbAiConfig & { provider?: "azure" };
/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type FoundryAiConfig = AskDbAiConfig & { provider?: "foundry" };
/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type AnthropicAiConfig = AskDbAiConfig & { provider?: "anthropic" };
/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type GoogleAiConfig = AskDbAiConfig & { provider?: "google" };
/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type GatewayAiConfig = AskDbAiConfig & { provider?: "gateway" };
/** @deprecated Use {@link AskDbAiConfig}. Removed at 1.0. */
export type CustomAiConfig = AskDbAiConfig;

// ---------------------------------------------------------------------------
// RAG configs
// ---------------------------------------------------------------------------

export type OpenaiRagEmbedderConfig = {
  model?: string;
  /** Raw env string or number; positive integer parsed in {@link flattenAskDbConfig}, else derived from `model`. */
  dimension?: string | number;
  apiKey?: string;
  baseUrl?: string;
};

export type FileStoreConfig = {
  /** Passed to `createFileStore({ basePath })` — vector files use `<basePath>.embeddings.*`. */
  basePath?: string;
  autoFlush?: boolean;
};

/** In-memory store has no env-backed options today. */
export type MemoryStoreConfig = Record<string, never>;

export type PgvectorStoreConfig = {
  /** Connection string for pgvector (maps to `ASKDB_PGVECTOR_URL`). */
  databaseUrl?: string;
  table?: string;
  /** Positive integer from env or number; when unset, matches resolved RAG embedder dimensions in {@link flattenAskDbConfig}. */
  dimensions?: string | number;
  /** When unset, {@link flattenAskDbConfig} uses `hnsw`. */
  indexStrategy?: string;
};

// ---------------------------------------------------------------------------
// Introspection configs
// ---------------------------------------------------------------------------

/** All introspection provider-specific configs as optional fields — allows storing multiple provider configs simultaneously. */
export type IntrospectionProviderConfigs = {
  postgres?: {
    /**
     * Postgres connection URL for live introspection (maps to `ASKDB_INTROSPECT_POSTGRES_URL`).
     * When omitted, pass `--url` to `askdb introspect` or set `ASKDB_INTROSPECT_POSTGRES_URL` in env.
     */
    databaseUrl?: string;
  };
  prisma?: {
    /**
     * Path to a `schema.prisma` file or directory containing `.prisma` files.
     * When omitted, `@askdb/prisma` auto-discovers `prisma/schema.prisma` or `schema.prisma`
     * in the project root — no explicit path needed.
     */
    schemaPath?: string;
  };
  mysql?: {
    /**
     * MySQL connection URL (e.g. `mysql://user:pass@host:port/database`).
     * When omitted, pass `--url` to `askdb introspect` or set `ASKDB_INTROSPECT_MYSQL_URL` in env.
     */
    databaseUrl?: string;
  };
  sqlite?: {
    /**
     * Path to a `.db` / `.sqlite` file (or `:memory:` for an empty DB). Required —
     * SQLite has no URL-shaped fallback because `DATABASE_URL` is typically a URL
     * for a network engine.
     */
    file?: string;
  };
  sqlserver?: {
    /**
     * Microsoft SQL Server connection URL (mssql URI form or the equivalent
     * `Server=...;` connection string). When omitted, pass `--url` to `askdb introspect`
     * or set `ASKDB_INTROSPECT_SQLSERVER_URL` in env.
     */
    databaseUrl?: string;
  };
};

/** Discriminated union branch for `introspection` when `provider` is `"postgres"`. */
export type PostgresIntrospectionConfig = {
  provider: "postgres";
  providerConfig?: IntrospectionProviderConfigs;
  /**
   * Default introspection output directory (maps to `ASKDB_INTROSPECT_OUT`).
   * When unset/blank, `flattenAskDbConfig` uses the package default `./askdb/`.
   */
  outputDir?: string;
  /**
   * Schemas to introspect, like `askdb introspect --schemas` (which overrides it), e.g.
   * `["public", "sales"]`. On MySQL/MariaDB these are databases: each becomes its own
   * namespace and cross-database foreign keys are kept; without a list, only the
   * connection URL's database is read, under the `public` namespace. On Postgres and SQL
   * Server, the default is every non-system schema.
   */
  schemas?: string[];
};

/** Discriminated union branch for `introspection` when `provider` is `"prisma"`. */
export type PrismaIntrospectionConfig = {
  provider: "prisma";
  providerConfig?: IntrospectionProviderConfigs;
  /**
   * Default introspection output directory (maps to `ASKDB_INTROSPECT_OUT`).
   * When unset/blank, `flattenAskDbConfig` uses the package default `./askdb/`.
   */
  outputDir?: string;
  /**
   * Schemas to introspect, like `askdb introspect --schemas` (which overrides it), e.g.
   * `["public", "sales"]`. On MySQL/MariaDB these are databases: each becomes its own
   * namespace and cross-database foreign keys are kept; without a list, only the
   * connection URL's database is read, under the `public` namespace. On Postgres and SQL
   * Server, the default is every non-system schema.
   */
  schemas?: string[];
};

/** Discriminated union branch for `introspection` when `provider` is `"mysql"`. */
export type MysqlIntrospectionConfig = {
  provider: "mysql";
  providerConfig?: IntrospectionProviderConfigs;
  /**
   * Default introspection output directory (maps to `ASKDB_INTROSPECT_OUT`).
   * When unset/blank, `flattenAskDbConfig` uses the package default `./askdb/`.
   */
  outputDir?: string;
  /**
   * Schemas to introspect, like `askdb introspect --schemas` (which overrides it), e.g.
   * `["public", "sales"]`. On MySQL/MariaDB these are databases: each becomes its own
   * namespace and cross-database foreign keys are kept; without a list, only the
   * connection URL's database is read, under the `public` namespace. On Postgres and SQL
   * Server, the default is every non-system schema.
   */
  schemas?: string[];
};

/** Discriminated union branch for `introspection` when `provider` is `"sqlite"`. */
export type SqliteIntrospectionConfig = {
  provider: "sqlite";
  providerConfig?: IntrospectionProviderConfigs;
  /**
   * Default introspection output directory (maps to `ASKDB_INTROSPECT_OUT`).
   * When unset/blank, `flattenAskDbConfig` uses the package default `./askdb/`.
   */
  outputDir?: string;
  /**
   * Schemas to introspect, like `askdb introspect --schemas` (which overrides it), e.g.
   * `["public", "sales"]`. On MySQL/MariaDB these are databases: each becomes its own
   * namespace and cross-database foreign keys are kept; without a list, only the
   * connection URL's database is read, under the `public` namespace. On Postgres and SQL
   * Server, the default is every non-system schema.
   */
  schemas?: string[];
};

/** Discriminated union branch for `introspection` when `provider` is `"sqlserver"`. */
export type SqlServerIntrospectionConfig = {
  provider: "sqlserver";
  providerConfig?: IntrospectionProviderConfigs;
  /**
   * Default introspection output directory (maps to `ASKDB_INTROSPECT_OUT`).
   * When unset/blank, `flattenAskDbConfig` uses the package default `./askdb/`.
   */
  outputDir?: string;
  /**
   * Schemas to introspect, like `askdb introspect --schemas` (which overrides it), e.g.
   * `["public", "sales"]`. On MySQL/MariaDB these are databases: each becomes its own
   * namespace and cross-database foreign keys are kept; without a list, only the
   * connection URL's database is read, under the `public` namespace. On Postgres and SQL
   * Server, the default is every non-system schema.
   */
  schemas?: string[];
};

/** Discriminated union of all supported introspection provider branches. */
export type AskDbIntrospectionConfig =
  | PostgresIntrospectionConfig
  | PrismaIntrospectionConfig
  | MysqlIntrospectionConfig
  | SqliteIntrospectionConfig
  | SqlServerIntrospectionConfig;

// ---------------------------------------------------------------------------
// Root config
// ---------------------------------------------------------------------------

/**
 * Root shape for `export default defineConfig({ ... })` in `askdb.config.*`.
 *
 * - **`ai`**: LLM provider discriminated union — selecting `provider` determines which `providerConfig` branch is required.
 * - **`introspection`**: target engine for `askdb introspect` (postgres / prisma / mysql / sqlite / sqlserver) — selecting `provider` determines which `providerConfig` branch is valid. Each branch holds the connection URL/path for that engine.
 * - **`rag`**: embedder + store branches flattened to `ASKDB_RAG_*` / `ASKDB_PGVECTOR_URL` / file paths.
 * - **`logging` | `modes` | `host`**: optional operational defaults.
 */
export type AskDbConfig = {
  ai: AskDbAiConfig;

  introspection: AskDbIntrospectionConfig;

  /**
   * Override the NL→SQL dialect. When unset, the dialect is inferred from the
   * introspection provider (or, for Prisma, from the detected `datasource.provider`).
   * Use this when the inferred dialect is wrong — e.g. Prisma `schema.prisma` declares
   * `provider = "postgresql"` but you actually target a different engine.
   *
   * Keep aligned with `DialectId` in `@askdb/core`. Shipped specs: see `ASKDB_DIALECTS`.
   */
  dialect?: AskDbDialectId;

  rag: {
    embedder: AskDbRagEmbedder;
    /** @deprecated Use `ai.embedding`. Removed at 1.0. */
    embedderConfig?: {
      openai?: OpenaiRagEmbedderConfig;
    };
    store: AskDbRagStore;
    storeConfig: {
      file?: FileStoreConfig;
      memory?: MemoryStoreConfig;
      pgvector?: PgvectorStoreConfig;
    };
  };

  logging?: {
    level?: AskDbLogLevel;
    correlationId?: string;
    /** Maps to `ASKDB_LOG_FILE`. */
    logFile?: string;
    /** When true, maps to `ASKDB_LOG_STDOUT=true`. */
    logStdout?: boolean;
  };
  modes?: { askdbMode?: AskDbModeV1; omitSensitiveFromPrompt?: boolean };
  host?: { schemaPath?: string; schemaJson?: string };

  /** Deterministic NL→SQL for tests / local dev (maps to `ASKDB_MOCK_SQL`). */
  dev?: { mockSql?: string };

  /** Studio browser server listen and query-execution defaults. */
  studio?: {
    listen?: { host?: string; port?: number };
    /**
     * Query execution against a live database from the Studio playground.
     * Off by default — set `enabled: true` and give Studio its own connection
     * (ideally a read-only database role).
     */
    execute?: {
      /**
       * Turn on `POST /api/execute` and the Playground's **Execute Query** button.
       * Default `false`: Studio generates SQL but never runs it.
       * Maps to `ASKDB_STUDIO_EXECUTE_ENABLED`.
       */
      enabled?: boolean;
      /**
       * Reuse the introspection connection (`introspection.providerConfig.<engine>`)
       * when `databaseUrl` / `file` is not set. Default `false` — Studio execute needs
       * its own explicit connection so introspection credentials are never used to run
       * ad-hoc SQL by accident. Maps to `ASKDB_STUDIO_EXECUTE_USE_INTROSPECTION_CONNECTION`.
       */
      useIntrospectionConnection?: boolean;
      /**
       * Per-query timeout in milliseconds (positive integer). Default `30000`.
       * Enforced server-side on Postgres, MySQL/MariaDB, and SQL Server; not enforced
       * for SQLite. Maps to `ASKDB_STUDIO_EXECUTE_TIMEOUT_MS`.
       */
      timeoutMs?: number;
      /**
       * Maximum rows returned per query (positive integer). Default `500`. Studio fetches
       * at most `maxRows + 1` rows and reports `truncated: true` when more exist.
       * Maps to `ASKDB_STUDIO_EXECUTE_MAX_ROWS`.
       */
      maxRows?: number;
      /**
       * Explicit live-execute provider. When omitted, Studio falls back to the active
       * introspection provider when it is a live engine, then defaults to `"postgres"`.
       * Maps to `ASKDB_STUDIO_EXECUTE_PROVIDER`.
       */
      provider?: AskDbStudioExecuteProvider;
      /** Connection URL used by `POST /api/execute` for network databases (maps to `ASKDB_STUDIO_DATABASE_URL`). */
      databaseUrl?: string;
      /**
       * SQLite file path used by `POST /api/execute` when `provider === "sqlite"`.
       * Maps to `ASKDB_STUDIO_SQLITE_FILE`.
       */
      file?: string;
    };
  };

  /** HTTP API server defaults (first-party `apps/http-api`). */
  httpApi?: {
    listen?: {
      /** When unset, servers default to `3000`. Use `env("PORT")` for platforms that inject `PORT`. */
      port?: number;
      host?: string;
    };
  };
};
