该项目采用**“源码即数据、脚本驱动构建”**的静态站点生成（SSG）模式，通过 GitHub Actions 实现内容审计与元数据同步，并依托 Vercel 和 GitHub Pages 完成多端自动化部署。

### 1. 核心构建系统
- **Node.js 驱动的数据编译**：`site/build.js` 是构建管线的核心引擎。它解析根目录的 `README.md`、`ROADMAP.md` 以及 `glossary/terms.md`，提取阶段（Phases）、课程（Lessons）及术语状态，动态生成前端所需的 `site/data.js`。同时，该脚本会自动扫描 `phases/` 下的 `outputs/` 目录，发现并注册 Skills、Prompts 等工程化产物。
- **SEO 与 AI 友好型输出**：构建过程不仅生成页面数据，还会自动产出 `sitemap.xml`（搜索引擎索引）和 `llms.txt`（面向 AI Agent 的课程地图），确保课程内容在 Web 搜索和 AI 检索中具有高可见性。

### 2. 持续集成与质量门禁 (CI)
- **GitHub Actions 自动化审计**：`.github/workflows/curriculum.yml` 定义了严格的流水线。当检测到课程内容变更时，会触发 `audit_lessons.py` 进行结构完整性检查。
- **自修复机制 (Self-healing)**：CI 包含两个关键的“自修复”任务：
    1. **README 计数同步**：自动计算课程总数并更新 README 中的徽章数字，防止人工维护导致的统计偏差。
    2. **站点数据重建**：在 main 分支推送后，自动运行 `node site/build.js` 并将生成的 `data.js` 提交回仓库，确保线上展示与源码实时一致。

### 3. 部署架构
- **Vercel 生产环境**：通过 `vercel.json` 配置，将 `site/` 目录作为输出源。利用 Vercel 的 Rewrites 功能实现 SEO 友好的路径映射（如 `/catalog` 指向 `catalog.html`），并配置了精细的 Cache-Control 策略以优化加载性能。
- **GitHub Pages 实验台发布**：针对 Vue 3 编写的学习总结应用（位于 `site/vue-app/summary`），使用 `scripts/deploy-learning-notes.sh` 脚本。该脚本通过 `git subtree split` 技术，将 `site/` 子目录的内容强制推送到 `gh-pages` 分支，实现与主仓库解耦的独立托管。

### 4. 开发者规范
- **内容结构化**：所有课程必须遵循 `phases/XX-name/YY-name/` 的目录规范，并在 `docs/en.md` 中提供标准化的 H3 标题以便构建脚本提取关键词。
- **产物标记**：若课程包含可复用的 Prompt 或 Skill，需放置在 `outputs/` 目录下并以 `skill-` 或 `prompt-` 为前缀命名，以便被构建系统自动收录到全局目录中。