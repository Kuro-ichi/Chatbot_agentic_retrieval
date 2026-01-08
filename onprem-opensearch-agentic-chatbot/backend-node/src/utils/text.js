const VN_STOPWORDS = new Set([
  "và","là","của","cho","một","những","các","trong","khi","để","với","từ","đến","trên","dưới",
  "này","đó","kia","ở","theo","về","có","không","được","bị","như","thì","lại","nên","ra","vào",
  "đang","đã","sẽ","tôi","bạn","anh","chị","em","chúng","ta","họ","nó","mình","mọi","vì","do"
]);
const EN_STOPWORDS = new Set(["the","a","an","and","or","of","to","in","for","on","with","is","are","be","as","by","at","from","this","that","it"]);

export function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[“”‘’]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function extractKeywords(text, { max = 8 } = {}) {
  const norm = normalizeText(text);
  if (!norm) return [];
  const tokens = norm.split(/\s+/).filter(t => t.length >= 3);
  const filtered = tokens.filter(t => !VN_STOPWORDS.has(t) && !EN_STOPWORDS.has(t));
  // keep order but remove duplicates
  const seen = new Set();
  const uniq = [];
  for (const t of filtered) {
    if (!seen.has(t)) { seen.add(t); uniq.push(t); }
    if (uniq.length >= max) break;
  }
  return uniq;
}

export function countTokenMatches(text, tokens) {
  const hay = normalizeText(text);
  let count = 0;
  for (const t of tokens) {
    if (hay.includes(t)) count += 1;
  }
  return count;
}

export function truncateText(s, maxChars) {
  const str = String(s || "");
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + "…";
}
