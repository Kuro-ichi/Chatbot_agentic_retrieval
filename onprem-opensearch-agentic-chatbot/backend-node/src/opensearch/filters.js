/**
 * Build OpenSearch filter clauses from a filter object.
 * Supported:
 * - source: string[]
 * - doc_id: string[]
 * - updated_at: { gte: string|null, lte: string|null }
 */
export function buildFilterClauses(filters = {}) {
  const clauses = [];
  if (!filters || typeof filters !== "object") return clauses;

  if (Array.isArray(filters.source) && filters.source.length) {
    clauses.push({ terms: { source: filters.source } });
  }
  if (Array.isArray(filters.doc_id) && filters.doc_id.length) {
    clauses.push({ terms: { doc_id: filters.doc_id } });
  }
  if (filters.updated_at && typeof filters.updated_at === "object") {
    const range = {};
    if (filters.updated_at.gte) range.gte = filters.updated_at.gte;
    if (filters.updated_at.lte) range.lte = filters.updated_at.lte;
    if (Object.keys(range).length) clauses.push({ range: { updated_at: range } });
  }

  return clauses;
}

/**
 * Merge global filters (from request) with planner-proposed filters (from subquery).
 * Strategy:
 * - If both have arrays (source/doc_id): intersect.
 * - If only one has: use it.
 * - updated_at: combine gte=max(gte), lte=min(lte) when both provided.
 */
export function mergeFilters(globalFilters = {}, subFilters = {}) {
  const out = { ...globalFilters, ...subFilters };

  for (const key of ["source","doc_id"]) {
    const a = Array.isArray(globalFilters?.[key]) ? globalFilters[key] : null;
    const b = Array.isArray(subFilters?.[key]) ? subFilters[key] : null;
    if (a && b) {
      const setA = new Set(a);
      out[key] = b.filter(x => setA.has(x));
    } else if (a) {
      out[key] = a;
    } else if (b) {
      out[key] = b;
    } else {
      delete out[key];
    }
  }

  const ga = globalFilters?.updated_at || null;
  const sa = subFilters?.updated_at || null;
  if (ga || sa) {
    const gte = pickMaxDate(ga?.gte, sa?.gte);
    const lte = pickMinDate(ga?.lte, sa?.lte);
    out.updated_at = { gte: gte || null, lte: lte || null };
    if (!out.updated_at.gte && !out.updated_at.lte) delete out.updated_at;
  }

  return out;
}

function pickMaxDate(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return (String(a) >= String(b)) ? a : b;
}
function pickMinDate(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return (String(a) <= String(b)) ? a : b;
}
