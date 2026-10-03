---
"@askdb/config": minor
"@askdb/ai": minor
"@askdb/studio": patch
"askdb": patch
---

Decouple AI provider connections from language and embedding functional sections, eliminate cross-provider secret leakage, and deprecate legacy configuration keys.

**@askdb/config**:
- Introduce decoupled AI configuration:
  - `ai.providerConfig`: keyed by provider id with single or array of named connections (`name`, `apiKey`, `baseUrl`, plus Azure/Foundry connection properties).
  - `ai.language`: model selection, optional connection binding, and reasoning effort.
  - `ai.embedding`: model selection, optional dimensions, and optional connection binding.
- Deprecate top-level `ai.provider`, `ai.providerConfig.<provider>.model`, `ai.providerConfig.custom`, `ai.reasoning`, `rag.embedder: "openai" | "ai-sdk"` (replaced with `rag.embedder: "ai"`), and `rag.embedderConfig`.
- Eliminate flat `ASKDB_RAG_EMBEDDER_API_KEY` and `ASKDB_RAG_EMBEDDER_BASE_URL` writes to prevent secret leakage.
- Runtime config now exposes `rt.ai.language`, `rt.ai.embedding`, `rt.rag.embedder`, and collects `deprecations` emitted via `process.emitWarning`.

**@askdb/ai**:
- Mark `defaultEmbeddingModel` deprecated on `ProviderEnvSpec`.
- `resolveModel` emits an `ASKDB_AI_DEFAULT_EMBEDDING_MODEL` deprecation warning once per process when falling back to a provider's default embedding model.
- Reword gateway and anthropic guidance messages to reference `ai.embedding` and `ai.embedding.model`.

**@askdb/studio**:
- Derive RAG embedder configuration cleanly from `rag.embedder` and `rt.ai.embedding`.
- Delete `buildStudioRagEmbeddingEnv`, `fallbackStudioRagProvider`, and `DEFAULT_EMBEDDING_MODEL`, eliminating embedding key leakage (#345).
- Structure embedder IDs as `ai-sdk:<provider>:<model>:<dims>`. Note: Studio indexes built with a provider other than OpenAI get a new embedder id and must be reindexed once.
- Show active embedder in the Studio Settings RAG card.
- RAG error messages now clearly identify section, provider, connection, and model.

**askdb**:
- Update `askdb init` scaffold to write the new `providerConfig`, `language: { model }`, and drop `embedderConfig: {}`.
