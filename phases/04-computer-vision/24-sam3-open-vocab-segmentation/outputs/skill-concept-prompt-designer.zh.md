---
name: skill-concept-prompt-designer
description: 将用户表述转换为格式良好的 SAM 3 概念提示，支持分割、消歧和回退
version: 1.0.0
phase: 4
lesson: 24
tags: [sam3, open-vocab, prompt-engineering, segmentation]
---

# 概念提示设计器

SAM 3 的准确性在很大程度上取决于概念提示的措辞方式。此技能将用户自由形式的表述规范化，转换为 SAM 3 能良好处理的提示。

## 何时使用

- 构建接受自然语言对象查询的 UI。
- 通过 API 暴露 SAM 3，上游调用者发送句子。
- 调试 SAM 3 匹配不佳的情况——通常是提示格式有问题，而非模型问题。

## 输入

- `utterance`：原始用户字符串。
- `context`：可选的领域提示（例如 "surveillance"、"medical"、"retail"）。
- `max_concepts`：每次表述最多提取的概念数；默认为 5。

## SAM 3 偏好的规则

- **简短名词短语，而非句子。**`"cat"` 优于 `"there is a cat"`。
- **具体名词。**`"skateboard"` 优于 `"thing to ride on"`。
- **修饰语紧跟在名词前。**`"red car"` 优于 `"car that is red"`。
- **小写。**SAM 3 对小写输入略微更好。
- **单数或复数。**两者都行；当预期有多个实例时，复数形式有帮助。

## 步骤

1. **按常见分隔符分词**——逗号、分号、"and"、"or"、"&"。
2. **去除填充前缀**——"find"、"show me"、"segment"、"detect"、"locate"、"a"、"an"、"the"。
3. **仅保留视觉相关的介词修饰语**——`"striped red umbrella"` 保留，`"umbrella from yesterday"` 不保留（"from yesterday" 不在图像中）。
4. **使用可选的 `context` 消歧冲突**：
   - 安防监控上下文中的 `"window"` -> `"building window"`。
   - 医学上下文中的 `"window"` -> 通常是错误；建议用户澄清。
5. **回退**：如果分割后产生零个概念，但表述包含至少一个具体名词，则使用确切字符串。如果无法提取具体名词，则不发出概念——仅返回警告并要求用户澄清（见规则）。
6. **上限为 `max_concepts`。**如果提取的概念超过调用者要求的数量，按表述顺序保留前 `max_concepts` 个，其余在 `dropped` 中列出，原因为 `"exceeded max_concepts"`。这可以防止用户粘贴长枚举时延迟超出限制。

## 输出格式

```
[designed prompts]
  utterance:    <原始文本>
  concepts:     ["concept_1", "concept_2", ...]
  dropped:      ["filler_1", ...]
  warnings:     ["概念过于抽象", "可能匹配多个类别", ...]

[sam3 calls]
  对每个概念运行：sam3.detect(image, concept)
  用不同的概念标签合并输出。
```

## 示例

```
输入： "can you find me a cat or two dogs?"
输出： ["cat", "dogs"]
丢弃： ["can you find me", "a", "or two", "?"]
注意： "dogs" 保持复数，因为表述说 "two dogs" ——保留复数提示。

输入： "segment the big red truck and the blue sedan"
输出： ["big red truck", "blue sedan"]
丢弃： ["segment", "the", "and"]

输入： "thing near the door"
输出： ["door"]
警告： ["'thing' 对 SAM 3 来说过于抽象；回退到 'door'"]

输入： "striped red umbrella, green hat, pink balloon"
输出： ["striped red umbrella", "green hat", "pink balloon"]
```

## 规则

- 绝不要向 SAM 3 传递超过 8 个词的句子——超过该长度准确率会下降。
- 当表述中没有可提取的具体名词时，不运行 SAM 3；返回警告并要求澄清。
- 不要对引号内的标点进行分割；如果 `"black and white cat"` 被引号包围，则将其保留为一个概念。
- 始终记录原始表述和派生概念，用于生产调试。
