# 语音识别（ASR）—— CTC、RNN-T、注意力机制

> 语音识别是每个时间步的音频分类，由一个知道英语和静音的序列模型粘合在一起。CTC、RNN-T 和注意力机制是三种实现方式。选择一种并理解为什么。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 02（频谱图与 Mel），阶段 5 · 08（文本的 CNN 与 RNN），阶段 5 · 10（注意力机制）
**时间：** ~45 分钟

## 问题

你有一个 10 秒的 16 kHz 片段。你想要一个字符串："turn on the kitchen lights"。挑战在于结构性的：音频帧与字符并非一一对齐。单词"okay"可能耗时 200 ms 或 1200 ms。静音标志话语的边界。一些音素比其他音素长。输出 token 的数量事先未知。

三种公式化方法解决了这个问题：

1. **CTC（连接主义时序分类）。** 输出每帧的 token 概率，包括一个特殊的*空白*。解码时折叠重复和空白。非自回归，速度快。被 wav2vec 2.0、MMS 使用。
2. **RNN-T（循环神经网络转导器）。** 联合网络根据编码器帧和之前的 token 预测下一个 token。可流式。被谷歌的设备端 ASR、NVIDIA Parakeet 使用。
3. **注意力编码器-解码器。** 编码器将音频压缩为隐藏状态，解码器通过交叉注意力自回归地生成 token。被 Whisper、SeamlessM4T 使用。

2026 年，LibriSpeech test-clean 上的最优 WER 为 1.4%（Parakeet-TDT-1.1B，NVIDIA）和 1.58%（Whisper-Large-v3-turbo）。差异微小；部署差异巨大。

## 概念

![三种 ASR 公式化：CTC、RNN-T、注意力编码器-解码器](../assets/asr-formulations.svg)

**CTC 直觉。** 让编码器输出 `T` 个帧级分布，覆盖 `V+1` 个 token（V 个字符 + 空白）。对于长度为 `U < T` 的目标字符串 `y`，任何能折叠为 `y` 的帧对齐方式都算数。CTC 损失对所有这样的对齐方式求和。推理：每帧 argmax，折叠重复，移除空白。

优点：非自回归、可流式、零前向注视。缺点：*条件独立性假设* —— 每帧预测独立于其他帧，因此没有内部语言模型。通过外部 LM 的波束搜索或浅融合来修复。

**RNN-T 直觉。** 增加了一个*预测器*网络来嵌入 token 历史，以及一个*连接器*将预测器状态与编码器帧结合成 `V+1` 上的联合分布（`+1` 是空/不发射）。显式建模了 CTC 忽略的条件依赖。可流式，因为每一步只依赖于过去的帧和过去的 token。

优点：可流式 + 内部 LM。缺点：训练更复杂且内存消耗更大（3D 损失格）；RNN-T 损失内核本身就是一个完整的库类别。

**注意力编码器-解码器。** 编码器（6-32 层 Transformer）处理对数 Mel 帧。解码器（6-32 层 Transformer）通过交叉注意力关注编码器输出，自回归地生成 token。无对齐约束 —— 注意力可以查看音频中的任何位置。除非限制注意力（分块 Whisper-Streaming，2024），否则不可流式。

优点：离线 ASR 质量最高，使用标准的 seq2seq 工具易于训练。缺点：自回归延迟与输出长度成正比；不经工程处理无法流式。

### WER：唯一重要的数字

**词错误率** = `(S + D + I) / N`，其中 S=替换、D=删除、I=插入、N=参考词数。匹配词级别的 Levenshtein 编辑距离。越低越好。WER 高于 20% 通常不可用；低于 5% 是朗读语音的人类水平。2026 年标准基准上的数据：

| 模型 | LibriSpeech test-clean | LibriSpeech test-other | 大小 |
|-------|------------------------|------------------------|------|
| Parakeet-TDT-1.1B | 1.40% | 2.78% | 11 亿参数 |
| Whisper-Large-v3-turbo | 1.58% | 3.03% | 8.09 亿 |
| Canary-1B Flash | 1.48% | 2.87% | 10 亿 |
| Seamless M4T v2 | 1.7% | 3.5% | 23 亿 |

所有这些都基于编码器-解码器或 RNN-T。纯 CTC 系统（wav2vec 2.0）在 test-clean 上约为 1.8-2.1%。

## 动手构建

### 步骤 1：贪心 CTC 解码

```python
def ctc_greedy(frame_logits, blank=0, vocab=None):
    # frame_logits: 每帧概率向量列表
    preds = [max(range(len(p)), key=lambda i: p[i]) for p in frame_logits]
    out = []
    prev = -1
    for p in preds:
        if p != prev and p != blank:
            out.append(p)
        prev = p
    return "".join(vocab[i] for i in out) if vocab else out
```

两条规则：折叠连续重复，丢弃空白。示例：`a a _ _ a b b _ c` → `a a b c`。

### 步骤 2：波束搜索 CTC

```python
def ctc_beam(frame_logits, beam=8, blank=0):
    import math
    beams = [([], 0.0)]  # (tokens, log_prob)
    for p in frame_logits:
        log_p = [math.log(max(pi, 1e-10)) for pi in p]
        candidates = []
        for seq, lp in beams:
            for t, lpt in enumerate(log_p):
                new = seq[:] if t == blank else (seq + [t] if not seq or seq[-1] != t else seq)
                candidates.append((new, lp + lpt))
        candidates.sort(key=lambda x: -x[1])
        beams = candidates[:beam]
    return beams[0][0]
```

生产环境使用带 LM 融合的前缀树波束搜索；这里只是概念框架。

### 步骤 3：WER

```python
def wer(ref, hyp):
    r, h = ref.split(), hyp.split()
    dp = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1):
        dp[i][0] = i
    for j in range(len(h) + 1):
        dp[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            cost = 0 if r[i - 1] == h[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[len(r)][len(h)] / max(1, len(r))
```

### 步骤 4：Whisper 推理

```python
import whisper
model = whisper.load_model("large-v3-turbo")
result = model.transcribe("clip.wav")
print(result["text"])
```

2026 年最强通用 ASR 的一行代码。在 24 GB GPU 上以约 20 倍实时速度运行。

### 步骤 5：使用 Parakeet 或 wav2vec 2.0 进行流式处理

```python
from transformers import pipeline
asr = pipeline("automatic-speech-recognition", model="nvidia/parakeet-tdt-1.1b")
for chunk in streaming_audio():
    print(asr(chunk, return_timestamps=True))
```

流式 ASR 需要分块编码器注意力和延续状态；使用支持它的库（NeMo 用于 Parakeet，带 `chunk_length_s` 的 `transformers` 流水线）。

## 场景应用

2026 年的技术选择：

| 场景 | 选择 |
|-----------|------|
| 英语，离线，最高质量 | Whisper-large-v3-turbo |
| 多语言，鲁棒 | SeamlessM4T v2 |
| 流式，低延迟 | Parakeet-TDT-1.1B 或 Riva |
| 边缘设备，手机，<500 ms 延迟 | Whisper-Tiny 量化版或 Moonshine（2024） |
| 长格式 | 基于 VAD 分块的 Whisper（WhisperX） |
| 特定领域（医疗、法律） | 微调 wav2vec 2.0 + 领域 LM 融合 |

## 2026 年仍然存在的陷阱

- **没有 VAD。** 在静音上运行 Whisper 会产生幻觉（"Thanks for watching!"）。始终配合 VAD 使用。
- **字符 vs 词 vs 子词 WER。** 在归一化（小写、去除标点）*之后*报告词级 WER。
- **语言识别漂移。** Whisper 的自动 LID 会将嘈杂片段误路由到日语或威尔士语；确定时强制 `language="en"`。
- **长片段不分块。** Whisper 有 30 秒窗口。对于更长的内容使用 `chunk_length_s=30, stride=5`。

## 交付物

保存为 `outputs/skill-asr-picker.zh.md`。为给定的部署目标选择模型、解码策略、分块和 LM 融合。

## 练习

1. **简单。** 运行 `code/main.py`。它贪心地解码一个手工制作的 CTC 输出并对照参考计算 WER。
2. **中等。** 正确实现第 2 步中的前缀树波束搜索（考虑空白合并规则）。在 10 个示例的合成数据集上与贪心方法进行比较。
3. **困难。** 在 [LibriSpeech test-clean](https://www.openslr.org/12) 上使用 `whisper-large-v3-turbo`。计算前 100 条话语的 WER。与公开数据进行比较。

## 关键术语

| 术语 | 人们说 | 实际含义 |
|------|-----------------|-----------------------|
| CTC | 空白 token 损失 | 对所有帧到 token 对齐方式进行边际化；非自回归。 |
| RNN-T | 流式损失 | CTC + 下一 token 预测器；处理词序。 |
| 注意力编码器-解码器 | Whisper 风格 | 编码器 + 交叉注意力解码器；最佳离线质量。 |
| WER | 你报告的数字 | 词级别的 `(S+D+I)/N`。 |
| 空白 | 空 | CTC 中表示"此帧无发射"的特殊 token。 |
| LM 融合 | 外部语言模型 | 波束搜索期间添加加权 LM 对数概率。 |
| VAD | 静音门 | 语音活动检测器；裁剪非语音部分。 |

## 延伸阅读

- [Graves et al. (2006). Connectionist Temporal Classification](https://www.cs.toronto.edu/~graves/icml_2006.pdf) — CTC 论文。
- [Graves (2012). Sequence Transduction with RNNs](https://arxiv.org/abs/1211.3711) — RNN-T 论文。
- [Radford et al. / OpenAI (2022). Whisper: Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356) — 2022 年经典论文；2024 年 v3-turbo 扩展。
- [NVIDIA NeMo — Parakeet-TDT card](https://huggingface.co/nvidia/parakeet-tdt-1.1b) — 2026 年开源 ASR 排行榜领先者。
- [Hugging Face — Open ASR Leaderboard](https://huggingface.co/spaces/hf-audio/open_asr_leaderboard) — 25+ 个模型的实时基准。
