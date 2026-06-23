# 综合项目 08 — 受监管领域的生产级 RAG 聊天机器人

> Harvey、Glean、Mendable 和 LlamaCloud 在 2026 年都运行相同的生产形态。使用 docling 或 Unstructured 进行摄入，使用 ColPali 处理视觉内容。混合搜索。使用 bge-reranker-v2-gemma 重排序。使用带有提示缓存的 Claude Sonnet 4.7 综合，命中率 60-80%。使用 Llama Guard 4 和 NeMo Guardrails 进行防护。使用 Langfuse 和 Phoenix 进行监控。使用 RAGAS 在 200 问题黄金集上进行评分。在受监管领域（法律、临床、保险）中构建一个，综合项目就是通过黄金集、红队测试和漂移仪表盘。

**类型：** 综合项目
**语言：** Python（管道 + API），TypeScript（聊天 UI）
**前置知识：** 阶段 5（NLP）、阶段 7（Transformer）、阶段 11（LLM 工程）、阶段 12（多模态）、阶段 17（基础设施）、阶段 18（安全）
**涉及阶段：** P5 · P7 · P11 · P12 · P17 · P18
**时间：** 30 小时

## 问题

受监管领域的 RAG（法律合同、临床试验方案、保险政策）是 2026 年发货最多的生产形态，因为 ROI 显而易见，风险具体可感。Harvey（Allen & Overy）为法律构建了它。Mendable 发布了开发者文档版本。Glean 覆盖了企业搜索。模式是：高保真摄入、混合检索加重排序、带有引用强制和提示缓存的综合、多层安全防护、持续漂移监控。

难点不在于模型。而在于管辖区域感知的合规性（HIPAA、GDPR、SOC2）、引用级可审计性、成本控制（提示缓存在命中率高时带来 60-90% 的折扣）、通过 RAGAS 忠实度进行的幻觉检测，以及当源文档更新而索引未跟上时的漂移检测。这个综合项目要求你在 200 问题黄金集和附带红队套件上交付所有这些。

## 概念

管道有两面。**摄入**：docling 或 Unstructured 解析结构化文档；ColPali 处理视觉丰富的文档；块获得摘要、标签和基于角色的访问标签。向量进入 pgvector + pgvectorscale（低于 5000 万向量）或 Qdrant Cloud；稀疏 BM25 并行运行。**对话**：LangGraph 处理记忆和多轮对话；每个查询运行混合检索、用 bge-reranker-v2-gemma-2b 重排序、用 Claude Sonnet 4.7（提示缓存）综合、将输出通过 Llama Guard 4 和 NeMo Guardrails、发出引用锚定的响应。

评估栈有四层。**黄金集**（200 个带引用的标签化问答对）用于正确性。**红队**（越狱、PII 提取尝试、领域外问题）用于安全性。**RAGAS** 用于自动每轮忠实度/答案相关性/上下文精确度。**漂移仪表盘**（Arize Phoenix）每周监控检索质量和幻觉分数。

提示缓存是成本杠杆。Claude 4.5+ 和 GPT-5+ 支持缓存系统提示 + 检索到的上下文。在 60-80% 的命中率下，每次查询成本下降 3-5 倍。管道必须为稳定的前缀设计（系统提示 + 重排序后的上下文优先），以实现高缓存命中率。

## 架构

```
documents (contracts, protocols, policies)
      |
      v
docling / Unstructured parse + ColPali for visuals
      |
      v
chunks + summaries + role-labels + jurisdiction tags
      |
      v
pgvector + pgvectorscale  +  BM25 (Tantivy)
      |
query + role + jurisdiction
      |
      v
LangGraph conversational agent
   +--- retrieve (hybrid)
   +--- filter by role + jurisdiction
   +--- rerank (bge-reranker-v2-gemma-2b or Voyage rerank-2)
   +--- synthesize (Claude Sonnet 4.7, prompt cached)
   +--- guard (Llama Guard 4 + NeMo Guardrails + Presidio output PII scrub)
   +--- cite + return
      |
      v
eval:
  RAGAS faithfulness / answer_relevance / context_precision (online)
  Langfuse annotation queue (sampled)
  Arize Phoenix drift (weekly)
  red team suite (pre-release)
```

## 技术栈

- 摄入：Unstructured.io 或 docling 用于结构化文档；ColPali 用于视觉丰富的 PDF
- 向量数据库：5000 万向量以下使用 pgvector + pgvectorscale；否则使用 Qdrant Cloud
- 稀疏：Tantivy BM25 带字段权重
- 编排：LlamaIndex Workflows（摄入）+ LangGraph（对话）
- 重排序器：自托管 bge-reranker-v2-gemma-2b 或托管 Voyage rerank-2
- LLM：带提示缓存的 Claude Sonnet 4.7；后备自托管 Llama 3.3 70B
- 评估：RAGAS 0.2 在线，DeepEval 用于幻觉和越狱套件
- 可观测性：自托管 Langfuse 带标注队列；Arize Phoenix 用于漂移
- 防护栏：Llama Guard 4 输入/输出分类器、NeMo Guardrails v0.12 策略、Presidio PII 擦除
- 合规：块上的基于角色的访问标签；GDPR/HIPAA 的管辖区域标签

## 构建步骤

1. **摄入。** 使用 Unstructured 或 docling 解析你的语料库（严肃构建需 1000-10000 个文档）。对于扫描/视觉密集的页面，通过 ColPali 路由。生成带有摘要、角色标签、管辖区域标签的块。

2. **索引。** 稠密嵌入（Voyage-3 或 Nomic-embed-v2）进入 pgvector + pgvectorscale。通过 Tantivy 的 BM25 侧索引。角色和管辖区域过滤器作为载荷。

3. **混合检索。** 首先按角色+管辖区域过滤；然后并行稠密 + BM25；用倒数排名融合合并；top-20 给重排序器；top-5 给综合器。

4. **带提示缓存的综合。** 系统提示 + 静态策略在缓存头部；重排序后的上下文作为缓存扩展；用户问题作为未缓存的后缀。稳定状态下目标 60-80% 缓存命中率。

5. **防护栏。** Llama Guard 4 在输入上；NeMo Guardrails 规则阻止领域外问题或策略禁止的话题；Presidio 擦除输出中意外的 PII；引用强制后置过滤器。

6. **黄金集。** 由领域专家标注的 200 个问答对，包含（答案、引用）。在精确引用匹配、答案正确性、忠实度（RAGAS）上对 Agent 评分。

7. **红队。** 50 个对抗性提示：越狱（PAIR、TAP）、PII 外泄尝试、领域外、跨管辖区域泄露。通过/失败和严重性评分。

8. **漂移仪表盘。** Arize Phoenix 跟踪检索质量（nDCG、引用忠实度）每周。5% 下降时发出警报。

9. **成本报告。** Langfuse：提示缓存命中率、每次查询 token、按阶段的 $/query 分解。

## 使用方式

```
$ chat --role=analyst --jurisdiction=GDPR
> what is the data-retention obligation for EU user profiles under our contract?
[retrieve]  hybrid top-20 filtered to GDPR + analyst-role
[rerank]    top-5 kept
[synth]     claude-sonnet-4.7, cache hit 74%, 0.8s
answer:
  The contract (Section 12.4, Master Services Agreement dated 2024-03-11)
  obligates EU user profile deletion within 30 days of termination per GDPR
  Article 17. The DPA amendment (DPA-v2.1, Section 5) extends this to 14 days
  for "restricted" category data.
  citations: [MSA-2024-03-11 s12.4, DPA-v2.1 s5]
```

## 交付物

`outputs/skill-production-rag.md` 描述可交付成果。一个部署的受监管领域聊天机器人，带有合规标签、通过评分标准、带有实时漂移监控。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | RAGAS 忠实度 + 答案相关性 | 黄金集（200 问答）上的在线得分 |
| 20 | 引用正确性 | 具有可验证源锚点的答案比例 |
| 20 | 防护栏覆盖率 | Llama Guard 4 通过率 + 越狱套件结果 |
| 20 | 成本/延迟工程 | 提示缓存命中率、p95 延迟、$/query |
| 15 | 漂移监控仪表盘 | 带每周检索质量趋势的 Phoenix 实时仪表盘 |
| **100** | | |

## 练习

1. 构建第二个不同管辖区域的语料库切片（例如，HIPAA 与 GDPR 并列）。演示角色+管辖区域过滤防止交叉泄露（20 题跨管辖区域探测）。

2. 测量一周生产流量中的提示缓存命中率。识别哪些查询破坏了缓存前缀。重新组织。

3. 添加带 10k token 摘要缓冲区的多轮记忆。测量随着对话增长忠实度是否下降。

4. 将 Claude Sonnet 4.7 替换为自托管的 Llama 3.3 70B。测量 $/query 和忠实度差异。

5. 添加"不确定"模式：如果 top 重排序分数低于阈值，Agent 说"我没有可信的引用"而不是回答问题。测量误自信降低。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 提示缓存 | "缓存的系统 + 上下文" | Claude/OpenAI 功能：缓存前缀 token 在命中时折扣 60-90% |
| RAGAS | "RAG 评估器" | 忠实度、答案相关性、上下文精确度的自动评分 |
| 黄金集 | "标记化评估" | 200+ 专家标记的问答对，带有引用；ground truth |
| 管辖区域标签 | "合规标签" | 附加到块的 GDPR/HIPAA/SOC2 范围；由检索过滤器强制执行 |
| 引用忠实度 | "接地答案率" | 由可检索源范围支持的声明比例 |
| 漂移 | "检索质量衰减" | nDCG 或引用分数的每周变化；警报阈值 5% |
| 红队 | "对抗性评估" | 发布前对越狱、PII 提取、领域外问题的探测 |

## 延伸阅读

- [Harvey AI](https://www.harvey.ai) — 参考法律生产栈
- [Glean 企业搜索](https://www.glean.com) — 企业级 RAG 参考
- [Mendable 文档](https://mendable.ai) — 开发者文档 RAG 参考
- [LlamaCloud Parse + Index](https://docs.llamaindex.ai/en/stable/examples/llama_cloud/llama_parse/) — 托管摄入
- [Anthropic 提示缓存](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — 成本杠杆参考
- [RAGAS 0.2 文档](https://docs.ragas.io/) — 规范 RAG 评估框架
- [Arize Phoenix](https://github.com/Arize-ai/phoenix) — 参考漂移可观测性
- [Llama Guard 4](https://ai.meta.com/research/publications/llama-guard-4/) — 2026 年安全分类器
- [NeMo Guardrails v0.12](https://docs.nvidia.com/nemo-guardrails/) — 策略规则框架
