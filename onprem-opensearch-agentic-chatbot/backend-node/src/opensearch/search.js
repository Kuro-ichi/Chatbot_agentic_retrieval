import { config } from "../config.js";
import { buildFilterClauses } from "./filters.js";
import { rrfFuseRankedLists } from "../retrieval/rrf.js";
import { logger } from "../utils/logger.js";
import { extractKeywords } from "../utils/text.js";

function mapHits(hits, extra = {}) {
  return (hits || []).map((h, idx) => {
    const s = h._source || {};
    return {
      doc_id: s.doc_id,
      chunk_id: s.chunk_id,
      title: s.title,
      content: s.content,
      source: s.source,
      updated_at: s.updated_at,
      url: s.url,
      _score: h._score ?? null,
      _rank: idx + 1,
      ...extra,
    };
  }).filter(x => x.doc_id !== undefined && x.chunk_id !== undefined);
}

function buildKeywordQuery(query) {
  const tokens = extractKeywords(query, { max: 12 });
  const tokenCount = tokens.length;

  // For very short queries, use stricter matching; otherwise allow partial match.
  const mm = {
    multi_match: {
      query,
      fields: config.opensearch.keywordFields,
      type: "best_fields",
      operator: tokenCount <= 2 ? "and" : "or",
      ...(tokenCount >= 3 ? { minimum_should_match: "70%" } : {})
    }
  };

  const should = [
    // Exact title match (if title.keyword exists)
    { term: { "title.keyword": { value: query, boost: 8 } } },
    // Phrase in title
    { match_phrase: { title: { query, boost: 4 } } }
  ];

  return { mm, should };
}

export async function searchKeyword(client, { query, filters = {}, size = 20 }) {
  const { mm, should } = buildKeywordQuery(query);

  const body = {
    size,
    _source: config.opensearch.sourceFields,
    track_total_hits: false,
    query: {
      bool: {
        must: [mm],
        should,
        minimum_should_match: 0,
        filter: buildFilterClauses(filters)
      }
    }
  };

  const resp = await client.search({ index: config.opensearch.index, body });
  const hits = mapHits(resp.body?.hits?.hits, { search_type: "keyword" });
  return { requestBody: body, hits };
}

/**
 * Vector search with fallback query shapes for better compatibility across OpenSearch versions.
 */
export async function searchVector(client, { vector, filters = {}, size = 20 }) {
  const filterClauses = buildFilterClauses(filters);

  // Attempt #1: bool(filter) + must(knn)
  const body1 = {
    size,
    _source: config.opensearch.sourceFields,
    track_total_hits: false,
    query: filterClauses.length
      ? {
          bool: {
            filter: filterClauses,
            must: [
              {
                knn: {
                  [config.opensearch.vectorField]: {
                    vector,
                    k: size,
                    num_candidates: config.retrieval.knnNumCandidates
                  }
                }
              }
            ]
          }
        }
      : {
          knn: {
            [config.opensearch.vectorField]: {
              vector,
              k: size,
              num_candidates: config.retrieval.knnNumCandidates
            }
          }
        }
  };

  try {
    const resp = await client.search({ index: config.opensearch.index, body: body1 });
    const hits = mapHits(resp.body?.hits?.hits, { search_type: "vector" });
    return { requestBody: body1, hits };
  } catch (e) {
    logger.warn({ err: e?.message || String(e) }, "Vector query shape #1 failed; trying fallback shape #2");
  }

  // Attempt #2: query knn + post_filter (filters applied after retrieval)
  const body2 = {
    size,
    _source: config.opensearch.sourceFields,
    track_total_hits: false,
    query: {
      knn: {
        [config.opensearch.vectorField]: {
          vector,
          k: size,
          num_candidates: config.retrieval.knnNumCandidates
        }
      }
    },
    ...(filterClauses.length ? { post_filter: { bool: { filter: filterClauses } } } : {})
  };

  const resp2 = await client.search({ index: config.opensearch.index, body: body2 });
  const hits2 = mapHits(resp2.body?.hits?.hits, { search_type: "vector" });
  return { requestBody: body2, hits: hits2 };
}

/**
 * Hybrid search strategy (stable): run keyword + vector separately then fuse ranks with RRF.
 * This avoids depending on specific OpenSearch hybrid DSL versions.
 */
export async function searchHybrid(client, { query, vector, filters = {}, size = 20, rrfK = 60 }) {
  const [kw, vec] = await Promise.all([
    searchKeyword(client, { query, filters, size }),
    searchVector(client, { vector, filters, size }),
  ]);

  const fused = rrfFuseRankedLists([kw.hits, vec.hits], { k: rrfK }).slice(0, size);

  return {
    requestBodies: [
      { type: "keyword", body: kw.requestBody },
      { type: "vector", body: vec.requestBody }
    ],
    hits: fused.map((h, idx) => ({ ...h, search_type: "hybrid", _rank: idx + 1 })),
    rawLists: { keyword: kw.hits, vector: vec.hits }
  };
}
