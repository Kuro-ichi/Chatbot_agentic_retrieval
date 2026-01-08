import { LRUCache } from "lru-cache";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { createEmbeddingClient } from "./client.js";

const cache = new LRUCache({ max: config.embeddings.cacheSize });

export function embeddingsEnabled() {
  return !!config.embeddings.enabled;
}

/**
 * Default embedding provider: OpenAI-compatible /embeddings endpoint.
 * You can replace this module with your own embedding model easily.
 */
export async function embedText(text) {
  const input = String(text || "").trim();
  if (!input) throw new Error("Empty embedding input");

  const key = `emb:${config.embeddings.model}:${input}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const client = createEmbeddingClient();
  const out = await client.embeddings({ model: config.embeddings.model, input });
  const emb = out.embedding;

  if (config.embeddings.dim && emb.length !== config.embeddings.dim) {
    logger.warn({ got: emb.length, expected: config.embeddings.dim }, "Embedding dim mismatch (continue anyway)");
  }

  cache.set(key, emb);
  return emb;
}
