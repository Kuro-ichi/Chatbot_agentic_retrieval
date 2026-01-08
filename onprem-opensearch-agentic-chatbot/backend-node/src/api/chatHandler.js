import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { createLLMClient } from "../llm/client.js";
import { runPlanner } from "../llm/planner.js";
import { buildAnswerMessages } from "../llm/answer.js";
import { embedText, embeddingsEnabled } from "../llm/embedding.js";
import { createOpenSearchClient } from "../opensearch/client.js";
import { searchKeyword, searchVector, searchHybrid } from "../opensearch/search.js";
import { mergeFilters } from "../opensearch/filters.js";
import { mergeResultsRRF } from "../retrieval/merge.js";
import { evidenceCheck } from "../retrieval/evidence.js";
import { truncateText } from "../utils/text.js";

const llmClient = createLLMClient();
const osClient = createOpenSearchClient();

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(x => x && typeof x === "object" && typeof x.content === "string")
    .map(x => ({ role: x.role === "assistant" ? "assistant" : "user", content: x.content }))
    .slice(-6);
}

function summarizeChunkForResponse(c) {
  return {
    doc_id: c.doc_id,
    chunk_id: c.chunk_id,
    title: c.title,
    source: c.source,
    updated_at: c.updated_at,
    url: c.url || null,
    content: truncateText(c.content || "", config.retrieval.chunkContentMaxChars),
    _score: c._score ?? null,
    _rrf_score: c._rrf_score ?? null,
    search_type: c.search_type,
    subquery_id: c.subquery_id || null,
    _rank: c._rank,
  };
}

async function executeSubquery(subq, globalFilters) {
  const subquery_id = subq.id;
  const topK = Math.min(config.retrieval.subquerySize, Math.max(3, Number(subq.top_k || config.retrieval.subquerySize)));
  const finalFilters = mergeFilters(globalFilters || {}, subq.filters || {});

  const preferred = subq.preferred_search;
  const query = String(subq.query || "").trim();

  if (preferred === "keyword" || !embeddingsEnabled()) {
    const { requestBody, hits } = await searchKeyword(osClient, { query, filters: finalFilters, size: topK });
    return {
      subquery_id,
      preferred_search: "keyword",
      query_text: query,
      filters: finalFilters,
      request_bodies: [{ type: "keyword", body: requestBody }],
      hits,
    };
  }

  // Embedding step
  let vector = null;
  try {
    vector = await embedText(query);
  } catch (e) {
    logger.warn({ err: e?.message }, "Embedding failed; fallback to keyword");
    const { requestBody, hits } = await searchKeyword(osClient, { query, filters: finalFilters, size: topK });
    return {
      subquery_id,
      preferred_search: "keyword(fallback)",
      query_text: query,
      filters: finalFilters,
      request_bodies: [{ type: "keyword", body: requestBody }],
      hits,
    };
  }

  if (preferred === "vector") {
    const { requestBody, hits } = await searchVector(osClient, { vector, filters: finalFilters, size: topK });
    return {
      subquery_id,
      preferred_search: "vector",
      query_text: query,
      filters: finalFilters,
      request_bodies: [{ type: "vector", body: requestBody }],
      hits,
    };
  }

  // Hybrid
  const out = await searchHybrid(osClient, { query, vector, filters: finalFilters, size: topK, rrfK: config.retrieval.rrfK });
  return {
    subquery_id,
    preferred_search: "hybrid",
    query_text: query,
    filters: finalFilters,
    request_bodies: out.requestBodies,
    hits: out.hits,
  };
}

function buildNoEvidenceAnswer(question) {
  const suggestions = [
    "Bạn có thể cung cấp thêm tên tài liệu/quy trình, mã hệ thống, hoặc từ khoá chính xác.",
    "Nếu có, hãy cho biết nguồn tài liệu (policy/sop/tech/wiki) hoặc khoảng thời gian cập nhật."
  ];
  return `Không tìm thấy trong tài liệu hiện có.\n\nGợi ý:\n- ${suggestions.join("\n- ")}`;
}

async function generateFinalAnswer({ question, history, chunks }) {
  if (!chunks || chunks.length === 0) return buildNoEvidenceAnswer(question);

  const messages = buildAnswerMessages({ question, history, chunks });
  const out = await llmClient.chatCompletions({
    model: config.llm.model,
    messages,
    temperature: config.llm.temperature,
    max_tokens: config.llm.maxTokens
  });

  let answer = String(out.content || "").trim();

  // Enforce that the answer has citations. If not, append a compact source list.
  const hasCitation = /\[[^\]]+?:[^\]]+?\]/.test(answer);
  if (!hasCitation) {
    const lines = chunks.slice(0, 5).map(c => {
      const url = c.url ? ` (${c.url})` : "";
      return `- [${c.doc_id}:${c.chunk_id}] ${c.title || ""} (${c.updated_at || ""})${url}`;
    });
    answer = answer + "\n\nNguồn tham khảo:\n" + lines.join("\n");
  }

  return answer;
}

function buildExecutedQueries(executions) {
  const executed = [];
  for (const exe of executions || []) {
    for (const rb of exe.request_bodies || []) {
      executed.push({
        stage: exe.stage || "initial",
        subquery_id: exe.subquery_id,
        preferred_search: exe.preferred_search,
        query_text: exe.query_text,
        filters: exe.filters,
        type: rb.type,
        body: rb.body
      });
    }
  }
  return executed;
}

export async function chatHandler(req, res) {
  const requestId = uuidv4();
  const started = Date.now();

  try {
    const message = String(req.body?.message || "").trim();
    const debug = !!req.body?.debug;
    const history = normalizeHistory(req.body?.history || []);
    const globalFilters = (req.body?.filters && typeof req.body.filters === "object") ? req.body.filters : {};

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    // 1) Planner (initial)
    const planner_initial = await runPlanner({
      llmClient,
      question: message,
      history,
      globalFilters,
      refine: false
    });

    // 2) Execute subqueries (initial)
    const executions_initial = [];
    for (const sq of planner_initial.subqueries) {
      const exe = await executeSubquery(sq, globalFilters);
      exe.stage = "initial";
      executions_initial.push(exe);
    }

    // 3) Merge (initial)
    let merged = mergeResultsRRF(executions_initial, { rrfK: config.retrieval.rrfK, topN: config.retrieval.topN });
    let evidence_initial = evidenceCheck({ question: message, chunks: merged, plannerOutput: planner_initial });

    // 4) Evidence check + refine once
    let refine_used = false;
    let planner_refined = null;
    let executions_refined = [];
    let evidence_refined = null;

    if (!evidence_initial.ok && config.retrieval.allowRefine) {
      refine_used = true;

      planner_refined = await runPlanner({
        llmClient,
        question: message,
        history,
        globalFilters,
        refine: true,
        previous: planner_initial,
        weakReason: evidence_initial.reason
      });

      for (const sq of planner_refined.subqueries) {
        const exe = await executeSubquery(sq, globalFilters);
        exe.stage = "refined";
        executions_refined.push(exe);
      }

      const merged2 = mergeResultsRRF(executions_refined, { rrfK: config.retrieval.rrfK, topN: config.retrieval.topN });
      evidence_refined = evidenceCheck({ question: message, chunks: merged2, plannerOutput: planner_refined });

      // Choose better evidence (by best_match then hits count)
      const score1 = (evidence_initial.best_match || 0) * 10 + merged.length;
      const score2 = (evidence_refined.best_match || 0) * 10 + merged2.length;

      if (evidence_refined.ok || score2 > score1) {
        merged = merged2;
      }
    }

    // 5) Answer
    const final_answer = await generateFinalAnswer({ question: message, history, chunks: merged });

    const took_ms = Date.now() - started;

    const executed_queries = [
      ...buildExecutedQueries(executions_initial),
      ...buildExecutedQueries(executions_refined)
    ];

    const retrieved_chunks = merged.map(summarizeChunkForResponse);

    if (debug) {
      return res.json({
        request_id: requestId,
        took_ms,
        planner_output_initial: planner_initial,
        evidence_initial,
        planner_output_refined: planner_refined,
        evidence_refined,
        refine_used,
        executed_queries,
        retrieved_chunks,
        final_answer
      });
    }

    return res.json({
      request_id: requestId,
      took_ms,
      answer: final_answer,
      meta: {
        refine_used,
        evidence: (evidence_refined && refine_used) ? evidence_refined : evidence_initial,
        chunks: retrieved_chunks.map(c => ({
          doc_id: c.doc_id,
          chunk_id: c.chunk_id,
          title: c.title,
          updated_at: c.updated_at,
          url: c.url
        }))
      }
    });
  } catch (e) {
    logger.error({ err: e?.message || String(e) }, "chatHandler error");
    return res.status(500).json({ error: "internal_error" });
  }
}
