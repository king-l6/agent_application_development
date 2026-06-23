# 综合项目 02 — 基于代码库的 RAG（跨仓库语义搜索）

> 2026 年，每个严肃的工程组织都在运行内部代码搜索，它理解的是含义而不仅仅是字符串。Sourcegraph Amp、Cursor 的代码库问答、Augment 的企业知识图谱、Aider 的仓库地图、Pinterest 的内部 MCP——都是相同的形态。摄入多个仓库，用 tree-sitter 解析，嵌入函数级和类级块，混合搜索，重排序，用引用来源回答。这个综合项目要求你构建一个能处理 10 个仓库中 200 万行代码的系统，并在每次 git 推送时进行增量重新索引。

**类型：** 综合项目
**语言：** Python（摄入），TypeScript（API + UI）
**前置知识：** 阶段 5（NLP 基础）、阶段 7（Transformer）、阶段 11（LLM 工程）、阶段 13（工具）、阶段 17（基础设施）
**涉及阶段：** P5 · P7 · P11 · P13 · P17
**时间：** 30 小时

## 问题

到 2026 年，每个前沿编码 Agent 都配备了代码库检索层，因为仅靠上下文窗口无法解决跨仓库问题。Claude 的 100 万 token 上下文有帮助，但并未消除对排序检索的需求。原始块上的朴素余弦搜索会在生成的代码、单体仓库重复以及罕见的导入符号长尾上产生有毒的结果。生产的答案是 AST 感知块上的混合（稠密 + BM25）搜索，带有重排序器和符号引用图。

你通过索引一个真实的代码群——而不是一个教程仓库——并测量 MRR@10、引用忠实度和增量新鲜度来学习这一点。失败模式是基础设施层面的：一个 10 万文件的单体仓库、一次触碰半数文件的推送、一个需要跨越四个仓库才能正确回答的查询。

## 概念

一个 AST 感知的摄入管道使用 tree-sitter 解析每个文件，提取函数和类节点，并在节点边界处而不是固定 token 窗口处进行分块。每个块获得三种表示：稠密嵌入（Voyage-code-3 或 nomic-embed-code）、稀疏 BM25 项和一个简短的自然语言摘要。摘要增加了第三种可检索模态——用户问"X 是如何授权的"，摘要提到"授权"，即使代码中只有 `check_permission`。

检索是混合的。查询同时触发稠密和 BM25 搜索，合并 top-k，并将并集交给交叉编码器重排序器（Cohere rerank-3 或 bge-reranker-v2-gemma-2b）。重排序后的列表交给长上下文综合器（带有提示缓存的 Claude Sonnet 4.7，或自托管的 Llama 3.3 70B），并要求每个声明都引用文件和行范围。没有引用的答案会被后置过滤器拒绝。

增量新鲜度是基础设施问题。Git 推送触发差异：哪些文件变更了，哪些符号变更了。只有受影响的块需要重新嵌入。受影响的跨文件符号边（导入、方法调用）被重新计算。索引保持一致，无需每次提交都重新处理 200 万行。

## 架构

```
git push --> webhook --> ingest worker (LlamaIndex Workflow)
                           |
                           v
             tree-sitter parse + AST chunk
                           |
            +--------------+----------------+
            v              v                v
          dense        BM25 index       summary (LLM)
        (Voyage / bge)  (Tantivy)        (Haiku 4.5)
            |              |                |
            +------> Qdrant / pgvector <----+
                            |
                            v
                      symbol graph (Neo4j / kuzu)
                            |
  query --> LangGraph agent (retrieve -> rerank -> synth)
                            |
                            v
                 Claude Sonnet 4.7 1M context
                            |
                            v
                 answer + file:line citations
```

## 技术栈

- 解析：tree-sitter，支持 17 种语言语法（Python、TS、Rust、Go、Java、C++ 等）
- 稠密嵌入：Voyage-code-3（托管）或 nomic-embed-code-v1.5（自托管），bge-code-v1 作为后备
- 稀疏索引：Tantivy（Rust），使用 BM25F，符号名 vs 正文的字段加权
- 向量数据库：Qdrant 1.12 混合搜索，或适用于 5000 万以下向量的 pgvector + pgvectorscale
- 块摘要模型：Claude Haiku 4.5 或 Gemini 2.5 Flash，提示缓存
- 重排序器：Cohere rerank-3 或自托管的 bge-reranker-v2-gemma-2b
- 编排：摄入使用 LlamaIndex Workflows，查询 Agent 使用 LangGraph
- 综合器：Claude Sonnet 4.7（100 万上下文），带提示缓存
- 符号图：Neo4j（托管）或 kuzu（嵌入），用于导入和调用边
- 可观测性：Langfuse span，覆盖每个检索和综合步骤

## 构建步骤

1. **摄入遍历器。** 在每个推送钩子上迭代 git 历史。收集变更的文件。对每个文件使用 tree-sitter 解析，提取函数和类节点及其完整源代码跨度。发出块记录 `{repo, path, start_line, end_line, symbol, body}`。

2. **块摘要器。** 将块批量送入 Haiku 4.5 调用，使用系统前言的提示缓存。提示："用一句话总结这个函数，说明其公共约定和副作用。"将摘要与块一起存储。

3. **嵌入池。** 两个并行队列：稠密（Voyage-code-3 批次 128）和摘要（相同模型，但用于摘要字符串）。将向量写入 Qdrant，载荷包含 `{repo, path, start_line, end_line, symbol, kind}`。

4. **BM25 索引。** 字段加权的 Tantivy 索引：符号名权重 4，符号正文权重 1，摘要权重 2。支持"查找名为 X 的函数"查询和"查找执行 X 的函数"查询。

5. **符号图。** 对每个块记录边：导入（此文件使用来自仓库 Z 的符号 Y）、调用（此函数调用类 C 上的方法 M）、继承。存储在 kuzu 中。查询时用于扩展跨仓库边界的检索。

6. **查询 Agent。** 包含三个节点的 LangGraph。`retrieve` 并行触发稠密 + BM25，按 `(repo, path, symbol)` 去重。`rerank` 在 top-50 上运行交叉编码器，保留 top-10。`synth` 使用上下文中重排序后的块调用 Claude Sonnet 4.7，缓存系统提示，要求文件:行引用。

7. **引用强制。** 解析模型输出；任何没有 `(repo/path:start-end)` 锚点的声明会被标记为重新询问或丢弃。只向用户返回有引用的答案。

8. **增量重新索引。** 在每个 webhook 上，计算符号级别的差异。只重新嵌入文本发生变化的块。为导入发生变化的块重新计算符号边。衡量标准：50 个文件的推送在 200 万行代码库上 60 秒内重新索引完成。

9. **评估。** 用黄金文件:行答案标注 100 个跨仓库问题。测量 MRR@10、nDCG@10、引用忠实度（具有可验证锚点的声明比例）和 p50/p99 延迟。

## 使用方式

```
$ code-rag ask "how is S3 multipart abort wired into our retry budget?"
[retrieve]  12 chunks dense + 7 chunks bm25, 16 unique after dedup
[rerank]    top-5 kept (cohere rerank-3)
[synth]     claude-sonnet-4.7, cache hit rate 68%, 2.1s
answer:
  Multipart aborts are triggered by `AbortMultipartOnFail` in
  services/uploader/retry.go:122-148, which decrements the per-bucket
  retry budget defined in config/budgets.yaml:34-51 ...
  citations: [services/uploader/retry.go:122-148, config/budgets.yaml:34-51,
              libs/s3client/multipart.ts:44-61]
```

## 交付物

可交付的技能文件 `outputs/skill-codebase-rag.md`。给定一个仓库集合，它搭建摄入管道、混合索引和查询 Agent，并为任何跨仓库问题返回带引用的答案。评分标准：

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | 检索质量 | 100 问题保留集上的 MRR@10 和 nDCG@10 |
| 20 | 引用忠实度 | 具有可验证文件:行锚点的答案声明比例 |
| 20 | 延迟和规模 | 在索引语料库大小上 p95 查询延迟 @ 10k QPS |
| 20 | 增量索引正确性 | 从 git 推送到可搜索的时间（50 文件提交） |
| 15 | 用户体验和答案格式 | 引用可点击性、代码片段预览、追问能力 |
| **100** | | |

## 练习

1. 将 Voyage-code-3 替换为自托管的 nomic-embed-code。测量 MRR@10 差异。报告启用重排序后差距是否缩小。

2. 在语料库中注入 20% 的生成代码（LLM 生产的样板代码）并重新评估。观察检索中毒。向载荷添加"generated"标记并降低这些命中的权重。

3. 在你的语料库大小上基准测试 Qdrant 混合搜索与 pgvector + pgvectorscale。报告批次大小为 1 时的 p99。

4. 添加基于采样的漂移检查：每周重新运行 100 问题评估。在 MRR@10 下降 > 5% 时发出警报。

5. 扩展为跨语言符号解析：一个调用 Go 服务的 Python 函数（通过 gRPC）。使用符号图来链接它们。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| AST 感知分块 | "函数级分割" | 在 tree-sitter 节点边界处切割代码，而不是固定的 token 窗口 |
| 混合搜索 | "稠密 + 稀疏" | 并行运行 BM25 和向量搜索，合并 top-k，重排序 |
| 交叉编码器重排序 | "第二阶段排序" | 模型同时对每个（查询、候选）对评分，比余弦更准确 |
| 提示缓存 | "缓存的系统提示" | 2026 年 Claude/OpenAI 功能，重复前缀 token 最多折扣 90% |
| 符号图 | "代码图" | 跨文件和仓库的导入、调用、继承边 |
| 引用忠实度 | "接地答案率" | 用户可以通过点击锚点并阅读引用的代码片段来验证的声明比例 |
| 增量重新索引 | "推送到搜索时间" | 从 git 推送到变更的符号可查询的挂钟时间 |

## 延伸阅读

- [Sourcegraph Amp](https://ampcode.com) — 生产级跨仓库代码智能
- [Sourcegraph Cody RAG 架构](https://sourcegraph.com/blog/how-cody-understands-your-codebase) — 本综合项目的参考深度解读
- [Aider repo-map](https://aider.chat/docs/repomap.html) — tree-sitter 排序的仓库视图
- [Augment Code 企业知识图谱](https://www.augmentcode.com) — 商业符号图 RAG
- [Qdrant 混合搜索文档](https://qdrant.tech/documentation/concepts/hybrid-queries/) — 参考实现
- [Voyage AI 代码嵌入](https://docs.voyageai.com/docs/embeddings) — Voyage-code-3 详情
- [Cohere rerank-3](https://docs.cohere.com/reference/rerank) — 交叉编码器参考
- [Pinterest MCP 内部搜索](https://medium.com/pinterest-engineering) — 内部平台参考
