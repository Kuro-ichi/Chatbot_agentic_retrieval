# On-prem AI Chatbot (Agentic Retrieval) + OpenSearch (RAG)

## Mục tiêu
Chatbot chạy **on-prem/local**, dùng **OpenSearch** để tra cứu tài liệu đã chunk + embedding sẵn, theo hướng **Agentic Retrieval**:
- LLM tự quyết định có cần subquery không, tạo tối đa **1–3 subqueries**
- Mỗi subquery chọn **keyword / vector / hybrid**
- Hybrid triển khai theo hướng **ổn định**: chạy BM25 + kNN riêng rồi **RRF** ở phía app
- Có **Evidence check** và cho phép **refine 1 vòng** để cải thiện truy xuất
- Trả lời **CHỈ dựa trên chunks** + citations chuẩn

## Kiến trúc
- `backend-node/`: Node.js (Express) – API chính: `POST /chat`
- `backend-fastapi/`: (tuỳ chọn) FastAPI proxy – cũng có `POST /chat` và forward về Node
- `powerapps/custom-connector/`: OpenAPI cho Power Apps Custom Connector

---

## Yêu cầu môi trường
- Docker + docker-compose (khuyến nghị) **hoặc** Node.js 20+
- OpenSearch có sẵn (không kèm trong compose)
- LLM server OpenAI-compatible:
  - Base URL mặc định: `http://localhost:8000/v1`
  - Model mặc định: `qwen2.5-7b-instruct`

---

## 1) Cấu hình
```bash
cp .env.example .env
```

Chỉnh các biến quan trọng:

### OpenSearch
- `OPENSEARCH_NODE=http://localhost:9200` (hoặc https://opensearch.company.local:9200)
- `OPENSEARCH_INDEX=docs_index`
- Auth:
  - none: `OPENSEARCH_AUTH_MODE=none`
  - basic: `OPENSEARCH_AUTH_MODE=basic` + `OPENSEARCH_USERNAME/OPENSEARCH_PASSWORD`
  - apikey: `OPENSEARCH_AUTH_MODE=apikey` + `OPENSEARCH_API_KEY`

### Embeddings cho query
Nếu bạn muốn vector/hybrid:
- `EMBEDDINGS_ENABLED=true`
- `EMBEDDING_BASE_URL=http://localhost:8000/v1`
- `EMBEDDING_MODEL=...`
- `EMBEDDING_DIM=768`

Nếu **không có endpoint embeddings**:
- `EMBEDDINGS_ENABLED=false`
→ hệ thống tự fallback sang **keyword**.

---

## 2) Chạy bằng Docker Compose (khuyến nghị)
```bash
docker compose up --build -d
```

- Node backend: http://localhost:3000
- FastAPI proxy (optional): http://localhost:8001

Health:
```bash
curl http://localhost:3000/health
curl http://localhost:8001/health
```

Diagnostics (kiểm tra kết nối OpenSearch/LLM/Embeddings – best-effort):
```bash
curl http://localhost:3000/diagnostics
```

---

## 3) Chạy trực tiếp (không dùng Docker)
```bash
cd backend-node
npm install
npm start
```

---

## 4) API: POST /chat

### Request
```json
{
  "message": "Quy trình reset mật khẩu VPN như thế nào?",
  "history": [
    {"role":"user","content":"..."},
    {"role":"assistant","content":"..."}
  ],
  "filters": {
    "source": ["policy","sop"],
    "updated_at": {"gte":"2024-01-01","lte":null}
  },
  "debug": true
}
```

### Response (debug=true)
Trả về:
- `planner_output`: kế hoạch subqueries
- `executed_queries`: request bodies gửi OpenSearch
- `retrieved_chunks`: top chunks (đã dedup + RRF)
- `final_answer`: câu trả lời kèm citations

---

## 5) Citations format
Bot sẽ trích dẫn như:
- `[doc_id:chunk_id] title (updated_at) (url nếu có)`

---

## 6) Power Apps Custom Connector
Xem `powerapps/custom-connector/README.md` và import `openapi.yaml`.

---

## Gợi ý tuning
- `OPENSEARCH_KEYWORD_FIELDS` tăng boost cho `title.keyword` nếu bạn hay hỏi đúng tên quy trình.
- `KNN_NUM_CANDIDATES` tăng nếu vector recall thấp.
- `RRF_K` ảnh hưởng mức “trộn” giữa các lists.
- Evidence check:
  - `EVIDENCE_MIN_HITS`
  - `EVIDENCE_MIN_TOKEN_MATCHES`
