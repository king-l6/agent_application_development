"""Guardrails 交互式沙箱 —— FastAPI 服务器"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
os.environ["HF_HUB_OFFLINE"] = "1"  # 强制 HuggingFace 离线，只使用缓存

import time
import json
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from pipeline import Pipeline
from llm_client import chat_with_retry, format_messages
from benchmark import BenchmarkRunner

# ── 注册所有 Guardrail 适配器 ──────────────────────────────────
pipeline = Pipeline()


def register_all_adapters():
    from adapters.rate_limiter import RateLimiter
    from adapters.injection import InjectionDetector
    from adapters.semantic import SemanticDetector
    from adapters.pii_detector import PiiDetector
    from adapters.length_check import LengthChecker
    from adapters.toxicity import ToxicityFilter
    from adapters.topic_classifier import TopicClassifier
    from adapters.output_scrubber import OutputScrubber
    from adapters.relevance import RelevanceChecker
    from adapters.factual_classifier import FactualClassifier
    from adapters.cot_judge import CotJudge
    from adapters.prompt_leak import PromptLeakDetector
    from adapters.rag_groundedness import RAGGroundedness
    from adapters.format_validator import FormatValidator
    from adapters.context_engine import ContextEngine
    from adapters.prompt_cache_planner import PromptCachePlanner

    pipeline.register(RateLimiter())
    pipeline.register(InjectionDetector())
    pipeline.register(SemanticDetector())
    pipeline.register(PiiDetector())
    pipeline.register(LengthChecker())
    pipeline.register(ToxicityFilter())
    pipeline.register(TopicClassifier())
    pipeline.register(OutputScrubber())
    pipeline.register(RelevanceChecker())
    pipeline.register(FactualClassifier())
    pipeline.register(CotJudge())
    pipeline.register(PromptLeakDetector())
    pipeline.register(RAGGroundedness())
    pipeline.register(FormatValidator())
    pipeline.register(ContextEngine())
    pipeline.register(PromptCachePlanner())


register_all_adapters()


# ── 预加载模型 ──────────────────────────────────────────────────
def _preload_models():
    """在 uvicorn 启动前预加载 sentence-transformers 模型，
    避免 huggingface_hub 在异步环境中的 httpx 连接问题"""
    try:
        from sentence_transformers import SentenceTransformer
        import os
        os.environ["HF_HUB_OFFLINE"] = "1"  # 强制离线，只使用缓存
        print("  ⟳ 加载语义模型 shibing624/text2vec-base-chinese...")
        SentenceTransformer("shibing624/text2vec-base-chinese", local_files_only=True)
        print("  ✓ 语义模型加载完成")
    except Exception as e:
        print(f"  ⚠ 语义模型加载失败: {e}")


_preload_models()

# ── FastAPI ─────────────────────────────────────────────────────
app = FastAPI(title="Guardrails Sandbox")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 数据模型 ────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str
    history: list = []
    system_prompt: str = "你是一个友好的AI助手。请清楚简洁地回答用户的问题。"
    user_id: str = "default"
    tier: str = "free"


class ChatResponse(BaseModel):
    response: str
    blocked: bool = False
    block_stage: Optional[str] = None
    block_reason: Optional[str] = None
    block_detail: Optional[dict] = None
    guardrail_logs: list = []
    total_latency_ms: float = 0.0
    llm_latency_ms: Optional[float] = None


class CompareResponse(BaseModel):
    without_guardrails: ChatResponse
    with_guardrails: ChatResponse


class ToggleRequest(BaseModel):
    name: str


# ── API 路由 ────────────────────────────────────────────────────


@app.get("/api/guardrails")
def get_guardrails():
    return {
        "guardrails": pipeline.get_all_adapters(),
        "stats": pipeline.get_stats(),
        "tree": pipeline.get_tree(),
        "block_history": pipeline.get_block_history(),
    }


@app.get("/api/adapters/tree")
def get_adapter_tree():
    return {"tree": pipeline.get_tree()}


@app.get("/api/guardrails/block-history")
def get_block_history():
    return {"history": pipeline.get_block_history()}


@app.post("/api/guardrails/clear-history")
def clear_block_history():
    pipeline.clear_block_history()
    return {"ok": True}


@app.post("/api/guardrails/toggle")
def toggle_guardrail(req: ToggleRequest):
    result = pipeline.toggle_adapter(req.name)
    if result is None:
        return {"error": f"未找到 guardrail: {req.name}"}, 404
    return result


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    overall_start = time.time()
    context = {"user_id": req.user_id, "tier": req.tier}

    # 1. Input guardrails
    input_ok, input_logs, block_detail = pipeline.run_input_checks(
        req.message, context
    )

    if not input_ok:
        return ChatResponse(
            response="🛡 消息被拦截",
            blocked=True,
            block_stage="input",
            block_reason=block_detail.reason,
            block_detail={
                "confidence": block_detail.confidence,
                "details": block_detail.details,
            },
            guardrail_logs=input_logs,
            total_latency_ms=round((time.time() - overall_start) * 1000, 2),
        )

    # 2. LLM call
    llm_start = time.time()
    try:
        messages = format_messages(req.message, req.history)
        llm_result = chat_with_retry(messages, system_prompt=req.system_prompt)
        llm_text = llm_result["text"]
        llm_latency = round((time.time() - llm_start) * 1000, 2)
    except Exception as e:
        return ChatResponse(
            response=f"LLM 调用失败: {e}",
            blocked=True,
            block_stage="llm_error",
            block_reason=str(e),
            guardrail_logs=input_logs,
            total_latency_ms=round((time.time() - overall_start) * 1000, 2),
        )

    # 3. Output guardrails
    output_result = pipeline.process_output(req.message, llm_text)
    output_logs = output_result.get("guardrail_logs", [])
    all_logs = input_logs + output_logs

    if output_result.get("blocked"):
        return ChatResponse(
            response="🛡 输出被拦截",
            blocked=True,
            block_stage="output",
            block_reason=output_result.get("block_reason", ""),
            block_detail=output_result.get("block_detail"),
            guardrail_logs=all_logs,
            total_latency_ms=round((time.time() - overall_start) * 1000, 2),
        )

    final_response = output_result.get("output_text", llm_text)

    return ChatResponse(
        response=final_response,
        blocked=False,
        guardrail_logs=all_logs,
        total_latency_ms=round((time.time() - overall_start) * 1000, 2),
        llm_latency_ms=llm_latency,
    )


@app.post("/api/chat/compare", response_model=CompareResponse)
def chat_compare(req: ChatRequest):
    """对比模式：同时发两次，一次无 guardrails、一次有 guardrails"""

    # Without guardrails — 直接调 LLM，跳过所有检查
    without_start = time.time()
    try:
        messages = format_messages(req.message, req.history)
        llm_result = chat_with_retry(messages, system_prompt=req.system_prompt)
        without_response = llm_result["text"]
    except Exception as e:
        without_response = f"LLM 调用失败: {e}"

    without = ChatResponse(
        response=without_response,
        blocked=False,
        guardrail_logs=[],
        total_latency_ms=round((time.time() - without_start) * 1000, 2),
    )

    # With guardrails — 走完整管线
    # 临时保存各 adapter 的 enabled 状态，全部开启
    saved_states = {}
    for a in pipeline.adapters:
        saved_states[a.name] = a.enabled
        a.enabled = True

    with_resp = chat(req)

    # 恢复原始状态
    for a in pipeline.adapters:
        a.enabled = saved_states.get(a.name, True)

    return CompareResponse(without_guardrails=without, with_guardrails=with_resp)


@app.post("/api/chat/reset-stats")
def reset_stats():
    pipeline.stats = {"total": 0, "blocked": 0, "passed": 0, "by_layer": {}}
    for a in pipeline.adapters:
        pipeline.stats["by_layer"][a.name] = {"blocked": 0, "passed": 0}
    pipeline.clear_block_history()
    return {"ok": True}


class BenchmarkRequest(BaseModel):
    category: Optional[str] = None


@app.post("/api/benchmark")
def run_benchmark(req: BenchmarkRequest = None):
    """运行基准测试，可选 category 参数指定测试类别"""
    runner = BenchmarkRunner()
    if req and req.category:
        result = runner.run_category(pipeline, req.category)
    else:
        result = runner.run_all(pipeline)
    return result


# ── MCP 工具代理 ──────────────────────────────────────────────────


class McpToolRequest(BaseModel):
    tool: str
    arguments: dict = {}


def _run_async(coro):
    """在已有事件循环的线程中安全运行协程"""
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # 已有运行中的 loop → 用 concurrent.futures
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        fut = asyncio.run_coroutine_threadsafe(coro, loop)
        return fut.result()


def _call_mcp(tool: str, arguments: dict) -> str:
    """通过 SDK 调用 MCP 服务器"""
    from mcp.client.stdio import StdioServerParameters, stdio_client
    from mcp import ClientSession

    async def _call():
        params = StdioServerParameters(
            command="/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/venv/bin/python",
            args=["/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/phases/11-llm-engineering/14-model-context-protocol/code/real_server.py"],
        )
        async with stdio_client(params) as (r, w):
            async with ClientSession(r, w) as s:
                await s.initialize()
                result = await s.call_tool(tool, arguments)
                return result.content[0].text

    return _run_async(_call())


@app.post("/api/mcp/call")
def mcp_call(req: McpToolRequest):
    try:
        result = _call_mcp(req.tool, req.arguments)
        return {"ok": True, "tool": req.tool, "result": result}
    except Exception as e:
        return {"ok": False, "tool": req.tool, "error": str(e)}


@app.get("/api/mcp/tools")
def mcp_tools_list():
    try:
        from mcp.client.stdio import StdioServerParameters, stdio_client
        from mcp import ClientSession

        async def _list():
            params = StdioServerParameters(
                command="/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/venv/bin/python",
                args=["/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/phases/11-llm-engineering/14-model-context-protocol/code/real_server.py"],
            )
            async with stdio_client(params) as (r, w):
                async with ClientSession(r, w) as s:
                    await s.initialize()
                    tools = await s.list_tools()
                    return [
                        {"name": t.name, "description": t.description, "inputSchema": t.inputSchema}
                        for t in tools.tools
                    ]

        tools = _run_async(_list())
        return {"ok": True, "tools": tools}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── 课程实验台（Playground）────────────────────────────────────────
from playground.registry import registry as playground_registry


class PlaygroundRunRequest(BaseModel):
    name: str
    inputs: dict = {}


@app.get("/api/playground/modules")
def playground_modules():
    """返回按 phase 分组的实验模块列表（含 input_schema）"""
    return {"groups": playground_registry.list_grouped()}


@app.post("/api/playground/run")
def playground_run(req: PlaygroundRunRequest):
    """执行一个实验模块，返回通用渲染块结果"""
    return playground_registry.run(req.name, req.inputs)


# ── 静态文件服务 ────────────────────────────────────────────────
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


# ── 启动 ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    print("=" * 55)
    print("  🧪 AI 工程学习实验台")
    print("  http://localhost:8000")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=8000)
