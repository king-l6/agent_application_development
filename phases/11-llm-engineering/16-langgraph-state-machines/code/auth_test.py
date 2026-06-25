"""探测沙箱网关(llmapi.bilibili.co + personal key)的可用模型 + 工具调用支持。

完全忽略 shell 的环境变量，强制用沙箱已验证可用的那套配置。
"""
import os
# 关键：清掉 shell 里会干扰的环境变量
for k in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"):
    os.environ.pop(k, None)

from anthropic import Anthropic

BASE = "http://llmapi.bilibili.co"
KEY = "personal-6d9fb60eca3d0ca7951af4e2d2f85229"

CANDIDATES = ["deepseek-v4-flash", "claude-opus-4-8", "claude-sonnet-4-5", "deepseek-v3"]

c = Anthropic(base_url=BASE, api_key=KEY, timeout=25, max_retries=1)
print("网关:", BASE, "\n")

ok_models = []
for model in CANDIDATES:
    try:
        r = c.messages.create(model=model, max_tokens=20,
            messages=[{"role": "user", "content": "say hi"}])
        text = "".join(b.text for b in r.content if hasattr(b, "text"))
        print(f"✅ {model:<20} -> {text[:35]}")
        ok_models.append(model)
    except Exception as e:
        print(f"❌ {model:<20} -> {type(e).__name__}: {str(e)[:50]}")

# 对第一个可用模型测工具调用
if ok_models:
    m = ok_models[0]
    print(f"\n--- 测试 {m} 的工具调用 ---")
    try:
        r = c.messages.create(
            model=m, max_tokens=200,
            tools=[{
                "name": "calculator",
                "description": "Evaluate arithmetic",
                "input_schema": {"type": "object",
                    "properties": {"expression": {"type": "string"}},
                    "required": ["expression"]},
            }],
            messages=[{"role": "user", "content": "What is 17 * 23? Use the calculator tool."}],
        )
        has_tool = any(getattr(b, "type", "") == "tool_use" for b in r.content)
        print("工具调用支持:", "✅ 是" if has_tool else "❌ 否(模型没调工具)")
        for b in r.content:
            print("  block:", getattr(b, "type", "?"), getattr(b, "name", ""), getattr(b, "input", ""))
    except Exception as e:
        print("❌ 工具调用失败:", type(e).__name__, str(e)[:80])
