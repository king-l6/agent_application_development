# 推理平台经济学 — Fireworks、Together、Baseten、Modal、Replicate、Anyscale

> 2026 年的推理市场不再是 GPU 时间租赁。它分化为定制芯片（Groq、Cerebras、SambaNova）、GPU 平台（Baseten、Together、Fireworks、Modal）和 API 优先市场（Replicate、DeepInfra）。Fireworks 于 2026 年 5 月 1 日将每 GPU 每小时价格提高 $1，而 $4B 估值和每天 10T+ token 的处理量说明量驱模型是有效的。Baseten 于 2026 年 1 月以 $5B 估值完成了 $300M 的 E 轮融资。竞争定位规则很简单：Fireworks 优化延迟，Together 优化目录广度，Baseten 优化企业级精致度，Modal 优化 Python 原生开发体验，Replicate 优化多模态覆盖，Anyscale 优化分布式 Python。本课为你提供一个可以直接交给创始人的矩阵。

**类型：** 学习
**语言：** Python（标准库，玩具每次调用经济学比较器）
**前置知识：** 阶段 17 · 01（托管 LLM 平台）、阶段 17 · 04（vLLM 服务内部原理）
**时间：** ~60 分钟

## 学习目标

- 说出三个市场细分（定制芯片、GPU 平台、API 优先市场）并将每个供应商映射到一个细分市场。
- 解释为什么"按 token"的 API 定价模型趋向于服务引擎的成本曲线，而非硬件的成本曲线。
- 计算至少三个供应商的每个请求有效成本，并解释何时按分钟计费（Baseten、Modal）优于按 token 计费。
- 识别对于给定工作负载（无服务器突发型、稳定高吞吐型、微调变体型、多模态型）哪个平台是合适的默认选择。

## 问题

你评估了托管云厂商平台。你决定需要一个更窄、更快的供应商 — Fireworks 追求延迟，Together 追求广度，Baseten 提供微调定制模型。现在你有六个真正可选的方案，而定价页面并不一致。Fireworks 显示 $/M token；Baseten 显示 $/分钟；Modal 显示 $/秒；Replicate 显示 $/预测。不建模工作负载，你无法进行直接比较。

更糟糕的是，每个定价页面背后的商业模式都不同。Fireworks 在共享 GPU 上运行自己的定制引擎（FireAttention）；按 token 费率反映了它们的利用率曲线。Baseten 提供 Truss + 专用 GPU；按分钟计费反映独占性。Modal 是真正的 Python 无服务器 — 按秒计费，亚秒级冷启动。相同的输出（LLM 响应），三种不同的成本函数。

本课对六个方案进行建模，并告诉你每种方案何时胜出。

## 概念

### 三个细分市场

**定制芯片** — Groq（LPU）、Cerebras（WSE）、SambaNova（RDU）。通常在相同模型上比基于 GPU 的集群快 5-10 倍解码速度。按 token 价格更高（Groq 在 2025 年末 Llama-70B 上约为 ~$0.99/M），但对于延迟敏感用例无可匹敌。Groq 是语音代理和实时翻译的生产选择。

**GPU 平台** — Baseten、Together、Fireworks、Modal、Anyscale。运行在 NVIDIA（2026 年为 H100、H200、B200）或有时 AMD 上。位于"原始 GPU 租赁"（RunPod、Lambda）和"云厂商托管服务"（Bedrock）之间的经济层。

**API 优先市场** — Replicate、DeepInfra、OpenRouter、Fal。目录广泛，按预测或按秒付费，强调首次调用时间。

### Fireworks — 延迟优化的 GPU 平台

- FireAttention 引擎（定制）；号称在等效配置下延迟比 vLLM 低 4 倍。
- 批处理层价格约为无服务器费率的 50%，适用于非交互式工作负载。
- 微调模型以与基础模型相同的费率提供服务 — 这是一个真正的差异化优势，与那些对你的 LoRA 收取更高价格的供应商不同。
- 2026 年中：2026 年 5 月 1 日起有效将按需 GPU 租赁价格提高 $1/小时。批量定价可按规模协商。
- 财务信号：$4B 估值，每天处理 10T+ token。

### Together — 广度优化

- 200+ 模型，包括上游发布后几天内的开源版本。
- 等效 LLM 模型上比 Replicate 便宜 50-70% — "AI 原生云"定位是体量和目录。
- 推理 + 微调 + 训练在一个 API 中。

### Baseten — 企业精致度优化

- Truss 框架：模型打包，依赖、密钥和服务配置在一个清单中。
- GPU 范围从 T4 到 B200。按分钟计费，合理的冷启动缓解。
- SOC 2 Type II、HIPAA 就绪。常见于金融科技和医疗领域。
- $5B 估值，2026 年 1 月 E 轮融资（$300M 来自 CapitalG、IVP、NVIDIA）。

### Modal — Python 原生优化

- 纯 Python 的基础设施即代码。用 `@modal.function(gpu="A100")` 装饰一个函数，一个命令即可部署。
- 按秒计费。预热后冷启动 2-4 秒；小型模型 <1 秒。
- $87M B 轮融资，$1.1B 估值（2025）。在独立调查中开发者体验评分最高。

### Replicate — 多模态广度

- 按预测付费。图像、视频和音频模型的默认平台。
- 集成生态（Zapier、Vercel、CMS 插件）。
- 在 LLM 按 token 费率上竞争力较弱，但在多模态多样性上胜出。

### Anyscale — Ray 原生

- 基于 Ray 构建；RayTurbo 是 Anyscale 的专有推理引擎（与 vLLM 竞争）。
- 最适合推理步骤是更大图中一个节点的分布式 Python 工作负载。
- 托管 Ray 集群；与 Ray AIR 和 Ray Serve 紧密集成。

### 按 token 与按分钟 — 何时各自胜出

按 token 在工作负载对延迟不敏感且突发时合理 — 你只为使用量付费。按分钟在利用率高且可预测时合理 — 一旦 GPU 饱和，你就超过了按 token 的计费方式。

粗略规则：对于专用 GPU 持续利用率约 30% 以上的工作负载，按分钟（Baseten、Modal）开始优于按 token（Fireworks、Together）。低于此阈值，按 token 胜出，因为你避免了为空闲付费。

### 定制引擎是真正的护城河

上述每个平台都在 vLLM 和 SGLang 之上声称拥有定制引擎。FireAttention、RayTurbo、Baseten 的推理栈。定制引擎的声称多少带有营销成分 — 诚实的表述是 vLLM + SGLang 代表了约 80% 的生产开源推理，而平台层的差异化在于开发者体验、归因和 SLA。

### 你应该记住的数字

- Fireworks GPU 租赁：2026 年 5 月 1 日起有效涨 $1/小时。
- Fireworks 声称：等效配置下延迟比 vLLM 低 4 倍。
- Together：LLM 上比 Replicate 便宜 50-70%。
- Baseten 估值：$5B（E 轮，2026 年 1 月，$300M 轮次）。
- Modal 估值：$1.1B（B 轮，2025）。
- 按分钟优于按 token 的阈值：约 30% 持续利用率以上。

```figure
cost-per-token
```

## 使用它

`code/main.py` 在合成工作负载上跨定价模型比较六个供应商。报告 $/天和有效 $/M token。运行它来找到按 token 和按分钟之间的盈亏平衡点。

## 交付物

本课产出 `outputs/skill-inference-platform-picker.md`。给定工作负载概要、SLA 和预算，选择主要推理平台并指出亚军。

## 练习

1. 运行 `code/main.py`。对于在单个 H100 上的 70B 模型，Baseten（按分钟）在多少持续利用率下优于 Fireworks（按 token）？自己推导交叉点并与经验法则比较。
2. 你的产品同时提供图像生成、聊天和语音转文本。为每种模态选择平台，并指出统一它们的网关模式。
3. Fireworks 在你主要模型上的价格提高了 $1/小时。如果 40% 的流量转移到批处理层（50% 折扣），建模混合成本影响。
4. 一个受监管客户需要 SOC 2 Type II + HIPAA + 专用 GPU。哪三个平台可行，哪个在 FinOps 上胜出？
5. 比较 Fireworks 无服务器、Together 按需、Baseten 专用和 Replicate API 上 Llama 3.1 70B 每 1000 次预测的成本。每天 10 次预测时哪个最便宜？每天 10,000 次呢？

## 关键术语

| 术语 | 人们说的是 | 实际含义 |
|------|-----------|---------|
| 定制芯片 | "非 GPU 芯片" | Groq LPU、Cerebras WSE、SambaNova RDU — 针对解码优化 |
| FireAttention | "Fireworks 引擎" | 定制注意力核；号称延迟比 vLLM 低 4 倍 |
| Truss | "Baseten 的格式" | 模型打包清单；依赖 + 密钥 + 服务配置 |
| 按 token | "API 定价" | 按消耗的 token 收费；不为空闲付费 |
| 按分钟 | "专用定价" | 按实际 GPU 时间收费；在高利用率时胜出 |
| 按预测 | "Replicate 定价" | 按模型调用收费；常见于图像/视频 |
| RayTurbo | "Anyscale 引擎" | Ray 上的专有推理；与 Ray 集群上的 vLLM 竞争 |
| 批处理层 | "5 折优惠" | 低费率下的非交互式队列；常见于 Fireworks、OpenAI |
| 基础费率下微调 | "Fireworks LoRA" | 以基础模型的费率对 LoRA 服务请求收费（差异化优势） |

## 进一步阅读

- [Fireworks 定价](https://fireworks.ai/pricing) — 按 token 费率、批处理层、GPU 租赁。
- [Baseten 定价](https://www.baseten.co/pricing/) — 按分钟费率、承诺容量、企业层级。
- [Modal 定价](https://modal.com/pricing) — 按秒 GPU 费率和免费层。
- [Together AI 定价](https://www.together.ai/pricing) — 模型目录和按 token 费率。
- [Anyscale 定价](https://www.anyscale.com/pricing) — RayTurbo 和托管 Ray 定价。
- [Northflank — Fireworks AI 替代方案](https://northflank.com/blog/7-best-fireworks-ai-alternatives-for-inference) — 比较评估。
- [Infrabase — AI 推理 API 供应商比较 2026](https://infrabase.ai/blog/ai-inference-api-providers-compared) — 供应商格局。
