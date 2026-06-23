# 托管 LLM 平台 — Bedrock、Vertex AI、Azure OpenAI

> 三大云厂商，三种截然不同的策略。AWS Bedrock 是一个模型市场 — Claude、Llama、Titan、Stability、Cohere 统一在一个 API 后面。Azure OpenAI 是独家 OpenAI 合作伙伴关系，外加预置吞吐量单元（PTU）用于专用容量。Vertex AI 以 Gemini 为先，拥有最佳的长上下文和多模态能力。2026 年 Artificial Analysis 测得 Azure OpenAI 中位延迟约 50 ms，Bedrock 上 Llama 3.1 405B 等效模型约 75 ms — PTU 解释了这一差距，因为专用容量胜过了共享按需。决策规则不是"哪个最快"，而是"哪个模型目录和 FinOps 界面符合我的产品"。本课教你根据写在纸面上的权衡做选择，而不是凭感觉。

**类型：** 学习
**语言：** Python（标准库，玩具成本和延迟比较器）
**前置知识：** 阶段 11（LLM 工程）、阶段 13（工具与协议）
**时间：** ~60 分钟

## 学习目标

- 说出三种平台策略（市场 vs 独家 vs 以 Gemini 为先），并将每种策略匹配到产品用例。
- 解释 Provisioned Throughput Units（PTU）在 Azure OpenAI 中的作用，以及为什么按需 Bedrock 在 405B 规模下通常慢约 25 ms。
- 绘制每个平台的 FinOps 归因面（Bedrock Application Inference Profiles vs Vertex 按团队项目 vs Azure 作用域 + PTU 预留）。
- 写出"至少两个供应商"策略，并解释为什么单一供应商锁定是 2026 年代价最高的错误。

## 问题

你选择了 Claude 3.7 Sonnet 作为你的产品。现在你需要提供服务。你可以直接调用 Anthropic API，也可以通过 AWS Bedrock 调用，或者通过网关。直接 API 最简单；Bedrock 增加了 BAA、VPC 端点、IAM 和 CloudWatch 归因。网关增加了故障转移、统一计费和跨供应商速率限制。

更深层的问题是模型目录。如果你需要在同一产品中使用 Claude、Llama 和 Gemini，你无法从一个地方购买全部，除非同时使用 Bedrock、Vertex 和 Azure OpenAI。三大云厂商不可互换 — 它们各自对谁拥有模型层做出了不同的押注。

本课绘制了三个押注、延迟差距、FinOps 差距和锁定风险。

## 概念

### 三种策略

**AWS Bedrock** — 市场模式。Claude（Anthropic）、Llama（Meta）、Titan（AWS 自研）、Stability（图像）、Cohere（嵌入）、Mistral，以及图像和嵌入子目录。一个 API，一个 IAM 界面，一个 CloudWatch 导出。Bedrock 的赌注是客户更想要可选择性，而不是单一模型。

**Azure OpenAI** — 独家合作伙伴。你获得 GPT-4 / 4o / 5 / o 系列、DALL·E、Whisper 以及在 Azure 数据中心中对 OpenAI 模型进行微调的能力。Azure OpenAI Service 目录中没有非 OpenAI 模型 — 这些模型归入 Azure AI Foundry（独立产品）。Azure 的赌注是 OpenAI 仍处于前沿，而客户希望在该特定关系上获得企业控制。

**Vertex AI** — Gemini 为先，其他为次。Gemini 1.5 / 2.0 / 2.5 Flash 和 Pro，以及 Model Garden（第三方）。Vertex 的赌注是多模态长上下文 — 100 万 token 的 Gemini 上下文是其差异化优势。

### 规模化下的延迟差距

Artificial Analysis 运行持续基准测试。在等效的 Llama 3.1 405B 部署（共享按需）上，Azure OpenAI 中位首 token 延迟约为 50 ms；Bedrock 约为 75 ms。这一差距并非 AWS 的失败 — 而是容量模型的差异。Azure 销售 PTU（Provisioned Throughput Units），为你的租户预留 GPU 容量。Bedrock 的等效方案（Provisioned Throughput）确实存在，但每单位起价约 $21/小时，大多数客户仍然使用共享按需。

按需共享容量与所有其他客户的流量竞争。专用容量则不会。如果你的产品 SLA 要求 P99 TTFT < 100 ms，你要么在 Azure 上购买 PTU，要么购买 Bedrock Provisioned Throughput，要么接受默认的方差。

### Provisioned Throughput 经济学

Azure PTU：预留的推理计算块。对于可预测的工作负载，相比按需可节省高达 ~70%。无论流量如何，按小时固定计费 — 即使空闲也要支付预留费用。盈亏平衡通常在约 40-60% 的持续利用率。

Bedrock Provisioned Throughput：$21-$50/小时，视模型和地区而定。类似的计算 — 盈亏平衡点约为峰值利用率的一半。需要按月承诺。

Vertex 的预置容量按每个 Gemini SKU 销售；定价因模型和地区而异，公开信息较少。

### FinOps 面 — 真正的差异化因素

**Bedrock Application Inference Profiles** 是市场上最清晰的归因机制。用 `team`、`product`、`feature` 标签标记一个配置；所有模型调用都通过它路由；CloudWatch 无需后处理即可按配置分解成本。2025 年新增，仍然是粒度最高的云原生方案。

**Vertex** 的归因是按团队项目加到处标签。你将每个团队建模为一个 GCP 项目，在每个资源上打标签，并使用 BigQuery Billing Export + DataStudio 进行汇总。工作量更大，但 BigQuery 让你可以在成本数据上执行任意 SQL。

**Azure** 依赖订阅/资源组作用域加标签，PTU 预留作为一级成本对象。标签从资源组继承，而非从请求继承，因此按请求归因需要 Application Insights 自定义指标或一个能添加标头的网关。

模式：Bedrock 原生最清晰，Vertex 通过 BigQuery 最灵活，Azure 除非自行检测否则最不透明。

### 锁定是 2026 年的风险

当初单一模型主导时，绑定一家云厂商是可以接受的。2026 年前沿每月变化 — 这季度 Claude 3.7，下季度 Gemini 2.5，再下季度 GPT-5。锁定一个平台意味着你被拒之门外，失去了三分之二的前沿模型。

高效团队采用的模式：对任何产品关键的 LLM 调用执行最低双供应商策略。Bedrock 加 Azure OpenAI 是常见配对 — 一个提供 Claude，另一个提供 GPT，两者之间故障转移，使用同一个网关。成本增加可以忽略不计，因为网关路由最优；宕机期间的可用性提升（如 Azure OpenAI 2025 年 1 月事件、AWS us-east-1 宕机）则是决定性的。

### 数据驻留、BAA 与受监管行业

- Bedrock：大多数地区提供 BAA；VPC 端点；护栏。常见的金融科技默认选择。
- Azure OpenAI：HIPAA、SOC 2、ISO 27001；欧盟数据驻留；企业受监管默认选择。
- Vertex：HIPAA、GDPR、按地区数据驻留；Google Cloud 合规栈。

三者都满足基本要求。区别在于数据保留策略、日志处理方式以及滥用监控是否读取你的流量（大多数默认 opt-in；企业客户可选择 opt-out）。

### 你应该记住的数字

- Azure OpenAI 在 Llama 3.1 405B 等效模型上的中位 TTFT：~50 ms（使用 PTU）。
- Bedrock 按需中位 TTFT：~75 ms。
- Bedrock Provisioned Throughput：每单位 $21-$50/小时。
- Azure PTU 盈亏平衡：~40-60% 持续利用率。
- 高利用率时 PTU 相比按需节省：高达 70%。

## 使用它

`code/main.py` 在合成工作负载上比较三个平台 — 它模拟了按需与 PTU 的经济性、TTFT 方差和成本归因准确性。运行它以查看 PTU 在什么情况下划算，以及市场模式的模型广度在何时超过 TTFT 差距。

## 交付物

本课产出 `outputs/skill-managed-platform-picker.md`。给定工作负载概要（所需模型、TTFT SLA、日量、合规要求），它推荐主要平台、备用平台和 FinOps 检测方案。

## 练习

1. 运行 `code/main.py`。对于 70B 类模型，Azure PTU 在多少持续利用率下优于按需？计算盈亏平衡点并与所述的 40-60% 区间比较。
2. 你的产品需要 Claude 3.7 Sonnet 和 GPT-4o。设计一个双供应商部署 — 哪个模型放到哪个云厂商，前面放什么网关，故障转移策略是什么？
3. 一个受监管的医疗客户要求 BAA、美东数据驻留和低于 100ms 的 P99 TTFT。选择一个平台并用三个具体特性证明。
4. 你发现 Bedrock 本月账单增长了 4 倍，但流量没有变化。如果没有 Application Inference Profiles，你如何找到原因？有了 Profiles，需要多长时间？
5. 阅读 Azure OpenAI 和 Bedrock 的定价页面。对于每月 100M token 的 Claude 工作负载，哪个更便宜 — 直接 Anthropic API、Bedrock 按需还是 Bedrock Provisioned Throughput？

## 关键术语

| 术语 | 人们说的是 | 实际含义 |
|------|-----------|---------|
| Bedrock | "AWS LLM 服务" | Claude、Llama、Titan、Mistral、Cohere 的模型市场 |
| Azure OpenAI | "Azure 的 ChatGPT" | Azure 数据中心中具有企业控制的独家 OpenAI 模型 |
| Vertex AI | "Google 的 LLM" | 以 Gemini 为先的平台，附带用于第三方模型的 Model Garden |
| PTU | "专用容量" | Provisioned Throughput Unit — 预留推理 GPU，按小时定价 |
| Application Inference Profile | "Bedrock 标签" | 带标签的按产品成本/使用量配置，CloudWatch 原生 |
| Model Garden | "Vertex 目录" | Vertex AI 的第三方模型部分，与 Gemini 分开 |
| 双供应商最低要求 | "LLM 冗余" | 在每个关键 LLM 路径上运行至少两个云厂商的策略 |
| BAA | "HIPAA 文件" | 业务伙伴协议；处理 PHI 所需；三者均提供 |
| 滥用监控 | "日志观察器" | 供应商端对提示/输出的安全扫描；企业可 opt-out |

## 进一步阅读

- [AWS Bedrock 定价](https://aws.amazon.com/bedrock/pricing/) — 权威费率卡和 Provisioned Throughput 定价。
- [Azure OpenAI Service 定价](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/) — PTU 经济学和费率卡。
- [Vertex AI 生成式 AI 定价](https://cloud.google.com/vertex-ai/generative-ai/pricing) — Gemini 层级和 Model Garden 附加费。
- [Artificial Analysis LLM 排行榜](https://artificialanalysis.ai/) — 各供应商的持续延迟和吞吐量基准测试。
- [The AI Journal — AWS Bedrock vs Azure OpenAI CTO 指南 2026](https://theaijournal.co/2026/03/aws-bedrock-vs-azure-openai/) — 企业决策框架。
- [Finout — Bedrock vs Vertex vs Azure FinOps](https://www.finout.io/blog/bedrock-vs.-vertex-vs.-azure-cognitive-a-finops-comparison-for-ai-spend) — 并排归因机制比较。
