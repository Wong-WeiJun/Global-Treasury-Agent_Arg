import re

import httpx
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.models import ChatRequest, ChatResponse

router = APIRouter()

THINK_PATTERN = re.compile(r"<think>.*?</think>\s*", flags=re.DOTALL)


@router.post("/", response_model=ChatResponse)
async def chat(body: ChatRequest):
    messages = body.history + [{"role": "user", "content": body.message}]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.CHUTES_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.CHUTES_API_KEY}",  # Chutes uses X-API-Key, not Bearer
                "Content-Type": "application/json",
            },
            json={
                "model": "Qwen/Qwen3-32B-TEE",  # change to any live model
                "messages": messages,
                "max_tokens": 1024,
            },
            timeout=60.0,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Chutes error: {response.text}")

    data = response.json()
    raw_reply = data["choices"][0]["message"]["content"]
    reply = THINK_PATTERN.sub("", raw_reply).strip()
    return ChatResponse(reply=reply)
