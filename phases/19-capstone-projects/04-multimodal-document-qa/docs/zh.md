# 综合项目 04 — 多模态文档问答（视觉优先的 PDF、表格、图表）

> 2026 年的文档问答前沿已经从 OCR 后接文本转向了视觉优先的后期交互。ColPali、ColQwen2.5 和 ColQwen3-omni 将每个 PDF 页面视为图像，用多向量后期交互进行嵌入，并让查询直接关注图像块。在财务 10-K 报表、科学论文和手写笔记上，这种模式以很大优势击败了 OCR 优先的方法。在 1 万页上端到端地构建这个管道，并与 OCR 后接文本进行并列对比。

**类型：** 综合项目
**语言：** Python（管道），TypeScript（查看器 UI）
**前置知识：** 阶段 4（计算机视觉）、阶段 5（NLP）、阶段 7（Transformer）、阶段 11（LLM 工程）、阶段 12（多模态）、阶段 17（基础设施）
**涉及阶段：** P4 · P5 · P7 · P11 · P12 · P17
**时间：** 30 小时

## 问题

企业拥有大量 OCR 管道无法很好处理的 PDF：带有旋转表格的扫描版 10-K 报表、充满公式的科学论文、只有作为图像才有意义的图表、手写注释。将它们视为纯文本意味着丢失一半的信号。2026 年的答案是原始页面图像上的后期交互多向量检索。ColPali（Illuin Tech）引入了它；ColQwen2.5-v0.2 和 ColQwen3-omni 提高了准确性。在 ViDoRe v3 上，视觉优先的检索以有意义的幅度超过了 OCR 后接文本——而在图表、表格和手写上差距更大。

代价是存储和延迟。一个 ColQwen 嵌入每页约 2048 个图像块向量，而不是单个 1024 维向量。原始存储会膨胀。DocPruner（2026 年）在无测量精度损失的情况下带来 50% 的剪枝。你将索引 1 万页，测量 ViDoRe v3 nDCG@5，在 2s 内提供答案，并直接与 OCR 后接文本基线进行比较。

## 概念

后期交互意味着每个查询 token 与每个图像块 token 进行评分，每个查询 token 的最大分数被求和。你可以在不需要单个池化向量的情况下获得细粒度的匹配。多向量索引（Vespa、Qdrant 多向量或 AstraDB）存储每个图像块的嵌入，并在检索时运行 MaxSim。

回答器是一个视觉语言模型，它接收查询加上 top-k 检索到的页面作为图像，并写出带有证据区域（边界框或页面引用）的答案。Qwen3-VL-30B、Gemini 2.5 Pro 和 InternVL3 是 2026 年的前沿选择。对于公式和科学符号，OCR 后备（Nougat、dots.ocr）作为可选的文本通道拼接进来。

评估是一个二维矩阵。一个轴：内容类型（纯文本段落、密集表格、条形/折线图、手写笔记、公式）。另一个轴：检索方法（视觉优先后期交互 vs OCR 后接文本 vs 混合）。每个单元格获得 nDCG@5 和答案准确率。报告就是交付物。

## 架构

```
PDFs -> page renderer (PyMuPDF, 180 DPI)
           |
           v
  ColQwen2.5-v0.2 embed (multi-vector per page, ~2048 patches)
           |
           +------> DocPruner 50% compression
           |
           v
   multi-vector index (Vespa or Qdrant multi-vector)
           |
query ----+----> retrieve top-k pages (MaxSim)
           |
           v
  VLM answerer: Qwen3-VL-30B | Gemini 2.5 Pro | InternVL3
    inputs: query + top-k page images + optional OCR text
           |
           v
  answer with cited page numbers + evidence regions
           |
           v
  Streamlit / Next.js viewer: highlighted boxes on source page
```

## 技术栈

- 页面渲染：PyMuPDF（fitz），180 DPI，纵向归一化
- 后期交互模型：ColQwen2.5-v0.2 或 ColQwen3-omni（Hugging Face 上的 vidore 团队）
- 索引：带多向量字段的 Vespa，或 Qdrant 多向量，或带 MaxSim 的 AstraDB
- 剪枝：DocPruner 2026 策略（保留高方差图像块，50% 压缩，精度损失 < 0.5%）
- OCR 后备（公式/密集表格）：dots.ocr 或 Nougat
- VLM 回答器：自托管的 Qwen3-VL-30B 或托管的 Gemini 2.5 Pro；InternVL3 作为后备
- 评估：ViDoRe v3 基准、M3DocVQA 用于多页面推理
- 查看器 UI：Next.js 15，使用 canvas 叠加证据区域

## 构建步骤

1. **摄入。** 遍历包含 10-K 报表、科学论文和扫描文档的 1 万页 PDF 语料库。将每页渲染为 1536x2048 PNG。持久化 `{doc_id, page_num, image_path}`。

2. **嵌入。** 在每个页面图像上运行 ColQwen2.5-v0.2。输出形状约 2048 个维度为 128 的图像块嵌入。应用 DocPruner 保留信号最高的半数。写入 Vespa 多向量字段或 Qdrant 多向量。

3. **查询。** 对每个传入查询，用查询塔嵌入（token 级嵌入）。对索引运行 MaxSim：对每个查询 token，取页面图像块嵌入上的最大点积，求和。返回 top-k 页面。

4. **综合。** 使用查询和 top-5 页面图像调用 Qwen3-VL-30B。提示："仅使用提供的页面回答。每个声明引用 (doc_id, page) 并命名区域（图表、表格、段落）。"

5. **证据区域。** 后处理答案以提取引用的区域。如果 VLM 发出边界框（Qwen3-VL 支持），在查看器中将其渲染为叠加层。

6. **OCR 后备。** 对于被识别为公式密集的页面（基于图像方差的启发式），运行 Nougat 或 dots.ocr，并将 OCR 文本作为额外通道与图像一起传入。

7. **评估。** 运行 ViDoRe v3（检索 nDCG@5）和 M3DocVQA（多页面 QA 准确率）。同时在相同语料库上运行 OCR 后接文本管道，使用相同的综合器。生成内容类型 × 方法矩阵。

8. **UI。** 先用 Streamlit 原型；再用 Next.js 15 生产级查看器，支持逐页证据区域叠加。

## 使用方式

```
$ doc-qa ask "what was the 2024 operating margin change for segment EMEA?"
[retrieve]   top-5 pages in 320ms (ColQwen2.5, MaxSim, Vespa)
[synth]      qwen3-vl-30b, 1.4s, cited (form-10k-2024, p. 88) + (..., p. 92)
answer:
  EMEA operating margin moved from 18.2% to 16.8%, a 140bp decline.
  cited: 10-K-2024.pdf p.88 (Table 4, Segment Operating Margin)
         10-K-2024.pdf p.92 (MD&A, Operating Performance)
[viewer]     open with highlighted bounding boxes overlaid on p.88 Table 4
```

## 交付物

`outputs/skill-doc-qa.md` 描述可交付成果：一个面向特定语料库调优、并在 ViDoRe v3 上与 OCR 后接文本基线进行对比评估的视觉优先多模态文档问答系统。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | ViDoRe v3 / M3DocVQA 准确率 | 基准数字 vs OCR 文本基线和已发布排行榜 |
| 20 | 证据区域定位 | 引用的区域中实际包含答案范围的比例 |
| 20 | 存储和延迟工程 | DocPruner 压缩比、索引 p95、答案 p95 |
| 20 | 多页面推理 | 手工标注的 100 问题多页面集上的准确率 |
| 15 | 源码检查用户体验 | 查看器清晰度、叠加保真度、并列对比工具 |
| **100** | | |

## 练习

1. 在同一语料库上测量 ColQwen2.5-v0.2 与 ColQwen3-omni 的对比。哪个页面一个模型正确而另一个遗漏？向索引添加"内容类别"标记以按类型路由。

2. 激进剪枝嵌入（75%、90%）。找到压缩悬崖：ViDoRe nDCG@5 降到 OCR 基线以下的临界点。

3. 构建混合模式：并行运行 OCR 后接文本和 ColQwen，用 RRF 融合，用交叉编码器重排序。混合模式是否比单独任何一种更好？在哪些方面帮助最大？

4. 将 Qwen3-VL-30B 替换为较小的 VLM（Qwen2.5-VL-7B）。测量准确率-每美元曲线。

5. 添加手写笔记支持。渲染手写语料库，用 ColQwen 嵌入，测量检索。与手写 OCR 管道进行比较。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 后期交互 | "ColPali 风格检索" | 查询 token 与页面图像块独立评分；MaxSim 聚合 |
| 多向量 | "每图像块嵌入" | 每个文档有很多向量，而不是一个池化向量 |
| MaxSim | "后期交互评分" | 对每个查询 token，取文档向量上的最大相似度；求和 |
| DocPruner | "图像块压缩" | 2026 年剪枝，保留 50% 图像块，精度损失可忽略 |
| ViDoRe v3 | "文档检索基准" | 2026 年测量视觉文档检索的标准 |
| 证据区域 | "引用的边界框" | 源页面上定位答案范围的包围盒 |
| OCR 后备 | "公式通道" | 用于公式密集或表格密集页面的文本管道，与视觉并行使用 |

## 延伸阅读

- [ColPali（Illuin Tech）仓库](https://github.com/illuin-tech/colpali) — 参考后期交互文档检索
- [ColPali 论文（arXiv:2407.01449）](https://arxiv.org/abs/2407.01449) — 基础方法论文
- [Hugging Face 上的 ColQwen 系列](https://huggingface.co/vidore) — 生产就绪的检查点
- [M3DocRAG（Adobe）](https://arxiv.org/abs/2411.04952) — 多页面多模态 RAG 基线
- [Vespa 多向量教程](https://docs.vespa.ai/en/colpali.html) — 参考服务栈
- [Qdrant 多向量支持](https://qdrant.tech/documentation/concepts/vectors/#multivectors) — 备选索引
- [AstraDB 多向量](https://docs.datastax.com/en/astra-db-serverless/databases/vector-search.html) — 备选托管索引
- [Nougat OCR](https://github.com/facebookresearch/nougat) — 支持公式的 OCR 后备
