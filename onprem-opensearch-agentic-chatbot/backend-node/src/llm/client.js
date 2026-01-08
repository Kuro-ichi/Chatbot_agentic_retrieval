import axios from "axios";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

function buildHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
}

export class OpenAICompatClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey || "";
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: buildHeaders(this.apiKey),
      timeout: 120000,
    });
  }

  async chatCompletions({ model, messages, temperature, max_tokens, response_format }) {
    const payload = {
      model,
      messages,
      temperature,
      max_tokens,
    };
    if (response_format) payload.response_format = response_format;

    try {
      const resp = await this.http.post("/chat/completions", payload);
      const choice = resp.data?.choices?.[0];
      const content = choice?.message?.content ?? "";
      return { content, raw: resp.data };
    } catch (err) {
      const msg = err?.response?.data || err?.message || String(err);
      logger.error({ err: msg }, "LLM chat completion failed");
      throw new Error("LLM chat completion failed");
    }
  }

  async embeddings({ model, input }) {
    const payload = { model, input };
    try {
      const resp = await this.http.post("/embeddings", payload);
      // OpenAI format: { data: [{ embedding: [...] }], ... }
      const emb = resp.data?.data?.[0]?.embedding;
      if (!Array.isArray(emb)) throw new Error("No embedding returned");
      return { embedding: emb, raw: resp.data };
    } catch (err) {
      const msg = err?.response?.data || err?.message || String(err);
      logger.error({ err: msg }, "Embeddings request failed");
      throw new Error("Embeddings request failed");
    }
  }
}

export function createLLMClient() {
  return new OpenAICompatClient({ baseUrl: config.llm.baseUrl, apiKey: config.llm.apiKey });
}

export function createEmbeddingClient() {
  return new OpenAICompatClient({ baseUrl: config.embeddings.baseUrl, apiKey: config.embeddings.apiKey });
}
