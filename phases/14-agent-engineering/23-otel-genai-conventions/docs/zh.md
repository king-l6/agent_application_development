# OpenTelemetry GenAI 语义约定

> OpenTelemetry的GenAI SIG（2024年4月启动）定义了智能体遥测的标准模式。跨度名称、属性和内容捕获规则在厂商之间趋同，使得智能体追踪在Datadog、Grafana、Jaeger和Honeycomb中含义一致。

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置知识：** 第14阶段·13（LangGraph），第14阶段·24（可观测性平台）
**时间：** 约60分钟

## 学习目标

- 说出GenAI跨度类别：模型/客户端、智能体、工具。
- 区分`invoke_agent` CLIENT与INTERNAL跨度以及各自适用的场景。
- 列出顶层GenAI属性：提供商名称、请求模型、数据源ID。
- 解释内容捕获契约：选择加入、`OTEL_SEMCONV_STABILITY_OPT_IN`、外部引用建议。

## 问题

每个厂商都发明自己的跨度名称。运维团队最终为每个框架构建独立的仪表板。OpenTelemetry的GenAI SIG通过定义一个全生态系统共同目标的标准来解决这个问题。

## 概念

### 跨度类别

1. **模型/客户端跨度。** 覆盖原始LLM调用。由提供商SDK（Anthropic、OpenAI、Bedrock）和框架模型适配器发出。
2. **智能体跨度。** `create_agent`（当智能体被构造时）和`invoke_agent`（当它运行时）。
3. **工具跨度。** 每个工具调用一个；通过父子关系连接到智能体跨度。

### 智能体跨度命名

- 跨度名称：有名称时为`invoke_agent {gen_ai.agent.name}`；回退为`invoke_agent`。
- 跨度类型：
  - **CLIENT** — 用于远程智能体服务（OpenAI Assistants API、Bedrock Agents）。
  - **INTERNAL** — 用于进程内智能体框架（LangChain、CrewAI、本地ReAct）。

### 关键属性

- `gen_ai.provider.name` — `anthropic`、`openai`、`aws.bedrock`、`google.vertex`。
- `gen_ai.request.model` — 模型ID。
- `gen_ai.response.model` — 解析后的模型（可能因路由与请求不同）。
- `gen_ai.agent.name` — 智能体标识符。
- `gen_ai.operation.name` — `chat`、`completion`、`invoke_agent`、`tool_call`。
- `gen_ai.data_source.id` — 用于RAG：咨询了哪个语料库或存储。

针对Anthropic、Azure AI Inference、AWS Bedrock、OpenAI存在特定技术约定。

### 内容捕获

默认规则：工具化默认情况下不应捕获输入/输出。捕获通过以下方式选择加入：

- `gen_ai.system_instructions`
- `gen_ai.input.messages`
- `gen_ai.output.messages`

推荐的生产模式：将内容存储在外部（S3、你的日志存储），在跨度上记录引用（指针ID，而非原文）。这是可观测性中接入的第27课内容投毒防御。

### 稳定性

截至2026年3月，大多数约定是实验性的。通过以下方式选择加入稳定预览：

```
OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
```

Datadog v1.37+原生地将GenAI属性映射到其LLM可观测性模式中。其他后端（Grafana、Honeycomb、Jaeger）支持原始属性。

### 这种模式失败的地方

- **在跨度中捕获完整提示。** 追踪中包含运维人员可以读取的PII、密钥、客户数据。存储在外部。
- **缺少`gen_ai.provider.name`。** 缺少归因时，多提供商仪表板会崩溃。
- **没有父链接的跨度。** 孤儿工具跨度。始终传播上下文。
- **未设置稳定性选择加入。** 你的属性可能会在后端升级时被重命名。

## 动手构建

`code/main.py` 实现了一个符合GenAI约定的stdlib跨度发射器：

- 带有GenAI属性模式的`Span`。
- 带有`start_span`、嵌套上下文的`Tracer`。
- 一个脚本化的智能体运行，发出：`create_agent`、`invoke_agent`（INTERNAL）、每个工具的跨度、LLM调用的`chat`跨度。
- 一种内容捕获模式，将提示存储在外部并在跨度上记录ID。

运行它：

```
python3 code/main.py
```

输出：带有所有必需GenAI属性的跨度树，以及显示选择加入内容引用的"外部存储"。

## 使用建议

- **Datadog LLM可观测性**（v1.37+）原生映射属性。
- **Langfuse / Phoenix / Opik**（第24课）— 自动工具化生态系统。
- **Jaeger / Honeycomb / Grafana Tempo** — 原始OTel追踪；从GenAI属性构建仪表板。
- **自托管** — 使用GenAI处理器运行OTel Collector。

## 交付产出

`outputs/skill-otel-genai.zh.md` 将OTel GenAI跨度接入现有智能体，带有内容捕获默认值和外部引用存储。

## 练习

1. 为你的第01课ReAct循环添加`invoke_agent`（INTERNAL）+ 每个工具的跨度。发送到Jaeger实例。
2. 以"仅引用"模式添加内容捕获：提示到SQLite，跨度属性仅携带行ID。
3. 阅读`gen_ai.data_source.id`的规范。将其接入你的第09课Mem0搜索。
4. 设置`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`并验证你的属性不会被collector重命名。
5. 构建一个仪表板："哪些工具错误与哪些模型相关"——仅从GenAI属性出发。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| GenAI SIG | "OpenTelemetry GenAI小组" | 定义模式的OTel工作组 |
| invoke_agent | "智能体跨度" | 表示智能体运行的跨度名称 |
| CLIENT跨度 | "远程调用" | 对远程智能体服务的调用的跨度 |
| INTERNAL跨度 | "进程内" | 进程内智能体运行的跨度 |
| gen_ai.provider.name | "提供商" | anthropic / openai / aws.bedrock / google.vertex |
| gen_ai.data_source.id | "RAG来源" | 检索命中的语料库/存储 |
| 内容捕获 | "提示日志记录" | 选择加入的消息捕获；生产环境中存储在外部 |
| 稳定性选择加入 | "预览模式" | 用于固定实验性约定的环境变量 |

## 延伸阅读

- [OpenTelemetry GenAI语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — 规范
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — 默认GenAI跨度
- [AutoGen v0.4（微软研究院）](https://www.microsoft.com/en-us/research/articles/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/) — 内置OTel跨度
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) — W3C追踪上下文传播
