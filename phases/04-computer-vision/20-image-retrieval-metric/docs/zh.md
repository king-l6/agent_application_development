# 图像检索与度量学习

> 检索系统按嵌入空间中的距离对候选对象进行排名。度量学习是塑造该空间的学科，使距离表达你想要的语义。

**类型：** 构建
**语言：** Python
**前置条件：** 阶段 4 第 14 课（ViT），阶段 4 第 18 课（CLIP）
**时间：** ~45 分钟

## 学习目标

- 解释三元组、对比和基于代理的度量学习损失，并为给定数据集选择合适的损失
- 正确实现 L2 归一化和余弦相似度，并审计"相同项目"与"相同类别"检索之间的差异
- 构建 FAISS 索引，通过文本和图像查询，并报告保留查询集的 recall@K
- 使用 DINOv2、CLIP 和 SigLIP 作为开箱即用的嵌入骨干，并了解各自何时胜出

## 问题

检索在生产视觉中无处不在：重复检测、反向图像搜索、视觉搜索（"查找相似产品"）、人脸重识别、监控中的人物重识别、电子商务中的实例级匹配。产品问题始终相同："给定这张查询图像，对我的目录进行排名。"

两个设计决策决定了整个系统。嵌入——什么模型产生向量。索引——如何规模化地找到最近邻。两者在 2026 年都是商品（DINOv2 用于嵌入，FAISS 用于索引），这提高了标准：困难的部分是定义对你的应用来说*什么算作相似*，然后塑造嵌入空间以使距离与之匹配。

这种塑造就是度量学习。这是一个虽小但高杠杆的学科。

## 概念

### 检索概览

```mermaid
flowchart LR
    Q["查询图像<br/>或文本"] --> ENC["编码器"]
    ENC --> EMB["查询嵌入"]
    EMB --> IDX["FAISS 索引"]
    CAT["目录图像"] --> ENC2["编码器（相同）"] --> IDX_BUILD["构建索引"]
    IDX_BUILD --> IDX
    IDX --> RANK["按余弦 / L2<br/>取 top-k 最近邻"]
    RANK --> OUT["排名结果"]

    style ENC fill:#dbeafe,stroke:#2563eb
    style IDX fill:#fef3c7,stroke:#d97706
    style OUT fill:#dcfce7,stroke:#16a34a
```

### 四大损失家族

| 损失 | 需要 | 优点 | 缺点 |
|------|------|------|------|
| **对比损失** | (锚点，正样本) + 负样本 | 简单，适用于任意对标签 | 无大量负样本时收敛慢 |
| **三元组损失** | (锚点，正样本，负样本) | 直观；直接控制边界 | 困难三元组挖掘代价高 |
| **NT-Xent / InfoNCE** | 对 + 批次内挖掘的负样本 | 可扩展到大批次 | 需要大批次或动量队列 |
| **基于代理的损失（ProxyNCA）** | 仅类别标签 | 快速、稳定、无需挖掘 | 在小数据集上可能过拟合代理 |

对大多数生产用例，先从预训练骨干开始，仅当开箱即用嵌入在你的测试集上表现不佳时才添加度量学习微调。

### 三元组损失的形式

```
L = max(0, ||f(a) - f(p)||^2 - ||f(a) - f(n)||^2 + margin)
```

将锚点 `a` 拉近正样本 `p`，推远负样本 `n`，通过 `margin` 确保有一个间隔。三图像结构泛化到任意相似度排序。

挖掘很重要：简单三元组（`n` 已经远离 `a`）贡献零损失；只有困难三元组教会网络。半困难挖掘（`n` 比 `p` 远但在边界内）是 2016 年 FaceNet 的配方，至今仍占主导地位。

### 余弦相似度 vs L2

两个度量标准，两种约定：

- **余弦**：向量间的角度。需要 L2 归一化嵌入。
- **L2**：欧几里得距离。适用于原始或归一化嵌入，但通常与 L2 归一化 + 平方 L2 配合使用。

对大多数现代网络，两者等价：当 `||a|| = ||b|| = 1` 时，`||a - b||^2 = 2 - 2 cos(a, b)`。选择与你的嵌入训练匹配的约定；混用会静默改变"最近"的含义。

### Recall@K

标准检索指标：

```
recall@K = 至少一个正确匹配出现在前 K 个结果中的查询比例
```

并排报告 recall@1、@5、@10。recall@10 高于 0.95 但 recall@1 低于 0.5 意味着嵌入空间有正确的结构但排名噪声大——尝试更长的微调或重排序步骤。

对于重复检测，precision@K 更重要，因为每个假阳性都是用户可见的错误。对于视觉搜索，recall@K 是产品信号。

### FAISS 概述

Facebook AI 相似度搜索。最邻近搜索的事实标准库。三个索引选择：

- `IndexFlatIP` / `IndexFlatL2` —— 暴力搜索，精确，无需训练。适用于最多约 100 万个向量。
- `IndexIVFFlat` —— 分区为 K 个单元，仅搜索最接近的几个单元。近似，快速，需要训练数据。
- `IndexHNSW` —— 基于图，对多查询最快，索引大小大。

对于 10 万个向量，你可能想在余弦相似度上使用 `IndexFlatIP`。对于 1000 万个，想要 `IndexIVFFlat`。对于 1 亿以上，结合乘积量化使用 `IndexIVFPQ`。

### 实例级 vs 类别级检索

两个截然不同的问题共享同一个名称：

- **类别级** —— "在我的目录中查找猫。" 类别条件相似度；开箱即用的 CLIP / DINOv2 嵌入效果良好。
- **实例级** —— "在我的目录中查找*这个精确产品*。" 需要同类视觉相似对象之间的细粒度区分；开箱即用嵌入表现不佳；度量学习微调很重要。

在选择模型之前，始终先问你正在解决哪一个。

## 构建

### 步骤 1：三元组损失

```python
import torch
import torch.nn.functional as F

def triplet_loss(anchor, positive, negative, margin=0.2):
    d_ap = F.pairwise_distance(anchor, positive, p=2)
    d_an = F.pairwise_distance(anchor, negative, p=2)
    return F.relu(d_ap - d_an + margin).mean()
```

一行。适用于 L2 归一化或原始嵌入。

### 步骤 2：半困难挖掘

给定嵌入和标签批次，为每个锚点找到最难的半困难负样本。

```python
def semi_hard_negatives(emb, labels, margin=0.2):
    dist = torch.cdist(emb, emb)
    same_class = labels[:, None] == labels[None, :]
    diff_class = ~same_class
    N = emb.size(0)

    positives = dist.clone()
    positives[~same_class] = float("-inf")
    positives.fill_diagonal_(float("-inf"))
    pos_idx = positives.argmax(dim=1)

    semi_hard = dist.clone()
    semi_hard[same_class] = float("inf")
    d_ap = dist[torch.arange(N), pos_idx].unsqueeze(1)
    semi_hard[dist <= d_ap] = float("inf")
    neg_idx = semi_hard.argmin(dim=1)

    fallback_mask = semi_hard[torch.arange(N), neg_idx] == float("inf")
    if fallback_mask.any():
        hardest = dist.clone()
        hardest[same_class] = float("inf")
        neg_idx = torch.where(fallback_mask, hardest.argmin(dim=1), neg_idx)
    return pos_idx, neg_idx
```

每个锚点得到类内最困难正样本和一个半困难负样本，该负样本比正样本远但在边界内。

### 步骤 3：Recall@K

```python
def recall_at_k(query_emb, gallery_emb, query_labels, gallery_labels, k=1):
    sim = query_emb @ gallery_emb.T
    _, top_k = sim.topk(k, dim=-1)
    matches = (gallery_labels[top_k] == query_labels[:, None]).any(dim=-1)
    return matches.float().mean().item()
```

在 L2 归一化嵌入上通过内积取 top-k 等同于通过余弦取 top-k。报告至少有一个正确邻居的查询的平均比例。

### 步骤 4：整合

```python
import torch
import torch.nn as nn
from torch.optim import Adam

class Encoder(nn.Module):
    def __init__(self, in_dim=128, emb_dim=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 128), nn.ReLU(),
            nn.Linear(128, emb_dim),
        )

    def forward(self, x):
        return F.normalize(self.net(x), dim=-1)

torch.manual_seed(0)
num_classes = 6
protos = F.normalize(torch.randn(num_classes, 128), dim=-1)

def sample_batch(bs=32):
    labels = torch.randint(0, num_classes, (bs,))
    x = protos[labels] + 0.15 * torch.randn(bs, 128)
    return x, labels

enc = Encoder()
opt = Adam(enc.parameters(), lr=3e-3)

for step in range(200):
    x, y = sample_batch(32)
    emb = enc(x)
    pos_idx, neg_idx = semi_hard_negatives(emb, y)
    loss = triplet_loss(emb, emb[pos_idx], emb[neg_idx])
    opt.zero_grad(); loss.backward(); opt.step()
```

几百步后，嵌入聚类为每个类别一个簇。

## 使用

2026 年的生产框架：

- **DINOv2 + FAISS** —— 通用视觉检索。开箱即用。
- **CLIP + FAISS** —— 当查询是文本时。
- **微调 DINOv2 + FAISS** —— 实例级检索、人脸重识别、时尚、电子商务。
- **Milvus / Weaviate / Qdrant** —— 围绕 FAISS 或 HNSW 的托管向量数据库包装器。

对于 SOTA 实例检索，配方是：DINOv2 骨干，添加嵌入头，在实例标注对上使用三元组或 InfoNCE 损失进行微调，在 FAISS 中索引。

## 交付

本课程产出：

- `outputs/prompt-retrieval-loss-picker.md` — 一个提示词，为给定检索问题选择三元组 / InfoNCE / ProxyNCA。
- `outputs/skill-recall-at-k-runner.md` — 一个技能，编写用于 recall@K 的干净评估框架，包含训练/验证/图库划分和适当的数据契约。

## 练习

1. **（简单）** 运行上述玩具示例。在训练前后用 PCA 绘制嵌入，观察六个聚类形成。
2. **（中等）** 添加 ProxyNCA 损失实现：每个类别一个学习的"代理"，在余弦相似度上进行标准交叉熵。在玩具数据上与三元组损失比较收敛速度。
3. **（困难）** 取 1000 张 ImageNet 验证图像，通过 HuggingFace 用 DINOv2 嵌入，构建 FAISS 平面索引，报告对相同图像作为查询的 recall@{1, 5, 10}（应为 1.0）以及使用 ImageNet 标签作为真实值的保留集上的结果。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 度量学习 | "塑造空间" | 训练编码器使其输出空间中的距离反映目标相似度 |
| 三元组损失 | "拉和推" | L = max(0, d(a, p) - d(a, n) + margin)；经典度量学习损失 |
| 半困难挖掘 | "有用的负样本" | 比正样本远但在边界内的负样本；经验上信息量最大 |
| 基于代理的损失 | "类原型" | 每个类别一个学习的代理；与代理相似度上的交叉熵；无需对挖掘 |
| Recall@K | "Top-K 命中率" | 在前 K 个结果中至少有一个正确结果的查询比例 |
| 实例检索 | "找到这个具体东西" | 细粒度匹配；开箱即用特征通常表现不佳 |
| FAISS | "NN 库" | Facebook 的最近邻库；支持精确和近似索引 |
| HNSW | "图索引" | 分层可导航小世界；快速近似 NN，内存开销小 |

## 延伸阅读

- [FaceNet: A Unified Embedding for Face Recognition (Schroff et al., 2015)](https://arxiv.org/abs/1503.03832) — 三元组损失/半困难挖掘论文
- [In Defense of the Triplet Loss for Person Re-Identification (Hermans et al., 2017)](https://arxiv.org/abs/1703.07737) — 三元组微调实用指南
- [FAISS documentation](https://github.com/facebookresearch/faiss/wiki) — 每个索引的每种权衡
- [SMoT: Metric Learning Taxonomy (Kim et al., 2021)](https://arxiv.org/abs/2010.06927) — 现代损失及其关联的综述
