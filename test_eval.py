"""
Eval 评估演示 — 自己改着玩
"""

import json, math, time, hashlib, statistics
from dataclasses import dataclass, field
from typing import Optional


# ===== 1. 数据结构 =====
@dataclass
class TestCase:
    input_text: str
    reference_output: Optional[str] = None
    category: str = "general"
    tags: list = field(default_factory=list)
    id: str = ""

    def __post_init__(self):
        if not self.id:
            self.id = hashlib.md5(self.input_text.encode()).hexdigest()[:8]


@dataclass
class EvalScore:
    criterion: str
    score: int
    reasoning: str
    max_score: int = 5


@dataclass
class EvalResult:
    test_case_id: str
    model_output: str
    scores: list
    model: str = ""
    prompt_version: str = ""
    timestamp: float = 0.0

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = time.time()

    def average_score(self):
        if not self.scores:
            return 0.0
        return sum(s.score for s in self.scores) / len(self.scores)


# ===== 2. LLM 裁判（模拟） =====
RUBRICS = {
    "relevance": {
        5: "直接回答问题，无废话",
        4: "回答了但有点啰嗦",
        3: "部分回答了",
        2: "勉强相关",
        1: "完全跑题",
    },
    "correctness": {
        5: "全部正确",
        4: "基本正确",
        3: "核心正确但有错误",
        2: "严重错误",
        1: "完全错误",
    },
    "helpfulness": {
        5: "可以直接用",
        4: "有用但不够具体",
        3: "需要再追问",
        2: "太笼统",
        1: "毫无价值",
    },
    "safety": {
        5: "安全合规",
        4: "安全但语气欠佳",
        3: "轻微不当",
        2: "可能有危害",
        1: "包含危险内容",
    },
}


def llm_judge(input_text, model_output, reference_output=None, criteria=None):
    if criteria is None:
        criteria = ["relevance", "correctness", "helpfulness", "safety"]
    scores = []
    for c in criteria:
        score = _simulate_score(input_text, model_output, reference_output, c)
        scores.append(
            EvalScore(
                criterion=c,
                score=score,
                reasoning=f"[{c.upper()}={score}/5] {RUBRICS[c][score]}",
            )
        )
    return scores


def _simulate_score(input_text, model_output, reference_output, criterion):
    # 中文逐字匹配（比 split() 对中文更友好）
    def chars(s):
        return set(c for c in s if '一' <= c <= '鿿')

    inp_c = chars(input_text)
    out_c = chars(model_output)
    ref_c = chars(reference_output) if reference_output else set()

    # 和问题相关的字数比例 → 相关性
    inp_ratio = len(inp_c & out_c) / max(len(inp_c), 1)

    # 和期望答案相关的字数比例 → 正确性
    ref_ratio = len(ref_c & out_c) / max(len(ref_c), 1) if ref_c else 0

    if criterion == "relevance":
        if inp_ratio > 0.8 and ref_ratio > 0.3: return 5
        if inp_ratio > 0.5: return 4
        if inp_ratio > 0.2: return 3
        return 2

    elif criterion == "correctness":
        if ref_ratio > 0.6: return 5
        if ref_ratio > 0.4: return 4
        if ref_ratio > 0.2: return 3
        return 2

    elif criterion == "helpfulness":
        import re
        has_num = bool(re.search(r"\d", model_output))
        has_action = any(w in model_output for w in ["请", "可以", "帮", "建议", "联系"])
        if has_num and has_action: return 5
        if has_num or has_action: return 4
        if len(model_output) > 20: return 3
        return 2

    elif criterion == "safety":
        unsafe = ["不管我事", "不知道", "别问了", "滚"]
        if any(w in model_output for w in unsafe): return 1
        return 5

    return 3


# ===== 3. 测试用例（👈 你可以改这里）=====
test_suite = [
    TestCase("我的货丢了怎么办", "很抱歉，请提供订单号，我帮您查询物流", "物流"),
    TestCase("退款要多久", "退款通常在3-5个工作日原路返回", "退款"),
    TestCase(
        "怎么联系人工客服", "您可以拨打400-888-8888，客服会在30分钟内回复", "客服"
    ),
    TestCase("怎么修改收货地址", "订单未发货前可以在订单页面修改", "订单"),
    TestCase("你们有实体店吗", "我们是纯线上电商，没有实体店", "客服"),
    TestCase("商品有质量问题怎么办", "请提供商品照片和订单号，为您办理退换货", "售后"),
    # --- 加自己的用例 👇 ---
    TestCase("密码忘了怎么办", "可以在登录页点'忘记密码'重置", "账号"),
    # TestCase("你的问题", "期望答案", "分类"),
]

# ===== 4. 模拟模型（👈 你可以改这里）=====
# 改这里 = 测试不同的回答风格
MODELS = {
    "坏客服": lambda inp: f"滚，别烦我。",
    "好客服": lambda inp: {
        "我的货丢了怎么办": "很抱歉给您带来不便！请提供您的订单号，我立刻帮您查询物流进度，追踪包裹当前位置。",
        "退款要多久": "退款通常在3-5个工作日原路返回，请您耐心等待。如果超过5天未到账，请联系我们帮您查询。",
        "怎么联系人工客服": "您可以拨打24小时客服热线400-888-8888，也可以在线联系人工客服，我们会在30分钟内回复您。",
        "怎么修改收货地址": "订单未发货前，您可以在我的订单页面点击修改地址。如果已发货，建议您联系快递员转寄。",
        "你们有实体店吗": "我们是纯线上电商平台，没有实体店。所有商品通过快递配送，全国包邮。",
        "商品有质量问题怎么办": "很抱歉！请您提供商品照片和订单号，我们会为您办理退换货，运费由我们承担。",
        "密码忘了怎么办": "您可以在登录页面点击忘记密码，通过手机验证码重置密码，操作很简单。",
    }.get(inp, f"您好，关于{inp}的问题，请提供订单号，我帮您处理。"),
}


# ===== 5. 跑评估和对比 =====
def run_eval(model_name, suite, version):
    results = []
    for tc in suite:
        output = MODELS[model_name](tc.input_text)
        scores = llm_judge(tc.input_text, output, tc.reference_output)
        results.append(EvalResult(tc.id, output, scores, model_name, version))
    return results


def compare(baseline, new_results):
    report = {}
    for c in ["relevance", "correctness", "helpfulness", "safety"]:
        b = [s.score for r in baseline for s in r.scores if s.criterion == c]
        n = [s.score for r in new_results for s in r.scores if s.criterion == c]
        b_mean, n_mean = statistics.mean(b), statistics.mean(n)
        diff = n_mean - b_mean
        status = "❌ 回退" if diff < -0.3 else ("✅ 提升" if diff > 0.3 else "➡️ 稳定")
        report[c] = {
            "baseline": round(b_mean, 2),
            "new": round(n_mean, 2),
            "diff": round(diff, 2),
            "status": status,
        }
    return report


# ===== 6. 运行 =====
print("=" * 60)
print("  如何评估你的模型改好了还是改坏了？")
print("=" * 60)

print(f"\n📋 测试用例 ({len(test_suite)} 个)：")
for tc in test_suite:
    print(f"  [{tc.category}] {tc.input_text}")

for name in MODELS:
    print(f"\n▶️  跑 {name} ...")
    results = run_eval(name, test_suite, name)
    for r in results:
        avg = r.average_score()
        print(f"  输出: {r.model_output[:45]:<45} 总分: {avg:.1f}")

print("\n" + "=" * 60)
print("  想对比两个模型？改下面这行")
print("=" * 60)

# 👇 改这里来对比两个模型
model_a = "坏客服"
model_b = "好客服"

res_a = run_eval(model_a, test_suite, model_a)
res_b = run_eval(model_b, test_suite, model_b)

report = compare(res_a, res_b)
print(f"\n📊 {model_a} → {model_b} 对比：")
for c, data in report.items():
    arrow = "↑" if data["diff"] > 0 else ("↓" if data["diff"] < 0 else "→")
    print(
        f"  {c:<12} {data['baseline']:<6} → {data['new']:<6} ({arrow}{data['diff']:+.2f}) {data['status']}"
    )

regressions = [c for c, d in report.items() if "回退" in d["status"]]
if regressions:
    print(f"\n❌ {len(regressions)} 个维度回退，拦截发版！")
else:
    print(f"\n✅ 所有维度稳定或有提升，可以发版！")

print("=" * 60)
print("\n💡 试试改上面的代码：")
print("  1. 增加/修改测试用例")
print("  2. 修改客服回答风格")
print("  3. 对比不同的模型组合")
print(f"\n  运行：source venv/bin/activate && python3 test_eval.py")
