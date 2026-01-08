export const PLANNER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["need_subquery","subqueries","primary_intent","main_entities","time_range","notes"],
  properties: {
    need_subquery: { type: "boolean" },
    primary_intent: { type: "string", enum: ["lookup_policy","howto_procedure","troubleshoot","definition","search_doc","other"] },
    main_entities: { type: "array", items: { type: "string" }, maxItems: 8 },
    time_range: {
      type: "object",
      additionalProperties: false,
      required: ["from","to"],
      properties: { from: { type: ["string","null"] }, to: { type: ["string","null"] } }
    },
    subqueries: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id","query","preferred_search","filters","top_k"],
        properties: {
          id: { type: "string", pattern: "^q[1-3]$" },
          query: { type: "string", minLength: 1 },
          preferred_search: { type: "string", enum: ["keyword","vector","hybrid"] },
          top_k: { type: "integer", minimum: 3, maximum: 25 },
          filters: {
            type: "object",
            additionalProperties: true,
            properties: {
              source: { type: ["array","null"], items: { type: "string" } },
              updated_at: {
                type: ["object","null"],
                additionalProperties: false,
                required: ["gte","lte"],
                properties: { gte: { type: ["string","null"] }, lte: { type: ["string","null"] } }
              },
              doc_id: { type: ["array","null"], items: { type: "string" } }
            }
          }
        }
      }
    },
    notes: { type: "string" }
  }
};
