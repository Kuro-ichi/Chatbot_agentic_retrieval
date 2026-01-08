import dotenv from "dotenv";
dotenv.config();

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === "") return def;
  return ["1","true","yes","y","on"].includes(String(v).toLowerCase());
}
function parseIntSafe(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function parseList(v, def = []) {
  if (!v) return def;
  return String(v).split(",").map(s => s.trim()).filter(Boolean);
}

export const config = {
  app: {
    port: parseIntSafe(process.env.APP_PORT, 3000),
    corsOrigin: process.env.APP_CORS_ORIGIN || "*",
  },

  llm: {
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:8000/v1",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "qwen2.5-7b-instruct",
    jsonMode: parseBool(process.env.LLM_JSON_MODE, false),
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
    maxTokens: parseIntSafe(process.env.LLM_MAX_TOKENS, 700),
  },

  embeddings: {
    enabled: parseBool(process.env.EMBEDDINGS_ENABLED, true),
    baseUrl: process.env.EMBEDDING_BASE_URL || (process.env.LLM_BASE_URL || "http://localhost:8000/v1"),
    apiKey: process.env.EMBEDDING_API_KEY || (process.env.LLM_API_KEY || ""),
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    dim: parseIntSafe(process.env.EMBEDDING_DIM, 768),
    cacheSize: parseIntSafe(process.env.EMBEDDING_CACHE_SIZE, 2000),
  },

  opensearch: {
    node: process.env.OPENSEARCH_NODE || "http://localhost:9200",
    index: process.env.OPENSEARCH_INDEX || "docs_index",
    authMode: (process.env.OPENSEARCH_AUTH_MODE || "none").toLowerCase(), // none|basic|apikey
    username: process.env.OPENSEARCH_USERNAME || "",
    password: process.env.OPENSEARCH_PASSWORD || "",
    apiKey: process.env.OPENSEARCH_API_KEY || "",
    apiKeyHeader: process.env.OPENSEARCH_API_KEY_HEADER || "Authorization",
    apiKeyPrefix: process.env.OPENSEARCH_API_KEY_PREFIX || "ApiKey",
    sslRejectUnauthorized: parseBool(process.env.OPENSEARCH_SSL_REJECT_UNAUTHORIZED, false),
    vectorField: process.env.OPENSEARCH_VECTOR_FIELD || "embedding",
    sourceFields: parseList(process.env.OPENSEARCH_SOURCE_FIELDS, ["doc_id","title","content","chunk_id","source","updated_at","url"]),
    keywordFields: parseList(process.env.OPENSEARCH_KEYWORD_FIELDS, ["title^3","title.keyword^6","content"]),
  },

  retrieval: {
    topN: parseIntSafe(process.env.TOP_N, 8),
    subquerySize: parseIntSafe(process.env.SUBQUERY_SIZE, 20),
    rrfK: parseIntSafe(process.env.RRF_K, 60),
    knnNumCandidates: parseIntSafe(process.env.KNN_NUM_CANDIDATES, 200),
    allowRefine: parseBool(process.env.ALLOW_REFINE, true),
    chunkContentMaxChars: parseIntSafe(process.env.CHUNK_CONTENT_MAX_CHARS, 1400),
    evidenceMinHits: parseIntSafe(process.env.EVIDENCE_MIN_HITS, 2),
    evidenceMinTokenMatches: parseIntSafe(process.env.EVIDENCE_MIN_TOKEN_MATCHES, 2),
  },
};
