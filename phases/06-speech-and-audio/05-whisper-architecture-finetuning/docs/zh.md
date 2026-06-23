# Whisper -- 架构与微调

> Whisper 是一个基于 30 秒窗口的 Transformer 编码器-解码器模型，在 68 万小时的多语言弱监督音频-文本对上训练。一个架构，多种任务，覆盖 99 种语言。2026 年的参考级 ASR。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 04（ASR），阶段 5 · 10（注意力机制），阶段 7 · 05（完整 Transformer）
**时间：** ~75 分钟

## 问题

Whisper 由 OpenAI 于 2022 年 9 月发布，是第一款作为商品级产品推出的 ASR 模型：粘贴音频、获取文本、支持 99 种语言、对噪声鲁棒、可在笔记本上运行。到 2024 年，OpenAI 推出了 Large-v3 和 Turbo 变体；到 2026 年，Whisper 已成为从播客转录到语音助手再到 YouTube 字幕等一切场景的默认基线。

但 Whisper 不是一个可以永远视为黑盒的流水线。领域迁移会使其性能下降 -- 技术术语、说话人口音、专有名词、短片段、静音。你需要了解：

1. 它的内部结构究竟是什么。
2. 如何正确地为其提供分块、流式或长音频。
3. 何时以及如何进行微调。

## 概念

![Whisper 编码器-解码器、任务、分块推理、微调](../assets/whisper.svg)

**架构。** 标准 Transformer 编码器-解码器。

- 输入：30 秒对数梅尔频谱图，80 个梅尔滤波器，10 ms 跳步 → 3000 帧。较短的片段用零填充，较长的片段则进行分块。
- 编码器：卷积下采样（步长 2）+ `N` 个 Transformer 块。Large-v3：32 层，1280 维，20 个头。
- 解码器：`N` 个 Transformer 块，包含因果自注意力 + 与编码器输出的交叉注意力。大小与编码器相同。
- 输出：基于 51,865 个词表的 BPE 词元。

Large-v3 有 15.5 亿参数。Turbo 使用 4 层解码器（从 32 层缩减），延迟降低 8 倍，WER 损失小于 1%。

**提示格式。** Whisper 是一个多任务模型，通过解码器提示中的特殊词元来控制：

```
<|startoftranscript|><|en|><|transcribe|><|notimestamps|> Hello world.<|endoftext|>
```

- `<|en|>` -- 语言标签；控制翻译与转录行为。
- `<|transcribe|>` 或 `<|translate|>` -- 将任意语言输入翻译为英文输出，或逐字转录。
- `<|notimestamps|>` -- 跳过词级时间戳（更快）。

提示让一个模型能够执行多种任务。将 `<|en|>` 改为 `<|fr|>`，它就会转录法语。

**30 秒窗口。** 一切都固定在 30 秒。较长的片段需要分块；较短的片段需要填充。窗口不是原生流式的 -- 这就是 WhisperX、Whisper-Streaming 和 faster-whisper 存在的原因。

**对数梅尔归一化。** `(log_mel - mean) / std`，其中统计量来自 Whisper 自己的训练语料。你*必须*使用 Whisper 的预处理（`whisper.audio.log_mel_spectrogram`），而不是 `librosa.feature.melspectrogram`。

### 2026 年的变体

| 变体 | 参数 | 延迟（A100） | WER（LibriSpeech-clean） |
|---------|--------|----------------|------------------------|
| Tiny | 39M | 1× 实时 | 5.4% |
| Base | 74M | 1× | 4.1% |
| Small | 244M | 1× | 3.0% |
| Medium | 769M | 1× | 2.7% |
| Large-v3 | 1.55B | 2× | 1.8% |
| Large-v3-turbo | 809M | 8× | 1.58% |
| Whisper-Streaming (2024) | 1.55B | 流式 | 2.0% |

### 微调

2026 年的规范工作流程：

1. 收集 10-100 小时的目标领域音频及对齐的转录文本。
2. 使用 `generate_with_loss` 回调运行 `transformers.Seq2SeqTrainer`。
3. 参数高效微调：对注意力层的 `q_proj`、`k_proj`、`v_proj` 进行 LoRA，可将 GPU 内存降低 4 倍，WER 损失小于 0.3。
4. 如果数据少于 10 小时，冻结编码器。仅调优解码器。
5. 使用 Whisper 自己的分词器和提示格式；切勿更换分词器。

社区成果：在 20 小时医学听写数据上微调 Medium，医学词汇的 WER 从 12% 降至 4.5%。在 4 小时冰岛语数据上微调 Turbo，WER 从 18% 降至 6%。

## 构建

### 第 1 步：直接运行 Whisper

```python
import whisper
model = whisper.load_model("large-v3-turbo")
result = model.transcribe(
    "clip.wav",
    language="en",
    task="transcribe",
    temperature=0.0,
    condition_on_previous_text=False,  # 防止重复失控
)
print(result["text"])
for seg in result["segments"]:
    print(f"[{seg['start']:.2f}--{seg['end']:.2f}] {seg['text']}")
```

你应该始终覆盖的关键默认值：`temperature=0.0`（采样默认为 0.0 → 0.2 → 0.4 ... 回退链）、`condition_on_previous_text=False`（防止级联幻觉问题）和 `no_speech_threshold=0.6`（静音检测）。

### 第 2 步：分块长音频

```python
# whisperx 是 2026 年带词级时间戳的长音频参考方案
import whisperx
model = whisperx.load_model("large-v3-turbo", device="cuda", compute_type="float16")
segments = model.transcribe("1hour.mp3", batch_size=16, chunk_size=30)
```

WhisperX 增加了（1）Silero VAD 门控、（2）通过 wav2vec 2.0 进行词级对齐、（3）通过 `pyannote.audio` 进行说话人日志。2026 年生产级转录的主力方案。

### 第 3 步：使用 LoRA 微调

```python
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from peft import LoraConfig, get_peft_model

model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-large-v3-turbo")
lora = LoraConfig(
    r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"],
    lora_dropout=0.1, bias="none", task_type="SEQ_2_SEQ_LM",
)
model = get_peft_model(model, lora)
# model.print_trainable_parameters()  -> ~3M 可训练 / 809M 总计
```

然后使用标准的 Trainer 循环。每 1000 步保存一次检查点。在保留集上评估 WER。

### 第 4 步：检查每层学到了什么

```python
# 在解码过程中获取交叉注意力权重，查看解码器关注什么。
with torch.inference_mode():
    out = model.generate(
        input_features=features,
        return_dict_in_generate=True,
        output_attentions=True,
    )
# out.cross_attentions: layer × head × step × src_len
```

用热力图可视化 -- 你会看到解码器步长扫描编码器帧时的对角线对齐。这条对角线就是 Whisper 的词时间戳概念。

## 使用

2026 年的技术栈：

| 场景 | 选择 |
|-----------|------|
| 通用英语，离线 | 通过 `whisperx` 使用 Large-v3-turbo |
| 移动端 / 边缘设备 | 量化（int8）的 Whisper-Tiny 或 Moonshine |
| 多语言长音频 | 通过 `whisperx` + 说话人日志使用 Large-v3 |
| 低资源语言 | 使用 LoRA 微调 Medium 或 Turbo |
| 流式（2 秒延迟） | Whisper-Streaming 或 Parakeet-TDT |
| 词级时间戳 | WhisperX（通过 wav2vec 2.0 进行强制对齐） |

`faster-whisper`（CTranslate2 后端）是 2026 年最快的 CPU+GPU 推理运行时 -- 比原版快 4 倍，输出完全相同。

## 2026 年仍然存在的陷阱

- **在静音上产生幻觉文本。** Whisper 在包含"感谢观看！"、"订阅！"、歌词的字幕上训练。在调用之前务必使用 VAD 门控。
- **`condition_on_previous_text` 级联。** 一次幻觉会污染后续窗口。除非需要在各块之间保持流畅，否则设置为 `False`。
- **短片段填充。** 一个 2 秒的片段填充到 30 秒可能会在尾随静音中产生幻觉。使用 `pad=False` 或 VAD 门控。
- **错误的梅尔统计量。** 使用 librosa 的梅尔滤波器代替 Whisper 的会产生近乎随机的输出。使用 `whisper.audio.log_mel_spectrogram`。

## 交付

保存为 `outputs/skill-whisper-tuner.md`。为给定领域设计 Whisper 微调或推理流水线。

## 练习

1. **简单。** 运行 `code/main.py`。它会分词一个 Whisper 风格的提示，计算解码后的形状预算，并为一段 10 分钟的音频打印分块计划。
2. **中等。** 安装 `faster-whisper`，转录一段 10 分钟的播客，与人工转录对比 WER。尝试 `language="auto"` 与强制 `language="en"` 的对比。
3. **困难。** 使用 HF `datasets`，选择 Whisper 难以处理的语言（如乌尔都语），在 2 小时数据上用 LoRA 微调 Medium 2 个 epoch，并报告 WER 变化。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| 30 秒窗口 | Whisper 的限制 | 硬输入上限；对较长音频进行分块。 |
| SOT | 转录开始 | `<\|startoftranscript\|>` 启动解码器提示。 |
| 时间戳词元 | 时间对齐 | 每 0.02 秒偏移是 51k 词表中的一个特殊词元。 |
| Turbo | 快速变体 | 4 层解码器，速度快 8 倍，WER 下降小于 1%。 |
| WhisperX | 长音频封装 | VAD + Whisper + wav2vec 对齐 + 说话人日志。 |
| LoRA 微调 | 高效调优 | 在注意力层添加低秩适配器；训练约 0.3% 的参数。 |
| 幻觉 | 静默失败 | Whisper 从噪声/静音中产生流畅的英语。 |

## 进一步阅读

- [Radford et al. (2022). Whisper 论文](https://arxiv.org/abs/2212.04356) -- 原始架构和训练方案。
- [OpenAI (2024). Whisper Large-v3-turbo 发布](https://github.com/openai/whisper/discussions/2363) -- 4 层解码器，8 倍加速。
- [Bain et al. (2023). WhisperX](https://arxiv.org/abs/2303.00747) -- 长音频、词对齐、说话人日志。
- [Systran -- faster-whisper 仓库](https://github.com/SYSTRAN/faster-whisper) -- CTranslate2 后端，快 4 倍。
- [HuggingFace -- Whisper 微调教程](https://huggingface.co/blog/fine-tune-whisper) -- 规范的 LoRA / 全量微调指南。
