# 综合项目 06 — Kubernetes DevOps 故障排查 Agent

> AWS 的 DevOps Agent 正式发布，Resolve AI 发布了其 K8s 运维手册，NeuBird 演示了语义监控，Metoro 将 AI SRE 与按服务的 SLO 联系起来。生产形态已经确定：告警 webhook 触发，Agent 读取遥测数据，遍历 K8s 对象图，对根因假设进行排序，并在 Slack 上发布带有批准按钮的简报。默认为只读。每项补救措施都需经人工批准。这个综合项目就是那个 Agent，在 20 个合成事件上进行评估，并在三个共享案例上与 AWS 的 Agent 进行对比。

**类型：** 综合项目
**语言：** Python（Agent），TypeScript（Slack 集成）
**前置知识：** 阶段 11（LLM 工程）、阶段 13（工具和 MCP）、阶段 14（Agent）、阶段 15（自主系统）、阶段 17（基础设施）、阶段 18（安全）
**涉及阶段：** P11 · P13 · P14 · P15 · P17 · P18
**时间：** 30 小时

## 问题

2025-2026 年的 SRE 叙事变成了："AI Agent 分类事件，人工批准补救措施。"AWS DevOps Agent、Resolve AI、NeuBird、Metoro、PagerDuty AIOps 都在生产中采用这种形态。Agent 读取 Prometheus 指标、Loki 日志、Tempo 追踪、kube-state-metrics 以及 K8s 对象的知识图谱。它在五分钟内生成带有遥测数据引用的排序根因假设。它绝不执行没有经过 Slack 明确人工批准的破坏性命令。

大部分艰苦工作是范围界定和安全性，而不是推理。Agent 需要一个默认为只读的 RBAC 表面、一个加固的 MCP 工具服务器，以及每个考虑过与执行过的命令的审计日志。它需要知道何时超出自身能力范围并升级。它还必须足够便宜地运行，以免 OOM-kill 级联产生 5000 美元的 Agent 账单。

## 概念

Agent 在一个知识图谱上操作。节点是 K8s 对象（Pod、Deployment、Service、Node、HPA、PVC）加上遥测源（Prometheus 序列、Loki 流、Tempo 追踪）。边编码了从属关系（Pod -> ReplicaSet -> Deployment）、调度关系（Pod -> Node）和观测关系（Pod -> Prometheus 序列）。图谱通过 kube-state-metrics 同步保持新鲜，并在每次告警时重新采样。

当告警触发时，Agent 从受影响的对象开始根因分析。它遍历边，拉取相关的遥测切片（最近 15 分钟），并起草一个假设。假设根据证据排序：有多少遥测引用支持它、多新、多具体。top-3 假设带着图谱路径可视化和用于补救操作的批准按钮发送到 Slack。

补救措施是受控的。允许的默认操作是只读的。破坏性操作（缩容、回滚、删除 Pod）需要 Slack 批准；ArgoCD 回滚钩子需要一个 Agent 从未持有的认证 token。审计日志记录 Agent *考虑过*的每一条命令——不仅仅是执行过的——因此评审过程可以捕获接近失误。

## 架构

```
PagerDuty / Alertmanager webhook
           |
           v
     FastAPI receiver
           |
           v
   LangGraph root-cause agent
           |
           +---- read-only MCP tools ----+
           |                             |
           v                             v
   K8s knowledge graph              telemetry slices
     (Neo4j / kuzu)              Prometheus, Loki, Tempo
   ownership + scheduling          last 15m, scoped
           |
           v
   hypothesis ranking (evidence weight)
           |
           v
   Slack brief + approval buttons
           |
           v (approved)
   ArgoCD rollback hook / PagerDuty escalate
           |
           v
   audit log: considered vs executed, every command
```

## 技术栈

- 可观测性源：Prometheus、Loki、Tempo、kube-state-metrics
- 知识图谱：Neo4j（托管）或 kuzu（嵌入）的 K8s 对象 + 遥测边
- Agent：LangGraph，带每工具允许列表，默认为只读
- 工具传输：FastMCP over StreamableHTTP；破坏性工具在单独的服务器上，位于批准门后
- 模型：Claude Sonnet 4.7 用于根因推理，Gemini 2.5 Flash 用于日志摘要
- 补救措施：ArgoCD 回滚 webhook、PagerDuty 升级、Slack 批准卡片
- 审计：仅追加的结构化日志（考虑过、执行过、已批准、结果）
- 部署：K8s 部署，带有其自己的狭窄 RBAC 角色；独立命名空间

## 构建步骤

1. **图谱摄入。** 每 30 秒将 kube-state-metrics 同步到 Neo4j/kuzu。节点：Pod、Deployment、Node、Service、PVC、HPA。边：OWNED_BY、SCHEDULED_ON、EXPOSES、MOUNTS、SCALES。遥测叠加边：OBSERVED_BY（Pod 被 Prometheus 序列观测）。

2. **告警接收器。** 接受 PagerDuty 或 Alertmanager webhook 的 FastAPI 端点。提取受影响的对象和 SLO 违规。

3. **只读工具表面。** 通过 FastMCP 封装 kubectl、Prometheus 查询、Loki logql、Tempo traceql。每个工具具有狭窄的 RBAC 动词（"get"、"list"、"describe"）。默认服务器上没有"delete"、"exec"、"scale"。

4. **根因 Agent。** 三个节点的 LangGraph：`sample` 拉取最近 15 分钟的遥测切片，`walk` 查询图中相邻对象，`hypothesize` 起草带有遥测引用的排序根因候选。

5. **证据评分。** 每个假设的分数 = 新近度 * 特异性 * 图路径长度倒数 * 引用数量。返回 top-3。

6. **Slack 简报。** 发布一个带有假设、图路径可视化（服务器端渲染的子图图像）和至少一个补救操作批准按钮的附件。

7. **补救门。** 破坏性工具（缩容、回滚、删除）位于第二个 MCP 服务器上，位于批准 token 后。Agent 只有在 Slack 卡片被人工批准后才能调用它们。

8. **审计日志。** 仅追加 JSONL：对每个候选命令，记录它是否被考虑过、是否被执行、谁批准了。每天发送到 S3。

9. **合成事件套件。** 构建 20 个场景：OOMKill 级联、DNS 抖动、HPA 震荡、PVC 填满、噪邻、故障 sidecar、不良 ConfigMap 发布、证书轮换、镜像拉取退避等。对 Agent 的根因准确性和推理耗时评分。

## 使用方式

```
webhook: alert.pagerduty.com -> checkout-api SLO breach, error rate 14%
[graph]   affected: Deployment checkout-api (3 Pods, Node ip-10-2-3-4)
[walk]    neighbors: ReplicaSet checkout-api-abc, Service checkout-api,
           recent rollout 14m ago
[sample]  prometheus error_rate 14%, up-trend; loki 500s on /api/v2/pay
[hypo]    #1 bad rollout: latest image checkout-api:v2.41 fails /healthz
          citations: deploy.yaml (rev 42), prometheus errorRate, loki 500 stack
[slack]   [ROLL BACK to v2.40]  [ESCALATE]  [IGNORE]
          (approval required; agent does not roll back unilaterally)
```

## 交付物

`outputs/skill-devops-agent.md` 是可交付的技能文件。给定一个 K8s 集群和告警源，Agent 生成排序的根因假设和一个 Slack 门控的补救流程。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | 场景套件上的 RCA 准确率 | 20 个合成事件中 ≥80% 的正确根因 |
| 20 | 安全性 | 破坏性操作防护在审计日志中从未在没有 Slack 批准的情况下触发 |
| 20 | 推理耗时 | p50 从告警到 Slack 简报小于 5 分钟 |
| 20 | 可解释性 | 每个假设都有图谱路径和遥测引用 |
| 15 | 集成完整性 | PagerDuty、Slack、ArgoCD、Prometheus 端到端工作 |
| **100** | | |

## 练习

1. 在 AWS DevOps Agent 演示的相同三个事件上运行你的 Agent。发布并列对比。报告 Agent 在哪里出现分歧。

2. 添加"接近失误"审计，标记 Agent *考虑过*但会具有破坏性的任何命令（未经批准）。测量一周内的接近失误率。

3. 将假设模型从 Claude Sonnet 4.7 替换为自托管的 Llama 3.3 70B。测量 RCA 准确率差异和每事件美元成本。

4. 构建一个因果过滤器：区分相关的遥测尖峰与真正的根因。在 20 场景标签上训练一个小型分类器。

5. 添加回滚预演：在具有相同清单的预发布集群上进行 ArgoCD 回滚。在 Slack 批准按钮前在实时集群上验证回滚计划。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| K8s 知识图谱 | "集群图" | 节点 = K8s 对象 + 遥测序列；边 = 从属关系、调度、观测 |
| 默认为只读 | "限定 RBAC" | Agent 的服务账户只有 get/list/describe 动词；破坏性动词在批准门后的单独服务器中 |
| 审计日志 | "考虑过 vs 执行过" | 每个候选命令的仅追加记录，包括是否执行、由谁批准 |
| 假设排序 | "证据分数" | 新近度 × 特异性 × 图路径长度倒数 × 引用数量 |
| Slack 批准卡片 | "人在环路门" | 带有补救按钮的交互式 Slack 消息；在人工点击前 Agent 无法继续 |
| 遥测引用 | "证据指针" | 支持声明的 Prometheus 查询、Loki 选择器或 Tempo 追踪 URL |
| MTTR | "平均解决时间" | 从告警触发到 SLO 恢复的挂钟时间 |

## 延伸阅读

- [AWS DevOps Agent GA](https://aws.amazon.com/blogs/aws/aws-devops-agent-helps-you-accelerate-incident-response-and-improve-system-reliability-preview/) — 2026 年规范参考
- [Resolve AI K8s 故障排查](https://resolve.ai/blog/kubernetes-troubleshooting-in-resolve-ai) — 竞品参考
- [NeuBird 语义监控](https://www.neubird.ai) — 语义图谱方法
- [Metoro AI SRE](https://metoro.io) — SLO 优先的生产框架
- [kube-state-metrics](https://github.com/kubernetes/kube-state-metrics) — 集群状态源
- [LangGraph](https://langchain-ai.github.io/langgraph/) — 参考 Agent 编排器
- [FastMCP](https://github.com/jlowin/fastmcp) — Python MCP 服务器框架
- [ArgoCD 回滚](https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_app_rollback/) — 门控补救目标
