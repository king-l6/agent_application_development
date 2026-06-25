"""测试上面搭建的 MCP 服务器

通过 stdin/stdout 发送 JSON-RPC 2.0 消息来调用服务器。
模拟了真实 MCP 主机（如 Claude Desktop）的通信流程。
"""

import json
import subprocess
import sys


def test_server():
    # 启动服务器子进程
    server_path = __file__.rsplit("/", 1)[0] + "/real_server.py"
    proc = subprocess.Popen(
        [sys.executable, server_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    request_id = 0

    def send_request(method, params=None):
        nonlocal request_id
        request_id += 1
        msg = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        }
        line = json.dumps(msg) + "\n"
        proc.stdin.write(line)
        proc.stdin.flush()
        response = proc.stdout.readline()
        return json.loads(response)

    try:
        # Step 1: initialize 握手
        print("【1】初始化握手...")
        result = send_request("initialize", {
            "protocolVersion": "2025-06-18",
            "clientInfo": {"name": "test-client"},
        })
        print(f"  服务器: {result['result']['serverInfo']['name']}")
        print(f"  协议: {result['result']['protocolVersion']}")
        print(f"  能力: {list(result['result']['capabilities'].keys())}")

        # Step 2: tools/list 发现工具
        print("\n【2】发现工具...")
        tools = send_request("tools/list")
        for t in tools["result"]["tools"]:
            print(f"  🔧 {t['name']}: {t['description']}")
            print(f"     参数: {json.dumps(t.get('inputSchema', {}), ensure_ascii=False)}")

        # Step 3: 调用 calculate_cost
        print("\n【3】调用 calculate_cost...")
        result = send_request("tools/call", {
            "name": "calculate_cost",
            "arguments": {
                "model": "claude-sonnet",
                "input_tokens": 1500,
                "output_tokens": 500,
                "requests_per_day": 10000,
            },
        })
        text = result["result"]["content"][0]["text"]
        print(text)

        # Step 4: 调用 search_lessons
        print("\n【4】调用 search_lessons（搜索 'MCP'）...")
        result = send_request("tools/call", {
            "name": "search_lessons",
            "arguments": {"query": "MCP"},
        })
        print(result["result"]["content"][0]["text"][:500])

        # Step 5: 调用 get_phase_summary
        print("\n【5】调用 get_phase_summary（Phase 14）...")
        result = send_request("tools/call", {
            "name": "get_phase_summary",
            "arguments": {"phase_number": 14},
        })
        print(result["result"]["content"][0]["text"][:500])

    finally:
        proc.terminate()
        proc.wait()


if __name__ == "__main__":
    test_server()
