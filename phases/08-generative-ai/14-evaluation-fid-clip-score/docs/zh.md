# 评估——FID、CLIP 分数与人类偏好

> 每个生成模型排行榜都引用 FID、CLIP 分数和来自人类偏好竞技场的胜率。每个数字都有其失效模式，坚定的研究者可以利用这些模式进行作弊。如果你不了解这些失效模式，就无法区分真正的改进与作弊。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 8 · 01（分类），阶段 2 · 04（评估指标）
**时间：** ~45 分钟

## 问题

生成模型的评判标准是*样本质量*和*条件遵循度*。两者都没有封闭形式的度量。你的模型必须渲染 10,000 张图像；必须用某种方式给它们打分；你必须在不同模型家族、不同分辨率、不同架构之间信任这些分数。三个指标经受住了 2014-2026 年的考验：

- **FID（Fréchet Inception Distance）。** 在 Inception 网络的特征空间中，真实分布和生成分布之间的距离。越低越好。
- **CLIP 分数。** 生成图像的 CLIP 图像嵌入与提示文本的 CLIP 文本嵌入之间的余弦相似度。越高越好。衡量提示遵循度。
- **人类偏好。** 将两个模型在相同提示下进行对比，让人类（或 GPT-4 级别的模型）选出更好的一个，汇总为 Elo 分数。

你还会看到：IS（Inception Score，已基本淘汰）、KID、CMMD、ImageReward、PickScore、HPSv2、MJHQ-30k。每个都是针对前一个指标的某个失效模式的修正。

## 概念

![FID、CLIP 和偏好：三个维度，不同的失效模式](../assets/evaluation.svg)

### FID——样本质量

Heusel 等人，2017 年。步骤：

1. 提取 N 张真实图像和 N 张生成图像的 Inception-v3 特征（2048 维）。
2. 为每个池拟合高斯分布：计算均值 `μ_r, μ_g` 和协方差 `Σ_r, Σ_g`。
3. FID = `||μ_r - μ_g||² + Tr(Σ_r + Σ_g - 2 · (Σ_r · Σ_g)^0.5)`。

解释：特征空间中两个多元高斯之间的 Fréchet 距离。越低表示分布越相似。

失效模式：
- **小 N 时有偏差。** FID 是特征分布上的均方差——小 N 会低估协方差，给出虚假的低 FID。始终使用 N ≥ 10,000。
- **依赖 Inception。** Inception-v3 是在 ImageNet 上训练的。远离 ImageNet 的领域（人脸、艺术、文本图像）会产生无意义的 FID。应使用领域特定的特征提取器。
- **可被作弊。** 过拟合 Inception 先验可以在没有视觉质量提升的情况下获得低 FID。用 CMMD（见下文）来对抗。

### CLIP 分数——提示遵循度

Radford 等人，2021 年。对于生成图像 + 提示：

```
clip_score = cos_sim( CLIP_image(x_gen), CLIP_text(prompt) )
```

对 30k 张生成图像取平均 → 一个可在模型之间比较的标量。

失效模式：
- **CLIP 自身的盲点。** CLIP 的组合推理能力较弱（"蓝色球体上的红色立方体"经常失败）。模型可以在 CLIP 分数上排名很高，但实际上并不真正遵循复杂提示。
- **短提示偏差。** 短提示在现实中有更多的 CLIP 图像匹配。长提示的 CLIP 分数机械性地更低。
- **提示作弊。** 在提示中包含"高质量、4k、杰作"会虚高 CLIP 分数，而不会改善图像-文本绑定。

CMMD（Jayasumana 等人，2024）修复了其中一些问题：使用 CLIP 特征替代 Inception，使用最大均值差异替代 Fréchet。能更好地检测细微的质量差异。

### 人类偏好——真实标准

选择一个提示池。用模型 A 和模型 B 生成。将配对展示给人类（或强大的 LLM 评估器）。将胜率汇总为 Elo 或 Bradley-Terry 分数。基准：

- **PartiPrompts（Google）**：1,600 个多样化提示，12 个类别。
- **HPSv2**：107k 条人类标注，广泛用作自动化代理。
- **ImageReward**：137k 个提示-图像偏好对，MIT 许可。
- **PickScore**：在 Pick-a-Pic 的 260 万偏好数据上训练。
- **Chatbot-Arena 风格的图像竞技场**：https://imagearena.ai/ 等。

失效模式：
- **评估者差异。** 非专家与专家有不同的偏好。两者都使用。
- **提示分布。** 精心挑选的提示会偏向某个模型家族。始终记录提示集。
- **LLM 评估器奖励作弊。** GPT-4 评估器会被漂亮但错误的输出欺骗。用人类结果进行三角验证。

## 综合使用

一份生产级评估报告应包括：

1. 对 10-30k 样本在保留的真实分布上的 FID（样本质量）。
2. 对相同样本相对于其提示的 CLIP 分数 / CMMD（遵循度）。
3. 在盲测竞技场中与先前模型的胜率（总体偏好）。
4. 失效模式分析：50 个随机采样的输出，标记已知问题（手部解剖、文字渲染、一致的对象数量）。

任何单一指标都是谎言。三个相互印证的指标 + 定性评审才是一个论断。

## 动手构建

`code/main.py` 在合成"特征向量"（我们使用 4 维向量作为 Inception 特征的替代）上实现了 FID、类 CLIP 分数和 Elo 聚合。你可以看到：

- 在小 N 和大 N 上计算 FID——偏差。
- 特征池之间的余弦相似度作为"CLIP 分数"。
- 从合成偏好流中得到的 Elo 更新规则。

### 第 1 步：四行代码的 FID

```python
def fid(real_features, gen_features):
    mu_r, cov_r = mean_and_cov(real_features)
    mu_g, cov_g = mean_and_cov(gen_features)
    mean_diff = sum((a - b) ** 2 for a, b in zip(mu_r, mu_g))
    trace_term = trace(cov_r) + trace(cov_g) - 2 * sqrt_cov_product(cov_r, cov_g)
    return mean_diff + trace_term
```

### 第 2 步：CLIP 风格的余弦相似度

```python
def clip_like(image_feat, text_feat):
    dot = sum(a * b for a, b in zip(image_feat, text_feat))
    norm = math.sqrt(dot_self(image_feat) * dot_self(text_feat))
    return dot / max(norm, 1e-8)
```

### 第 3 步：Elo 聚合

```python
def elo_update(r_a, r_b, winner, k=32):
    expected_a = 1 / (1 + 10 ** ((r_b - r_a) / 400))
    actual_a = 1.0 if winner == "a" else 0.0
    r_a_new = r_a + k * (actual_a - expected_a)
    r_b_new = r_b - k * (actual_a - expected_a)
    return r_a_new, r_b_new
```

## 陷阱

- **N=1000 时的 FID。** N 小于 10k 时启发式方法不可靠。报告小 N 下 FID 的论文是在作弊。
- **跨分辨率比较 FID。** Inception 的 299×299 缩放会改变特征分布。仅在匹配的分辨率下进行比较。
- **只报告一个随机种子。** 至少运行 3 个种子。报告标准差。
- **通过负提示虚高 CLIP 分数。** 一些管线通过过拟合提示来提升 CLIP。检查是否存在视觉饱和。
- **提示重叠导致的 Elo 偏差。** 如果两个模型在训练时都见过基准提示，Elo 就毫无意义。使用保留的提示集。
- **人类评估的付费人群偏差。** Prolific、MTurk 的标注者偏年轻/偏技术背景。混合招募艺术/设计专家。

## 使用建议

2026 年的生产级评估协议：

| 支柱 | 最低要求 | 推荐 |
|--------|---------|-------------|
| 样本质量 | 在 10k 样本上对保留真实集的 FID | + 在 5k 样本上的 CMMD + 每个类别的 FID 子集 |
| 提示遵循度 | 在 30k 样本上的 CLIP 分数 | + HPSv2 + ImageReward + VQA 风格问答 |
| 偏好 | 与基线的 200 个盲测配对 | + 2000 个配对的人类 + LLM 评估 + Chatbot Arena |
| 失效分析 | 50 个人工标记 | 500 个人工标记 + 自动化安全分类器 |

所有四个支柱都在一份报告中 = 论断。只有其中任何一个 = 营销。

## 交付技能

保存 `outputs/skill-eval-report.md`。技能接收一个新的模型检查点 + 基线，并输出完整的评估计划：样本数量、指标、失效模式探查、签字标准。

## 练习

1. **简单。** 运行 `code/main.py`。在相同的合成分布上比较 N=100 与 N=1000 时的 FID。报告偏差大小。
2. **中等。** 从合成的 CLIP 风格特征实现 CMMD（参见 Jayasumana 等人 2024 年的公式）。与 FID 比较对质量差异的敏感性。
3. **困难。** 复现 HPSv2 设置：从 Pick-a-Pic 的一个子集中取 1000 个图像-提示对，在偏好数据上微调一个小的基于 CLIP 的打分器，并测量其与保留集的一致性。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| FID | "Fréchet Inception Distance" | 真实与生成 Inception 特征的高斯拟合的 Fréchet 距离。 |
| CLIP score | "文本-图像相似度" | CLIP 图像和文本嵌入之间的余弦相似度。 |
| CMMD | "FID 的替代" | CLIP 特征 MMD；偏差较小，无高斯假设。 |
| IS | "Inception score" | Exp KL(p(y|x) || p(y))；在现代模型上相关性差，已淘汰。 |
| HPSv2 / ImageReward / PickScore | "学习的偏好代理" | 在人类偏好上训练的小模型；用作自动评估器。 |
| Elo | "国际象棋等级分" | 成对胜率的 Bradley-Terry 聚合。 |
| PartiPrompts | "基准提示集" | Google 策划的 1,600 个跨 12 个类别的提示。 |
| FD-DINO | "自监督替代" | 使用 DINOv2 特征的 FD；在非 ImageNet 领域表现更好。 |

## 生产注意事项：评估本身也是一种推理负载

对 10k 样本运行 FID 意味着生成 10k 张图像。对于一个在单张 L4 上以 1024² 运行的 50 步 SDXL 基础模型，这大约是 11 小时的单请求推理。评估预算真实存在，其框架正是离线推理场景（最大化吞吐量，忽略 TTFT）：

- **强批处理，忽略延迟。** 离线评估 = 在内存允许的最大批大小下进行静态批处理。`pipe(...).images` 配合 `num_images_per_prompt=8` 在 80GB H100 上比单请求快 4-6 倍（墙钟时间）。
- **缓存真实特征。** 在真实参考集上的 Inception（FID）或 CLIP（CLIP 分数、CMMD）特征提取只需运行*一次*，保存为 `.npz` 文件。不要在每次评估时重新计算。

对于 CI / 回归门控：在每个 PR 的 500 样本子集上运行 FID + CLIP 分数（约 30 分钟）；每晚运行完整的 10k FID + HPSv2 + Elo。

## 延伸阅读

- [Heusel et al. (2017). GANs Trained by a Two Time-Scale Update Rule Converge to a Local Nash Equilibrium (FID)](https://arxiv.org/abs/1706.08500) — FID 论文。
- [Jayasumana et al. (2024). Rethinking FID: Towards a Better Evaluation Metric for Image Generation (CMMD)](https://arxiv.org/abs/2401.09603) — CMMD。
- [Radford et al. (2021). Learning Transferable Visual Models from Natural Language Supervision (CLIP)](https://arxiv.org/abs/2103.00020) — CLIP。
- [Wu et al. (2023). HPSv2: A Comprehensive Human Preference Score](https://arxiv.org/abs/2306.09341) — HPSv2。
- [Xu et al. (2023). ImageReward: Learning and Evaluating Human Preferences for Text-to-Image Generation](https://arxiv.org/abs/2304.05977) — ImageReward。
- [Yu et al. (2023). Scaling Autoregressive Models for Content-Rich Text-to-Image Generation (Parti + PartiPrompts)](https://arxiv.org/abs/2206.10789) — PartiPrompts。
- [Stein et al. (2023). Exposing flaws of generative model evaluation metrics](https://arxiv.org/abs/2306.04675) — 失效模式综述。
