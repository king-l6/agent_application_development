// Phase 11 · 04-embeddings —— 向量相似度实验
// 对应后端 embedding_similarity.py。后端实时跑 sentence-transformers 模型，
// 纯前端无法加载模型，故改为：预置句子的真实向量已离线算好（embeddingSnapshot），
// 前端只做余弦相似度计算。选两句看"语义接近 = 向量接近"。
import { embeddingSnapshot } from '../embeddingSnapshot.generated.js'

const SENTS = embeddingSnapshot.sentences
const VECS = embeddingSnapshot.vectors

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  na = Math.sqrt(na); nb = Math.sqrt(nb)
  return na > 0 && nb > 0 ? dot / (na * nb) : 0
}

function run(inputs) {
  const a = (inputs.text_a || '').trim()
  const b = (inputs.text_b || '').trim()
  const ia = SENTS.indexOf(a)
  const ib = SENTS.indexOf(b)
  if (ia < 0 || ib < 0) {
    return { summary: '❌ 请从下拉里选择预置的文本 A 和文本 B', blocks: [] }
  }

  const sim = cosineSim(VECS[ia], VECS[ib])
  let verdict
  if (sim >= 0.8) verdict = '高度相似'
  else if (sim >= 0.6) verdict = '比较相似'
  else if (sim >= 0.4) verdict = '有一定关联'
  else verdict = '基本无关'

  return {
    summary: `余弦相似度 ${sim.toFixed(4)} —— ${verdict}`,
    blocks: [
      { type: 'score', label: '余弦相似度', value: Number(sim.toFixed(4)), max: 1.0, hint: verdict },
      { type: 'keyvalue', label: '细节', items: {
        '向量维度': embeddingSnapshot.dim,
        '模型': embeddingSnapshot.model,
        '文本 A 长度': a.length,
        '文本 B 长度': b.length,
      }},
      { type: 'text', label: '说明',
        content: '这些句子的向量是离线用真实模型 (shibing624/text2vec-base-chinese) 算好的静态快照，前端只算余弦相似度。试试选“我喜欢吃苹果 / 我爱吃水果”(高) 对比“我喜欢吃苹果 / 股票市场大跌”(低)——语义越近向量越近。' },
    ],
  }
}

export default {
  name: 'embedding-similarity',
  displayName: '向量相似度',
  phase: '11-llm-engineering',
  lesson: '04 向量嵌入',
  order: 40,
  description: '选两段预置文本，计算余弦相似度（语义越接近分数越高）。向量为真实模型离线算好的快照。',
  inputs: [
    { name: 'text_a', label: '文本 A', type: 'select', default: SENTS[0], options: SENTS },
    { name: 'text_b', label: '文本 B', type: 'select', default: SENTS[1], options: SENTS },
  ],
  run,
}
