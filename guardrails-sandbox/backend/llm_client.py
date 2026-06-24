"""LLM API 调用封装，复用 test_production.py 的配置"""
import os
import time
import random
from anthropic import Anthropic

API_KEY = os.environ.get("LLM_API_KEY") or "personal-6d9fb60eca3d0ca7951af4e2d2f85229"
BASE_URL = os.environ.get("LLM_BASE_URL") or "http://llmapi.bilibili.co"
MODEL = "deepseek-v4-flash"

def _make_client():
    return Anthropic(api_key=API_KEY, base_url=BASE_URL)


def chat(messages, max_tokens=1024, system_prompt=None):
    """调用 LLM。messages 格式: [{"role": "user", "content": "..."}]"""
    client = _make_client()
    kwargs = dict(model=MODEL, max_tokens=max_tokens, messages=messages)
    if system_prompt:
        kwargs["system"] = system_prompt
    resp = client.messages.create(**kwargs)
    text = "".join(
        block.text for block in resp.content if hasattr(block, "text")
    )
    return {
        "text": text,
        "model": MODEL,
        "input_tokens": getattr(resp.usage, "input_tokens", 0),
        "output_tokens": getattr(resp.usage, "output_tokens", 0),
    }


def chat_with_retry(messages, max_retries=2, system_prompt=None):
    """带指数退避重试的 LLM 调用"""
    for attempt in range(max_retries + 1):
        try:
            return chat(messages, system_prompt=system_prompt)
        except Exception as e:
            if attempt < max_retries:
                wait = 2**attempt + random.uniform(0, 1)
                time.sleep(wait)
            else:
                raise


def format_messages(query: str, history: list = None) -> list:
    """将用户查询和历史组装成 messages 格式"""
    messages = list(history or [])
    messages.append({"role": "user", "content": query})
    return messages
