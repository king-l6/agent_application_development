# vLLM 生产栈与 LMCache KV 卸载

> vLLM 的生产栈是参考 Kubernetes 部署——路由器、引擎和可观测性紧密集成。LMCache 是 KV 卸载层，将 KV 缓存从 GPU 内存中取出并在查询和引擎间复用（CPU DRAM，然后是磁盘/Ceph）。vLLM 0.11.0 的 KV Offloading Connector（2026年1月）通过 Connector API（v0.9.0+）使其异步且可插拔。卸载延迟对用户不可见。即使没有共享前缀，LMCache 也很有价值——当 GPU KV 槽位不足时，被抢占的请求可以从 CPU 恢复，而无需重新计算预填充。已发布的16x H100（80GB HBM）跨4个 a3-highgpu-4g 基准测试显示：当 KV 缓存超过 HBM 时，原生 CPU 卸载和 LMCache 都能大幅提升吞吐量；在低 KV 占用时，所有配置与基线匹配，仅有小量开销。

**类型：** 学习
**语言：** Python（标准库，玩具级 KV 溢出模拟器）
**前置知识：** 第17阶段·04（vLLM 服务内部原理），第17阶段·06（SGLang/RadixAttention）
**时间：** 约60分钟

## 学习目标

- 绘制 vLLM 生产栈的各层：路由器、引擎、KV 卸载、可观测性。
- 解释 KV Offloading Connector API（v0.9.0+）以及 0.11.0 异步路径如何隐藏卸载延迟。
- 量化 LMCache CPU-DRAM 何时有帮助（KV > HBM）vs 何时增加开销（KV 小到足以容纳在 HBM 中）。
- 根据部署约束在原生 vLLM CPU 卸载和 LMCache Connector 之间选择。

## 问题

你的 vLLM 服务显示 GPU HBM 使用率达到100%，每当并发增加时就会出现抢占事件。请求被驱逐、重新排队，你在一分钟内对同一个2K token 提示进行了四次重新预填充。GPU 计算浪费在冗余预填充上；有效吞吐量远低于原始吞吐量。

增加更多 GPU 的成本是线性的。增加更多 HBM 是不可能的。但 CPU DRAM 很便宜——一个插槽就有512 GB 以上，延迟虽然比 HBM 差几个数量级，但对于"暂热"KV 缓存来说已经足够。

LMCache 将 KV 缓存提取到 CPU DRAM，使被抢占的请求快速恢复，并且引擎间的重复前缀可以共享缓存，无需每个引擎重新预填充。

## 概念

### vLLM 生产栈

`github.com/vllm-project/production-stack` 是参考 Kubernetes 部署：

- **路由器** —— 缓存感知（第17阶段·11）。消费 KV 事件。
- **引擎** —— vLLM 工作节点。每个 GPU 或每个 TP/PP 组一个。
- **KV 缓存卸载** —— LMCache 部署或原生连接器。
- **可观测性** —— Prometheus 抓取、Grafana 仪表板、OTel 追踪。
- **控制平面** —— 服务发现、配置、滚动更新。

以 Helm chart + operator 形式发布。

### KV Offloading Connector API（v0.9.0+）

vLLM 0.9.0 引入了用于可插拔 KV 缓存后端的 Connector API。你的引擎将块卸载到连接器；连接器存储它们（RAM、磁盘、对象存储、LMCache）。当请求需要某个块时，连接器将其加载回来。

vLLM 0.11.0（2026年1月）添加了异步卸载路径——卸载可以在后台进行，因此在常见情况下引擎不会阻塞它。端到端延迟和吞吐量仍然取决于工作负载形状、KV 缓存命中率和系统压力；vLLM 自己的说明指出，自定义内核卸载可能在低命中率时降低吞吐量，并且异步调度与推测解码存在已知的交互问题。

### 原生 CPU 卸载 vs LMCache

**原生 vLLM CPU 卸载**：引擎本地。将 KV 块存储在宿主机 RAM 中。实现快速，零网络跳转。不跨引擎。

**LMCache 连接器**：集群级别。将块存储在共享的 LMCache 服务器（CPU DRAM + Ceph/S3 层级）中。任何引擎都可以访问块。已发布16x H100 基准测试。

当单个引擎有 HBM 压力时选择原生。当多个引擎共享前缀（RAG 带有公共系统提示、多租户共享模板）时选择 LMCache。

### 基准测试行为

16x H100（80GB HBM）跨4个 a3-highgpu-4g 测试：

- 低 KV 占用（短提示、低并发）：所有配置与基线匹配，LMCache 增加约3-5%开销。
- 中等占用：LMCache 开始对引擎间前缀复用有帮助。
- KV 超过 HBM：原生 CPU 卸载和 LMCache 都能大幅提升吞吐量；LMCache 增益更大，因为支持跨引擎共享。

### LMCache 何时起决定性作用

- 多租户服务中系统提示跨租户共享。
- RAG 中文档块在查询间重复。
- 相同基座模型上的微调变体（LoRA），基座模型 KV 复用减少冗余工作。
- 抢占密集型工作负载：从 CPU 恢复比重算预填充更便宜。

### 何时不启用

- HBM 压力小——你支付开销而没有收益。
- 短上下文（<1K tokens）——传输时间 > 重新预填充。
- 单租户单提示工作负载——没有可供捕获的复用机会。

### 与分离式服务的集成

第17阶段·17的分离式服务 + LMCache 相辅相成：从预填充池到解码池的 KV 传输如果未被使用则进入 LMCache；后续查询从 LMCache 拉取。第17阶段·11的缓存感知路由器可以路由到其本地或 LMCache 共享缓存匹配的引擎。

### 你应该记住的数字

- vLLM 0.9.0：Connector API 发布。
- vLLM 0.11.0（2026年1月）：异步卸载路径；端到端延迟影响取决于工作负载、KV 命中率和系统压力（非绝对保证）。
- 16x H100 基准测试：当 KV 占用超过 HBM 时，LMCache 有帮助。
- HBM 压力小：3-5%开销，没有收益。

```figure
zero-sharding
```

## 使用

`code/main.py` 模拟有和没有 LMCache 的抢占密集型工作负载。报告避免的重新预填充次数、吞吐量增益和盈亏平衡 HBM 利用率。

## 交付

本课程产出 `outputs/skill-vllm-stack-decider.md`。根据工作负载形状和 vLLM 部署，决定使用原生、LMCache 还是两者都不用。

## 练习

1. 运行 `code/main.py`。在什么 HBM 利用率下 LMCache 开始带来回报？
2. 一个租户每小时共享一个6K token 系统提示，200次查询。计算每个租户的预期 LMCache 节省。
3. LMCache 服务器是单点故障。设计高可用策略（副本、回退到原生）。
4. LMCache 将数据存储到旋转磁盘上的 Ceph。对于70B FP8 上4K token 的 KV（500 MB），读取时间与重新预填充相比如何？
5. 论证 vLLM 0.11.0 异步路径是否"免费"——开销隐藏在哪里？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| 生产栈 | "参考部署" | vLLM 的 Kubernetes Helm chart + operator |
| Connector API | "KV 后端接口" | vLLM 0.9.0+ 可插拔 KV 存储接口 |
| 原生 CPU 卸载 | "引擎本地溢出" | 在同一引擎的宿主机 RAM 中存储 KV |
| LMCache | "集群 KV 缓存" | CPU DRAM + 磁盘上的跨引擎 KV 缓存服务器 |
| 0.11.0 异步 | "非阻塞卸载" | 隐藏在引擎流后面的卸载 |
| 抢占 | "驱逐以腾出空间" | HBM 满时的 KV 缓存 shuffle |
| 前缀复用 | "相同系统提示" | 多个查询共享开头；缓存命中 |
| Ceph 层级 | "磁盘层级" | 缓存层次结构中 DRAM 之下的持久化存储 |

## 延伸阅读

- [vLLM 博客 —— KV Offloading Connector（2026年1月）](https://blog.vllm.ai/2026/01/08/kv-offloading-connector.html)
- [vLLM 生产栈 GitHub](https://github.com/vllm-project/production-stack) —— Helm chart + operator。
- [LMCache 用于企业级 LLM 推理（arXiv:2510.09665）](https://arxiv.org/html/2510.09665v2)
- [LMCache GitHub](https://github.com/LMCache/LMCache) —— Connector 实现。
- [vLLM 0.11.0 发布说明](https://github.com/vllm-project/vllm/releases) —— 异步路径详情。
