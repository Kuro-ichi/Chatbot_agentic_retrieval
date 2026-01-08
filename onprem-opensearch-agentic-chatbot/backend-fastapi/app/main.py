import os
from typing import Any, Dict, List, Optional
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3000").rstrip("/")
FASTAPI_PORT = int(os.getenv("FASTAPI_PORT", "8001"))

app = FastAPI(title="On-prem Agentic Retrieval Chatbot (FastAPI proxy)", version="1.0.0")

class ChatMessage(BaseModel):
    role: str = Field(..., description="user|assistant")
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    filters: Dict[str, Any] = {}
    debug: bool = False

@app.get("/health")
async def health():
    return {"ok": True, "proxy_to": NODE_BACKEND_URL}

@app.post("/chat")
async def chat(req: ChatRequest):
    url = f"{NODE_BACKEND_URL}/chat"
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, json=req.model_dump())
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
