# Terminal Coding Agent

这是 Terminal Coding Agent 学习计划对应的引导式实现项目。

## T0 契约

第一个里程碑刻意不接入模型和工具循环，只冻结三个边界：

1. `TaskRequest` 描述一次代码仓库任务。
2. `FakeCodingAgent` 以确定性方式接受或拒绝任务。
3. `TaskResult` 使用统一、可序列化的结构返回完成、失败或暂停状态。

## 运行

```bash
cd projects/terminal-coding-agent
python3 main.py . "Inspect the repository" --task-id task-001
```

## 测试

```bash
cd projects/terminal-coding-agent
python3 -m unittest discover tests -v
```

下一个里程碑会在保留这些契约的前提下，用显式 Agent Harness Loop 替换 `FakeCodingAgent`。
