# graph.py — 有状态图的构建与拓扑辅助
# 来源: phases/14-agent-engineering/13-langgraph-stateful-graphs/outputs/skill-demo
# StateGraph 支持固定边、条件边、入口设置；附带三种拓扑辅助函数
# 仅使用 Python stdlib，不依赖 langgraph/langchain 等外部库

from __future__ import annotations

from typing import Callable

from state import END, START, NodeFn, PausedAtNode, Router, State, Update


# ---------------------------------------------------------------------------
# StateGraph
# ---------------------------------------------------------------------------

class StateGraph:
    """声明式有状态图。

    节点是纯函数（State → Update），边可以是固定的或条件的。
    图本身不执行——执行由 Runner 负责。
    """

    def __init__(self) -> None:
        # name → 节点函数
        self._nodes: dict[str, NodeFn] = {}
        # src → dst（固定边）
        self._edges: dict[str, str] = {}
        # src → (router_fn, path_map)（条件边，优先级高于固定边）
        self._cond_edges: dict[str, tuple[Router, dict[str, str]]] = {}
        # 入口节点名称
        self._entry: str | None = None

    # -- 注册 API ----------------------------------------------------------

    def add_node(self, name: str, fn: NodeFn) -> "StateGraph":
        """注册一个节点函数。name 在图中必须唯一。"""
        if name in (START, END):
            raise ValueError(f"'{name}' 是保留哨兵，不能用作节点名")
        if name in self._nodes:
            raise ValueError(f"节点 '{name}' 已存在")
        if len(self._nodes) >= 30:
            raise ValueError(
                f"图已有 {len(self._nodes)} 个节点，超过 30 节点上限。"
                f"请使用嵌套子图拆分。"
            )
        self._nodes[name] = fn
        return self

    def add_edge(self, src: str, dst: str) -> "StateGraph":
        """添加固定边：src 执行完毕后总是跳转到 dst。

        src 可以是 START 哨兵，此时表示从入口跳转到 dst。
        dst 可以是 END 哨兵，表示 src 执行完毕后图结束。
        非哨兵的 src/dst 必须已注册为节点。
        """
        if src not in (START, END) and src not in self._nodes:
            raise ValueError(f"边源节点 '{src}' 未注册，请先调用 add_node()")
        if dst not in (START, END) and dst not in self._nodes:
            raise ValueError(f"边目标节点 '{dst}' 未注册，请先调用 add_node()")
        self._edges[src] = dst
        return self

    def add_conditional_edges(
        self, src: str, router_fn: Router, path_map: dict[str, str]
    ) -> "StateGraph":
        """添加条件边：根据 router_fn(state) 的返回值选择下一个节点。

        path_map 将 router_fn 的返回值映射到实际节点名。
        例如 {"refund": "handle_refund"} 表示 router 返回 "refund" 时
        跳转到 "handle_refund" 节点。
        非哨兵的 src 和 path_map 中的目标必须已注册为节点。
        """
        if src not in (START, END) and src not in self._nodes:
            raise ValueError(f"条件边源节点 '{src}' 未注册，请先调用 add_node()")
        for target in path_map.values():
            if target not in (START, END) and target not in self._nodes:
                raise ValueError(f"条件边目标节点 '{target}' 未注册，请先调用 add_node()")
        self._cond_edges[src] = (router_fn, path_map)
        return self

    def set_entry(self, node_name: str) -> "StateGraph":
        """设置图的入口节点。等价于 add_edge(START, node_name)。

        node_name 必须已注册为节点。
        """
        if node_name not in self._nodes:
            raise ValueError(f"入口节点 '{node_name}' 未注册，请先调用 add_node()")
        self._entry = node_name
        self._edges[START] = node_name
        return self

    # -- 查询 API ----------------------------------------------------------

    def get_node_fn(self, name: str) -> NodeFn:
        """根据名称获取节点函数。"""
        if name not in self._nodes:
            raise KeyError(f"节点 '{name}' 未注册")
        return self._nodes[name]

    def next_node(self, current: str, state: State) -> str:
        """根据当前节点和 state 决定下一个节点名称。

        条件边优先于固定边。返回 END 表示图执行完毕。
        """
        # 条件边优先
        if current in self._cond_edges:
            router_fn, path_map = self._cond_edges[current]
            key = router_fn(state)
            if key not in path_map:
                raise ValueError(
                    f"路由器从 '{current}' 返回 '{key}'，"
                    f"但 path_map 中只有 {list(path_map.keys())}"
                )
            return path_map[key]

        # 固定边
        if current in self._edges:
            return self._edges[current]

        # 没有任何出边 → 结束
        return END

    @property
    def nodes(self) -> list[str]:
        return list(self._nodes.keys())


# ---------------------------------------------------------------------------
# 客服工单节点函数
# ---------------------------------------------------------------------------

def classify(state: State) -> Update:
    """classify 节点：根据最新消息内容判断工单类型。

    简单关键词匹配演示分类逻辑，生产环境可替换为 LLM 调用。
    """
    last_msg = state["messages"][-1]["content"].lower() if state["messages"] else ""

    if any(kw in last_msg for kw in ("退款", "refund", "退钱", "退回")):
        ticket_type = "refund"
    elif any(kw in last_msg for kw in ("bug", "错误", "崩溃", "闪退", "无法")):
        ticket_type = "bug"
    else:
        ticket_type = "sales"

    return {
        "ticket_type": ticket_type,
        "messages": state["messages"] + [
            {"role": "system", "content": f"工单已分类为: {ticket_type}"}
        ],
    }


def handle_refund(state: State) -> Update:
    """处理退款工单：收集退款表单数据。"""
    return {
        "form_data": {"type": "refund", "amount": 99.00, "order_id": "ORD-20260701"},
        "messages": state["messages"] + [
            {"role": "system", "content": "退款表单已填写，等待人工审批"}
        ],
    }


def handle_bug(state: State) -> Update:
    """处理 bug 工单：记录 bug 详情。"""
    return {
        "form_data": {"type": "bug", "severity": "high", "component": "checkout"},
        "messages": state["messages"] + [
            {"role": "system", "content": "Bug 报告已归档，等待人工审批"}
        ],
    }


def handle_sales(state: State) -> Update:
    """处理销售咨询工单：记录客户需求。"""
    return {
        "form_data": {"type": "sales", "interest": "enterprise_plan"},
        "messages": state["messages"] + [
            {"role": "system", "content": "销售需求已记录，等待人工审批"}
        ],
    }


def human_gate(state: State) -> Update:
    """人工审批节点：暂停图执行，等待人工介入。

    若 state["approved"] 为 False（默认），抛出 PausedAtNode。
    恢复后 approved=True 则放行。
    """
    if not state.get("approved", False):
        raise PausedAtNode("human_gate", reason="等待人工审批工单处理结果")
    # 已批准，直接放行，不修改状态
    return {}


def send(state: State) -> Update:
    """发送节点：生成最终回复并发送给用户。"""
    ticket_type = state.get("ticket_type", "unknown")
    form_data = state.get("form_data", {})

    templates = {
        "refund": f"退款申请已批准，金额 ¥{form_data.get('amount', 0):.2f} 将在 3 个工作日内退回。",
        "bug": f"Bug 已标记为 {form_data.get('severity', 'unknown')} 级别，工程师将在 24 小时内处理。",
        "sales": f"已为您安排企业方案顾问，稍后将通过邮件联系您。",
    }
    response = templates.get(ticket_type, "感谢您的反馈，我们会尽快处理。")

    return {
        "response": response,
        "messages": state["messages"] + [
            {"role": "assistant", "content": response}
        ],
    }


# ---------------------------------------------------------------------------
# 路由函数
# ---------------------------------------------------------------------------

def classify_router(state: State) -> str:
    """根据 ticket_type 路由到对应的处理节点。"""
    return state.get("ticket_type", "sales")


# ---------------------------------------------------------------------------
# 示例图构建
# ---------------------------------------------------------------------------

def build_support_graph() -> StateGraph:
    """构建客服工单处理完整示例图。

    流程：classify → (refund/bug/sales 条件分支) → human_gate → send → END
    """
    g = StateGraph()

    # 注册节点
    g.add_node("classify", classify)
    g.add_node("handle_refund", handle_refund)
    g.add_node("handle_bug", handle_bug)
    g.add_node("handle_sales", handle_sales)
    g.add_node("human_gate", human_gate)
    g.add_node("send", send)

    # 入口
    g.set_entry("classify")

    # classify → 条件分支
    g.add_conditional_edges(
        "classify",
        classify_router,
        {
            "refund": "handle_refund",
            "bug": "handle_bug",
            "sales": "handle_sales",
        },
    )

    # 三个处理节点 → human_gate（固定边）
    g.add_edge("handle_refund", "human_gate")
    g.add_edge("handle_bug", "human_gate")
    g.add_edge("handle_sales", "human_gate")

    # human_gate → send → END
    g.add_edge("human_gate", "send")
    g.add_edge("send", END)

    return g


# ---------------------------------------------------------------------------
# 三种拓扑辅助函数
# ---------------------------------------------------------------------------

def build_supervisor_graph(
    router_fn: Router, worker_graphs: dict[str, StateGraph]
) -> StateGraph:
    """监督者模式：中央路由器将任务分发给 worker 子图。

    router_fn(state) → worker 名称 → 执行该 worker 子图。
    适用于一个"经理"协调多个专家团队的场景。
    """
    g = StateGraph()

    # 将每个 worker 子图包装为代理节点，使用 Runner 执行完整子图流程
    def _make_proxy(name: str, sub: StateGraph) -> NodeFn:
        entry = sub._edges.get(START) or sub._entry
        if entry is None:
            raise ValueError(f"子图 '{name}' 未设置入口节点")

        def _proxy(state: State) -> Update:
            """代理节点：遍历子图节点依次执行（简化实现）。

            注意：这是一个简化的子图执行器，按子图的拓扑顺序
            依次执行各节点。完整的子图执行应使用 Runner，但
            为避免循环依赖此处直接遍历执行。
            """
            current = entry
            result_state = dict(state)
            while current != END and current is not None:
                node_fn = sub.get_node_fn(current)
                update = node_fn(result_state)
                if update:
                    result_state = {**result_state, **update}
                # 沿子图的边前进
                current = sub.next_node(current, result_state)
            # 只返回子图产生的增量更新
            return {k: v for k, v in result_state.items() if k in state and v != state[k]}  # type: ignore[return-value]

        return _proxy

    for name, sub in worker_graphs.items():
        g.add_node(name, _make_proxy(name, sub))

    # 条件路由
    g.add_conditional_edges(START, router_fn, {n: n for n in worker_graphs})
    for name in worker_graphs:
        g.add_edge(name, END)

    return g


def build_swarm_graph(
    agents: dict[str, NodeFn], handoff_router: Router
) -> StateGraph:
    """群集模式：多个对等代理通过交接路由器互相转交控制权。

    任何代理执行完毕后，handoff_router 决定下一个代理。
    适用于多代理协商、工具共享等场景。
    """
    g = StateGraph()
    for name, fn in agents.items():
        g.add_node(name, fn)

    # 每个节点完成后由 handoff_router 决定下一步
    for name in agents:
        g.add_conditional_edges(name, handoff_router, {n: n for n in agents} | {END: END})

    # 设置入口（取第一个 agent）
    first = next(iter(agents))
    g.set_entry(first)

    return g


def build_hierarchical_graph(layers: list[dict[str, NodeFn]]) -> StateGraph:
    """层次化模式：按层级排列节点，每层执行完毕后进入下一层。

    layers[0] 是第一层（入口），layers[-1] 是最后一层。
    同层节点按字典顺序依次执行。
    适用于流水线、多阶段审批等场景。
    """
    g = StateGraph()
    prev_last: str | None = None

    for layer_idx, layer in enumerate(layers):
        names = sorted(layer.keys())
        for name in names:
            g.add_node(name, layer[name])

        # 同层节点串联
        for i in range(len(names) - 1):
            g.add_edge(names[i], names[i + 1])

        # 上一层最后一个节点 → 本层第一个节点
        if prev_last is not None:
            g.add_edge(prev_last, names[0])
        else:
            g.set_entry(names[0])

        prev_last = names[-1]

    # 最后一个节点 → END
    if prev_last is not None:
        g.add_edge(prev_last, END)

    return g
