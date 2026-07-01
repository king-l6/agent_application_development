该仓库在 `error_handling` 方面主要体现为**基于适配器模式的护栏（Guardrail）拦截系统**以及**实验台模块的通用异常捕获**。由于这是一个 AI 工程课程编排平台，其“错误”更多指代 LLM 交互中的不安全内容、格式违规或执行失败，而非传统业务逻辑的崩溃。

### 1. 核心系统与模式
- **护栏管线（Pipeline）短路机制**：在 `guardrails-sandbox/backend/pipeline.py` 中实现。通过注册多个 `GuardrailAdapter`（如注入检测、PII 过滤、格式校验），按顺序执行检查。一旦某个适配器返回 `passed=False`，管线立即“短路”并返回拦截详情，阻止后续处理或 LLM 调用。
- **统一结果封装**：使用 `GuardrailResult` (dataclass) 和 `ModuleResult` (dataclass) 标准化错误/拦截信息，包含 `passed/ok` 状态、`reason/error` 描述、`confidence` 置信度及 `details` 结构化数据。
- **LLM 调用重试策略**：在 `llm_client.py` 中实现了 `chat_with_retry`，采用指数退避（Exponential Backoff）处理网络波动或 API 临时故障。

### 2. 关键文件与逻辑
- **`guardrails-sandbox/backend/adapters/base.py`**：定义了 `GuardrailAdapter` 基类，强制子类实现 `check()` 方法，确立了统一的错误/拦截判定接口。
- **`guardrails-sandbox/backend/main.py`**：FastAPI 入口。在 `/api/chat` 等路由中，通过 `try-except` 捕获 LLM 调用异常，并将其转化为标准的 `ChatResponse` 错误对象（`blocked=True`, `block_stage="llm_error"`）。
- **`guardrails-sandbox/backend/playground/registry.py`**：实验台注册表。在执行动态加载的教学模块时，使用通用的 `try-except` 捕获运行时异常，防止单个模块崩溃导致整个沙箱服务不可用。
- **`guardrails-sandbox/backend/adapters/format_validator.py`**：展示了具体的业务错误判定逻辑，如 JSON 解析失败、Markdown 代码块未闭合等，并将这些“格式错误”视为严重拦截项。

### 3. 开发者约定
- **拦截即错误**：在护栏系统中，不通过抛出 Python 异常来处理业务规则违反（如检测到有毒内容），而是通过返回 `GuardrailResult(passed=False)` 进行流式控制。
- **异常边界隔离**：所有外部调用（LLM API、MCP 服务器、数据库读取）必须包裹在 `try-except` 中，确保前端能收到明确的 `error` 字段而非 HTTP 500。
- **结构化错误响应**：API 错误响应应遵循 `{"ok": false, "error": "..."}` 或 `{"blocked": true, "block_reason": "..."}` 的约定，便于前端统一展示拦截原因。