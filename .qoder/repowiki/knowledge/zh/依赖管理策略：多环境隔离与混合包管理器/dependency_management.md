该仓库采用**混合依赖管理策略**，针对 Python 后端、前端应用及教学模块分别使用不同的工具链，强调环境隔离与可复现性。

### 1. Python 依赖管理
- **核心清单**：根目录下的 `requirements.txt` 定义了全局基础依赖（如 `torch`, `transformers`, `openai` 等），主要用于快速启动和教学演示。
- **现代化工具链**：在文档规范（`phases/00-setup-and-tooling/06-python-environments`）中强烈推荐并实践 `uv` 作为首选包管理器，配合 `pyproject.toml` 和 `uv.lock` 实现确定性构建。同时兼容 `venv`（内置）和 `conda`（用于 CUDA/cuDNN 等非 Python 依赖管理）。
- **环境隔离**：强制要求为不同阶段或项目创建独立的虚拟环境（`.venv`），严禁全局安装以避免版本冲突（特别是 PyTorch 与 CUDA 版本的匹配问题）。

### 2. 前端依赖管理
- **工具链**：前端模块（`guardrails-sandbox/frontend` 和 `site/vue-app/summary`）均使用 `npm` 生态。
- **配置文件**：通过 `package.json` 声明依赖，使用 `package-lock.json` 锁定版本以确保构建一致性。
- **构建工具**：统一采用 `Vite` 进行开发与构建，依赖包括 `vue`, `typescript` 及相关插件。

### 3. 关键约定与规则
- **禁止全局污染**：所有 Python 代码必须在激活的虚拟环境中运行，通过 `which python` 验证路径。
- **锁文件提交**：建议将 `uv.lock` 或 `requirements.lock` 提交至 Git，而忽略 `.venv` 目录。
- **Conda/Pip 混用禁忌**：若使用 Conda 环境，应优先通过 Conda 安装包，避免随意混用 `pip install` 导致依赖树损坏。
- **CUDA 版本对齐**：在安装 GPU 相关库时，必须确保驱动版本、CUDA Toolkit 版本与框架（如 PyTorch）编译版本兼容。