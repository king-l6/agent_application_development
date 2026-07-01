"""Phase 14 / 12-anthropic-workflow-patterns —— 置信度阈值路由（练习题1）

路由模式：一个分类器给每条消息判类别 + 置信度。低于阈值就认为"没把握"，
升级给人工，而不是硬塞一个类别自动处理。拖动阈值看自动率/人工率怎么变。

一级客服场景：阈值低→机器多担待(省人工但错的多)；阈值高→多转人工(准但贵)。
纯模拟、不调 LLM、自包含。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# 预置：一批客服消息，各带"分类器判的类别"和"置信度"
# （真实系统里这两个值由 embedding+小分类模型 或 LLM 分类器产出）
MESSAGES = [
    ("我要退款！！！订单还没发就不想要了", "退款", 0.96),
    ("这个 App 一打开就闪退，安卓 14", "bug报告", 0.93),
    ("你们企业版怎么收费，能开发票吗", "销售", 0.91),
    ("怎么修改收货地址", "一级支持", 0.88),
    ("密码忘了登不进去", "一级支持", 0.84),
    ("那个……之前那个事儿到底咋整啊", "一级支持", 0.41),  # 含糊，低置信
    ("钱", "退款", 0.38),                                    # 太短，低置信
    ("？？？", "一级支持", 0.22),                             # 无信息，极低
    ("我想把上次买的会员退了顺便问下新套餐", "退款", 0.55),   # 混合意图，中等
    ("系统是不是又崩了我朋友也进不去", "bug报告", 0.79),
]


class ConfidenceRouter(PlaygroundModule):
    name = "confidence_router"
    display_name = "置信度阈值路由（客服分流）"
    description = "路由模式落地：分类器给每条消息判类别+置信度，低于阈值转人工。拖动阈值看自动率/人工率权衡（练习题1，不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "12-anthropic-workflow-patterns"
    order = 120

    input_schema = [
        field_spec("threshold", "置信度阈值 (0~1)", type="number", default=0.7,
                   help="低于此值＝分类器没把握→转人工。一级客服可低(0.6~0.7)，高风险业务调高(0.9)"),
    ]

    def run(self, inputs):
        start = time.time()
        try:
            threshold = float(inputs.get("threshold", 0.7))
        except (ValueError, TypeError):
            threshold = 0.7
        threshold = max(0.0, min(threshold, 1.0))

        rows = []
        auto_count = 0
        human_count = 0
        route_dist = {}   # 自动处理的按类别分发统计
        for msg, category, conf in MESSAGES:
            if conf >= threshold:
                decision = f"自动 → {category}队列"
                auto_count += 1
                route_dist[category] = route_dist.get(category, 0) + 1
                mark = "✓ 自动"
            else:
                decision = "转人工（没把握）"
                human_count += 1
                mark = "⚠ 人工"
            short = msg if len(msg) <= 20 else msg[:20] + "…"
            rows.append([short, category, f"{conf:.2f}", mark, decision])

        total = len(MESSAGES)
        auto_rate = auto_count / total
        human_rate = human_count / total

        # 自动分发到各队列的分布
        dist_rows = [[cat, str(n)] for cat, n in sorted(route_dist.items(), key=lambda x: -x[1])]

        blocks = [
            block_keyvalue({
                "当前阈值": f"{threshold:.2f}",
                "消息总数": total,
                "自动处理": f"{auto_count} 条（{auto_rate:.0%}）",
                "转人工": f"{human_count} 条（{human_rate:.0%}）",
                "省人工程度": "高（机器多担待）" if auto_rate >= 0.7 else ("中" if auto_rate >= 0.4 else "低（大量转人工）"),
            }, label="路由结果（当前阈值）"),
            block_table(
                ["消息", "分类器判类别", "置信度", "决策", "去向"], rows,
                label="逐条路由（置信度 ≥ 阈值才自动，否则转人工）"),
            block_table(
                ["自动分发队列", "条数"], dist_rows,
                label="自动处理的按类别分发") if dist_rows else block_text("（当前阈值下无消息自动处理，全转人工）", label="自动分发"),
            block_list([
                "置信度 = 分类器'我有多确定'的分数(0~1)；阈值 = 你划的线，低于线就别自动、交人工",
                "阈值越高→转人工越多(准但贵慢)；越低→自动越多(省但错的风险大)。按'分错的代价'定",
                "一级客服分错代价低→阈值可低(0.6~0.7)；退款/账户安全分错代价高→调高(0.9)",
                "坑：LLM 会'自信地错'(高置信但答错)，所以生产里置信度更信 embedding+小分类模型，而非 LLM 自报",
                "生产分类分层：规则匹配(最便宜)→小分类模型(主力)→LLM(兜底)→低于阈值升人工",
            ], label="要点"),
            block_text(
                "试试把阈值从 0.3 拖到 0.95：低阈值几乎全自动(但含糊消息也被硬分)，"
                "高阈值只放行最确定的、其余全转人工。这就是练习题1的权衡——没有万能数字，看业务错误代价。",
                label="怎么玩"),
        ]

        return ModuleResult(
            ok=True,
            summary=f"阈值 {threshold:.2f}：{auto_count} 条自动（{auto_rate:.0%}）、{human_count} 条转人工（{human_rate:.0%}）",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
