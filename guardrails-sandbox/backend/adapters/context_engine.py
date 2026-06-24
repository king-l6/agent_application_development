"""Phase 11-05 Context Engineering → 上下文预算管理器

核心思想：上下文窗口是稀缺资源，要像管 RAM 一样管 Token 预算。
- 每个组件（系统提示、工具、历史、检索、生成）竞争窗口空间
- "中间丢失"效应：开头和结尾的信息注意力高，中间的低
- 动态上下文组装：不同查询需要不同的上下文配置
"""
import time
import json
from collections import OrderedDict
from .base import GuardrailAdapter, GuardrailResult


def count_tokens(text: str) -> int:
    if not text:
        return 0
    return int(len(text.split()) * 1.3)


def reorder_lost_in_middle(items: list, scores: list) -> list:
    """中间丢失重排序：最重要的放开头和结尾，最不重要的放中间"""
    paired = sorted(zip(scores, items), reverse=True)
    sorted_items = [item for _, item in paired]
    if len(sorted_items) <= 2:
        return sorted_items
    first_half = sorted_items[::2]
    second_half = sorted_items[1::2]
    second_half.reverse()
    return first_half + second_half


# 工具注册表（演示用，模拟真实 Agent 的工具集）
TOOL_REGISTRY = {
    "read_file":     {"desc": "读取文件内容",         "tokens": 120, "intents": ["code", "files"]},
    "write_file":    {"desc": "将内容写入文件",        "tokens": 150, "intents": ["code", "files"]},
    "search_code":   {"desc": "在代码库中搜索模式",    "tokens": 130, "intents": ["code"]},
    "run_command":   {"desc": "执行 shell 命令",       "tokens": 140, "intents": ["code", "system"]},
    "web_search":    {"desc": "在网络上搜索信息",      "tokens": 140, "intents": ["research"]},
    "query_db":      {"desc": "在数据库上运行 SQL",    "tokens": 170, "intents": ["code", "data"]},
    "send_email":    {"desc": "发送邮件消息",          "tokens": 200, "intents": ["email"]},
    "list_emails":   {"desc": "列出最近的邮件",       "tokens": 160, "intents": ["email"]},
    "create_event":  {"desc": "创建新的日历事件",      "tokens": 180, "intents": ["calendar"]},
    "generate_chart":{"desc": "从数据生成图表",       "tokens": 190, "intents": ["data", "viz"]},
}


def classify_intent(query: str) -> list:
    """基于关键词的意图分类"""
    intent_kw = {
        "code":     ["代码", "函数", "错误", "文件", "实现", "重构", "调试", "bug", "fix", "write", "code"],
        "calendar": ["会议", "日程", "日历", "预约", "meeting", "schedule"],
        "email":    ["邮件", "发送", "收件箱", "email", "send", "inbox"],
        "research": ["搜索", "查找", "什么", "如何", "解释", "search", "find", "what", "how"],
        "data":     ["数据", "查询", "数据库", "图表", "sql", "data", "query", "chart"],
    }
    q = query.lower()
    scores = {}
    for intent, keywords in intent_kw.items():
        score = sum(1 for kw in keywords if kw in q)
        if score > 0:
            scores[intent] = score
    if not scores:
        return ["code"]
    max_s = max(scores.values())
    return [k for k, v in scores.items() if v >= max_s * 0.5]


def select_tools(query: str, budget: int = 2000) -> tuple:
    """根据查询意图动态选择工具"""
    intents = classify_intent(query)
    selected, total = {}, 0
    for name, tool in TOOL_REGISTRY.items():
        if any(i in intents for i in tool["intents"]):
            if total + tool["tokens"] <= budget:
                selected[name] = tool
                total += tool["tokens"]
    return selected, total


class ContextBudget:
    """上下文预算管理器——跟踪每个组件的 Token 使用"""

    def __init__(self, max_tokens: int = 128000, gen_reserve: int = 4000):
        self.max_tokens = max_tokens
        self.gen_reserve = gen_reserve
        self.available = max_tokens - gen_reserve
        self.allocations = OrderedDict()

    def allocate(self, component: str, content: str, max_tokens: int = None) -> tuple:
        tokens = count_tokens(content)
        if max_tokens and tokens > max_tokens:
            words = content.split()
            target = int(max_tokens / 1.3)
            content = " ".join(words[:target])
            tokens = count_tokens(content)
        used = sum(self.allocations.values())
        if used + tokens > self.available:
            allowed = self.available - used
            if allowed <= 0:
                return None, 0
            words = content.split()
            target = int(allowed / 1.3)
            content = " ".join(words[:target])
            tokens = count_tokens(content)
        self.allocations[component] = tokens
        return content, tokens

    def remaining(self) -> int:
        return self.available - sum(self.allocations.values())

    def utilization(self) -> float:
        return sum(self.allocations.values()) / self.max_tokens

    def report(self, query_type: str = "") -> dict:
        total_used = sum(self.allocations.values())
        items = []
        for comp, tokens in self.allocations.items():
            pct = round(tokens / max(self.max_tokens, 1) * 100, 1)
            items.append({"component": comp, "tokens": tokens, "pct": pct})
        return {
            "query_type": query_type,
            "max_tokens": self.max_tokens,
            "gen_reserve": self.gen_reserve,
            "total_used": total_used,
            "remaining": self.remaining(),
            "utilization_pct": round(self.utilization() * 100, 1),
            "items": items,
        }


class HistoryCompressor:
    """对话历史压缩器——超出预算时自动总结旧轮次"""

    def __init__(self, max_tokens: int = 5000):
        self.turns = []
        self.summaries = []
        self.max_tokens = max_tokens

    def add_turn(self, role: str, content: str):
        self.turns.append({"role": role, "content": content})
        self._compress_if_needed()

    def _compress_if_needed(self):
        total = sum(count_tokens(t["content"]) for t in self.turns)
        if total <= self.max_tokens:
            return
        while total > self.max_tokens and len(self.turns) > 4:
            old = self.turns[:2]
            summary = " | ".join(f"{t['role']}: {t['content'][:80]}..." for t in old)
            self.summaries.append(summary)
            self.turns = self.turns[2:]
            total = sum(count_tokens(t["content"]) for t in self.turns)

    def get_context(self) -> str:
        parts = []
        if self.summaries:
            parts.append("[对话总结]" + " | ".join(self.summaries))
        for t in self.turns:
            parts.append(f"{t['role']}: {t['content']}")
        return "\n".join(parts)

    def token_count(self) -> int:
        return count_tokens(self.get_context())

    def stats(self) -> dict:
        return {
            "total_turns": len(self.turns),
            "summaries": len(self.summaries),
            "tokens": self.token_count(),
            "max_tokens": self.max_tokens,
        }


# 全局实例（pipeline 级别共享）
_global_budget = ContextBudget()
_global_history = HistoryCompressor()


class ContextEngine(GuardrailAdapter):
    name = "context_engine"
    display_name = "上下文预算"
    description = "跟踪 Token 预算，分析上下文利用率，中间丢失重排序"
    group = "上下文工程"
    category = "output"
    order = 5
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        ctx = context or {}
        input_text = ctx.get("input_text", "")

        # 更新对话历史
        if input_text:
            _global_history.add_turn("user", input_text)
        if text:
            _global_history.add_turn("assistant", text)

        # 构建预算报告
        budget = ContextBudget()
        budget.allocate("system_prompt", "你是一个友好的AI助手", max_tokens=500)
        budget.allocate("generation", text or "(空)", max_tokens=4000)

        history_text = _global_history.get_context()
        if history_text.strip():
            budget.allocate("history", history_text, max_tokens=5000)

        # 工具选择（基于意图）
        if input_text:
            tools, tool_tokens = select_tools(input_text)
            tool_text = json.dumps(list(tools.keys()), ensure_ascii=False)
            if tool_text != "[]":
                budget.allocate("tools", tool_text, max_tokens=2000)

        # 中间丢失分析
        items = [item["component"] for item in budget.report()["items"]]
        total_items = len(items)

        latency = (time.time() - start) * 1000

        return GuardrailResult(
            passed=True,  # 永不拦截，只报告
            reason="",
            details={
                "budget": budget.report(query_type=input_text[:50]),
                "history": _global_history.stats(),
                "tool_selection": {
                    "query": input_text[:80],
                    "intents": classify_intent(input_text) if input_text else [],
                    "selected_tools": list(
                        select_tools(input_text)[0].keys()
                    ) if input_text else [],
                },
                "lost_in_middle": {
                    "total_items": total_items,
                    "high_priority_positions": ["开头 (0-20%)", "结尾 (80-100%)"],
                    "low_priority_positions": ["中间 (40-70%)"],
                },
            },
            confidence=0.0,
            latency_ms=round(latency, 2),
        )


def get_budget_report():
    """获取当前上下文预算报告（供 API 调用）"""
    return {
        "budget": _global_budget.report(),
        "history": _global_history.stats(),
    }
