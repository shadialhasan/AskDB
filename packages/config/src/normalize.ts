import { ASKDB_AI_PROVIDERS, ASKDB_RAG_EMBEDDERS, ASKDB_RAG_STORES } from "./constants.js";
import {
  DEFAULT_ANTHROPIC_LANGUAGE_MODEL,
  DEFAULT_AZURE_OPENAI_DEPLOYMENT,
  DEFAULT_GATEWAY_LANGUAGE_MODEL,
  DEFAULT_GOOGLE_LANGUAGE_MODEL,
  DEFAULT_OPENAI_LANGUAGE_MODEL,
  DEFAULT_RAG_EMBEDDING_MODEL,
  knownEmbeddingDimensions,
  parsePositiveInteger,
} from "./defaults.js";
import type { AskDbAiReasoningConfig, AskDbConfig } from "./types.js";

export type NormalizedConnection = {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  resourceName?: string;
  secondaryApiKey?: string;
  apiVersion?: string;
  model?: string;
  modelFamily?: string;
};

export type NormalizedAiLanguage = {
  provider: string;
  connection: string;
  model: string | undefined;
  modelFamily: string | undefined;
  reasoning?: AskDbAiReasoningConfig;
};

export type NormalizedAiEmbedding = {
  provider: string;
  connection: string;
  model: string;
  dimensions: number | undefined;
  requestDimensions?: number;
};

export type NormalizedAskDbConfig = Omit<AskDbConfig, "ai" | "rag"> & {
  ai: {
    provider?: string;
    providerConfig: Record<string, NormalizedConnection[]>;
    language: NormalizedAiLanguage;
    embedding?: NormalizedAiEmbedding;
  };
  rag: {
    embedder: "mock" | "ai";
    store: AskDbConfig["rag"]["store"];
    storeConfig: AskDbConfig["rag"]["storeConfig"];
  };
};

export type NormalizeConfigResult = {
  config: NormalizedAskDbConfig;
  deprecations: string[];
};

function isBuiltinProvider(provider: string): boolean {
  return (ASKDB_AI_PROVIDERS as readonly string[]).includes(provider);
}

function normalizeConnectionsForProvider(
  provider: string,
  raw: unknown,
): NormalizedConnection[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const result: NormalizedConnection[] = [];
  const seenNames = new Set<string>();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const conn = item as Record<string, unknown>;
    const name = typeof conn.name === "string" && conn.name.trim() !== "" ? conn.name.trim() : "default";
    if (seenNames.has(name)) {
      throw new Error(`askdb.config: duplicate connection name "${name}" in ai.providerConfig.${provider}.`);
    }
    seenNames.add(name);
    result.push({
      name,
      apiKey: typeof conn.apiKey === "string" ? conn.apiKey : undefined,
      baseUrl: typeof conn.baseUrl === "string" ? conn.baseUrl : undefined,
      resourceName: typeof conn.resourceName === "string" ? conn.resourceName : undefined,
      secondaryApiKey: typeof conn.secondaryApiKey === "string" ? conn.secondaryApiKey : undefined,
      apiVersion: typeof conn.apiVersion === "string" ? conn.apiVersion : undefined,
      model: typeof conn.model === "string" ? conn.model : undefined,
      modelFamily: typeof conn.modelFamily === "string" ? conn.modelFamily : undefined,
    });
  }

  return result;
}

function getDefaultLanguageModel(provider: string): string | undefined {
  if (provider === "openai") return DEFAULT_OPENAI_LANGUAGE_MODEL;
  if (provider === "azure" || provider === "foundry") return DEFAULT_AZURE_OPENAI_DEPLOYMENT;
  if (provider === "anthropic") return DEFAULT_ANTHROPIC_LANGUAGE_MODEL;
  if (provider === "google") return DEFAULT_GOOGLE_LANGUAGE_MODEL;
  if (provider === "gateway") return DEFAULT_GATEWAY_LANGUAGE_MODEL;
  return undefined;
}

export function normalizeAskDbConfig(config: AskDbConfig): NormalizeConfigResult {
  const deprecations: string[] = [];

  // Validate rag embedder
  const rawEmbedder = config.rag?.embedder;
  if (rawEmbedder !== undefined && !(ASKDB_RAG_EMBEDDERS as readonly string[]).includes(rawEmbedder)) {
    throw new Error(
      `askdb.config: invalid rag.embedder "${rawEmbedder}" (expected one of: ${ASKDB_RAG_EMBEDDERS.join(", ")}).`,
    );
  }

  // Provider connections map
  const rawProviderConfig = config.ai?.providerConfig ?? {};
  const providerConnections: Record<string, NormalizedConnection[]> = {};

  for (const [p, raw] of Object.entries(rawProviderConfig)) {
    if (p === "custom") continue;
    providerConnections[p] = normalizeConnectionsForProvider(p, raw);
  }

  // T4: providerConfig.custom -> providerConfig[ai.provider] when ai.provider is custom
  const rawCustom = (rawProviderConfig as Record<string, unknown>).custom;
  if (rawCustom) {
    deprecations.push(`ai.providerConfig.custom is deprecated; configure ai.providerConfig.${config.ai?.provider ?? "custom"} instead.`);
    if (config.ai?.provider && !isBuiltinProvider(config.ai.provider) && !providerConnections[config.ai.provider]) {
      providerConnections[config.ai.provider] = normalizeConnectionsForProvider(config.ai.provider, rawCustom);
    }
  }

  // 1. Language section resolution
  const langProvider = config.ai?.language?.provider ?? config.ai?.provider;
  if (!langProvider || langProvider.trim() === "") {
    throw new Error("askdb.config: ai.language has no provider; set ai.language.provider or ai.provider.");
  }
  const L = langProvider.trim();

  // Find language connection
  const langConnName = config.ai?.language?.connection ?? "default";
  let lConnections = providerConnections[L];
  if (!lConnections || lConnections.length === 0) {
    if (isBuiltinProvider(L)) {
      throw new Error(
        `askdb.config: ai.providerConfig.${L} is required when ai.language.provider is "${L}". ` +
          `(Did you put the settings under providerConfig.custom? That branch is only for ` +
          `third-party providers without a first-party package.)`,
      );
    }
    // Custom provider without connections -> empty default
    lConnections = [{ name: "default" }];
    providerConnections[L] = lConnections;
  }

  const defaultLConn = lConnections.find((c) => c.name === "default");
  const targetLConn = lConnections.find((c) => c.name === langConnName);
  if (!targetLConn) {
    if (langConnName === "default" && !isBuiltinProvider(L)) {
      const emptyConn: NormalizedConnection = { name: "default" };
      lConnections.push(emptyConn);
    } else {
      const avail = lConnections.map((c) => c.name).join(", ");
      throw new Error(`askdb.config: connection "${langConnName}" not found in ai.providerConfig.${L}. Available connections: ${avail}.`);
    }
  }

  // T1: model on default connection vs language.model
  const legacyLModel = defaultLConn?.model?.trim();
  const explicitLModel = config.ai?.language?.model?.trim();
  let resolvedLModel: string | undefined;

  if (explicitLModel) {
    resolvedLModel = explicitLModel;
    if (legacyLModel && legacyLModel !== explicitLModel) {
      deprecations.push(`ai.providerConfig.${L}.model is deprecated and ignored because ai.language.model is set.`);
    } else if (legacyLModel) {
      deprecations.push(`ai.providerConfig.${L}.model is deprecated; use ai.language.model instead.`);
    }
  } else if (legacyLModel) {
    deprecations.push(`ai.providerConfig.${L}.model is deprecated; use ai.language.model instead.`);
    resolvedLModel = legacyLModel;
  } else {
    resolvedLModel = getDefaultLanguageModel(L);
  }

  // T2: modelFamily on default connection vs language.modelFamily
  const legacyLModelFamily = defaultLConn?.modelFamily?.trim();
  const explicitLModelFamily = config.ai?.language?.modelFamily?.trim();
  let resolvedLModelFamily: string | undefined;

  if (explicitLModelFamily) {
    resolvedLModelFamily = explicitLModelFamily;
    if (legacyLModelFamily && legacyLModelFamily !== explicitLModelFamily) {
      deprecations.push(`ai.providerConfig.${L}.modelFamily is deprecated and ignored because ai.language.modelFamily is set.`);
    } else if (legacyLModelFamily) {
      deprecations.push(`ai.providerConfig.${L}.modelFamily is deprecated; use ai.language.modelFamily instead.`);
    }
  } else if (legacyLModelFamily) {
    deprecations.push(`ai.providerConfig.${L}.modelFamily is deprecated; use ai.language.modelFamily instead.`);
    resolvedLModelFamily = legacyLModelFamily;
  }

  // T3: reasoning
  if (config.ai?.reasoning && config.ai?.language?.reasoning) {
    throw new Error("askdb.config: both ai.language.reasoning and legacy ai.reasoning are configured; remove ai.reasoning.");
  }
  let resolvedReasoning = config.ai?.language?.reasoning;
  if (config.ai?.reasoning) {
    deprecations.push('ai.reasoning is deprecated; use ai.language.reasoning instead.');
    resolvedReasoning = config.ai.reasoning;
  }

  // Other connections having legacy .model or .modelFamily
  for (const [p, conns] of Object.entries(providerConnections)) {
    for (const c of conns) {
      if (p !== L || c.name !== "default") {
        if (c.model) {
          deprecations.push(`ai.providerConfig.${p}.model is deprecated; use ai.language.model instead.`);
        }
        if (c.modelFamily) {
          deprecations.push(`ai.providerConfig.${p}.modelFamily is deprecated; use ai.language.modelFamily instead.`);
        }
      }
    }
  }

  const normalizedLanguage: NormalizedAiLanguage = {
    provider: L,
    connection: langConnName,
    model: resolvedLModel,
    modelFamily: resolvedLModelFamily,
    reasoning: resolvedReasoning,
  };

  // 2. RAG & Embedding resolution
  const eo = config.rag?.embedderConfig?.openai;
  const hasEoKeys = eo && (
    eo.apiKey !== undefined ||
    eo.baseUrl !== undefined ||
    eo.model !== undefined ||
    eo.dimension !== undefined
  );

  let normalizedEmbedder: "mock" | "ai" = "mock";
  let normalizedEmbedding: NormalizedAiEmbedding | undefined;

  if (rawEmbedder === "mock" || rawEmbedder === undefined) {
    normalizedEmbedder = "mock";
    if (hasEoKeys) {
      deprecations.push('rag.embedderConfig.openai is deprecated and ignored when rag.embedder is "mock"; remove it or use rag.embedder: "ai" with ai.embedding.');
    }
  } else {
    // "openai" | "ai-sdk" | "ai"
    normalizedEmbedder = "ai";

    if (rawEmbedder === "openai" || rawEmbedder === "ai-sdk") {
      deprecations.push(`rag.embedder: "${rawEmbedder}" is deprecated; use rag.embedder: "ai" with ai.embedding instead.`);
      if (hasEoKeys) {
        deprecations.push('rag.embedderConfig.openai is deprecated; use ai.embedding and ai.providerConfig instead.');
      }

      // T10 check
      if (config.ai?.embedding && hasEoKeys) {
        throw new Error("askdb.config: both ai.embedding and legacy rag.embedderConfig.openai are configured; remove rag.embedderConfig.openai.");
      }

      let P: string;
      let embedModel: string;
      let embedDimensions: string | number | undefined;

      if (rawEmbedder === "openai") {
        P = "openai";
        embedModel = eo?.model?.trim() || DEFAULT_RAG_EMBEDDING_MODEL;
        embedDimensions = eo?.dimension;
      } else {
        // "ai-sdk"
        P = L;
        if (eo?.model?.trim()) {
          embedModel = eo.model.trim();
        } else if (P === "openai" || P === "azure" || P === "foundry") {
          embedModel = DEFAULT_RAG_EMBEDDING_MODEL;
        } else {
          throw new Error(`askdb.config: rag.embedder is "ai-sdk" with provider "${P}", which has no default embedding model; set ai.embedding.model.`);
        }
        embedDimensions = eo?.dimension;
      }

      // T7 connection handling
      let embedConnection = "default";
      if (eo?.apiKey !== undefined || eo?.baseUrl !== undefined) {
        if (P !== "openai" && P !== "azure" && P !== "foundry" && P !== "gateway") {
          throw new Error(
            `askdb.config: legacy rag.embedderConfig.openai contains credentials but the embedding provider is "${P}". ` +
              `To configure credentials for ${P}, use ai.providerConfig.${P}, or set ai.embedding.provider to "openai" with an OpenAI connection.`,
          );
        }

        let pConns = providerConnections[P];
        if (!pConns) {
          pConns = [];
          providerConnections[P] = pConns;
        }
        const defaultConn = pConns.find((c) => c.name === "default");

        if (!defaultConn) {
          pConns.push({
            name: "default",
            apiKey: eo.apiKey,
            baseUrl: eo.baseUrl,
          });
          embedConnection = "default";
        } else if (
          (eo.apiKey === undefined || eo.apiKey === defaultConn.apiKey) &&
          (eo.baseUrl === undefined || eo.baseUrl === defaultConn.baseUrl)
        ) {
          embedConnection = "default";
        } else {
          // Add "rag-embeddings" connection
          embedConnection = "rag-embeddings";
          pConns.push({
            ...defaultConn,
            apiKey: eo.apiKey ?? defaultConn.apiKey,
            baseUrl: eo.baseUrl ?? defaultConn.baseUrl,
            name: "rag-embeddings",
          });
        }
      }

      // Dimension resolution
      const explicitDims = parsePositiveInteger(embedDimensions);
      let parsedDims = explicitDims;

      // T8: pgvector dimensions
      const pgDimsRaw = config.rag?.storeConfig?.pgvector?.dimensions;
      const pgDims = parsePositiveInteger(pgDimsRaw);
      if (pgDims !== undefined) {
        deprecations.push('rag.storeConfig.pgvector.dimensions is deprecated; use ai.embedding.dimensions instead.');
        if (parsedDims !== undefined && parsedDims !== pgDims) {
          throw new Error(`askdb.config: conflicting dimensions: ai.embedding.dimensions is ${parsedDims} but rag.storeConfig.pgvector.dimensions is ${pgDims}.`);
        }
        if (parsedDims === undefined) {
          parsedDims = pgDims;
        }
      }

      if (parsedDims === undefined) {
        parsedDims = knownEmbeddingDimensions(P, embedModel);
      }

      if (parsedDims === undefined && config.rag?.store === "pgvector") {
        throw new Error(`askdb.config: set ai.embedding.dimensions for embedding model "${embedModel}"; pgvector needs a fixed width.`);
      }

      normalizedEmbedding = {
        provider: P,
        connection: embedConnection,
        model: embedModel,
        dimensions: parsedDims,
        requestDimensions: explicitDims,
      };
    } else {
      // rawEmbedder === "ai"
      if (hasEoKeys) {
        throw new Error("askdb.config: both ai.embedding and legacy rag.embedderConfig.openai are configured; remove rag.embedderConfig.openai.");
      }

      const emb = config.ai?.embedding;
      const P = emb?.provider?.trim() || config.ai?.provider?.trim();
      if (!P) {
        throw new Error("askdb.config: ai.embedding has no provider; set ai.embedding.provider or ai.provider.");
      }
      if (P === "anthropic") {
        throw new Error("askdb.config: anthropic has no embeddings API; set ai.embedding.provider (for example \"openai\") and give it a connection in ai.providerConfig.");
      }
      if (!emb?.model || emb.model.trim() === "") {
        throw new Error('askdb.config: rag.embedder is "ai" but ai.embedding.model is not set.');
      }
      const embedModel = emb.model.trim();

      const embedConnName = emb.connection?.trim() || "default";
      let pConns = providerConnections[P];
      if (!pConns || pConns.length === 0) {
        if (isBuiltinProvider(P)) {
          throw new Error(
            `askdb.config: ai.providerConfig.${P} is required when ai.embedding.provider is "${P}". ` +
              `(Did you put the settings under providerConfig.custom? That branch is only for ` +
              `third-party providers without a first-party package.)`,
          );
        }
        pConns = [{ name: "default" }];
        providerConnections[P] = pConns;
      }

      const targetConn = pConns.find((c) => c.name === embedConnName);
      if (!targetConn) {
        if (embedConnName === "default" && !isBuiltinProvider(P)) {
          pConns.push({ name: "default" });
        } else {
          const avail = pConns.map((c) => c.name).join(", ");
          throw new Error(`askdb.config: connection "${embedConnName}" not found in ai.providerConfig.${P}. Available connections: ${avail}.`);
        }
      }

      const explicitDims = parsePositiveInteger(emb.dimensions);
      let parsedDims = explicitDims;

      // T8: pgvector dimensions
      const pgDimsRaw = config.rag?.storeConfig?.pgvector?.dimensions;
      const pgDims = parsePositiveInteger(pgDimsRaw);
      if (pgDims !== undefined) {
        deprecations.push('rag.storeConfig.pgvector.dimensions is deprecated; use ai.embedding.dimensions instead.');
        if (parsedDims !== undefined && parsedDims !== pgDims) {
          throw new Error(`askdb.config: conflicting dimensions: ai.embedding.dimensions is ${parsedDims} but rag.storeConfig.pgvector.dimensions is ${pgDims}.`);
        }
        if (parsedDims === undefined) {
          parsedDims = pgDims;
        }
      }

      if (parsedDims === undefined) {
        parsedDims = knownEmbeddingDimensions(P, embedModel);
      }

      if (parsedDims === undefined && config.rag?.store === "pgvector") {
        throw new Error(`askdb.config: set ai.embedding.dimensions for embedding model "${embedModel}"; pgvector needs a fixed width.`);
      }

      normalizedEmbedding = {
        provider: P,
        connection: embedConnName,
        model: embedModel,
        dimensions: parsedDims,
        requestDimensions: explicitDims,
      };
    }
  }

  // Validate rag store
  if (config.rag?.store !== undefined && !(ASKDB_RAG_STORES as readonly string[]).includes(config.rag.store)) {
    throw new Error(
      `askdb.config: invalid rag.store "${config.rag.store}" (expected one of: ${ASKDB_RAG_STORES.join(", ")}).`,
    );
  }

  const normalized: NormalizedAskDbConfig = {
    ...config,
    ai: {
      provider: config.ai?.provider,
      providerConfig: providerConnections,
      language: normalizedLanguage,
      embedding: normalizedEmbedding,
    },
    rag: {
      embedder: normalizedEmbedder,
      store: config.rag?.store ?? "memory",
      storeConfig: config.rag?.storeConfig ?? {},
    },
  };

  return {
    config: normalized,
    deprecations,
  };
}
