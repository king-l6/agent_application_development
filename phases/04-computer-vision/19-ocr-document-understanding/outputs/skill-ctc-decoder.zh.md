---
name: skill-ctc-decoder
description: 从头编写贪心和 beam-search CTC 解码器，包括长度归一化
version: 1.0.0
phase: 4
lesson: 19
tags: [ocr, ctc, decoding, sequence-models]
---

# CTC 解码器

为 CTC 输出生成两个解码例程：贪心（快速）和 beam（在噪声输入上更好）。

## 使用时机

- 在自定义 CRNN 输出上运行 OCR 推理。
- 针对不同解码器基准测试预训练 OCR 模型。
- 在不引入 ctcdecode 的情况下实现简单的 beam search。

## 输入

- `log_probs`: (T, N, C) log-softmax 在词汇表上（按惯例索引 0 = 空白）。
- `vocab`: C 个字符的列表。
- `beam_width`（仅 beam）：通常为 5-10。

## 贪心解码器

```python
def greedy_ctc_decode(log_probs, vocab, blank=0):
    preds = log_probs.argmax(dim=-1).transpose(0, 1).cpu().tolist()
    out = []
    for seq in preds:
        decoded = []
        prev = None
        for idx in seq:
            if idx != prev and idx != blank:
                decoded.append(vocab[idx])
            prev = idx
        out.append("".join(decoded))
    return out
```

## Beam search 解码器

```python
import heapq
import math

def beam_ctc_decode(log_probs, vocab, beam_width=5, blank=0):
    T, N, C = log_probs.shape
    lp = log_probs.cpu()
    results = []
    for n in range(N):
        beams = {("",): (0.0, -math.inf)}  # (prefix_tuple) -> (p_blank, p_nonblank)
        for t in range(T):
            logits_t = lp[t, n]
            new_beams = {}
            for prefix, (p_b, p_nb) in beams.items():
                for c in range(C):
                    p = logits_t[c].item()
                    if c == blank:
                        nb = p_b + p
                        nnb = p_nb + p
                        upd = new_beams.get(prefix, (-math.inf, -math.inf))
                        new_beams[prefix] = (
                            _logsumexp(upd[0], _logsumexp(nb, nnb)),
                            upd[1],
                        )
                    else:
                        last = prefix[-1] if prefix else ""
                        char = vocab[c]
                        if char == last:
                            # 情况 1：保持在相同前缀上（从 p_nb 坍缩）
                            upd = new_beams.get(prefix, (-math.inf, -math.inf))
                            new_beams[prefix] = (upd[0], _logsumexp(upd[1], p_nb + p))
                            # 情况 2：通过空白分隔的重复扩展前缀（"a_a" -> "aa"）
                            new_prefix = prefix + (char,)
                            upd = new_beams.get(new_prefix, (-math.inf, -math.inf))
                            new_beams[new_prefix] = (upd[0], _logsumexp(upd[1], p_b + p))
                        else:
                            new_prefix = prefix + (char,)
                            upd = new_beams.get(new_prefix, (-math.inf, -math.inf))
                            nb = _logsumexp(p_b, p_nb) + p
                            new_beams[new_prefix] = (upd[0], _logsumexp(upd[1], nb))
            beams = dict(heapq.nlargest(
                beam_width,
                new_beams.items(),
                key=lambda kv: _logsumexp(kv[1][0], kv[1][1]),
            ))
        best = max(beams.items(), key=lambda kv: _logsumexp(kv[1][0], kv[1][1]))[0]
        results.append("".join(best))
    return results


def _logsumexp(a, b):
    if a == -math.inf: return b
    if b == -math.inf: return a
    m = max(a, b)
    return m + math.log(math.exp(a - m) + math.exp(b - m))
```

## 规则

- PyTorch 的 `nn.CTCLoss` 中空白索引按惯例为 0。
- Beam search 提高了低置信度输入上的准确率；在清晰输入上改进 <1% CER。
- 绝不将 beam 剪枝到 5 以下；准确率-延迟权衡在此以下趋于平坦。
- 在 Tight 延迟预算内运行 beam search 时，降级到贪心；在大多数生产 OCR 数据上质量损失很小。
- 对于大型词汇表（CJK 有 3000+ 字符），切换到 `ctcdecode`（C++）而不是上述纯 Python 版本；Python beam 很快成为瓶颈。
