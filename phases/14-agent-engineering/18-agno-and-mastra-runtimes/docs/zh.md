# Agno 和 Mastra：生产运行时

> Agno（Python）和 Mastra（TypeScript）是2026年的生产运行时配对。Agno 致力于微秒级智能体实例化和无状态 FastAPI 后端。Mastra 在 Vercel AI SDK 基础上提供智能体、工具、工作流、统一模型路由和复合存储。

**类型：** 学习
**语言：** Python、TypeScript
**前置条件：** 第14阶段·01（智能体循环），第14阶段·13（LangGraph）
**时长：** ~45分钟

## 学习目标

- 识别 Agno 的性能目标及其适用场景。
- 列举 Mastra 的三个基本要素——Agents、Tools、Workflows——以及支持的服务器适配器。
- 解释为什么无状态会话范围的 FastAPI 后端是推荐的 Agno 生产路径。
- 针对给定技术栈（Python 优先 vs TypeScript 优先），选择 Agno 或 Mastra。

## 问题

LangGraph、AutoGen、CrewAI 框架较重。想要"只是智能体循环，快速运行，在我自己的运行时中"的团队选择 Agno（Python）或 Mastra（TypeScript）。两者都以框架拥有的部分基本要素换取原始速度和与周围技术栈更紧密的契合。

## 概念

### Agno

- Python 运行时，前身为 Phi-data。
- "无图、无链、无复杂模式——只有纯 Python。"
- 文档中的性能目标：约2微秒智能体实例化，约3.75 KiB 每智能体内存，约23个模型提供商。
- 生产路径：无状态会话范围 FastAPI 后端。每个请求启动一个新智能体；会话状态存在于数据库中。
- 原生多模态（文本、图像、音频、视频、文件）和智能体 RAG。

速度目标在每秒数千个短生命周期智能体（聊天扇入、评估管道）时重要。当一个智能体运行10分钟时，它们不那么重要。

### Mastra

- TypeScript，基于 Vercel AI SDK 构建。
- 三个基本要素：**Agents**、**Tools**（Zod 类型化）、**Workflows**。
- 统一模型路由器——94个提供商中的3,300多个模型（2026年3月）。
- 复合存储：记忆、工作流、可观测性到不同的后端；ClickHouse 推荐用于大规模可观测性。
- Apache 2.0 许可证，带有 `ee/` 目录（源代码可用企业许可证）。
- 服务器适配器：Express、Hono、Fastify、Koa；一流的 Next.js 和 Astro 集成。
- 提供 Mastra Studio（localhost:4111）用于调试。
- 1.0 版本（2026年1月）时22k+ GitHub 星标，300k+ 周 npm 下载量。

### 定位

两者都不是要成为 LangGraph。它们在以下方面竞争：

- **语言适配。** Agno 适用于 Python 优先团队；Mastra 适用于 TypeScript 优先团队。
- **运行时人体工程学。** Agno = 近零开销；Mastra = 与 Vercel 生态系统集成。
- **可观测性。** 两者都与 Langfuse/Phoenix/Opik（第24课）集成，但 Mastra Studio 是第一方支持。

### 何时选择哪个

- **Agno** — Python 后端，大量短生命周期智能体，强性能要求，FastAPI 团队。
- **Mastra** — TypeScript 后端，Next.js / Vercel 部署，统一多提供商模型路由，Zod 类型化工具。
- **LangGraph**（第13课）— 当持久化状态和显式图推理比原始速度更重要时。
- **OpenAI / Claude Agent SDK** — 当你想要提供商的成品形态时（第16-17课）。

### 这种模式的失败点

- **为性能而性能。** 因为"2微秒"听起来不错而选择 Agno，但工作负载是每个请求一个慢速智能体调用。开销不是瓶颈。
- **生态系统锁定。** Mastra 的 Vercel 风格集成在 Vercel 上是优点，在其他地方是缺点。
- **企业许可证混淆。** Mastra 的 `ee/` 目录是源代码可用，而非 Apache 2.0。如果你计划分叉，请阅读许可证。

## 构建

本课主要是比较性的——没有单一的代码工件能公正地对待两个框架。见 `code/main.py` 的并列玩具示例：一个最小的"运行智能体、流式输出、持久化会话"流程，实现两次（一次 Agno 风格，一次 Mastra 风格）。

运行：

```
python3 code/main.py
```

两个结构不同但功能等价的跟踪。

## 使用

- **Agno** — 需要速度和 FastAPI 形态的 Python 后端。
- **Mastra** — 具有多个提供商和工作流基本要素的 TypeScript 后端。
- 两者都提供第一方可观测性钩子。两者都与 Langfuse 集成。

## 交付

`outputs/skill-runtime-picker.md` 基于技术栈、延迟预算和运营形态选择 Agno、Mastra、LangGraph 或提供商 SDK。

## 练习

1. 阅读 Agno 文档。将标准库 ReAct 循环（第1课）移植到 Agno。什么消失了？什么保留了？
2. 阅读 Mastra 文档。将同一循环移植到 Mastra。工具类型化有什么变化（Zod vs 无）？
3. 基准测试：在你的技术栈上测量智能体实例化延迟。Agno 的2微秒对你的工作负载重要吗？
4. 设计迁移：如果你一直在 Python 中运行 CrewAI，迁移到 Agno 会破坏什么？
5. 阅读 Mastra 的 `ee/` 许可证条款。哪些限制会影响开源分叉？

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| Agno | "快速 Python 智能体" | 无状态会话范围智能体运行时 |
| Mastra | "Vercel AI SDK 上的 TypeScript 智能体" | Agents + Tools + Workflows + Model Router |
| 统一模型路由器（Unified Model Router） | "多提供商访问" | 跨94个提供商的3,300多个模型的单一客户端 |
| 复合存储（Composite storage） | "多后端" | 记忆/工作流/可观测性各自存储在不同的地方 |
| Mastra Studio | "本地调试器" | localhost:4111 用于检查智能体的 UI |
| 源代码可用（Source-available） | "非开源" | 许可证允许阅读源代码但限制商业使用 |

## 延伸阅读

- [Agno Agent Framework 文档](https://www.agno.com/agent-framework) — 性能目标、FastAPI 集成
- [Mastra 文档](https://mastra.ai/docs) — 基本要素、服务器适配器、Model Router
- [LangGraph 概述](https://docs.langchain.com/oss/python/langgraph/overview) — 有状态图替代方案
- [Comet Opik](https://www.comet.com/site/products/opik/) — Mastra 集成引用的可观测性比较
