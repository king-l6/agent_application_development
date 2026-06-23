# 音频评估 — WER、MOS、UTMOS、MMAU、FAD 与公开排行榜

> 你无法发布你无法衡量的东西。本课命名了 2026 年每项音频任务的指标：ASR（WER、CER、RTFx）、TTS（MOS、UTMOS、SECS、WER-on-ASR-round-trip）、音频语言（MMAU、LongAudioBench）、音乐（FAD、CLAP）和说话人（EER）。还有你用来比较的排行榜。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 6 · 04、06、07、09、10；阶段 2 · 09（模型评估）
**时间：** ~60 分钟

## 问题

每项音频任务都有多个指标，每个衡量不同的维度。使用错误的指标，你就会发布一个在仪表盘上看起来很好但在生产中表现糟糕的模型。2026 年的标准列表：

| 任务 | 主要指标 | 辅助指标 |
|------|---------|---------|
| ASR | WER | CER · RTFx · 首 token 延迟 |
| TTS | MOS / UTMOS | SECS · WER-on-ASR-round-trip · CER · TTFA |
| 语音克隆 | SECS（ECAPA 余弦相似度） | MOS · CER |
| 说话人验证 | EER | minDCF · 工作点的 FAR / FRR |
| 说话人分离 | DER | JER · 说话人混淆率 |
| 音频分类 | top-1 · mAP | 宏平均 F1 · 每类召回率 |
| 音乐生成 | FAD | CLAP · 听感小组 MOS |
| 音频语言模型 | MMAU-Pro | LongAudioBench · AudioCaps FENSE |
| 流式 S2S | 延迟 P50/P95 | WER · MOS |

## 概念

![音频评估矩阵 — 指标 vs 任务 vs 2026 排行榜](../assets/eval-landscape.svg)

### ASR 指标

**WER（词错误率）。** `(S + D + I) / N`。评分前需要小写化、去除标点、标准化数字。使用 `jiwer` 或 OpenAI 的 `whisper_normalizer`。&lt; 5% = 朗读语音的人类水平。

**CER（字符错误率）。** 相同公式，字符级别。用于声调语言（普通话、粤语），在这些语言中词边界划分不明确。

**RTFx（实时因子倒数）。** 每秒挂钟时间处理的音频秒数。越高越好。Parakeet-TDT 达到 3380x。Whisper-large-v3 约 30x。

**首 token 延迟。** 从音频输入到首个转录 token 的挂钟时间。对流式处理至关重要。Deepgram Nova-3：约 150 ms。

### TTS 指标

**MOS（平均意见分）。** 1-5 分人工评分。黄金标准但速度慢。每个样本收集 20+ 个听者，每个模型 100+ 个样本。

**UTMOS（2022-2026）。** 学习得到的 MOS 预测器。在标准基准上与人工 MOS 的相关系数约 0.9。F5-TTS：UTMOS 3.95；真实值：4.08。

**SECS（说话人编码器余弦相似度）。** 用于语音克隆。参考语音与克隆输出之间的 ECAPA 嵌入余弦相似度。&gt; 0.75 = 可识别的克隆。

**WER-on-ASR-round-trip。** 对 TTS 输出运行 Whisper，计算与输入文本的 WER。捕捉可懂度退化。2026 年最先进水平：&lt; 2% CER。

**TTFA（首段音频时间）。** 挂钟延迟。Kokoro-82M：约 100 ms；F5-TTS：约 1 s。

### 语音克隆专用

**SECS + MOS + CER** 作为三重指标。SECS 高但 MOS 低的克隆意味着音色正确但不自然；相反则意味着声音自然但说话人不对。

### 说话人验证

**EER（等错误率）。** 误接受率等于误拒绝率的阈值。ECAPA 在 VoxCeleb1-O 上：0.87%。

**minDCF（最小检测代价函数）。** 在选定工作点（通常 FAR=0.01）的加权代价。比 EER 更贴近生产。

### 说话人分离

**DER（说话人分离错误率）。** `(FA + Miss + Confusion) / total_speaker_time`。漏检语音 + 误报语音 + 说话人混淆，各为比例。AMI 会议：DER 约 10-20% 是现实的。pyannote 3.1 + Precision-2 商业版：在良好录音的音频上 &lt;10% DER。

**JER（Jaccard 错误率）。** DER 的替代方案，对短片段偏差更鲁棒。

### 音频分类

多标签：**mAP（平均精确率均值）** 在所有类别上。AudioSet：BEATs-iter3 的 mAP 为 0.548。

多类别互斥：**top-1、top-5 准确率**。Speech Commands v2：99.0% top-1（Audio-MAE）。

不平衡：**宏平均 F1** + **每类召回率**。按类报告——聚合准确率掩盖了哪些类别失败。

### 音乐生成

**FAD（弗雷歇音频距离）。** 真实与生成音频的 VGGish 嵌入分布之间的距离。MusicGen-small 在 MusicCaps 上：4.5。MusicLM：4.0。越低越好。

**CLAP 分数。** 使用 CLAP 嵌入的文本-音频对齐分数。&gt; 0.3 = 合理对齐。

**听感小组 MOS。** 消费级音乐的最终标准。Suno v5 在 TTS Arena 上的 ELO 1293（来自成对人工偏好）。

### 音频语言基准

**MMAU（大规模多音频理解）。** 10k 音频问答对。

**MMAU-Pro。** 1800 个困难题目，四个类别：语音 / 声音 / 音乐 / 多音频。四选一随机概率 25%。Gemini 2.5 Pro 总体约 60%；多音频在所有模型上约 22%。

**LongAudioBench。** 多分钟片段搭配语义查询。Audio Flamingo Next 超过 Gemini 2.5 Pro。

**AudioCaps / Clotho。** 描述生成基准。SPICE、CIDEr、FENSE 指标。

### 流式语音到语音

**延迟 P50 / P95 / P99。** 从用户语音结束到首个可听响应的挂钟时间。Moshi：200 ms；GPT-4o Realtime：300 ms。

**输出上的 WER / MOS。**

**打断响应速度。** 从用户打断到助手静音的时间。目标 &lt; 150 ms。

### 2026 年排行榜

| 排行榜 | 追踪内容 | URL |
|--------|---------|-----|
| Open ASR Leaderboard（HF） | 英语 + 多语 + 长文 | `huggingface.co/spaces/hf-audio/open_asr_leaderboard` |
| TTS Arena（HF） | 英语 TTS | `huggingface.co/spaces/TTS-AGI/TTS-Arena` |
| Artificial Analysis Speech | TTS + STT，成对投票 ELO | `artificialanalysis.ai/speech` |
| MMAU-Pro | LALM 推理 | `mmaubenchmark.github.io` |
| SpeakerBench / VoxSRC | 说话人识别 | `voxsrc.github.io` |
| MMAU 音乐子集 | 音乐 LALM |（MMAU 内部） |
| HEAR benchmark | 自监督音频 | `hearbenchmark.com` |

## 动手搭建

### 步骤 1：带标准化的 WER

```python
from jiwer import wer, Compose, ToLowerCase, RemovePunctuation, Strip

transform = Compose([ToLowerCase(), RemovePunctuation(), Strip()])
score = wer(
    truth="Please turn on the lights.",
    hypothesis="please turn on the light",
    truth_transform=transform,
    hypothesis_transform=transform,
)
# ~0.17
```

### 步骤 2：TTS 往返 WER

```python
def ttr_wer(tts_model, asr_model, texts):
    errors = []
    for txt in texts:
        audio = tts_model.synthesize(txt)
        recog = asr_model.transcribe(audio)
        errors.append(wer(truth=txt, hypothesis=recog))
    return sum(errors) / len(errors)
```

### 步骤 3：语音克隆的 SECS

```python
from speechbrain.inference.speaker import EncoderClassifier
sv = EncoderClassifier.from_hparams("speechbrain/spkrec-ecapa-voxceleb")

emb_ref = sv.encode_batch(load_wav("reference.wav"))
emb_clone = sv.encode_batch(load_wav("cloned.wav"))
secs = torch.nn.functional.cosine_similarity(emb_ref, emb_clone, dim=-1).item()
```

### 步骤 4：音乐生成的 FAD

```python
from frechet_audio_distance import FrechetAudioDistance
fad = FrechetAudioDistance()
score = fad.get_fad_score("generated_folder/", "reference_folder/")
```

### 步骤 5：说话人验证的 EER（与第 6 课相同代码）

```python
def eer(same_scores, diff_scores):
    thresholds = sorted(set(same_scores + diff_scores))
    best = (1.0, 0.0)
    for t in thresholds:
        far = sum(1 for s in diff_scores if s >= t) / len(diff_scores)
        frr = sum(1 for s in same_scores if s < t) / len(same_scores)
        if abs(far - frr) < best[0]:
            best = (abs(far - frr), (far + frr) / 2)
    return best[1]
```

## 应用场景

每次部署都配对固定的评估工具，在每次模型更新时运行。三条基本规则：

1. **评分前进行标准化。** 小写化、去标点、数字展开。报告标准化规则。
2. **报告分布而非平均值。** 延迟的 P50/P95/P99。分类的每类召回率。MMAU 的每类别结果。
3. **运行一个标准的公开基准。** 即使你的生产数据不同，在 Open ASR / TTS Arena / MMAU 上报告能让审阅者在同等基础上比较。

## 常见陷阱

- **UTMOS 外推。** 在 VCTK 风格干净语音上训练；对有噪声、克隆或情感语音评分较差。
- **MOS 小组偏差。** 20 个 Amazon Mechanical Turk 工作者 ≠ 20 个目标用户。如果影响重大，请付费聘请领域专家组。
- **FAD 依赖于参考集。** 跨模型比较时使用相同的参考分布。
- **聚合 WER。** 总体 5% 的 WER 可能掩盖带口音语音上 30% 的 WER。按人群切片报告。
- **公开基准饱和。** 大多数前沿模型在标准基准上已接近天花板。构建反映你流量的内部保留集。

## 交付产出

保存为 `outputs/skill-audio-evaluator.md`。为任意音频模型发布选择指标、基准和报告格式。

## 练习

1. **简单。** 运行 `code/main.py`。在玩具输入上计算 WER / CER / EER / SECS / FAD-ish / MMAU-ish。
2. **中等。** 构建一个 TTS 往返 WER 工具。将你的 Kokoro 或 F5-TTS 输出通过 Whisper 运行。在 50 个提示上计算 WER。标记 WER 超过 10% 的提示。
3. **困难。** 在第 10 课的 LALM 选择上，在 MMAU-Pro 语音 + 多音频子集（各 50 项）上评分。按类别报告准确率并与发布的数据比较。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| WER | ASR 分数 | 标准化后的 `(S+D+I)/N`，词级别。 |
| CER | 字符 WER | 用于声调语言或字符级系统。 |
| MOS | 人工意见 | 1-5 评分；20+ 听者 × 100 样本。 |
| UTMOS | 机器学习 MOS 预测器 | 学习模型；与人工 MOS 相关系数约 0.9。 |
| SECS | 语音克隆相似度 | 参考与克隆的 ECAPA 余弦相似度。 |
| EER | 说话人验证分数 | FAR = FRR 时的阈值。 |
| DER | 说话人分离分数 | (FA + Miss + Confusion) / total。 |
| FAD | 音乐生成质量 | VGGish 嵌入上的弗雷歇距离。 |
| RTFx | 吞吐量 | 每秒挂钟时间的音频秒数。 |

## 延伸阅读

- [jiwer](https://github.com/jitsi/jiwer) — 带标准化工具的 WER/CER 库。
- [UTMOS (Saeki et al. 2022)](https://arxiv.org/abs/2204.02152) — 学习得到的 MOS 预测器。
- [Fréchet Audio Distance (Kilgour et al. 2019)](https://arxiv.org/abs/1812.08466) — 音乐生成标准。
- [Open ASR Leaderboard](https://huggingface.co/spaces/hf-audio/open_asr_leaderboard) — 2026 年实时排名。
- [TTS Arena](https://huggingface.co/spaces/TTS-AGI/TTS-Arena) — 人工投票 TTS 排行榜。
- [MMAU-Pro benchmark](https://mmaubenchmark.github.io/) — LALM 推理排行榜。
- [HEAR benchmark](https://hearbenchmark.com/) — 音频自监督学习基准。
