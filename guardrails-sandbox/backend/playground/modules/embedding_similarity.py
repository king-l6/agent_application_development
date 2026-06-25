"""Phase 11 / 04-embeddings —— 向量相似度实验

输入两段文本，输出它们的余弦相似度，直观看到「语义接近 = 向量接近」。
复用 guardrails 已经预加载的 shibing624/text2vec-base-chinese 模型（离线）。
"""
import time
import numpy as np

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_score, block_keyvalue,
)


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    dot = float(np.dot(a, b))
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    return dot / (na * nb) if na > 0 and nb > 0 else 0.0


class EmbeddingSimilarity(PlaygroundModule):
    name = "embedding_similarity"
    display_name = "向量相似度"
    description = "输入两段文本，计算它们的余弦相似度（语义越接近，分数越高）"
    phase = "11-llm-engineering"
    lesson = "04-embeddings"
    order = 40

    input_schema = [
        field_spec("text_a", "文本 A", type="textarea",
                   placeholder="例如：我喜欢吃苹果"),
        field_spec("text_b", "文本 B", type="textarea",
                   placeholder="例如：我爱吃水果"),
    ]

    def __init__(self):
        self._model = None

    def _lazy_load(self):
        if self._model is not None:
            return
        from sentence_transformers import SentenceTransformer
        self._model = SentenceTransformer(
            "shibing624/text2vec-base-chinese", local_files_only=True
        )

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        text_a = (inputs.get("text_a") or "").strip()
        text_b = (inputs.get("text_b") or "").strip()

        if not text_a or not text_b:
            return ModuleResult(ok=False, error="请同时填写文本 A 和文本 B")

        self._lazy_load()
        vecs = self._model.encode([text_a, text_b])
        sim = _cosine_sim(vecs[0], vecs[1])

        if sim >= 0.8:
            verdict = "高度相似"
        elif sim >= 0.6:
            verdict = "比较相似"
        elif sim >= 0.4:
            verdict = "有一定关联"
        else:
            verdict = "基本无关"

        latency = (time.time() - start) * 1000
        return ModuleResult(
            ok=True,
            summary=f"余弦相似度 {sim:.4f} —— {verdict}",
            blocks=[
                block_score(sim, "余弦相似度", max_value=1.0, hint=verdict),
                block_keyvalue({
                    "向量维度": len(vecs[0]),
                    "模型": "shibing624/text2vec-base-chinese",
                    "文本 A 长度": len(text_a),
                    "文本 B 长度": len(text_b),
                }, label="细节"),
            ],
            latency_ms=latency,
        )
