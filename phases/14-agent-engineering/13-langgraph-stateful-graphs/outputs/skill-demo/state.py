# state.py — 客服工单处理系统的状态定义
# 来源: phases/14-agent-engineering/13-langgraph-stateful-graphs/outputs/skill-demo
# 仅使用 Python stdlib，不依赖 langgraph/langchain 等外部库
# State 用 TypedDict 定义，节点读取状态并返回更新字典

from __future__ import annotations

from typing import Any, Callable, Optional, TypedDict


# ---------------------------------------------------------------------------
# 状态类型
# ---------------------------------------------------------------------------

class State(TypedDict):
    """客服工单处理系统的完整状态。

    每个节点函数接收当前 State（只读语义），
    返回一个 Update 字典来合并进状态。
    """

    # messages — 对话/消息历史，每条消息是 {"role": ..., "content": ...} 字典
    messages: list[dict]

    # ticket_type — 工单类型，由 classify 节点写入，取值为 "refund" | "bug" | "sales"
    ticket_type: str

    # form_data — 表单数据，由处理节点收集，如退款金额、订单号等
    form_data: dict

    # approved — 是否通过人工审批，human_gate 节点设置
    approved: bool

    # response — 最终回复内容，由 send 节点生成
    response: str

    # retry_count — 重试次数，用于限流和防止无限循环
    retry_count: int


class Update(TypedDict, total=False):
    """节点返回的部分更新（所有字段均为 Optional）。

    节点函数返回 Update，Runner 将其合并进当前 State。
    total=False 表示所有键均可选。
    """

    messages: list[dict]
    ticket_type: str
    form_data: dict
    approved: bool
    response: str
    retry_count: int


# ---------------------------------------------------------------------------
# 类型别名
# ---------------------------------------------------------------------------

# 节点函数：接收 State，返回 Update 字典
NodeFn = Callable[[State], Update]

# 路由函数：接收 State，返回下一个节点名称字符串
Router = Callable[[State], str]


# ---------------------------------------------------------------------------
# 哨兵常量
# ---------------------------------------------------------------------------

# START — 图的虚拟入口，set_entry 指向的真实节点从 START 出发
START: str = "__START__"

# END — 图的虚拟出口，next_node 返回 END 时 Runner 停止遍历
END: str = "__END__"


# ---------------------------------------------------------------------------
# 异常
# ---------------------------------------------------------------------------

class PausedAtNode(Exception):
    """节点请求暂停（例如等待人工介入）时抛出。

    Runner 捕获此异常后保存检查点并停止执行，
    后续可通过 resume() 携带 state_override 恢复。
    """

    def __init__(self, node: str, reason: str = "") -> None:
        self.node = node
        self.reason = reason
        super().__init__(f"Paused at node '{node}': {reason}")
