# A2A——智能体到智能体协议

> Google 于 2025 年 4 月宣布了 A2A；到 2026 年 4 月，规范文档位于 https://a2a-protocol.org/latest/specification/，且有 150 多个组织支持它。A2A 是 MCP（第 13 阶段）的水平补充：MCP 是垂直的（智能体 ↔ 工具），A2A 是对等的（智能体 ↔ 智能体）。它定义了智能体卡片（发现）、带有产物（文本、结构化数据、视频）的任务、不透明的任务生命周期和认证。生产系统越来越多地将 MCP 与 A2A 配对使用。Google Cloud 在 2025-2026 年期间将 A2A 支持纳入了 Vertex AI Agent Builder。

**类型：** 学习 + 构建
**语言：** Python（标准库，`http.server`，`json`）
**前置知识：** 第 16 阶段 · 04（基础模型）
**时间：** 约 75 分钟

## 问题

你的智能体需要调用另一个系统上的另一个智能体。如何做到？你可以暴露一个 HTTP 端点，定义一个定制的 JSON 模式，并希望另一端能理解它。每对智能体就变成了一个定制集成。

A2A 就是实现这种调用的通用线路协议。标准发现、标准任务模型、标准传输、标准产物。就像 HTTP+REST，但将智能体作为一等公民。

## 概念

### 四个元素

**智能体卡片（Agent Card）。** 位于 `/.well-known/agent.json` 的一个 JSON 文档，描述智能体：名称、技能、端点、支持的模态、认证要求。通过读取卡片进行发现。

```
GET https://agent.example.com/.well-known/agent.json
→ {
    "name": "code-review-agent",
    "skills": ["review-python", "review-typescript"],
    "endpoints": {
      "tasks": "https://agent.example.com/tasks"
    },
    "auth": {"type": "bearer"},
    "modalities": ["text", "structured"]
  }
```

**任务（Task）。** 工作单元。一个异步、有状态的对象，具有生命周期：`submitted → working → completed / failed / canceled`。客户端发送任务，轮询或订阅更新。

**产物（Artifact）。** 任务产生的结果类型。文本、结构化 JSON、图片、视频、音频。产物是带类型的，因此不同的模态是一等公民。

**不透明生命周期（Opaque lifecycle）。** A2A 不规定远程智能体*如何*解决任务。客户端看到状态转换和产物；实现可以使用任何框架。

### MCP/A2A 的分工

- **MCP**（第 13 阶段）：智能体 ↔ 工具。智能体通过 JSON-RPC 对工具服务器进行读写。默认无状态。
- **A2A**：智能体 ↔ 智能体。对等协议；双方都是具有自己推理能力的智能体。

生产级多智能体系统两者都用。一个 A2A 对等体在其一侧调用 MCP 工具。这种分工使两个关注点保持清晰。

### 发现流程

```
客户端                        智能体服务器
  ├──GET /.well-known/agent.json──>
  <──智能体卡片 JSON─────────────
  ├──POST /tasks {skill, input}──>
  <──201 task_id, state=submitted
  ├──GET /tasks/{id}──────────────>
  <──state=working, 42% done──────
  ├──GET /tasks/{id}──────────────>
  <──state=completed, artifacts──
```

或者使用流式传输：通过 SSE 订阅 `/tasks/{id}/events` 以接收推送更新。

### 认证

A2A 支持三种常见模式：

- **Bearer 令牌**——OAuth2 或不透明令牌。
- **mTLS**——双向 TLS；组织之间相互验证身份。
- **签名请求**——对载荷的 HMAC。

认证在智能体卡片中声明；客户端发现并遵守。

### 到 2026 年 4 月已有 150 多个组织

企业采用推动了 A2A 的规模化。主要成果：A2A 成为企业智能体系统跨信任边界通信的方式。Google Cloud 推出了 Vertex AI Agent Builder 的 A2A 支持；Microsoft Agent Framework 支持它；大多数主流框架（LangGraph、CrewAI、AutoGen）都推出了 A2A 适配器。

### A2A 的优势场景

- **跨组织调用。** 公司 A 的智能体调用公司 B 的智能体。没有 A2A，每对都是一份定制合同。
- **异构框架。** LangGraph 智能体调用 CrewAI 智能体调用自定义 Python 智能体。A2A 使其标准化。
- **带类型的产物。** 视频结果、结构化 JSON、音频——都是一等公民。
- **长时间运行的任务。** 不透明生命周期 + 轮询使耗时数小时的任务变得简单直接。

### A2A 的劣势场景

- **对延迟敏感的微调用。** A2A 的生命周期是异步的。亚毫秒级的智能体间通信不适用；改用直接 RPC。
- **紧耦合的进程内智能体。** 如果两个智能体在同一个 Python 进程中运行，A2A 的 HTTP 往返是过度设计。
- **小团队。** 规范的开销是真实存在的；仅限内部的智能体可能不需要这种形式化。

### A2A 与 ACP、ANP、NLIP 的对比

2024-2026 年间出现了几个相关规范：

- **ACP**（IBM/Linux 基金会）——A2A 的前身，范围较窄。
- **ANP**（Agent Network Protocol）——重度对等发现，去中心化优先。
- **NLIP**（Ecma 自然语言交互协议，2025 年 12 月标准化）——自然语言内容类型。

截至 2026 年 4 月，A2A 是采用最广泛的对等协议。参见 arXiv:2505.02279（Liu 等人，"A Survey of Agent Interoperability Protocols"）以进行比较。

## 构建它

`code/main.py` 使用 `http.server` 和 JSON 实现了一个最小化的 A2A 服务器和客户端。服务器：

- 暴露 `/.well-known/agent.json`，
- 接受 `POST /tasks`，
- 管理任务状态，
- 在 `GET /tasks/{id}` 上返回产物。

客户端：

- 获取智能体卡片，
- 提交任务，
- 轮询直到完成，
- 读取产物。

运行：

```
python3 code/main.py
```

脚本在后台线程中启动服务器，然后运行客户端。你可以看到完整的流程：发现、提交、轮询、产物。

## 使用它

`outputs/skill-a2a-integrator.md` 设计一个 A2A 集成：智能体卡片内容、任务模式、认证选择、流式传输 vs 轮询。

## 交付清单

- **锁定规范版本。** A2A 仍在发展中；智能体卡片应声明协议版本。
- **幂等的任务创建。** 重复提交（网络重试）应产生一个任务。
- **产物模式。** 声明智能体返回的形状；消费者应进行验证。
- **速率限制 + 认证。** A2A 是对外公开的；应用标准 Web 安全措施。
- **失败任务的死信队列。** 随时间推移检查模式以发现重复出现的失败类型。

## 练习

1. 运行 `code/main.py`。确认客户端发现服务器并接收到正确的产物。
2. 在服务器上添加第二个技能（例如，"summarize"）。更新智能体卡片。编写一个根据任务类型选择技能的客户端。
3. 实现一个 SSE 流式传输端点：`/tasks/{id}/events` 发出状态变更。客户端需要做哪些不同的操作？
4. 阅读 A2A 规范（https://a2a-protocol.org/latest/specification/）。指出规范强制要求但本演示未实现的三件事。
5. 比较 A2A（智能体卡片发现）与 MCP（通过 `listTools` 列出服务器端能力）。自描述智能体与能力探测之间的权衡是什么？

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------|---------|
| A2A | "智能体到智能体" | 智能体调用其他系统智能体的对等协议。Google 2025。 |
| 智能体卡片 (Agent Card) | "智能体的名片" | 位于 `/.well-known/agent.json` 的 JSON，描述技能、端点、认证。 |
| 任务 (Task) | "工作单元" | 具有生命周期的异步有状态对象；完成后产生产物。 |
| 产物 (Artifact) | "结果" | 带类型的输出：文本、结构化 JSON、图片、视频、音频。一等媒体。 |
| 不透明生命周期 (Opaque lifecycle) | "如何解决是智能体的事" | 客户端看到状态转换；服务器可以自由选择框架/工具。 |
| 发现 (Discovery) | "找到智能体" | `GET /.well-known/agent.json` 返回卡片。 |
| MCP vs A2A | "工具 vs 对等体" | MCP：垂直的智能体 ↔ 工具。A2A：水平的智能体 ↔ 智能体。 |
| ACP / ANP / NLIP | "姊妹协议" | 相邻规范；A2A 是 2026 年采用最广泛的。 |

## 延伸阅读

- [A2A specification](https://a2a-protocol.org/latest/specification/) —— 规范标准
- [Google Developers Blog — A2A announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) —— 2025 年 4 月发布文章
- [A2A GitHub repo](https://github.com/a2aproject/A2A) —— 参考实现和 SDK
- [Liu 等人 — A Survey of Agent Interoperability Protocols](https://arxiv.org/html/2505.02279v1) —— MCP、ACP、A2A、ANP 比较
