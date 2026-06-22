import numpy as np
from sentence_transformers import SentenceTransformer
import anthropic

model = SentenceTransformer("shibing624/text2vec-base-chinese")
client = anthropic.Anthropic(
    api_key="personal-6d9fb60eca3d0ca7951af4e2d2f85229",
    base_url="http://llmapi.bilibili.co",
)

文档库 = [
    "企业版退款政策：企业客户享有60天退款窗口，按比例退款。需要联系客户经理提交退款申请。",
    "个人版退款政策：个人用户可在购买后14天内申请全额退款。超过14天不予退款。",
    "价格说明：企业版每月299元，年付享8折优惠。个人版每月29元。",
    "技术支持：企业版提供7x24小时电话和邮件支持。个人版仅提供邮件支持，工作日24小时内回复。",
    "数据安全：所有数据采用AES-256加密存储，通过SOC2认证。企业版支持私有化部署。",
]

doc_vectors = model.encode(文档库)


def call(msg):
    r = client.messages.create(
        model="deepseek-v4-flash",
        max_tokens=256,
        messages=[{"role": "user", "content": msg}],
    )
    for b in r.content:
        if hasattr(b, "text"):
            return b.text


# ===== 向量搜索 =====
def 向量搜索(query, top_k=3):
    q_vec = model.encode([query])
    相似度 = (doc_vectors @ q_vec.T).flatten() / (
        np.linalg.norm(doc_vectors, axis=1) * np.linalg.norm(q_vec)
    )
    排名 = np.argsort(相似度)[::-1]
    return [(文档库[i], 相似度[i]) for i in 排名[:top_k]]


# ===== 高级搜索：向量 + 关键词提权 + 兜底 =====
def 高级搜索(query, top_k=2):
    # 第一步：向量搜索
    结果 = 向量搜索(query, top_k=3)

    # 第二步：关键词提权（包含查询中词的文档加分）
    提权后 = []
    for doc, score in 结果:
        extra = 0
        for 词 in query:
            if 词 in doc:
                extra += 0.1
        if "价格" in query and ("元" in doc or "价格" in doc):
            extra += 0.3
        提权后.append((doc, score + extra))
    提权后.sort(key=lambda x: x[1], reverse=True)

    final = 提权后[:top_k]

    # 第三步：如果相关性太低，单独搜价格文档兜底
    if final[0][1] < 0.4:
        print(f"  → 首次搜索结果相关性低，进行兜底搜索")
        兜底结果 = 向量搜索("价格 费用", top_k=1)
        if 兜底结果 and 兜底结果[0][1] > 0.2:
            # 合并，去重
            seen = set(d for d, _ in final)
            for d, s in 兜底结果:
                if d not in seen:
                    final.append((d, s))
            final = final[:top_k]

    return final


# ===== 回答 =====
def 问答(query):
    print(f"\n问题：{query}")
    结果 = 高级搜索(query)
    for doc, score in 结果:
        print(f"  [{score:.3f}] {doc[:40]}...")
    上下文 = "\n".join([doc for doc, _ in 结果])
    prompt = f"根据以下文档回答：\n{上下文}\n\n问题：{query}\n回答："
    r = client.messages.create(
        model="deepseek-v4-flash",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    for b in r.content:
        if hasattr(b, "text"):
            print(f"回答：{b.text}")


问答("个人版多少钱？")
问答("企业版能退款吗？")
问答("数据安全怎么保证？")
