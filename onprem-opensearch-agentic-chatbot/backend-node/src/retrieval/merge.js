import { rrfFuseRankedLists } from "./rrf.js";

/**
 * Merge results from multiple subquery executions.
 * Each execution = { subquery_id, hits: ranked[] }
 */
export function mergeResultsRRF(executions, { rrfK = 60, topN = 8 } = {}) {
  const lists = (executions || []).map(exe =>
    (exe.hits || []).map(h => ({ ...h, subquery_id: exe.subquery_id }))
  );

  const fused = rrfFuseRankedLists(lists, { k: rrfK });
  return fused.slice(0, topN);
}
