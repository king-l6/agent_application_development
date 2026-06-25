"""Phase 11 / 09-function-calling —— 工具调用模拟器

输入一句自然语言请求，本地决定该调用哪个工具、生成 tool_call 参数、
真实执行并返回结果。完整复现 function-calling 的回路，但路由用关键词
而非 LLM，所以本地可跑、不烧 API。

工具逻辑取自课程 function_calling.py（calculator / get_weather / web_search）。
"""
import re
import time
import math

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_json, block_text,
)

WEATHER_DB = {
    "tokyo": {"temp_c": 18, "condition": "cloudy", "humidity": 72},
    "东京": {"temp_c": 18, "condition": "cloudy", "humidity": 72},
    "new york": {"temp_c": 22, "condition": "sunny", "humidity": 45},
    "纽约": {"temp_c": 22, "condition": "sunny", "humidity": 45},
    "london": {"temp_c": 12, "condition": "rainy", "humidity": 88},
    "伦敦": {"temp_c": 12, "condition": "rainy", "humidity": 88},
}


def _calculator(expression: str):
    allowed = set("0123456789+-*/.() ")
    if not all(c in allowed for c in expression):
        return {"error": f"表达式含非法字符: {expression}"}
    try:
        result = eval(expression, {"__builtins__": {}}, {"math": math})
        return {"result": round(float(result), 4), "expression": expression}
    except Exception as e:
        return {"error": str(e)}


def _get_weather(city: str):
    key = city.lower().strip()
    if key not in WEATHER_DB:
        return {"error": f"未收录城市「{city}」", "可用": list(WEATHER_DB.keys())}
    data = WEATHER_DB[key].copy()
    data["city"] = city
    return data


def _route(query: str):
    """关键词路由：返回 (tool_name, arguments) 或 (None, None)。"""
    q = query.lower()

    # 计算器：抓数学表达式
    math_expr = re.search(r"[-+]?[\d.]+\s*[-+*/]\s*[\d.][\d.+\-*/() ]*", query)
    if math_expr or any(w in q for w in ["计算", "算一下", "等于", "calculate"]):
        expr = math_expr.group(0).strip() if math_expr else ""
        if expr:
            return "calculator", {"expression": expr}

    # 天气
    if any(w in q for w in ["天气", "气温", "weather", "temperature"]):
        for city in WEATHER_DB:
            if city in q:
                return "get_weather", {"city": city}
        return "get_weather", {"city": "(未识别到城市)"}

    return None, None


TOOL_FUNCS = {"calculator": _calculator, "get_weather": _get_weather}


class FunctionCallSimulator(PlaygroundModule):
    name = "function_call_simulator"
    display_name = "工具调用模拟"
    description = "输入请求，看模型如何决定调用哪个工具、生成参数并执行（本地路由，不调 LLM）"
    phase = "11-llm-engineering"
    lesson = "09-function-calling"
    order = 90

    input_schema = [
        field_spec("query", "用户请求", type="textarea",
                   placeholder="例如：帮我算一下 (15 + 27) * 3  /  东京今天天气怎么样？"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        query = (inputs.get("query") or "").strip()
        if not query:
            return ModuleResult(ok=False, error="请输入一句请求")

        tool, args = _route(query)
        if tool is None:
            return ModuleResult(
                ok=True,
                summary="模型判断：无需调用工具，直接回答即可",
                blocks=[block_text(
                    "这句话没有触发任何已注册工具（calculator / get_weather）。\n"
                    "真实场景下模型会直接用自身知识回答。\n"
                    "试试：『计算 (15+27)*3』或『伦敦天气怎么样』。",
                    label="无工具调用",
                )],
                latency_ms=(time.time() - start) * 1000,
            )

        # 模拟 tool_call 协议结构
        tool_call = {
            "type": "function",
            "function": {"name": tool, "arguments": args},
        }
        result = TOOL_FUNCS[tool](**args)

        return ModuleResult(
            ok=True,
            summary=f"模型决定调用工具：{tool}",
            blocks=[
                block_keyvalue({
                    "选中工具": tool,
                    "传入参数": str(args),
                }, label="① 模型的决策"),
                block_json(tool_call, label="② 发出的 tool_call（OpenAI 格式）"),
                block_json(result, label="③ 工具执行结果（回填给模型）"),
            ],
            latency_ms=(time.time() - start) * 1000,
        )
