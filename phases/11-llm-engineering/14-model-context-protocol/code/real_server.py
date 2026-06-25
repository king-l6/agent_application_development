"""实操：用 FastMCP 搭建一个真实的 MCP 服务器

提供三个工具：
  - search_lessons: 搜索课程内容
  - get_phase_summary: 获取阶段概要
  - calculate_cost: 计算 LLM 调用成本

运行方式：
  python real_server.py
  这会启动一个 stdio 传输的 MCP 服务器
"""

import json
import os
import re
from pathlib import Path

# Import the real MCP SDK
from mcp.server.fastmcp import FastMCP

# 创建服务器实例
mcp = FastMCP("ai-engineering-helper")

# ──── 工具 1：搜索课程 ────

@mcp.tool()
def search_lessons(query: str, phase: str = "") -> str:
    """在 AI Engineering from Scratch 课程中搜索相关内容

    Args:
        query: 搜索关键词
        phase: 可选的阶段号，例如 "11" 只搜 Phase 11
    """
    base = Path("/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/phases")
    results = []

    # 确定搜索范围
    if phase:
        search_dirs = [base / f"{int(phase):02d}-*"]
    else:
        search_dirs = [base / d for d in os.listdir(base) if os.path.isdir(base / d)]

    for phase_dir in search_dirs:
        if not os.path.isdir(phase_dir):
            continue
        phase_name = phase_dir.name

        for lesson_dir in sorted(os.listdir(phase_dir)):
            lesson_path = phase_dir / lesson_dir
            if not os.path.isdir(lesson_path):
                continue
            # 检查 docs/zh.md 和 docs/en.md
            for doc_file in ["docs/zh.md", "docs/en.md"]:
                doc_path = lesson_path / doc_file
                if not os.path.exists(doc_path):
                    continue
                try:
                    content = open(doc_path, encoding="utf-8").read()
                    if query.lower() in content.lower():
                        # 摘取包含关键词的上下文
                        lines = content.split("\n")
                        matched_lines = [
                            line.strip()
                            for i, line in enumerate(lines)
                            if query.lower() in line.lower()
                        ][:3]
                        results.append({
                            "phase": phase_name,
                            "lesson": lesson_dir,
                            "matched_lines": matched_lines,
                        })
                        break
                except:
                    continue

    if not results:
        return f"未找到包含 '{query}' 的课程"

    output = [f"找到 {len(results)} 个匹配结果：\n"]
    for r in results[:10]:
        output.append(f"📘 {r['phase']}/{r['lesson']}")
        for line in r["matched_lines"]:
            output.append(f"   {line[:80]}")
        output.append("")
    return "\n".join(output)


# ──── 工具 2：获取阶段概要 ────

@mcp.tool()
def get_phase_summary(phase_number: int) -> str:
    """获取某个阶段的概要信息

    Args:
        phase_number: 阶段号 (00-19)
    """
    base = Path("/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/phases")
    # 找到匹配的阶段目录
    matches = list(base.glob(f"{phase_number:02d}-*"))
    if not matches:
        return f"未找到阶段 {phase_number}"

    phase_dir = matches[0]
    phase_name = phase_dir.name

    # 读 README
    readme_path = phase_dir / "README.md"
    readme = ""
    if readme_path.exists():
        readme = open(readme_path, encoding="utf-8").read()

    # 列出所有课程
    lessons = sorted([
        d.name for d in phase_dir.iterdir()
        if d.is_dir() and d.name[0].isdigit()
    ])

    output = [f"# {phase_name}\n"]
    if readme:
        # 取第一段
        first_para = readme.split("\n\n")[0]
        output.append(first_para[:200])
        output.append("")

    output.append(f"共 {len(lessons)} 课：")
    for l in lessons:
        output.append(f"  - {l}")

    return "\n".join(output)


# ──── 工具 3：计算成本 ────

@mcp.tool()
def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    requests_per_day: int = 1000,
    days_per_month: int = 30,
) -> str:
    """估算 LLM API 调用的月度成本

    Args:
        model: 模型名称 (gpt-4o, claude-sonnet, gpt-4o-mini, gemini-pro)
        input_tokens: 每次请求的平均输入 token 数
        output_tokens: 每次请求的平均输出 token 数
        requests_per_day: 每日请求量
        days_per_month: 每月天数
    """
    pricing = {
        "gpt-4o":        {"input": 2.50, "output": 10.00},
        "claude-sonnet": {"input": 3.00, "output": 15.00},
        "gpt-4o-mini":   {"input": 0.15, "output": 0.60},
        "gemini-pro":    {"input": 1.25, "output": 5.00},
    }

    model = model.lower()
    if model not in pricing:
        available = ", ".join(pricing.keys())
        return f"不支持的模型。可选：{available}"

    p = pricing[model]
    cost_per_request = (input_tokens / 1_000_000 * p["input"]) + (output_tokens / 1_000_000 * p["output"])
    daily_cost = cost_per_request * requests_per_day
    monthly_cost = daily_cost * days_per_month
    yearly_cost = monthly_cost * 12

    # 对比不同缓存命中率下的成本
    lines = [
        f"## 成本估算：{model}",
        f"",
        f"每次请求：{input_tokens} in / {output_tokens} out",
        f"单次成本：${cost_per_request:.6f}",
        f"每日成本：${daily_cost:.2f}（{requests_per_day} 次请求）",
        f"月度成本：${monthly_cost:.2f}",
        f"年度成本：${yearly_cost:.2f}",
        f"",
        f"### 缓存节省对比：",
    ]
    for hit_rate in [0, 20, 40, 60]:
        effective_cost = monthly_cost * (1 - hit_rate / 100)
        savings = monthly_cost - effective_cost
        lines.append(f"  {hit_rate}% 缓存命中率 → ${effective_cost:.2f}/月（节省 ${savings:.2f}）")

    return "\n".join(lines)


if __name__ == "__main__":
    print("=" * 50)
    print("  AI Engineering Helper MCP Server")
    print("  3 tools: search_lessons, get_phase_summary, calculate_cost")
    print("=" * 50)
    mcp.run(transport="stdio")
