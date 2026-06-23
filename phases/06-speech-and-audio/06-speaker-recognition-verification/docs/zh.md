# 说话人识别与验证

> ASR 问"他们说了什么？"说话人识别问"是谁说的？"数学看起来一样 -- 嵌入加余弦 -- 但每个生产决策都取决于一个单一的 EER 数字。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 02（频谱图与梅尔），阶段 5 · 22（嵌入模型）
**时间：** ~45 分钟

## 问题

用户说出一句口令。你想知道：这是他们声称的那个人吗（*验证*，1:1），还是你的注册库中的第一个人（*识别*，1:N）？或者两者都不是 -- 这是一个未知的说话人（*开集*）？

2018 年之前：GMM-UBM + i-vector。EER 尚可，但对信道变化（电话 vs 笔记本）和情绪敏感。2018-2022：x-vector（基于角间隔训练的 TDNN 骨干）。2022 年以后：ECAPA-TDNN 和 WavLM-large 嵌入。到 2026 年，该领域由三个模型和一个指标主导。

这个指标是 **EER** -- 等错误率。设置决策阈值使得错误接受率 = 错误拒绝率。交叉点就是 EER。每篇论文、每个排行榜、每次采购招标中都使用它。

## 概念

![注册 + 验证流水线，包含嵌入 + 余弦 + EER](../assets/speaker-verification.svg)

**流水线。** 注册：录制目标说话人 5-30 秒音频；计算固定维度的嵌入（ECAPA-TDNN 为 192 维，WavLM-large 为 256 维）。验证：获取测试话语的嵌入；计算余弦相似度；与阈值比较。

**ECAPA-TDNN（2020 年，2026 年仍然主导）。** 增强通道注意力、传播和聚合 - 时延神经网络。包含压缩-激励的 1D 卷积块、多头注意力池化，后接线性层到 192 维。在 VoxCeleb 1+2（2700 说话人，110 万话语）上使用加性角间隔损失（AAM-softmax）训练。

**WavLM-SV（2022 年以后）。** 使用 AAM 损失微调预训练的 WavLM-large SSL 骨干。质量更高但速度更慢 -- 300+ MB vs 15 MB。

**x-vector（基线）。** TDNN + 统计池化。经典方案；在 CPU / 边缘设备上仍然有用。

**AAM-softmax。** 在角度空间中为正确类别的角度 `θ` 添加间隔 `m` 的标准 softmax：`cos(θ + m)`。强制类间的角度分离。典型值 `m=0.2`，缩放因子 `s=30`。

### 评分

- **余弦** 在注册嵌入和测试嵌入之间。基于阈值的决策。
- **PLDA（概率线性判别分析）。** 将嵌入投影到潜在空间，其中同说话人与不同说话人具有封闭形式的似然比。在余弦之上使用可使 EER 降低 10-20%。2020 年以前的标准方案；现在仅用于闭集设置。
- **分数归一化。** `S-norm` 或 `AS-norm`：根据一组冒名顶替者的均值和标准差对每个分数进行归一化。对于跨领域评估至关重要。

### 你应该知道的数字（2026）

| 模型 | VoxCeleb1-O EER | 参数 | 吞吐量（A100） |
|-------|-----------------|--------|-------------------|
| x-vector（经典） | 3.10% | 5 M | 400× 实时 |
| ECAPA-TDNN | 0.87% | 15 M | 200× 实时 |
| WavLM-SV large | 0.42% | 316 M | 20× 实时 |
| Pyannote 3.1 分割 + 嵌入 | 0.65% | 6 M | 100× 实时 |
| ReDimNet (2024) | 0.39% | 24 M | 100× 实时 |

### 说话人日志

在多说话人片段中"谁在什么时候说话"。流水线：VAD → 分割 → 嵌入每个片段 → 聚类（凝聚或谱聚类）→ 平滑边界。现代方案：`pyannote.audio` 3.1，将说话人分割 + 嵌入 + 聚类整合在一次调用中。2026 年 AMI 上的 SOTA DER 约为 15%（从 2022 年的 23% 下降）。

## 构建

### 第 1 步：基于 MFCC 统计量的玩具嵌入

```python
def embed_mfcc_stats(signal, sr):
    frames = featurize_mfcc(signal, sr, n_mfcc=13)
    mean = [sum(f[i] for f in frames) / len(frames) for i in range(13)]
    std = [
        math.sqrt(sum((f[i] - mean[i]) ** 2 for f in frames) / len(frames))
        for i in range(13)
    ]
    return mean + std  # 26-d
```

远非 SOTA -- 仅供教学使用。`code/main.py` 将其用作合成说话人数据的概念验证。

### 第 2 步：余弦相似度 + 阈值

```python
def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0

def verify(enroll, test, threshold=0.75):
    return cosine(enroll, test) >= threshold
```

### 第 3 步：从相似度对计算 EER

```python
def eer(same_scores, diff_scores):
    thresholds = sorted(set(same_scores + diff_scores))
    best = (1.0, 1.0, 0.0)  # (fa, fr, threshold)
    for t in thresholds:
        fr = sum(1 for s in same_scores if s < t) / len(same_scores)
        fa = sum(1 for s in diff_scores if s >= t) / len(diff_scores)
        if abs(fa - fr) < abs(best[0] - best[1]):
            best = (fa, fr, t)
    return (best[0] + best[1]) / 2, best[2]
```

返回 (eer, threshold_at_eer)。同时报告两者。

### 第 4 步：使用 SpeechBrain 生产部署

```python
from speechbrain.pretrained import EncoderClassifier

clf = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb")

# 注册：对 3-5 个干净样本的嵌入取平均
enroll = torch.stack([clf.encode_batch(load(x)) for x in enrollment_clips]).mean(0)
# 验证
score = clf.similarity(enroll, clf.encode_batch(load("test.wav"))).item()
verdict = score > 0.25   # ECAPA 典型阈值；根据你的数据调整
```

### 第 5 步：使用 pyannote 进行说话人日志

```python
from pyannote.audio import Pipeline

pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
diarization = pipe("meeting.wav", num_speakers=None)
for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"{turn.start:.1f}--{turn.end:.1f}  {speaker}")
```

## 使用

2026 年的技术栈：

| 场景 | 选择 |
|-----------|------|
| 闭集 1:1 验证，边缘设备 | ECAPA-TDNN + 余弦阈值 |
| 开集验证，云端 | WavLM-SV + AS-norm |
| 说话人日志（会议、播客） | `pyannote/speaker-diarization-3.1` |
| 反欺骗（重放 / 深度伪造检测） | AASIST 或 RawNet2 |
| 微型嵌入式（关键词识别 + 注册） | Titanet-Small（NeMo） |

## 陷阱

- **信道不匹配。** 在 VoxCeleb（网络视频）上训练的模型 ≠ 电话音频。始终在目标信道上评估。
- **短话语。** 测试音频低于 3 秒时，EER 急剧恶化。
- **带噪声的注册。** 一个带噪声的注册样本会毒化锚点。使用 3 个以上干净样本并取平均。
- **跨条件的固定阈值。** 始终在目标领域的保留开发集上调整阈值。
- **在未归一化的嵌入上使用余弦。** 先进行 L2 归一化；否则幅度会主导结果。

## 交付

保存为 `outputs/skill-speaker-verifier.md`。选择模型、注册协议、阈值调整计划和防欺诈措施。

## 练习

1. **简单。** 运行 `code/main.py`。构建合成"说话人"（不同音调特征），注册，在 100 对测试列表中计算 EER。
2. **中等。** 在 30 条 VoxCeleb1 话语（5 个说话人 × 6 条）上使用 SpeechBrain ECAPA。比较余弦与 PLDA 的 EER。
3. **困难。** 使用 `pyannote.audio` 构建完整的注册 → 日志 → 验证流水线。在 AMI 开发集上评估 DER。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| EER | 核心指标 | 错误接受 = 错误拒绝时的阈值。 |
| 验证 | 1:1 | "这是 Alice 吗？" |
| 识别 | 1:N | "谁在说话？" |
| 开集 | 可能未知 | 测试集可能包含未注册的说话人。 |
| 注册 | 注册 | 计算说话人的参考嵌入。 |
| AAM-softmax | 损失函数 | 带加性角间隔的 softmax；强制聚类分离。 |
| PLDA | 经典评分 | 概率线性判别分析；嵌入之上的似然比评分。 |
| DER | 日志指标 | 说话人日志错误率 -- 漏报 + 误报 + 混淆。 |

## 进一步阅读

- [Snyder et al. (2018). X-Vectors: Robust DNN Embeddings for Speaker Recognition](https://www.danielpovey.com/files/2018_icassp_xvectors.pdf) -- 经典深度嵌入论文。
- [Desplanques et al. (2020). ECAPA-TDNN](https://arxiv.org/abs/2005.07143) -- 2020-2026 年的主导架构。
- [Chen et al. (2022). WavLM: Large-Scale Self-Supervised Pre-Training for Full Stack Speech Processing](https://arxiv.org/abs/2110.13900) -- 用于说话人验证和日志的 SSL 骨干。
- [Bredin et al. (2023). pyannote.audio 3.1](https://github.com/pyannote/pyannote-audio) -- 生产级日志 + 嵌入栈。
- [VoxCeleb 排行榜（2026 更新）](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/) -- 各模型的当前 EER 排名。
