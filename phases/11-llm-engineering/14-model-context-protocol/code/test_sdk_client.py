"""用 MCP SDK 连接并测试我们的服务器"""
import asyncio
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp import ClientSession


async def main():
    params = StdioServerParameters(
        command="/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/venv/bin/python",
        args=["phases/11-llm-engineering/14-model-context-protocol/code/real_server.py"],
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # 发现工具
            tools = await session.list_tools()
            print(f"发现 {len(tools.tools)} 个工具：\n")
            for t in tools.tools:
                print(f"  🔧 {t.name}")
                print(f"     {t.description}")
                print(f"     inputSchema: {t.inputSchema}")
                print()

            # 测试 1：计算成本
            print("=" * 50)
            print("测试：calculate_cost")
            print("=" * 50)
            result = await session.call_tool("calculate_cost", {
                "model": "claude-sonnet",
                "input_tokens": 1500,
                "output_tokens": 500,
                "requests_per_day": 10000,
            })
            print(result.content[0].text)
            print()

            # 测试 2：搜索课程
            print("=" * 50)
            print("测试：search_lessons")
            print("=" * 50)
            result = await session.call_tool("search_lessons", {
                "query": "Agent",
                "phase": "14",
            })
            print(result.content[0].text[:800])
            print()

            # 测试 3：阶段概要
            print("=" * 50)
            print("测试：get_phase_summary")
            print("=" * 50)
            result = await session.call_tool("get_phase_summary", {
                "phase_number": 14,
            })
            print(result.content[0].text[:600])
            print()

            print("✅ 全部测试通过！")


if __name__ == "__main__":
    asyncio.run(main())
