"""Phase 11 / 03-structured-outputs —— JSON 校验器

贴入一段 LLM 输出（应为 JSON），本地校验：能否解析、字段是否齐全、
类型是否匹配。对应课程「结构化输出」的核心：格式错误比内容错误更致命。
不调 LLM。
"""
import json
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_json,
)


class JsonValidator(PlaygroundModule):
    name = "json_validator"
    display_name = "JSON 校验"
    description = "校验一段输出是否为合法 JSON、字段是否齐全、类型是否匹配（本地，不调 LLM）"
    phase = "11-llm-engineering"
    lesson = "03-structured-outputs"
    order = 30

    input_schema = [
        field_spec("payload", "JSON 文本", type="textarea",
                   placeholder='例如：{"name": "小明", "age": 18, "tags": ["a","b"]}'),
        field_spec("required_fields", "必填字段(可选)", type="text",
                   placeholder="逗号分隔，例如：name,age",
                   help="留空则只校验能否解析"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        payload = (inputs.get("payload") or "").strip()
        if not payload:
            return ModuleResult(ok=False, error="请粘贴一段 JSON 文本")

        # 容错：去掉常见的 markdown 代码围栏
        cleaned = payload
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            return ModuleResult(
                ok=True,
                summary=f"❌ JSON 解析失败：{e.msg}（第 {e.lineno} 行第 {e.colno} 列）",
                blocks=[block_keyvalue({
                    "错误类型": "JSONDecodeError",
                    "错误信息": e.msg,
                    "位置": f"行 {e.lineno} 列 {e.colno}",
                    "提示": "检查引号/逗号/括号是否配对，LLM 常漏尾随逗号或多包一层文字",
                }, label="解析错误")],
                latency_ms=(time.time() - start) * 1000,
            )

        # 解析成功，统计字段类型
        type_rows = []
        if isinstance(data, dict):
            for k, v in data.items():
                type_rows.append([k, type(v).__name__, str(v)[:40]])
        top_type = type(data).__name__

        # 必填字段检查
        req_raw = (inputs.get("required_fields") or "").strip()
        missing = []
        if req_raw and isinstance(data, dict):
            required = [f.strip() for f in req_raw.replace("，", ",").split(",") if f.strip()]
            missing = [f for f in required if f not in data]

        if missing:
            summary = f"⚠️ JSON 合法，但缺少必填字段：{', '.join(missing)}"
        else:
            summary = f"✅ 合法 JSON（顶层类型 {top_type}）"

        blocks = []
        if type_rows:
            blocks.append(block_table(
                headers=["字段", "类型", "值(截断)"],
                rows=type_rows,
                label="字段一览",
            ))
        if missing:
            blocks.append(block_keyvalue(
                {"缺失字段": ", ".join(missing)}, label="必填校验未通过"))
        blocks.append(block_json(data, label="解析结果"))

        return ModuleResult(
            ok=True,
            summary=summary,
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
