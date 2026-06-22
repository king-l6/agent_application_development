import anthropic
import hashlib
import numpy as np
from sentence_transformers import SentenceTransformer

client = anthropic.Anthropic(
    api_key="personal-6d9fb60eca3d0ca7951af4e2d2f85229",
    base_url="http://llmapi.bilibili.co",
)

# 加载embedding模型用于语义缓存
embedder = SentenceTransformer("shibing624/text2vec-base-chinese")

def call(msg):
    r = client.messages.create(model="deepseek-v4-flash", max_tokens=512, messages=[{"role": "user", "content": msg}])
    for b in r.content:
        if hasattr(b, "text"): return b.text

# ===== 语义缓存 =====
class 语义缓存:
    def __init__(self, 阈值=0.85):
        self.缓存 = []  # 存 (问题向量, 回答)
        self.阈值 = 阈值

    def 获取(self, 问题):
        问题向量 = embedder.encode([问题])[0]
        for 缓存向量, 缓存回答 in self.缓存:
            相似度 = np.dot(问题向量, 缓存向量) / (
                np.linalg.norm(问题向量) * np.linalg.norm(缓存向量)
            )
            if 相似度 > self.阈值:
                return 缓存回答, 相似度
        return None, 0

    def 保存(self, 问题, 回答):
        问题向量 = embedder.encode([问题])[0]
        self.缓存.append((问题向量, 回答))


缓存 = 语义缓存()

def 智能问答(问题):
    # 先查缓存
    缓存回答, 相似度 = 缓存.获取(问题)
    if 缓存回答:
        print(f"[缓存命中] 相似度={相似度:.2f}")
        return 缓存回答

    # 缓存没有，调API
    print("[未命中] 调API...")
    回答 = call(问题)
    缓存.保存(问题, 回答)
    return 回答


# ===== 测试 =====
print("第一次提问：")
r1 = 智能问答("个人版多少钱？")
print(f"回答：{r1[:50]}...\n")

print("第二次提问（换说法）：")
r2 = 智能问答("个人版售价是多少")
print(f"回答：{r2[:50]}...\n")

print(f"缓存大小：{len(缓存.缓存)} 条,{缓存.缓存}")
