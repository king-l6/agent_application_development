"""
PDF 扫描件/电子件处理（EasyOCR 版）
自动检测 PDF 类型，图片型 OCR、文字型直接提取
"""
import os

# ===== 环境配置（在 import 其他库之前执行） =====
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")   # HuggingFace 国内镜像
os.environ.setdefault("PYTORCH_MPS_PIN_MEMORY", "0")            # 关掉 MPS 上不支持的 pin_memory 警告

import fitz
from PIL import Image
import easyocr
import io
import numpy as np
from sentence_transformers import SentenceTransformer
import hashlib

# ===== 模型初始化（带本地缓存 fallback） =====
MODEL_NAME = "shibing624/text2vec-base-chinese"
LOCAL_PATH = "./local_models/text2vec-base-chinese"

try:
    model = SentenceTransformer(MODEL_NAME)
except Exception:
    print(f"在线加载失败，尝试本地路径: {LOCAL_PATH}")
    try:
        model = SentenceTransformer(LOCAL_PATH)
    except Exception:
        print(f"本地也没有，请先手动下载：HF_ENDPOINT=https://hf-mirror.com python3 -c \"from sentence_transformers import SentenceTransformer; SentenceTransformer('{MODEL_NAME}').save_pretrained('{LOCAL_PATH}')\"")
        raise

# 初始化 EasyOCR（gpu=True 会走 MPS 加速）
ocr = easyocr.Reader(["ch_sim", "en"], gpu=True)


def 判断pdf类型(pdf路径):
    """检测 PDF 是「电子版」还是「扫描件」

    原理：取前 3 页尝试提取文字，平均每页 > 50 字就算电子版
    """
    doc = fitz.open(pdf路径)
    总文字 = 0
    取样页数 = min(3, len(doc))

    for i in range(取样页数):
        总文字 += len(doc[i].get_text().strip())

    doc.close()
    平均字数 = 总文字 / 取样页数

    if 平均字数 > 50:
        return "电子版"
    else:
        return "扫描件"


def pdf提取文字_电子版(pdf路径):
    """电子版 PDF：直接提取文字"""
    doc = fitz.open(pdf路径)
    全部文字 = []

    for 页码, 页 in enumerate(doc):
        文字 = 页.get_text().strip()
        全部文字.append({
            "页码": 页码 + 1,
            "文字": 文字 if 文字 else "(空页)",
        })

    return 全部文字


def pdf扫描件转文字(pdf路径, 置信度阈值=0.5, dpi=300):
    """图片型 PDF：每页转图片 → OCR 识别

    参数
    - 置信度阈值：0.3（宽松）~ 0.7（严格），默认 0.5
    - dpi：200~300 够用，越大越慢
    """
    doc = fitz.open(pdf路径)
    全部文字 = []

    for 页码, 页 in enumerate(doc):
        print(f"  正在处理第 {页码+1}/{len(doc)} 页...")

        pix = 页.get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes("png")))

        result = ocr.readtext(np.array(img))

        文字行 = []
        for line in result:
            识别的文字 = line[1]
            置信度 = line[2]
            if 置信度 > 置信度阈值:
                文字行.append(识别的文字)

        全部文字.append({
            "页码": 页码 + 1,
            "文字": "\n".join(文字行),
        })

    return 全部文字


def 切块_按段落(页列表, 每块最大字数=500):
    """按段落切块，不切断语义

    策略：段落（空行分隔）微块 → 合并到接近上限 → 保留上下文
    """
    块列表 = []
    缓存块 = ""
    块序号 = 0
    当前页 = 1

    for 页 in 页列表:
        文字 = 页["文字"]
        if not 文字 or 文字 == "(空页)":
            continue

        段落 = [p.strip() for p in 文字.split("\n") if p.strip()]

        for 段 in 段落:
            # 单段超长 → 硬切
            if len(段) > 每块最大字数:
                # 先把缓存里已有的内容落盘
                if 缓存块.strip():
                    块列表.append({
                        "text": 缓存块.strip(),
                        "page": 当前页,
                        "chunk_index": 块序号,
                    })
                    块序号 += 1
                    缓存块 = ""

                # 长段硬切成块
                start = 0
                while start < len(段):
                    块列表.append({
                        "text": 段[start:start + 每块最大字数],
                        "page": 页["页码"],
                        "chunk_index": 块序号,
                    })
                    块序号 += 1
                    start += 每块最大字数
                continue

            # 加到缓存不超过上限 → 合并
            if len(缓存块) + len(段) < 每块最大字数:
                缓存块 += 段 + "\n"
            else:
                # 缓存满了 → 落盘
                if 缓存块.strip():
                    块列表.append({
                        "text": 缓存块.strip(),
                        "page": 当前页,
                        "chunk_index": 块序号,
                    })
                    块序号 += 1
                缓存块 = 段 + "\n"

            当前页 = 页["页码"]

    # 最后剩余缓存
    if 缓存块.strip():
        块列表.append({
            "text": 缓存块.strip(),
            "page": 当前页,
            "chunk_index": 块序号,
        })

    return 块列表


# ===== 演示 =====
if __name__ == "__main__":
    pdf文件 = "zqB10617.pdf"

    print("=" * 50)
    print("  PDF 扫描件/电子件 → 文字 → 向量 → 搜索")
    print("=" * 50)

    # 1. 判断类型
    print("\n1. 判断 PDF 类型...")
    pdf类型 = 判断pdf类型(pdf文件)
    print(f"   检测结果: {pdf类型}")

    # 2. 提取文字
    try:
        if pdf类型 == "电子版":
            print("\n2. 直接提取文字...")
            页内容 = pdf提取文字_电子版(pdf文件)
        else:
            print("\n2. OCR 识别中（置信度阈值=0.5, DPI=300）...")
            页内容 = pdf扫描件转文字(pdf文件)

        print("\n3. 按段落切块中...")
        块 = 切块_按段落(页内容)

        print(f"\n4. 向量化中（共 {len(块)} 块）...")
        for i, b in enumerate(块):
            b["向量"] = model.encode([b["text"]])[0]
            b["md5"] = hashlib.md5(b["text"].encode()).hexdigest()
            print(f"   块 {i+1}（第{b['page']}页）→ 向量维度: {len(b['向量'])}")

        print("\n5. 搜索测试")
        查询 = "合同金额是多少？"
        q_vec = model.encode([查询])[0]
        print(f"   查询: {查询}")

        结果 = []
        for b in 块:
            相似度 = np.dot(q_vec, b["向量"]) / (
                np.linalg.norm(q_vec) * np.linalg.norm(b["向量"])
            )
            结果.append((相似度, b))

        结果.sort(key=lambda x: x[0], reverse=True)

        for 相似度, b in 结果[:3]:
            print(f"\n   [相似度: {相似度:.3f}] 第{b['page']}页 块{b['chunk_index']}")
            print(f"   内容: {b['text'][:200]}...")

        # 6. 输出验证文件
        print("\n6. 输出 OCR 结果到 txt（方便肉眼校验）...")
        for 页 in 页内容:
            with open(f"page_{页['页码']}_ocr.txt", "w", encoding="utf-8") as f:
                f.write(页["文字"])
            print(f"   已保存 page_{页['页码']}_ocr.txt")

    except FileNotFoundError:
        print(f"\n  没找到 {pdf文件}")
        print("  请把扫描件 PDF 放在当前目录")
