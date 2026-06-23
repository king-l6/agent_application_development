---
name: devops-agent
description: 构建一个 Kubernetes 故障排查 Agent，遍历集群知识图谱，排序根因，并通过 Slack 门控每个补救操作。
version: 1.0.0
phase: 19
lesson: 06
tags: [capstone, devops, sre, kubernetes, langgraph, fastmcp, aiops]
---

给定一个 K8s 集群和一个告警源（PagerDuty 或 Alertmanager），构建一个 Agent，在五分钟内生成排序的根因假设，并通过 Slack 批准卡片门控每个补救操作。

构建计划：

1. 每 30 秒将 kube-state-metrics 摄入 Neo4j 或 kuzu。构建 Pod、Deployment、Service、Node、PVC、HPA 的图，以及到 Prometheus、Loki 和 Tempo 源的遥测叠加边。
2. 为 PagerDuty 和 Alertmanager 搭建 FastAPI webhook 接收器。
3. 通过 FastMCP 通过 StreamableHTTP 传输暴露只读工具：kubectl get/describe、promql、logql、traceql。
4. 构建一个三节点的 LangGraph 根因 Agent：`sample`（拉取 15 分钟遥测）、`walk`（遍历图邻居）、`hypothesize`（按新近度 × 特异性 × 引用数量排序候选）。
5. 将 top-3 排序假设与图谱路径可视化一起发布到 Slack，带有批准按钮。
6. 将破坏性工具（缩放、回滚、删除）放在单独的 FastMCP 服务器上，位于 Agent 仅在 Slack 批准后才能获得的批准 token 后面。
7. 维护仅追加的审计日志：每个*考虑过*的命令、是否批准、是否执行、谁批准了。
8. 构建 20 个合成事件场景（OOMKill、DNS 抖动、HPA 震荡、PVC 填满、噪邻、故障 sidecar、ConfigMap 不良发布、证书轮换、镜像拉取退避、探针失败等）。对 Agent 的 RCA 准确性和推理耗时评分。

评估标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 场景套件上的 RCA 准确率 | 20 个合成事件中至少 80% 的正确根因 |
| 20 | 安全性 | 破坏性操作防护在审计日志中从未在没有 Slack 批准的情况下触发 |
| 20 | 推理耗时 | p50 从告警到 Slack 简报小于 5 分钟 |
| 20 | 可解释性 | 每个假设都有图谱路径和遥测引用 |
| 15 | 集成完整性 | PagerDuty、Slack、ArgoCD、Prometheus 端到端工作 |

硬性拒绝：

- 混合了只读和破坏性工具的单一 MCP 服务器的 Agent。
- 任何没有遥测引用就产生的 RCA。未引用的假设必须被拒绝。
- 仅记录执行情况的审计日志。必须记录每个考虑过的命令。
- 未使用 20 场景套件和种子运行 Agent 就声称的准确性。

拒绝规则：

- 拒绝在没有人类值班人员的 Slack 批准的情况下进行补救。即使假设是明显的。
- 拒绝通过只读 MCP 暴露 `kubectl exec`、`kubectl port-forward` 或任何交互式工具。这些实际效果是破坏性的。
- 拒绝跨多个部署批量应用补救措施，而不为每个部署提供单独的批准卡片。

输出：一个包含 FastAPI 接收器、LangGraph Agent、只读和破坏性 MCP 服务器、Slack 集成、20 场景测试套件、与 AWS DevOps Agent 在三个共享事件上的并列比较、以及一份关于接近失误命令（Agent *考虑过*但未执行的命令）的报告（在一周观察窗口内）。
