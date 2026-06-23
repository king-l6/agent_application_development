# OCR 与文档理解

> OCR 是一个三阶段管线——检测文本框、识别字符、然后排版。每个现代 OCR 系统都会重新排序这些阶段或将它们合并。

**类型：** 学习 + 使用
**语言：** Python
**前置条件：** 阶段 4 第 06 课（检测），阶段 7 第 02 课（自注意力）
**时间：** ~45 分钟

## 学习目标

- 梳理经典 OCR 管线（检测 -> 识别 -> 排版）和现代端到端替代方案（Donut、Qwen-VL-OCR）
- 实现 CTC（连接主义时序分类）损失用于序列到序列的 OCR 训练
- 使用 PaddleOCR 或 EasyOCR 进行无需训练的生产文档解析
- 区分 OCR、版面解析和文档理解——并为每个任务选择合适的工具

## 问题

充满文本的图像无处不在：收据、发票、身份证、扫描的书籍、表格、白板、标志、截图。从中提取结构化数据——不仅仅是字符，而是"这是总金额"——是最高价值的应用视觉问题之一。

该领域分为三个技能层：

1. **纯 OCR**：将像素转化为文本。
2. **版面解析**：将 OCR 输出分组为区域（标题、正文、表格、页眉）。
3. **文档理解**：从版面中提取结构化字段（"invoice_total = $42.50"）。

每一层都有经典和现代的方法，而"我想从图像中获取文本"与"我需要从这张收据中获取总金额"之间的差距比大多数团队意识到的要大。

## 概念

### 经典管线

```mermaid
flowchart LR
    IMG["图像"] --> DET["文本检测<br/>（DB, EAST, CRAFT）"]
    DET --> BOX["单词/行<br/>边界框"]
    BOX --> CROP["裁剪每个区域"]
    CROP --> REC["识别<br/>（CRNN + CTC）"]
    REC --> TXT["文本字符串"]
    TXT --> LAY["版面<br/>排序"]
    LAY --> OUT["阅读顺序文本"]

    style DET fill:#dbeafe,stroke:#2563eb
    style REC fill:#fef3c7,stroke:#d97706
    style OUT fill:#dcfce7,stroke:#16a34a
```

- **文本检测** 生成每行或每词的四边形。
- **识别** 将每个区域裁剪为固定高度，运行 CNN + BiLSTM + CTC 以生成字符序列。
- **版面** 重建阅读顺序（拉丁字母从上到下、从左到右；阿拉伯语、日语不同）。

### CTC 概述

OCR 识别从固定长度的特征图生成变长序列。CTC（Graves 等人，2006）让你可以在没有字符级对齐的情况下训练它。模型在每个时间步输出（词汇表 + 空白）上的分布；CTC 损失对所有在合并重复和移除空白后能简化为目标文本的对齐进行边缘化。

```
原始输出："h h h _ _ e e l l _ l l o _ _"
合并重复并移除空白后："hello"
```

CTC 是 CRNN 在 2015 年成功的原因，并且至今仍训练着大多数生产 OCR 模型。

### 现代端到端模型

- **Donut**（Kim 等人，2022）—— ViT 编码器 + 文本解码器；读取图像并直接输出 JSON。无需文本检测器，无需版面模块。
- **TrOCR** —— ViT + transformer 解码器，用于行级 OCR。
- **Qwen-VL-OCR / InternVL** —— 为 OCR 任务微调的完整视觉语言模型；2026 年复杂文档上的最佳准确率。
- **PaddleOCR** —— 成熟生产包中的经典 DB + CRNN 管线；仍然是开源的主力。

端到端模型需要更多数据和计算，但跳过了多阶段管线的误差累积。

### 版面解析

对于结构化文档，运行版面检测器（LayoutLMv3、DocLayNet），标记每个区域：标题、段落、图形、表格、脚注。然后阅读顺序变成"按版面顺序遍历区域，连接"。

对于表格，使用**键值提取**模型（针对视觉丰富文档的 Donut，针对普通扫描件的 LayoutLMv3）。它们接受图像 + 检测到的文本 + 位置，并预测结构化的键值对。

### 评估指标

- **字符错误率（CER）** —— Levenshtein 距离 / 参考长度。越低越好。生产目标：清洁扫描件 < 2%。
- **词错误率（WER）** —— 词级别的相同指标。
- **结构化字段的 F1** —— 用于键值任务；测量 `{invoice_total: 42.50}` 是否正确出现。
- **JSON 上的编辑距离** —— 用于端到端文档解析；Donut 论文引入了归一化树编辑距离。

## 构建

### 步骤 1：CTC 损失 + 贪心解码器

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


def ctc_loss(log_probs, targets, input_lengths, target_lengths, blank=0):
    """
    log_probs:      (T, N, C) log-softmax 在词汇表上，空白在索引 0
    targets:        (N, S) int 目标（无空白）
    input_lengths:  (N,) 每样本使用的时间步数
    target_lengths: (N,) 每样本目标长度
    """
    return F.ctc_loss(log_probs, targets, input_lengths, target_lengths,
                      blank=blank, reduction="mean", zero_infinity=True)


def greedy_ctc_decode(log_probs, blank=0):
    """
    log_probs: (T, N, C) log-softmax
    returns: 索引序列列表（空白移除，重复合并）
    """
    preds = log_probs.argmax(dim=-1).transpose(0, 1).cpu().tolist()
    out = []
    for seq in preds:
        decoded = []
        prev = None
        for idx in seq:
            if idx != prev and idx != blank:
                decoded.append(idx)
            prev = idx
        out.append(decoded)
    return out
```

`F.ctc_loss` 在可用时使用高效的 CuDNN 实现。贪心解码器比 beam search 简单，通常 CER 在 1% 以内。

### 步骤 2：小型 CRNN 识别器

用于行 OCR 的最小 CNN + BiLSTM。

```python
class TinyCRNN(nn.Module):
    def __init__(self, vocab_size=40, hidden=128, feat=32):
        super().__init__()
        self.cnn = nn.Sequential(
            nn.Conv2d(1, feat, 3, 1, 1), nn.BatchNorm2d(feat), nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(feat, feat * 2, 3, 1, 1), nn.BatchNorm2d(feat * 2), nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(feat * 2, feat * 4, 3, 1, 1), nn.BatchNorm2d(feat * 4), nn.ReLU(inplace=True),
            nn.MaxPool2d((2, 1)),
            nn.Conv2d(feat * 4, feat * 4, 3, 1, 1), nn.BatchNorm2d(feat * 4), nn.ReLU(inplace=True),
            nn.MaxPool2d((2, 1)),
        )
        self.rnn = nn.LSTM(feat * 4, hidden, bidirectional=True, batch_first=True)
        self.head = nn.Linear(hidden * 2, vocab_size)

    def forward(self, x):
        # x: (N, 1, H, W)
        f = self.cnn(x)                # (N, C, H', W')
        f = f.mean(dim=2).transpose(1, 2)  # (N, W', C)
        h, _ = self.rnn(f)
        return F.log_softmax(self.head(h).transpose(0, 1), dim=-1)  # (W', N, vocab)
```

固定高度输入（CNN 最大池化将高度降为 1）。宽度是 CTC 的时间维度。

### 步骤 3：合成 OCR

生成白底黑色数字字符串用于端到端冒烟测试。

```python
import numpy as np

def synthetic_line(text, height=32, char_width=16):
    W = char_width * len(text)
    img = np.ones((height, W), dtype=np.float32)
    for i, c in enumerate(text):
        x = i * char_width
        shade = 0.0 if c.isalnum() else 0.5
        img[6:height - 6, x + 2:x + char_width - 2] = shade
    return img


def build_batch(strings, vocab):
    H = 32
    W = 16 * max(len(s) for s in strings)
    imgs = np.ones((len(strings), 1, H, W), dtype=np.float32)
    target_lengths = []
    targets = []
    for i, s in enumerate(strings):
        imgs[i, 0, :, :16 * len(s)] = synthetic_line(s)
        ids = [vocab.index(c) for c in s]
        targets.extend(ids)
        target_lengths.append(len(ids))
    return torch.from_numpy(imgs), torch.tensor(targets), torch.tensor(target_lengths)


vocab = ["_"] + list("0123456789abcdefghijklmnopqrstuvwxyz")
imgs, targets, lengths = build_batch(["hello", "world"], vocab)
print(f"images: {imgs.shape}   targets: {targets.shape}   lengths: {lengths.tolist()}")
```

真实的 OCR 数据集会添加字体、噪声、旋转、模糊和颜色。上述管线是相同的。

### 步骤 4：训练框架

```python
model = TinyCRNN(vocab_size=len(vocab))
opt = torch.optim.Adam(model.parameters(), lr=1e-3)

for step in range(200):
    strings = ["abc" + str(step % 10)] * 4 + ["xyz" + str((step + 1) % 10)] * 4
    imgs, targets, target_lens = build_batch(strings, vocab)
    log_probs = model(imgs)  # (W', 8, vocab)
    input_lens = torch.full((8,), log_probs.size(0), dtype=torch.long)
    loss = ctc_loss(log_probs, targets, input_lens, target_lens, blank=0)
    opt.zero_grad(); loss.backward(); opt.step()
```

在这个简单的合成数据上，200 步后损失应从 ~3 降至 ~0.2。

## 使用

三个生产路径：

- **PaddleOCR** —— 成熟、快速、多语言。一行用法：`paddleocr.PaddleOCR(lang="en").ocr(image_path)`。
- **EasyOCR** —— Python 原生、多语言、PyTorch 骨干。
- **Tesseract** —— 经典；当模型难以处理老旧扫描文档时仍然有用。

对于端到端文档解析，使用 Donut 或 VLM：

```python
from transformers import DonutProcessor, VisionEncoderDecoderModel

processor = DonutProcessor.from_pretrained("naver-clova-ix/donut-base-finetuned-cord-v2")
model = VisionEncoderDecoderModel.from_pretrained("naver-clova-ix/donut-base-finetuned-cord-v2")
```

对于具有可重复结构的收据、发票和表格，微调 Donut。对于任意文档或需要推理的 OCR，VLM（如 Qwen-VL-OCR）是目前默认选择。

## 交付

本课程产出：

- `outputs/prompt-ocr-stack-picker.md` — 一个提示词，根据文档类型、语言和结构选择 Tesseract / PaddleOCR / Donut / VLM-OCR。
- `outputs/skill-ctc-decoder.md` — 一个技能，从头编写贪心和 beam search CTC 解码器，包括长度归一化。

## 练习

1. **（简单）** 在 5 位随机数字字符串上训练 TinyCRNN 500 步。报告保留集上的 CER。
2. **（中等）** 将贪心解码替换为 beam search（beam_width=5）。报告 CER 差异。在哪些输入上 beam search 胜出？
3. **（困难）** 在一组 20 张收据上使用 PaddleOCR，提取行项目，并针对手工标注的 {item_name, price} 对的真实值计算 F1。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| OCR | "从像素中提取文本" | 将图像区域转化为字符序列 |
| CTC | "无对齐损失" | 无需每时间步标签即可训练序列模型的损失；在所有对齐上边缘化 |
| CRNN | "经典 OCR 模型" | 卷积特征提取器 + BiLSTM + CTC；仍在生产环境中使用的 2015 基线 |
| Donut | "端到端 OCR" | ViT 编码器 + 文本解码器；直接从图像输出 JSON |
| 版面解析 | "找到区域" | 检测并标记文档中的标题/表格/图形/段落区域 |
| 阅读顺序 | "文本序列" | 将识别区域排序为句子；拉丁字母简单，混合布局不简单 |
| CER / WER | "错误率" | 字符或词粒度的 Levenshtein 距离 / 参考长度 |
| VLM-OCR | "会读的 LLM" | 为 OCR 任务训练或提示的视觉语言模型；当前复杂文档上的 SOTA |

## 延伸阅读

- [CRNN (Shi et al., 2015)](https://arxiv.org/abs/1507.05717) — 原始的 CNN+RNN+CTC 架构
- [CTC (Graves et al., 2006)](https://www.cs.toronto.edu/~graves/icml_2006.pdf) — 原始 CTC 论文；密集包含算法思想
- [Donut (Kim et al., 2022)](https://arxiv.org/abs/2111.15664) — 无 OCR 的文档理解 transformer
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) — 开源生产 OCR 框架
