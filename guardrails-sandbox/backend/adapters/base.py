from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GuardrailResult:
    passed: bool
    reason: str = ""
    details: dict = field(default_factory=dict)
    confidence: float = 0.0
    latency_ms: float = 0.0


class GuardrailAdapter:
    """所有适配器的基类。

    子类只需实现 check() 方法。
    group/category/name/order 决定了在树形结构中的位置。
    """

    name: str = ""          # 唯一标识（snake_case）
    display_name: str = ""  # 显示名称（中文）
    description: str = ""
    group: str = "guardrails"  # 顶层分组（如 guardrails/rag/finetune/eval）
    category: str = "input"    # 'input' | 'output'
    order: int = 0             # 执行顺序，从小到大
    enabled: bool = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        raise NotImplementedError

    def __repr__(self):
        return f"<Adapter: {self.name} ({'ON' if self.enabled else 'OFF'})>"
