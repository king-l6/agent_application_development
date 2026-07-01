该仓库的日志系统呈现为**“教学演示为主、生产可观测为辅”**的双轨模式，缺乏统一的工程级日志基础设施。

### 1. 核心系统与方式
- **标准库 logging (教学场景)**：在调试与实验课程（如 `phases/00-setup-and-tooling/12-debugging-and-profiling`）中，使用 Python 内置的 `logging` 模块。配置简单，仅包含时间戳、级别和消息，主要用于展示结构化日志的概念。
- **OpenTelemetry GenAI (生产规范)**：在高级 Agent 工程章节（Phase 14），明确引入 OpenTelemetry (OTel) GenAI 语义规范作为生产环境的日志/追踪标准。强调通过 Span 记录 `gen_ai.provider.name`、`gen_ai.request.model` 等字段，并规定了内容捕获的“外部引用”安全模式。
- **Print/Stdout (沙箱与脚本)**：在护栏沙箱 (`guardrails-sandbox`) 和自动化脚本中，大量依赖 `print()` 进行状态输出和简单的错误提示，未接入正式的日志框架。

### 2. 关键文件与包
- **教学示例**：`phases/00-setup-and-tooling/12-debugging-and-profiling/code/debug_tools.py` 展示了基础的 `logging.basicConfig` 配置。
- **实验运行器**：`phases/19-capstone-projects/52-experiment-runner/code/main.py` 在内存轮询器等组件中使用了 `_LOGGER.warning`，体现了在复杂子进程管理中对日志级别的初步应用。
- **规范文档**：`phases/14-agent-engineering/23-otel-genai-conventions/docs/en.md` 详细定义了 GenAI 时代的日志字段标准和稳定性开关 (`OTEL_SEMCONV_STABILITY_OPT_IN`)。

### 3. 架构与约定
- **去中心化**：目前没有全局的日志初始化入口。每个实验或模块独立决定是否使用 `logging` 或 `print`。
- **安全优先的内容捕获**：在生产级 Agent 日志中，严禁直接在日志/Span 中记录完整的 Prompt 或输出（防止 PII 泄露），推荐将内容存入外部存储（如 S3/DB），仅在日志中保留引用 ID。
- **结构化字段**：遵循 OTel GenAI 规范，日志/追踪应包含 Provider、Model ID、Agent Name 和 Data Source ID 等标准化属性。

### 4. 开发者规则
- **教学代码**：可以使用 `print` 或简单的 `logging` 进行快速反馈。
- **Agent 开发**：必须遵循 OTel GenAI 语义规范，使用 `invoke_agent` 和 `tool_call` 等标准 Span 名称。
- **敏感信息**：在任何日志输出中，禁止直接打印用户输入或模型原始输出，应采用“外部引用”模式。
- **环境配置**：在生产环境中需设置 `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` 以确保字段兼容性。