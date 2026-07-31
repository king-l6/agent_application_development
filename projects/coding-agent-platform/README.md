# 智工台 · Coding Agent Platform

正经可运行的编码 Agent 平台，不是贴了门户皮肤的假 Demo。

- **引擎** `@cap/core`：T0–T15 Harness（契约、状态机、工具校验、门禁、沙箱、评测、Trace、产物）
- **API** `@cap/api`：Hono 服务，任务落盘、SSE 事件流、评测与指标聚合
- **控制台** `@cap/web`：中文工作台，只展示真实可执行 Agent
- **CLI** `@cap/cli`：同一套引擎的命令行入口

## 一键启动

```bash
cd projects/coding-agent-platform
pnpm install
pnpm dev
```

| 服务 | 地址 |
|---|---|
| 控制台 | http://localhost:5173 |
| API | http://127.0.0.1:8787/health |

顶栏模块：**对话** · **文档（含企微同步）** · 工作台 · 任务 · 评测 · 指标

企微配置说明见 [docs/wecom-setup.md](docs/wecom-setup.md)。

## 真实能力（不是假卡片）

| 能力 | 说明 |
|---|---|
| 创建任务 | `POST /api/tasks` → 后台跑 Harness |
| 实时事件 | `GET /api/tasks/:id/events` SSE |
| 任务历史 | 落盘可查询、可重试 |
| 评测 | `POST /api/eval` 固定 3 题 + 验证器 |
| 指标 | `GET /api/metrics` 按真实运行聚合 |
| 三个 Agent | 编码修复 / 边界守卫 / 路径越狱审计 |

## API 一览

```text
GET  /health
GET  /api/agents
POST /api/tasks              { "agentId": "fix-typo" }
GET  /api/tasks
GET  /api/tasks/:id
GET  /api/tasks/:id/events   (SSE)
POST /api/tasks/:id/retry
POST /api/eval
GET  /api/eval/latest
GET  /api/metrics
```

## 目录

```text
apps/api          Hono API + 文件持久化
apps/web          中文控制台（对接 API）
apps/cli          本地 CLI
packages/core     Harness 内核
packages/fixtures 固定玩具仓库
```

## 开发说明

```bash
pnpm test          # 内核 + fixture 测试
pnpm eval          # CLI 跑评测
pnpm build         # 全量构建
```

威胁模型：应用层 Path Jail ≠ 容器隔离；演示默认 Deterministic 策略，不依赖付费 API Key。
