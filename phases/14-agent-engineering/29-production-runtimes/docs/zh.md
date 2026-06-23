# 生产运行时：队列、事件、Cron

> 生产智能体六种运行时形态运行：请求-响应、流式、持久执行、基于队列的后台、事件驱动和定时调度。在选择框架之前先选择形态。可观测性在每个形态中都是承重结构。

**类型：** 学习
**语言：** Python（标准库）
**前置知识：** 阶段 14 · 13（LangGraph），阶段 14 · 22（语音）
**时间：** ~60 分钟

## 学习目标

- 说出六种生产运行时形态，并将每种匹配到一个框架/产品模式。
- 解释为什么持久执行（LangGraph）对长周期任务至关重要。
- 描述事件驱动运行时以及 Claude Managed Agents 何时适用。
- 解释多步骤智能体的可观测性即承重结构的主张。

## 问题

生产智能体以 Jupyter notebook 无法呈现的方式失败：第 37 步的网络超时、用户中途挂断语音通话、cron 任务在机器重启后死亡、后台工作者内存耗尽。运行时形态决定了哪些故障是可存活的。

## 概念

### 请求-响应

- 同步 HTTP。用户等待完成。
- 仅适用于短任务（<30 秒）。
- 技术栈：Agno（Python + FastAPI）、Mastra（TypeScript + Express/Hono/Fastify/Koa）。
- 可观测性：标准 HTTP 访问日志 + OTel 跨度。

### 流式

- SSE 或 WebSocket 用于渐进输出。
- LiveKit 将其扩展到 WebRTC 以支持语音/视频（第 22 课）。
- 技术栈：任何支持流式的框架 + 处理 SSE/WS 的前端。
- 可观测性：每块时机、首令牌延迟、尾延迟。

### 持久执行

- 每一步后状态检查点；失败时自动恢复。
- AutoGen v0.4 参与者模型将故障隔离到单个智能体（第 14 课）。
- LangGraph 的核心差异化优势（第 13 课）。
- 当步骤数量未知且恢复成本高时至关重要。

### 基于队列/后台

- 任务进入队列，工作者领取，结果通过 webhook 或发布/订阅返回。
- 对长周期智能体至关重要（每任务数十到数百步，根据 Anthropic 的计算机使用公告）。
- 技术栈：Celery（Python）、BullMQ（Node）、SQS + Lambda（AWS）、自定义。
- 可观测性：队列深度、每任务延迟分布、DLQ 大小。

### 事件驱动

- 智能体订阅触发器：新邮件、PR 已打开、cron 触发。
- Claude Managed Agents 开箱即用支持此模式（第 17 课）。
- CrewAI Flows（第 15 课）构建事件驱动的确定性工作流。
- 可观测性：触发源、事件到启动延迟、智能体延迟。

### 定时调度

- 周期性运行的 Cron 形态智能体。
- 与持久执行结合，使失败的夜间运行在下一次调度时恢复。
- 技术栈：Kubernetes CronJob + 持久框架；托管服务（Render cron、Vercel cron）。

### 2026 年部署模式

- **CrewAI Flows**用于事件驱动生产。
- **Agno**无状态 FastAPI 用于 Python 微服务。
- **Mastra**服务器适配器（Express、Hono、Fastify、Koa）用于嵌入。
- **Pipecat Cloud / LiveKit Cloud**用于托管语音（第 22 课）。
- **Claude Managed Agents**用于托管的长运行异步任务。

### 可观测性是承重结构

没有 OpenTelemetry GenAI 跨度（第 23 课）加上 Langfuse/Phoenix/Opik 后端（第 24 课），您无法调试在第 40 步失败的多步骤智能体。这对于生产不是可选的。这是"我们快速调试"和"我们用更多日志记录从头重放"之间的区别。

### 生产运行时失效的地方

- **错误的形态选择。** 为 5 分钟任务选择请求-响应。用户挂断；工作者堆积；重试叠加。
- **没有 DLQ。** 没有死信的队列工作者。失败的任务消失无踪。
- **不透明的后台工作。** 后台智能体运行没有追踪导出。失败在用户报告之前不可见。
- **跳过持久状态。** 任何运行时间 > 30 秒且您无法承受重新启动的任务都需要持久执行。

## 构建

`code/main.py` 是一个标准库多形态演示：

- 请求-响应端点（纯函数）。
- 流式处理器（生成器）。
- 带 DLQ 的基于队列的工作者。
- 事件触发器注册表。
- Cron 形态调度器。

运行：

```bash
python3 code/main.py
```

输出：五个追踪，展示每种形态在同一任务上的行为。相同的智能体逻辑，不同的外部外壳。持久执行（第六种形态）有意在第 13 课中通过 LangGraph 检查点机制进行讲解。

## 使用

- **请求-响应**用于聊天风格的用户体验。
- **流式**用于渐进响应。
- **持久**用于长周期任务。
- **队列**用于批处理/异步/长运行。
- **事件**用于智能体响应式。
- **Cron**用于维护任务（记忆整合、评估、成本报告）。

## 交付

`outputs/skill-runtime-shape.md` 为任务选择运行时形态并接入可观测性需求。

## 练习

1. 将您的第 01 课 ReAct 循环移植到您技术栈中的所有六种形态。哪种形态适合哪个产品表面？
2. 向基于队列的演示添加 DLQ。模拟 10% 的任务失败；显示 DLQ 大小。
3. 编写一个由 cron 触发的评估智能体，每晚针对当天的前 20 条追踪运行。
4. 实现带背压的流式：如果客户端慢，暂停智能体。这与轮次预算如何交互？
5. 阅读 Claude Managed Agents 文档。何时会将自托管的长周期智能体迁移到托管服务？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 请求-响应 | "同步" | 用户等待；仅短任务 |
| 流式 | "SSE / WS" | 渐进输出；更好的用户体验；每个块可观察延迟 |
| 持久执行 | "从失败恢复" | 已检查点的状态；在最后一步重启 |
| 基于队列 | "后台任务" | 生产者 / 工作者池 / DLQ |
| 事件驱动 | "基于触发器的" | 智能体响应外部事件 |
| DLQ | "死信队列" | 失败任务的停车场 |
| Claude Managed Agents | "托管运行时" | Anthropic 托管的长运行异步，支持缓存和压缩 |

## 延伸阅读

- [LangGraph 概述](https://docs.langchain.com/oss/python/langgraph/overview) — 持久执行详情
- [Claude Managed Agents 概述](https://platform.claude.com/docs/en/managed-agents/overview) — 托管的长运行异步
- [Anthropic，介绍计算机使用](https://www.anthropic.com/news/3-5-models-and-computer-use) — "每任务数十到数百步"
- [AutoGen v0.4（微软研究院）](https://www.microsoft.com/en-us/research/articles/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/) — 参与者模型故障隔离
