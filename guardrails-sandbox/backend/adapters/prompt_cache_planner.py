"""Phase 11-15 Prompt Caching → PromptCachePlanner 适配器

提示缓存：提供者在它那侧保留稳定前缀的 KV 缓存，复用时只收正常费率的
10%（Anthropic）。省 50-90% 成本，降 40-85% 首 token 延迟。

本 adapter 永不拦截。它分析输入文本的"缓存友好度"：
  - 检测会破坏前缀匹配的翻车点（动态时间戳、可能的工具乱序、近似重复）
  - 估算盈亏平衡（写入溢价需要至少读 2 次才回本）
  - 展示三家提供者的缓存模式与缓存友好布局
"""
import time
import re
from .base import GuardrailAdapter, GuardrailResult


# 会破坏前缀缓存的"动态内容"特征：出现在系统提示顶部就每次未命中
DYNAMIC_PATTERNS = [
    (r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", "时间戳 (YYYY-MM-DD HH:MM)"),
    (r"\d{2}:\d{2}:\d{2}", "时钟时间 (HH:MM:SS)"),
    (r"当前时间|current time|now\(\)|datetime\.now|时间戳|timestamp", "动态时间字段"),
    (r"会话 ?ID|session[_ ]?id|request[_ ]?id|trace[_ ]?id|uuid", "随请求变化的 ID"),
    (r"随机|random|nonce", "随机值"),
]

# 三家提供者缓存模式速查
PROVIDER_REGIMES = {
    "Anthropic": {
        "用法": "内容块上显式加 cache_control 标记 {'type': 'ephemeral'}",
        "命中折扣": "输入费用 10%（省 90%）",
        "写入溢价": "5min: +25% / 1h: +50%",
        "默认 TTL": "5 分钟（可延长至 1 小时）",
        "最小块": "1024 token（Haiku 2048）",
        "适用": "稳定 10k+ 系统提示的多轮对话代理",
    },
    "OpenAI": {
        "用法": "全自动前缀检测，无需配置",
        "命中折扣": "50%",
        "写入溢价": "无",
        "默认 TTL": "尽力最长 1 小时",
        "最小块": "1024 token",
        "适用": "无自定义基础设施的无服务器端点",
    },
    "Gemini": {
        "用法": "显式创建 CachedContent 对象并命名",
        "命中折扣": "读取约正常费率 25%（外加存储费）",
        "写入溢价": "按 token·小时存储计费",
        "默认 TTL": "用户设置（默认 1 小时）",
        "最小块": "4096 token（Flash），32768（Pro）",
        "适用": "跨多天多会话复用大型语料库",
    },
}

# 缓存友好布局：稳定的放上面，可变的放下面
CACHE_FRIENDLY_LAYOUT = [
    ("系统提示", "稳定 → 缓存"),
    ("工具定义", "稳定 → 缓存"),
    ("少样本示例", "稳定 → 缓存"),
    ("检索到的文档", "复用才缓存，否则不缓存"),
    ("对话历史", "缓存到最近一轮"),
    ("当前用户消息", "永远不缓存（每次不同）"),
]


def breakeven_table():
    """Anthropic 25% 写入溢价下，不同复用次数的平均成本倍数。"""
    rows = []
    write_cost = 1.25  # 写入按 1.25x
    read_cost = 0.10   # 读取按 0.10x
    for reads in [1, 2, 3, 5, 10]:
        total = write_cost + read_cost * reads
        requests = 1 + reads
        avg = total / requests
        rows.append({
            "复用读取次数": reads,
            "平均成本倍数": round(avg, 3),
            "节省": f"{round((1 - avg) * 100)}%",
        })
    return rows


class PromptCachePlanner(GuardrailAdapter):
    name = "prompt_cache_planner"
    display_name = "提示缓存规划"
    description = "分析前缀缓存友好度，检测破坏命中的翻车点，展示三家提供者模式"
    group = "缓存与成本"
    category = "output"  # 永不拦截，只展示知识
    order = 60
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()

        # 检测会破坏前缀缓存的动态内容
        cache_breakers = []
        for pattern, label in DYNAMIC_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                cache_breakers.append(label)

        # 简单的缓存友好度评分
        token_estimate = max(1, len(text) // 4)  # 粗略估算（~4 字符/token）
        meets_min_block = token_estimate >= 1024
        is_cache_friendly = len(cache_breakers) == 0 and meets_min_block

        if cache_breakers:
            verdict = f"发现 {len(cache_breakers)} 个会破坏前缀缓存的动态内容"
        elif not meets_min_block:
            verdict = f"约 {token_estimate} token，低于 1024 最小可缓存量，不会被缓存"
        else:
            verdict = "前缀稳定且足够长，适合缓存"

        latency = (time.time() - start) * 1000
        return GuardrailResult(
            passed=True,  # 永不拦截
            reason="",
            details={
                "缓存友好度": "✅ 友好" if is_cache_friendly else "⚠️ 需调整",
                "判定": verdict,
                "估算 token": token_estimate,
                "满足最小块(1024)": meets_min_block,
                "检测到的缓存破坏点": cache_breakers or ["无"],
                "铁律": "三家都只匹配前缀——稳定的放顶部，可变的放底部。一个 token 字节不同 = 后面全部未命中",
                "缓存友好布局": [f"{sec} — {note}" for sec, note in CACHE_FRIENDLY_LAYOUT],
                "盈亏平衡(Anthropic)": breakeven_table(),
                "经验法则": "预期 TTL 内复用 ≥3 次才值得缓存",
                "三家提供者模式": PROVIDER_REGIMES,
                "经典翻车点": [
                    "系统提示顶部塞动态时间戳 → 每次未命中，挪到断点下方",
                    "工具乱序序列化 → 字典重排破坏每一次命中，固定顺序",
                    "近似重复：'You are helpful.' vs 'You are a helpful assistant.' → 差一字节即完全未命中",
                    "块太小：Anthropic 强制 1024 下限，更小的块静默不缓存",
                    "成本仪表盘不拆分已缓存/未缓存 token → 流量下降误判为缓存胜利",
                ],
                "验证": "CI 断言第二个相同请求 cache_read_input_tokens > 0；若多次请求恒为 0 说明缓存键在漂移",
            },
            confidence=0.0,
            latency_ms=round(latency, 2),
        )
