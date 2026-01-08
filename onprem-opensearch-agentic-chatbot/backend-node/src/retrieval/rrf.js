/**
 * Reciprocal Rank Fusion (RRF)
 * score(d) = Σ_i 1 / (k + rank_i(d))
 *
 * Input lists must be ranked arrays (best first). We'll dedup by doc_id+chunk_id.
 */
export function rrfFuseRankedLists(lists, { k = 60 } = {}) {
  const scores = new Map();
  const itemMap = new Map();

  for (const list of (lists || [])) {
    for (let i = 0; i < (list || []).length; i++) {
      const item = list[i];
      const key = `${item.doc_id}:${item.chunk_id}`;
      const add = 1.0 / (k + (i + 1));
      scores.set(key, (scores.get(key) || 0) + add);
      if (!itemMap.has(key)) itemMap.set(key, item);
    }
  }

  const fused = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, s], idx) => ({ ...itemMap.get(key), _rrf_score: s, _rank: idx + 1 }));

  return fused;
}
