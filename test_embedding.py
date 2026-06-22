from sentence_transformers import SentenceTransformer

# 用中文优化过的模型
model = SentenceTransformer("shibing624/text2vec-base-chinese")

句子集 = [
    "我的支付没成功",
    "交易被拒绝了",
    "今天天气真好",
]

vectors = model.encode(句子集)

from sklearn.metrics.pairwise import cosine_similarity
sim = cosine_similarity(vectors)

print("=== 中文模型相似度 ===")
for i, s1 in enumerate(句子集):
    for j, s2 in enumerate(句子集):
        if i < j:
            print(f"'{s1}' ↔ '{s2}'：{sim[i][j]:.3f}")
