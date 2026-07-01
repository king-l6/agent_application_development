// 自动生成，勿手改。由 scripts/gen-checkpoint-snapshot.py 预解码 LangGraph
// 检查点库产出。真实 msgpack 二进制已用 JsonPlusSerializer 解码为可读对话。
// 重新生成：../../../venv/bin/python scripts/gen-checkpoint-snapshot.py
export const checkpointSnapshot = {
  "dbs": [
    {
      "key": "demo",
      "label": "课程演示库 (demo_checkpoints.db)",
      "filename": "demo_checkpoints.db",
      "exists": true
    }
  ],
  "snapshots": {
    "demo": {
      "ok": true,
      "db_filename": "demo_checkpoints.db",
      "tables": [
        "checkpoints",
        "writes"
      ],
      "all_threads": [
        "user-demo-7"
      ],
      "thread_filter": "",
      "checkpoint_count": 5,
      "steps": [
        {
          "index": 0,
          "thread_id": "user-demo-7",
          "checkpoint_id": "1f1707ce-4be8-62ea-bfff-25c39830653a",
          "message_count": 0,
          "last_message": null,
          "messages": []
        },
        {
          "index": 1,
          "thread_id": "user-demo-7",
          "checkpoint_id": "1f1707ce-4bea-61bc-8000-1b77dcce8801",
          "message_count": 1,
          "last_message": {
            "kind": "HumanMessage",
            "role": "user",
            "content": "请计算 (17 * 23 + 100)",
            "tool_call": null
          },
          "messages": [
            {
              "kind": "HumanMessage",
              "role": "user",
              "content": "请计算 (17 * 23 + 100)",
              "tool_call": null
            }
          ]
        },
        {
          "index": 2,
          "thread_id": "user-demo-7",
          "checkpoint_id": "1f1707ce-7884-6fa6-8001-12d384b8835b",
          "message_count": 2,
          "last_message": {
            "kind": "AIMessage",
            "role": "assistant",
            "content": "[{'id': 'tooluse_nyCyjEdNxP70twbot4v92W', 'input': {'expression': '17 * 23 + 100'}, 'name': 'calculator', 'type': 'tool_use'}]",
            "tool_call": {
              "name": "calculator",
              "args": {
                "expression": "17 * 23 + 100"
              }
            }
          },
          "messages": [
            {
              "kind": "HumanMessage",
              "role": "user",
              "content": "请计算 (17 * 23 + 100)",
              "tool_call": null
            },
            {
              "kind": "AIMessage",
              "role": "assistant",
              "content": "[{'id': 'tooluse_nyCyjEdNxP70twbot4v92W', 'input': {'expression': '17 * 23 + 100'}, 'name': 'calculator', 'type': 'tool_use'}]",
              "tool_call": {
                "name": "calculator",
                "args": {
                  "expression": "17 * 23 + 100"
                }
              }
            }
          ]
        },
        {
          "index": 3,
          "thread_id": "user-demo-7",
          "checkpoint_id": "1f1707ce-7893-6aec-8002-74374d545253",
          "message_count": 3,
          "last_message": {
            "kind": "ToolMessage",
            "role": "tool",
            "content": "491",
            "tool_call": null
          },
          "messages": [
            {
              "kind": "HumanMessage",
              "role": "user",
              "content": "请计算 (17 * 23 + 100)",
              "tool_call": null
            },
            {
              "kind": "AIMessage",
              "role": "assistant",
              "content": "[{'id': 'tooluse_nyCyjEdNxP70twbot4v92W', 'input': {'expression': '17 * 23 + 100'}, 'name': 'calculator', 'type': 'tool_use'}]",
              "tool_call": {
                "name": "calculator",
                "args": {
                  "expression": "17 * 23 + 100"
                }
              }
            },
            {
              "kind": "ToolMessage",
              "role": "tool",
              "content": "491",
              "tool_call": null
            }
          ]
        },
        {
          "index": 4,
          "thread_id": "user-demo-7",
          "checkpoint_id": "1f1707ce-870f-633c-8003-6754597046ac",
          "message_count": 4,
          "last_message": {
            "kind": "AIMessage",
            "role": "assistant",
            "content": "17 * 23 + 100 = 491",
            "tool_call": null
          },
          "messages": [
            {
              "kind": "HumanMessage",
              "role": "user",
              "content": "请计算 (17 * 23 + 100)",
              "tool_call": null
            },
            {
              "kind": "AIMessage",
              "role": "assistant",
              "content": "[{'id': 'tooluse_nyCyjEdNxP70twbot4v92W', 'input': {'expression': '17 * 23 + 100'}, 'name': 'calculator', 'type': 'tool_use'}]",
              "tool_call": {
                "name": "calculator",
                "args": {
                  "expression": "17 * 23 + 100"
                }
              }
            },
            {
              "kind": "ToolMessage",
              "role": "tool",
              "content": "491",
              "tool_call": null
            },
            {
              "kind": "AIMessage",
              "role": "assistant",
              "content": "17 * 23 + 100 = 491",
              "tool_call": null
            }
          ]
        }
      ],
      "full_conversation": [
        {
          "kind": "HumanMessage",
          "role": "user",
          "content": "请计算 (17 * 23 + 100)",
          "tool_call": null
        },
        {
          "kind": "AIMessage",
          "role": "assistant",
          "content": "[{'id': 'tooluse_nyCyjEdNxP70twbot4v92W', 'input': {'expression': '17 * 23 + 100'}, 'name': 'calculator', 'type': 'tool_use'}]",
          "tool_call": {
            "name": "calculator",
            "args": {
              "expression": "17 * 23 + 100"
            }
          }
        },
        {
          "kind": "ToolMessage",
          "role": "tool",
          "content": "491",
          "tool_call": null
        },
        {
          "kind": "AIMessage",
          "role": "assistant",
          "content": "17 * 23 + 100 = 491",
          "tool_call": null
        }
      ]
    }
  }
}
