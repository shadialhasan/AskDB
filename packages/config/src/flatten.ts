import {
  ASKDB_LOG_LEVELS,
  ASKDB_MODES_V1,
  ASKDB_REASONING_EFFORTS,
} from "./constants.js";
import {
  DEFAULT_ANTHROPIC_LANGUAGE_MODEL,
  DEFAULT_AZURE_OPENAI_DEPLOYMENT,
  DEFAULT_GATEWAY_LANGUAGE_MODEL,
  DEFAULT_GOOGLE_LANGUAGE_MODEL,
  DEFAULT_INTROSPECT_OUTPUT_DIR,
  DEFAULT_MOCK_RAG_EMBEDDING_DIMENSIONS,
  DEFAULT_OPENAI_LANGUAGE_MODEL,
  DEFAULT_RAG_FILE_BASE_PATH,
  normalizePgvectorIndexStrategy,
  parsePositiveInteger,
} from "./defaults.js";
import { normalizeAskDbConfig, type NormalizedConnection } from "./normalize.js";
import type {
  AskDbAiReasoningConfig,
  AskDbConfig,
} from "./types.js";

function isMember<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function set(out: Record<string, string>, key: string, value: string | undefined): void {
  if (value === undefined) return;
  const t = value.trim();
  if (t === "") return;
  out[key] = t;
}

/**
 * Maps a provider connection to its native environment variables.
 * Shared between language flatten and `rt.ai.embedding.env`.
 */
export function applyProviderConnectionEnv(
  out: Record<string, string>,
  provider: string,
  conn: NormalizedConnection,
  options?: {
    model?: string;
    modelFamily?: string;
    usage?: "language" | "embedding";
  },
): void {
  const p = provider.trim().toLowerCase();
  const usage = options?.usage ?? "language";
  const model = options?.model;
  const modelFamily = options?.modelFamily;

  if (p === "openai") {
    set(out, "OPENAI_API_KEY", conn.apiKey);
    set(out, "OPENAI_BASE_URL", conn.baseUrl);
    if (usage === "embedding") {
      set(out, "ASKDB_AI_EMBEDDING_MODEL", model);
    } else {
      const m = model || DEFAULT_OPENAI_LANGUAGE_MODEL;
      set(out, "OPENAI_MODEL", m);
      set(out, "ASKDB_MODEL", m);
    }
  } else if (p === "azure" || p === "foundry") {
    set(out, "AZURE_OPENAI_API_KEY", conn.apiKey);
    if (conn.secondaryApiKey) {
      set(out, "AZURE_OPENAI_API_KEY_SECONDARY", conn.secondaryApiKey);
    }
    set(out, "ASKDB_AI_AZURE_RESOURCE_NAME", conn.resourceName);
    set(out, "AZURE_OPENAI_BASE_URL", conn.baseUrl);
    set(out, "AZURE_OPENAI_API_VERSION", conn.apiVersion);
    set(out, "ASKDB_AI_AZURE_MODEL_FAMILY", modelFamily ?? conn.modelFamily);

    if (usage === "embedding") {
      set(out, "ASKDB_AI_EMBEDDING_MODEL", model);
    } else {
      const m = model || DEFAULT_AZURE_OPENAI_DEPLOYMENT;
      set(out, "AZURE_OPENAI_DEPLOYMENT", m);
      set(out, "AZURE_DEPLOYMENT_NAME", m);
      set(out, "ASKDB_AI_MODEL", m);
    }
  } else if (p === "anthropic") {
    set(out, "ANTHROPIC_API_KEY", conn.apiKey);
    set(out, "ANTHROPIC_BASE_URL", conn.baseUrl);
    if (usage === "embedding") {
      set(out, "ASKDB_AI_EMBEDDING_MODEL", model);
    } else {
      const m = model || DEFAULT_ANTHROPIC_LANGUAGE_MODEL;
      set(out, "ASKDB_AI_MODEL", m);
    }
  } else if (p === "google") {
    set(out, "GOOGLE_GENERATIVE_AI_API_KEY", conn.apiKey);
    set(out, "GOOGLE_AI_BASE_URL", conn.baseUrl);
    if (usage === "embedding") {
      set(out, "ASKDB_AI_EMBEDDING_MODEL", model);
    } else {
      const m = model || DEFAULT_GOOGLE_LANGUAGE_MODEL;
      set(out, "ASKDB_AI_MODEL", m);
    }
  } else if (p === "gateway") {
    set(out, "AI_GATEWAY_API_KEY", conn.apiKey);
    set(out, "ASKDB_AI_BASE_URL", conn.baseUrl);
    if (usage === "embedding") {
      set(out, "ASKDB_AI_EMBEDDING_MODEL", model);
    } else {
      const m = model || DEFAULT_GATEWAY_LANGUAGE_MODEL;
      set(out, "ASKDB_AI_MODEL", m);
    }
  } else {
    // Custom/third-party provider
    set(out, "ASKDB_AI_API_KEY", conn.apiKey);
    set(out, "ASKDB_AI_BASE_URL", conn.baseUrl);
    if (usage === "embedding") {
      set(out, "ASKDB_AI_EMBEDDING_MODEL", model);
    } else {
      set(out, "ASKDB_AI_MODEL", model);
    }
  }
}

function applyReasoningAi(out: Record<string, string>, reasoning: AskDbAiReasoningConfig | undefined): void {
  if (!reasoning) return;
  for (const [envKey, value] of [
    ["ASKDB_AI_REASONING_EFFORT", reasoning.effort],
    ["ASKDB_AI_REASONING_EFFORT_NL_TO_SQL", reasoning.nlToSql],
    ["ASKDB_AI_REASONING_EFFORT_ENRICHMENT", reasoning.enrichment],
  ] as const) {
    if (value !== undefined && !isMember(value, ASKDB_REASONING_EFFORTS)) {
      throw new Error(
        `askdb.config: invalid ai.reasoning value "${value}" (expected one of: ${ASKDB_REASONING_EFFORTS.join(", ")}).`,
      );
    }
    set(out, envKey, value);
  }
}

/**
 * Flattens a nested {@link AskDbConfig} into canonical env keys for the runtime snapshot
 * (`AskDbEnvProjection.entries`).
 */
export function flattenAskDbConfig(config: AskDbConfig): Record<string, string> {
  const { config: normalized } = normalizeAskDbConfig(config);
  const out: Record<string, string> = {};

  // --- AI (Language view) ---
  const lang = normalized.ai.language;
  const langConns = normalized.ai.providerConfig[lang.provider] ?? [];
  const langConn = langConns.find((c) => c.name === lang.connection) ?? { name: lang.connection };

  set(out, "ASKDB_AI_PROVIDER", lang.provider);
  applyProviderConnectionEnv(out, lang.provider, langConn, {
    model: lang.model,
    modelFamily: lang.modelFamily,
    usage: "language",
  });
  applyReasoningAi(out, lang.reasoning);

  // --- Introspection ---
  const intro = config.introspection;
  if (intro) {
    if (intro.provider === "postgres") {
      set(out, "ASKDB_INTROSPECT_POSTGRES_URL", intro.providerConfig?.postgres?.databaseUrl);
    } else if (intro.provider === "prisma") {
      // schemaPath lives in structured config (introspection.providerConfig.prisma.schemaPath);
      // @askdb/prisma discovers it at runtime — no flat env key needed.
    } else if (intro.provider === "mysql") {
      set(out, "ASKDB_INTROSPECT_MYSQL_URL", intro.providerConfig?.mysql?.databaseUrl);
    } else if (intro.provider === "sqlite") {
      set(out, "ASKDB_INTROSPECT_SQLITE_FILE", intro.providerConfig?.sqlite?.file);
    } else if (intro.provider === "sqlserver") {
      set(out, "ASKDB_INTROSPECT_SQLSERVER_URL", intro.providerConfig?.sqlserver?.databaseUrl);
    }

    const outDir = intro.outputDir?.trim() || DEFAULT_INTROSPECT_OUTPUT_DIR;
    set(out, "ASKDB_INTROSPECT_OUT", outDir);
    set(out, "ASKDB_INTROSPECT_SCHEMAS", intro.schemas?.join(","));
  }

  // --- RAG ---
  const rag = normalized.rag;
  set(out, "ASKDB_RAG_EMBEDDER", rag.embedder);

  if (rag.embedder === "ai" && normalized.ai.embedding) {
    const emb = normalized.ai.embedding;
    set(out, "ASKDB_RAG_EMBEDDER_MODEL", emb.model);
    if (emb.dimensions !== undefined) {
      set(out, "ASKDB_RAG_EMBEDDER_DIMENSIONS", String(emb.dimensions));
    }
  }

  if (rag.store === "file") {
    const f = rag.storeConfig.file;
    if (!f) throw new Error('askdb.config: rag.store is "file" but `rag.storeConfig.file` is missing.');
    const basePath = f.basePath?.trim() || DEFAULT_RAG_FILE_BASE_PATH;
    set(out, "ASKDB_RAG_FILE_BASE_PATH", basePath);
  } else if (rag.store === "memory") {
    // no env keys
  } else if (rag.store === "pgvector") {
    const p = rag.storeConfig.pgvector;
    if (!p) throw new Error('askdb.config: rag.store is "pgvector" but `rag.storeConfig.pgvector` is missing.');
    const url = p.databaseUrl?.trim();
    if (!url) {
      throw new Error(
        'askdb.config: rag.store is "pgvector" but `storeConfig.pgvector.databaseUrl` is missing (set ASKDB_PGVECTOR_URL via env in askdb.config).',
      );
    }
    set(out, "ASKDB_PGVECTOR_URL", url);
    const pgDims =
      parsePositiveInteger(p.dimensions) ??
      (rag.embedder === "ai" ? normalized.ai.embedding?.dimensions : DEFAULT_MOCK_RAG_EMBEDDING_DIMENSIONS);
    if (pgDims !== undefined) {
      set(out, "ASKDB_RAG_EMBEDDER_DIMENSIONS", String(pgDims));
    }
    const strategy = normalizePgvectorIndexStrategy(
      typeof p.indexStrategy === "string" ? p.indexStrategy : undefined,
    );
    set(out, "ASKDB_PGVECTOR_INDEX_STRATEGY", strategy);
  }

  // --- Logging ---
  if (config.logging?.level) {
    const lvl = config.logging.level;
    if (!isMember(lvl, ASKDB_LOG_LEVELS)) {
      throw new Error(
        `askdb.config: invalid logging.level "${lvl}" (expected one of: ${ASKDB_LOG_LEVELS.join(", ")}).`,
      );
    }
    set(out, "ASKDB_LOG_LEVEL", lvl);
  }
  set(out, "ASKDB_CORRELATION_ID", config.logging?.correlationId);

  // --- Modes ---
  if (config.modes?.askdbMode) {
    const m = config.modes.askdbMode;
    if (!isMember(m, ASKDB_MODES_V1)) {
      throw new Error(
        `askdb.config: invalid modes.askdbMode "${m}" (expected one of: ${ASKDB_MODES_V1.join(", ")}).`,
      );
    }
    set(out, "ASKDB_MODE", m);
  }
  if (config.modes?.omitSensitiveFromPrompt === true) {
    set(out, "ASKDB_OMIT_SENSITIVE_FROM_PROMPT", "true");
  }

  // --- Host ---
  set(out, "ASKDB_SCHEMA_PATH", config.host?.schemaPath);
  set(out, "ASKDB_SCHEMA_JSON", config.host?.schemaJson);

  if (config.logging?.logFile) {
    set(out, "ASKDB_LOG_FILE", config.logging.logFile);
  }
  if (config.logging?.logStdout === true) {
    set(out, "ASKDB_LOG_STDOUT", "true");
  }

  // --- Dev ---
  if (config.dev?.mockSql) {
    set(out, "ASKDB_MOCK_SQL", config.dev.mockSql);
  }

  // --- Studio ---
  if (config.studio?.listen?.host) {
    set(out, "ASKDB_STUDIO_HOST", config.studio.listen.host);
  }
  if (config.studio?.listen?.port !== undefined && !Number.isNaN(config.studio.listen.port)) {
    set(out, "ASKDB_STUDIO_PORT", String(config.studio.listen.port));
  }
  set(out, "ASKDB_STUDIO_EXECUTE_PROVIDER", config.studio?.execute?.provider);
  set(out, "ASKDB_STUDIO_DATABASE_URL", config.studio?.execute?.databaseUrl);
  set(out, "ASKDB_STUDIO_SQLITE_FILE", config.studio?.execute?.file);
  const studioExecute = config.studio?.execute;
  if (studioExecute?.enabled !== undefined) {
    if (typeof studioExecute.enabled !== "boolean") {
      throw new Error("askdb.config: studio.execute.enabled must be a boolean.");
    }
    set(out, "ASKDB_STUDIO_EXECUTE_ENABLED", String(studioExecute.enabled));
  }
  if (studioExecute?.useIntrospectionConnection !== undefined) {
    if (typeof studioExecute.useIntrospectionConnection !== "boolean") {
      throw new Error("askdb.config: studio.execute.useIntrospectionConnection must be a boolean.");
    }
    set(
      out,
      "ASKDB_STUDIO_EXECUTE_USE_INTROSPECTION_CONNECTION",
      String(studioExecute.useIntrospectionConnection),
    );
  }
  for (const [field, key] of [
    ["timeoutMs", "ASKDB_STUDIO_EXECUTE_TIMEOUT_MS"],
    ["maxRows", "ASKDB_STUDIO_EXECUTE_MAX_ROWS"],
  ] as const) {
    const raw = studioExecute?.[field];
    if (raw === undefined) continue;
    const n = parsePositiveInteger(raw);
    if (n === undefined) {
      throw new Error(
        `askdb.config: studio.execute.${field} must be a positive integer (got ${JSON.stringify(raw)}).`,
      );
    }
    set(out, key, String(n));
  }
  // --- HTTP API listen (canonical keys on runtime flat map) ---
  const httpListen = config.httpApi?.listen;
  if (httpListen?.port !== undefined && !Number.isNaN(httpListen.port)) {
    set(out, "PORT", String(httpListen.port));
  }
  if (httpListen?.host) {
    set(out, "HOST", httpListen.host);
  }

  return out;
}
