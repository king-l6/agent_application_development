该仓库的配置系统呈现出**“教学演示优先、生产规范为辅”**的混合特征。核心逻辑依赖于环境变量（Environment Variables）进行运行时配置，但在多个关键模块中存在硬编码路径和密钥作为默认值或回退机制。

### 1. 核心配置策略
- **环境变量注入**：后端服务（如 `guardrails-sandbox`）和前端构建工具（Vite）均通过 `process.env` 或 `os.environ` 读取配置。支持 `.env` 文件加载（在 TypeScript 示例中手动实现了解析器）。
- **硬编码回退（Hardcoded Fallbacks）**：为了降低初学者的启动门槛，代码中广泛存在“如果环境变量不存在则使用硬编码值”的模式。例如，LLM API 密钥和基础 URL 在 `llm_client.py` 中直接写入了默认值。
- **平台级配置**：静态站点的部署依赖 `vercel.json` 定义构建命令、输出目录及路由重写规则；CI/CD 流程通过 GitHub Actions 触发 `site/build.js` 脚本生成数据文件。

### 2. 关键配置文件与逻辑
- **后端配置**：`guardrails-sandbox/backend/main.py` 和 `llm_client.py`。通过 `os.environ.get()` 获取 `LLM_API_KEY` 和 `LLM_BASE_URL`，若缺失则使用硬编码的个人密钥和内网地址。
- **前端构建配置**：`guardrails-sandbox/frontend/vite.config.ts` 和 `site/vue-app/summary/vite.config.js`。定义了代理规则（Proxy）将 `/api` 请求转发至本地后端，以及静态资源的基础路径（Base）。
- **部署配置**：`vercel.json`。配置了 `buildCommand` (`node site/build.js`)，`outputDirectory` (`site`)，以及针对静态资源的高缓存策略（Cache-Control headers）。
- **构建脚本配置**：`site/build.js`。作为站点的“元配置”中心，它解析 `README.md` 和 `ROADMAP.md` 生成 `data.js`，并读取 `VERCEL_GIT_COMMIT_REF` 环境变量来确定文档拉取的 Git 分支。
- **MCP 服务器配置**：`phases/11-llm-engineering/14-model-context-protocol/code/real_server.py`。其中硬编码了绝对文件系统路径（如 `/Users/bilibili/Desktop/...`），这在跨环境部署时会失效。

### 3. 架构约定与风险
- **离线优先**：在 `main.py` 中强制设置 `HF_HUB_OFFLINE=1`，确保 HuggingFace 模型仅从本地缓存加载，这是一种针对特定网络环境的运行时配置约束。
- **安全警示**：仓库中存在明显的敏感信息泄露风险（如 `llm_client.py` 中的 API Key）。在生产环境中，必须严格遵循“环境变量优先”原则，并移除所有硬编码的凭证。
- **路径耦合**：部分实验性代码（如 MCP Server 和 Guardrails 沙箱）强依赖于开发者的本地绝对路径，缺乏通过配置文件（如 `config.yaml` 或 `.env`）解耦路径的逻辑。

### 4. 开发者应遵循的规则
1. **敏感信息隔离**：严禁在代码中提交真实的 API Key。应使用 `.env` 文件管理密钥，并在 `.gitignore` 中排除该文件。
2. **路径抽象**：避免在代码中硬编码绝对路径。应使用 `pathlib` 或 `os.path` 结合项目根目录动态构建路径，或通过环境变量（如 `PROJECT_ROOT`）注入。
3. **配置层级**：遵循 `环境变量 > .env 文件 > 代码默认值` 的优先级顺序，确保在不同部署环境（本地、CI、Vercel）下的行为一致性。
4. **构建时配置**：站点内容的更新应通过修改 Markdown 源文件并重新运行 `node site/build.js` 完成，而非直接编辑生成的 `data.js`。