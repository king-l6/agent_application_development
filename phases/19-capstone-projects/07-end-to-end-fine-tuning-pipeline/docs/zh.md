# 综合项目 07 — 端到端微调管道（从数据到 SFT 到 DPO 到服务）

> 一个在你自己的数据上训练、在你自己的偏好上经过 DPO 对齐、量化、推测解码并以可衡量的 $/1M token 提供服务的 8B 模型。2026 年的开源栈是 Axolotl v0.8、TRL 0.15、Unsloth 用于迭代、GPTQ/AWQ/GGUF 用于量化、带有 EAGLE-3 的 vLLM 0.7 用于服务。这个综合项目是完整地可复现地运行整个管道——YAML 输入，服务端点输出——并在 2026 年模型开放框架下发布模型卡。

**类型：** 综合项目
**语言：** Python（管道），YAML（配置），Bash（脚本）
**前置知识：** 阶段 2（ML）、阶段 3（DL）、阶段 7（Transformer）、阶段 10（从零实现 LLM）、阶段 11（LLM 工程）、阶段 17（基础设施）、阶段 18（安全）
**涉及阶段：** P2 · P3 · P7 · P10 · P11 · P17 · P18
**时间：** 35 小时

## 问题

2026 年每个严肃的 AI 团队都保留一个随时可用的微调管道。不是因为他们发布前沿基础模型，而是因为下游适配——领域 SFT、针对标记偏好的 DPO、用于推测解码的蒸馏草稿、带有 EAGLE-3 的服务——是可衡量的胜利所在。Axolotl v0.8 处理多 GPU SFT 配置。TRL 0.15 处理 DPO 和 GRPO。Unsloth 让你快速进行单 GPU 迭代。带有 EAGLE-3 的 vLLM 0.7 将解码吞吐量提高 2-3 倍而不损失质量。工具已就绪；技艺在于 YAML、数据卫生和评估纪律。

你将通过 SFT 然后 DPO 在任务特定数据上运行一个 8B 基础模型（Llama 3.3、Qwen3 或 Gemma 3），量化为服务做准备，并针对 lm-evaluation-harness、RewardBench-2、MT-Bench-v2 和 MMLU-Pro 衡量收益。你将根据 2026 年模型开放框架生成模型卡。重点是可复现性——一个命令端到端地重新运行整个管道。

## 概念

管道有五个阶段。**数据**：去重（MinHash / Datatrove）、质量过滤（Nemotron-CC 风格分类器）、PII 擦除、针对公共基准污染的划分卫生检查。**SFT**：Axolotl YAML，在 8xH100 上的 ZeRO-3，余弦调度，打包序列，2-3 轮。**DPO 或 GRPO**：TRL 配置，1 轮，偏好对要么人工标记要么模型评判，beta 调优。**量化**：GPTQ + AWQ + GGUF 用于部署灵活性。**服务**：带有 EAGLE-3 推测头（或 SGLang + SpecForge）的 vLLM 0.7，K8s 部署，基于队列等待的 HPA。

消融研究是交付物：在三个任务特定基准上只 SFT vs SFT+DPO vs SFT+GRPO 的对比。服务指标：批次 1/8/32 下的 token/s、EAGLE-3 接受率、$/1M tokens。安全评估：Llama Guard 4 通过率。模型卡：偏差评估、可复现性种子、数据许可。

## 架构

```
raw data (HF datasets + internal)
    |
    v
Datatrove dedup + Nemotron-CC quality filter + PII scrub
    |
    v
split hygiene (MMLU-Pro contamination check)
    |
    v
Axolotl SFT config (YAML)  ---> 8xH100, ZeRO-3
    |
    v
TRL DPO / GRPO config       ---> 4xH100, 1 epoch
    |
    v
GPTQ + AWQ + GGUF quantize
    |
    v
vLLM 0.7 + EAGLE-3 speculative decoding
    |
    v
K8s deployment, HPA on queue-wait
    |
    v
lm-eval-harness + RewardBench-2 + MT-Bench-v2 + MMLU-Pro
    |
    v
model card (2026 MOF) + safety eval (Llama Guard 4)
```

## 技术栈

- 数据：Datatrove 用于去重，Nemotron-CC 分类器用于质量，Presidio 用于 PII
- 基础模型：Llama 3.3 8B、Qwen3 14B 或 Gemma 3 12B
- SFT：Axolotl v0.8，ZeRO-3，Flash Attention 3，打包序列
- 偏好调优：TRL 0.15 用于 DPO 或 GRPO；Unsloth 用于单 GPU 迭代
- 量化：GPTQ（Marlin）、AWQ、通过 llama.cpp 的 GGUF
- 服务：带有 EAGLE-3 推测解码的 vLLM 0.7（或 SGLang 0.4 + SpecForge）
- 评估：lm-evaluation-harness、RewardBench-2、MT-Bench-v2、MMLU-Pro
- 安全评估：Llama Guard 4、ShieldGemma-2
- 基础设施：Kubernetes + NVIDIA 设备插件，基于队列等待指标的 HPA
- 可观测性：W&B 用于训练，Langfuse 用于推理

## 构建步骤

1. **数据管道。** 在原始语料库上运行 Datatrove 去重。应用 Nemotron-CC 风格质量分类器。Presidio 擦除 PII。写入带有显式种子的训练/验证划分。

2. **污染检查。** 对每个验证划分，计算与 MMLU-Pro、MT-Bench-v2、RewardBench-2 测试集的 MinHash 相似度。拒绝任何重叠。

3. **Axolotl SFT。** YAML 配置，带 ZeRO-3、FA3、序列打包。在 8xH100 上训练 2-3 轮。记录到 W&B。

4. **TRL DPO / GRPO。** 取 SFT 检查点，在偏好对上运行一轮 DPO（或在数学/代码上使用可验证奖励的 GRPO）。调优 beta。

5. **量化。** 生成三种量化：GPTQ-INT4-Marlin、AWQ-INT4、适用于 llama.cpp 的 GGUF-Q4_K_M。记录大小和标称吞吐量。

6. **带推测解码的服务。** vLLM 0.7 配置，带有通过 Red Hat Speculators 训练的 EAGLE-3 草稿头。测量批次 1/8/32 下的接受率和尾部延迟。报告与 Anthropic/OpenAI 在相同评估上的 $/1M tokens 对比。

7. **评估矩阵。** 在基础模型、只 SFT、SFT+DPO、SFT+GRPO 上运行 lm-eval-harness、RewardBench-2、MT-Bench-v2、MMLU-Pro。生成表格。

8. **安全评估。** 开发集上的 Llama Guard 4 通过率。ShieldGemma-2 输出过滤器。

9. **模型卡。** MOF 2026 模板：数据、训练、评估、安全、许可、可复现性部分，包含 YAML 和提交 SHA。

## 使用方式

```
$ ./pipeline.sh config/llama3.3-8b-domainX.yaml
[data]    300k deduped, 12k filtered, 280k accepted (seed=7)
[SFT]     3 epochs, 8xH100, 6h12m, val loss 1.42 -> 1.03
[DPO]     1 epoch, beta=0.08, 4xH100, 1h40m
[quant]   GPTQ-INT4 4.6 GB, AWQ-INT4 4.8 GB, GGUF-Q4_K_M 5.1 GB
[serve]   vLLM 0.7, EAGLE-3 acceptance 0.74, p99 126ms @ bs=8
[eval]    MMLU-Pro +3.2, MT-Bench-v2 +0.41, RewardBench-2 +0.08
[card]    model-card.md generated under 2026 MOF
```

## 交付物

`outputs/skill-finetuning-pipeline.md` 描述可交付成果。一个命令通过 SFT 到 DPO 到量化到服务到评估运行数据，并生成模型卡 + 服务端点。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | 与基线的评估差异 | 在目标任务上测量的增益（MMLU-Pro、MT-Bench-v2、任务特定） |
| 20 | 管道可复现性 | 一个命令使用相同种子端到端重新运行 |
| 20 | 数据卫生 | 去重率、PII 擦除覆盖率、污染检查绿灯 |
| 20 | 服务效率 | 批次大小 1/8/32 下的 token/s、EAGLE-3 接受率、$/1M tokens |
| 15 | 模型卡 + 安全评估 | 2026 MOF 完整性 + Llama Guard 4 通过率 |
| **100** | | |

## 练习

1. 在同一任务特定基准上运行只 SFT vs SFT+DPO vs SFT+GRPO 的对比。报告哪种偏好方法胜出以及胜出多少。

2. 将 Llama 3.3 8B 替换为 Qwen3 14B。在匹配质量下测量 $/1M tokens。

3. 测量 EAGLE-3 在领域数据 vs 通用 ShareGPT 上的接受率。报告差异及其对延迟预算的意义。

4. 注入 1% 的污染（将 MMLU-Pro 答案泄露到训练数据中）并重新运行评估。观察 MMLU-Pro 准确率不现实地跳升。构建一个能捕获此问题的污染检查 CI 门。

5. 添加 LoRA SFT 作为全参数微调的替代方案。测量在 10 倍更低内存下的质量差距。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| Axolotl | "SFT 训练器" | 统一的 YAML 驱动训练器，支持 SFT、DPO 和蒸馏 |
| TRL | "偏好调优器" | Hugging Face 库，用于在 LLM 上进行 DPO、GRPO、PPO |
| GRPO | "群体相对策略优化" | DeepSeek R1 的 RL 方法，使用可验证奖励 |
| EAGLE-3 | "推测解码草稿" | 预测 N 个 ahead token 的草稿头；vLLM 用目标模型验证 |
| MOF | "模型开放框架" | 2026 年标准，对模型发布的数据、代码、许可进行分级 |
| 污染检查 | "划分卫生" | 基于 MinHash 的测试集泄露到训练中的检测 |
| 接受率 | "EAGLE / MTP 指标" | 目标模型接受的草稿 token 比例 |

## 延伸阅读

- [Axolotl 文档](https://axolotl-ai-cloud.github.io/axolotl/) — 参考 SFT / DPO 训练器
- [TRL 文档](https://huggingface.co/docs/trl) — DPO 和 GRPO 参考实现
- [Unsloth](https://github.com/unslothai/unsloth) — 单 GPU 迭代参考
- [DeepSeek R1 论文（arXiv:2501.12948）](https://arxiv.org/abs/2501.12948) — GRPO 方法论
- [vLLM + EAGLE-3 文档](https://docs.vllm.ai) — 参考服务栈
- [SGLang SpecForge](https://github.com/sgl-project/SpecForge) — 备选推测解码训练器
- [模型开放框架 2026](https://isocpp.org/) — 开放发布分级标准
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) — 规范评估运行器
