import axios from "axios";
import { config } from "../config.js";
import { createOpenSearchClient } from "../opensearch/client.js";
import { logger } from "../utils/logger.js";

const osClient = createOpenSearchClient();

export async function diagnosticsHandler(req, res) {
  const out = {
    ok: true,
    opensearch: { ok: false },
    llm: { ok: false },
    embeddings: { enabled: config.embeddings.enabled, ok: false }
  };

  // OpenSearch
  try {
    const info = await osClient.info();
    out.opensearch.ok = true;
    out.opensearch.version = info.body?.version?.number || null;
    out.opensearch.cluster_name = info.body?.cluster_name || null;
  } catch (e) {
    out.ok = false;
    out.opensearch.error = e?.message || String(e);
  }

  // LLM /models (best-effort; some servers may not support)
  try {
    const base = config.llm.baseUrl.replace(/\/$/, "");
    const headers = { "Content-Type": "application/json" };
    if (config.llm.apiKey) headers["Authorization"] = `Bearer ${config.llm.apiKey}`;
    const r = await axios.get(base + "/models", { headers, timeout: 15000 });
    out.llm.ok = true;
    out.llm.models_count = Array.isArray(r.data?.data) ? r.data.data.length : null;
  } catch (e) {
    // Not fatal
    out.llm.ok = false;
    out.llm.note = "LLM /models not available or blocked (non-fatal)";
  }

  // Embeddings check
  if (config.embeddings.enabled) {
    try {
      const base = config.embeddings.baseUrl.replace(/\/$/, "");
      const headers = { "Content-Type": "application/json" };
      if (config.embeddings.apiKey) headers["Authorization"] = `Bearer ${config.embeddings.apiKey}`;
      // small smoke-test input; may fail if embeddings not supported
      const payload = { model: config.embeddings.model, input: "ping" };
      const r = await axios.post(base + "/embeddings", payload, { headers, timeout: 20000 });
      const emb = r.data?.data?.[0]?.embedding;
      if (Array.isArray(emb)) {
        out.embeddings.ok = true;
        out.embeddings.dim = emb.length;
      } else {
        out.embeddings.ok = false;
        out.embeddings.note = "No embedding returned";
      }
    } catch (e) {
      out.embeddings.ok = false;
      out.embeddings.note = "Embeddings endpoint not available (vector/hybrid will fallback to keyword)";
    }
  } else {
    out.embeddings.ok = true;
  }

  return res.json(out);
}
