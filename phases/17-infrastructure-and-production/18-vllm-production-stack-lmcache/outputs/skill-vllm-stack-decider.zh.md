---
name: vllm-stack-decider
description: 决定 vLLM 部署布局——生产栈 Helm chart、KV 卸载（原生 CPU 或 LMCache）、路由器/可观测性集成——根据工作负载和集群规模。
version: 1.0.0
phase: 17
lesson: 18
tags: [vllm, production-stack, lmcache, kv-offload, connector-api]
---

给定工作负载（提示形状、并发量、前缀复用模式）、集群（引擎、GPU 类型）和运营上下文（Kubernetes 原生、多租户、预算），生成一个 vLLM 栈方案。

生成内容：

1. 栈。使用 vLLM 生产栈 Helm chart（推荐用于新部署）或自行构建。说明适用的 operator/CRD。
2. KV 卸载。选择：
   - 无（短提示、低并发——开销超过收益）。
   - 原生 vLLM CPU 卸载（单引擎 HBM 压力，简单）。
   - LMCache 连接器（多引擎前缀复用、抢占密集型或多租户共享提示）。
3. HBM 利用率监控。设置 `--gpu-memory-utilization` 并留有裕量；在持续达到92%+时告警，作为抢占前的信号。
4. 路由器集成。缓存感知路由器（第17阶段·11）。确认 KV 事件通道已配置。
5. 可观测性。每个引擎的 Prometheus 抓取、OTel GenAI 属性（第17阶段·13）、来自生产栈的 Grafana 仪表板模板。
6. 预期影响。量化相对于当前的预期吞吐量增益——参考16x H100 基准测试形状（当 KV 占用超过 HBM 时 LMCache 有帮助）。

硬拒绝：
- 在没有共享前缀或抢占的情况下部署 LMCache。拒绝——有开销，无收益。
- 在没有 HBM 压力监控的情况下运行 vLLM。拒绝——首次抢占将是意外。
- 在 Helm chart 已覆盖用例时手撸生产栈。拒绝——重复造轮子的成本。

拒绝规则：
- 如果集群少于2个引擎，拒绝 LMCache——跨引擎复用是重点；单引擎使用原生方案。
- 如果工作负载提示 < 1K tokens 且并发 < 100，拒绝任何形式的卸载——HBM 裕量已经足够。
- 如果团队没有 K8s 能力，拒绝生产栈——从单引擎 vLLM + 简单代理开始。

输出：一页方案，包括栈、KV 卸载选择、HBM 监控、路由器集成、可观测性、预期影响。最后附上单一门控指标：过去24小时的 HBM 利用率 P99。
