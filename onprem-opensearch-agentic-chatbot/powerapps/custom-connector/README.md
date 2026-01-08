# Power Apps Custom Connector

## 1) Import OpenAPI
Trong Power Apps:
- Data -> Custom connectors -> New custom connector -> Import an OpenAPI file
- Chọn file `openapi.yaml`

## 2) Base URL
- Development: `http://localhost:3000`
- Nếu dùng FastAPI proxy: sửa server trong OpenAPI thành `http://localhost:8001`

## 3) Test
Gọi action **Chat** với body ví dụ:
```json
{
  "message": "Quy trình reset mật khẩu VPN như thế nào?",
  "history": [],
  "filters": { "source": ["policy", "sop"] },
  "debug": false
}
```
