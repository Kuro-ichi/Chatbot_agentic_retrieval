import { extractKeywords, countTokenMatches } from "../utils/text.js";
import { config } from "../config.js";

export function evidenceCheck({ question, chunks = [], plannerOutput = null }) {
  if (!chunks || chunks.length === 0) {
    return { ok: false, reason: "no_hits" };
  }

  const tokensFromQuestion = extractKeywords(question, { max: 8 });
  const tokensFromEntities = (plannerOutput?.main_entities || []).filter(Boolean).slice(0, 6);
  const tokens = Array.from(new Set([...tokensFromEntities, ...tokensFromQuestion])).filter(Boolean);

  const scored = chunks.map(c => {
    const text = `${c.title || ""} ${c.content || ""}`;
    const matches = countTokenMatches(text, tokens);
    return { key: `${c.doc_id}:${c.chunk_id}`, matches };
  });

  const best = scored.reduce((a, b) => (b.matches > a.matches ? b : a), { matches: 0 });
  const enoughHits = chunks.length >= config.retrieval.evidenceMinHits;
  const enoughMatch = best.matches >= config.retrieval.evidenceMinTokenMatches;

  if (enoughHits && enoughMatch) return { ok: true, reason: "ok", tokens, best_match: best.matches };
  return { ok: false, reason: `weak_evidence(best_matches=${best.matches},hits=${chunks.length})`, tokens, best_match: best.matches };
}
