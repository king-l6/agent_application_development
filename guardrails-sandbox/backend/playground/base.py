"""课程实验台（Playground）通用模块抽象。

与 guardrails 的 GuardrailAdapter（pass/fail 形状）并存，但更通用：
每个模块自己声明「输入哪些字段、输出什么形状」，前端拿到 schema
后自动渲染表单和结果，新增模块无需改前端。

一个模块需要提供：
  - name / display_name / description
  - phase / lesson      —— 归属哪一节课（前端按 phase 分组）
  - input_schema        —— 字段列表，驱动前端表单
  - run(inputs) -> ModuleResult

结果用一组「渲染块」承载，前端按块类型渲染。
"""
from dataclasses import dataclass, field
from typing import Any, Callable


# ──── 输入字段 schema ────────────────────────────────────────────

def field_spec(
    name: str,
    label: str,
    type: str = "text",          # text | textarea | number | select
    default: Any = None,
    placeholder: str = "",
    options: list = None,        # select 用
    help: str = "",
) -> dict:
    """声明一个输入字段。前端据此渲染对应控件。"""
    spec = {
        "name": name,
        "label": label,
        "type": type,
        "default": default if default is not None else ("" if type != "number" else 0),
        "placeholder": placeholder,
        "help": help,
    }
    if options:
        spec["options"] = options
    return spec


# ──── 渲染块辅助函数 ──────────────────────────────────────────────
# 前端只认这几种 type，新增模块复用它们即可，不用改前端。

def block_text(content: str, label: str = "") -> dict:
    return {"type": "text", "label": label, "content": content}


def block_score(value: float, label: str, max_value: float = 1.0, hint: str = "") -> dict:
    """一个带进度条的分数（如相似度、置信度）。"""
    return {
        "type": "score",
        "label": label,
        "value": round(float(value), 4),
        "max": max_value,
        "hint": hint,
    }


def block_table(headers: list, rows: list, label: str = "") -> dict:
    return {"type": "table", "label": label, "headers": headers, "rows": rows}


def block_json(data: Any, label: str = "") -> dict:
    return {"type": "json", "label": label, "data": data}


def block_keyvalue(items: dict, label: str = "") -> dict:
    """键值对列表（如统计指标）。"""
    return {"type": "keyvalue", "label": label, "items": items}


def block_list(items: list, label: str = "", ordered: bool = False) -> dict:
    return {"type": "list", "label": label, "items": items, "ordered": ordered}


# ──── 模块执行结果 ────────────────────────────────────────────────

@dataclass
class ModuleResult:
    ok: bool = True
    summary: str = ""                       # 一句话结论
    blocks: list = field(default_factory=list)  # 有序渲染块
    latency_ms: float = 0.0
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "summary": self.summary,
            "blocks": self.blocks,
            "latency_ms": round(self.latency_ms, 2),
            "error": self.error,
        }


# ──── 模块基类 ────────────────────────────────────────────────────

class PlaygroundModule:
    name: str = ""              # 唯一标识（snake_case）
    display_name: str = ""      # 显示名（中文）
    description: str = ""
    phase: str = ""             # 归属阶段，如 "11-llm-engineering"
    lesson: str = ""            # 归属课程，如 "04-embeddings"
    order: int = 0              # 同 phase 内排序

    # 子类用 field_spec(...) 列出输入字段
    input_schema: list = []

    def run(self, inputs: dict) -> ModuleResult:
        raise NotImplementedError

    # 子类一般不用重写下面的
    def meta(self) -> dict:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "phase": self.phase,
            "lesson": self.lesson,
            "order": self.order,
            "input_schema": self.input_schema,
        }

    def __repr__(self):
        return f"<PlaygroundModule: {self.name}>"
