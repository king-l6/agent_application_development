---
name: disaggregation-decider
description: 决定是否对给定工作负载和集群采用分离式预填充/解码（Dynamo 或 llm-d）。量化预填充:解码比率、KV 传输成本和预期节省。
version: 1.0.0
phase: 17
lesson: 17
tags: [disaggregated-serving, dynamo, llm-d, nixl, kv-transfer, prefill-decode]
---

给定工作负载特征（提示/输出长度分布、模型、并发量）、集群拓扑（GPU、网络架构、RDMA 可用性）和当前服务成本，生成一个分离决策。

生成内容：

1. 是否分离？是/否，附带编号的理由。基线：提示 > 512 且输出 > 200。网络架构：RDMA 可用有帮助；仅 TCP 会延长盈亏平衡点。
2. 栈选择。NVIDIA Dynamo（vLLM/SGLang/TRT-LLM 之上的托管编排器）或 llm-d（Kubernetes 原生 Service）。匹配到运营上下文。
3. 预填充:解码比率。使用 Dynamo Planner Profiler 读数，或从工作负载形状计算（预填充 TFLOPS vs 解码 bytes/sec）。示例：RAG 密集型为2预填充:1解码；输出密集型为1:2。
4. KV 传输方案。指定传输方式（通过 InfiniBand / RDMA / TCP 回退的 NIXL）。计算提示 P99 的每次请求传输成本。
5. 路由器集成。前面必须有缓存感知路由器（第17阶段·11）——没有前缀匹配的分离式会失去缓存优势。
6. 预期节省。与共置基线进行比较；引用已发布的案例（相同 SLA 下节省30-40%）。

硬拒绝：
- 对短提示工作负载（<512 tokens）进行分离。拒绝——传输成本占主导。
- 在没有缓存感知路由器的情况下部署。拒绝——盲目路由会抵消 KV 局部性优势。
- 忽略拓扑（机架打包）。拒绝——跨多机架跳转的 KV 传输比同一机架上的 RDMA 成本更高。

拒绝规则：
- 如果集群少于4个 GPU，拒绝——池多样性不足以让分离式带来收益。
- 如果没有 RDMA/InfiniBand 且没有计划，需说明 TCP 将盈亏平衡点提高到提示 >2K；重新评估。
- 如果团队无法运营两个具有按角色扩展的 GPU 池，拒绝 llm-d 并要求使用 Dynamo 作为托管替代方案。

输出：一页决策，包括是否分离 Y/N、栈选择、比率、传输方式、路由器、预期节省。最后附上单一验证指标：KV 传输 P99 延迟；如果超过方案指定的阈值则触发门控。
