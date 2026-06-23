---
name: skill-prompt-injection-detector
description: 分层检测器管道，为任何提示返回类别和置信度，具有可测量的精确率和召回率
version: 1.0.0
phase: 19
lesson: 83
tags: [safety, detector, prompt-injection]
---

# 提示注入检测器

这里的检测器是一个从提示到判决的函数。判决携带课程 82 分类法中的类别和一个 `[0, 1]` 中的置信度。

## 管道

1. 规范化 - 去除零宽字符、还原同形字、解码 base64/hex、折叠 leet 语数字、尝试 rot13 并附带常见词语合理性检查。
2. 子串规则 - 手写模式，如 `ignore previous`、`from now on you are`、`decode this base64`。
3. 正则表达式规则 - 词元级模式，如 `\bignor\w*\s+(all|prior|previous|earlier)\b`。

聚合保留每个类别的最高分数，并返回具有最大分数的类别，如果无任何触发则返回 `benign`。

## 添加规则

编辑 `code/rules.py`。一条规则是一个字典，包含 `name`、`category`（六个分类法类别之一）、`score`（浮点数 0 到 1），以及 `substring` 或 `regex` 之一。重新运行 `main.py` 查看对每类别精确率和召回率的影响。

## 工件

`outputs/detector_report.json` 是每类别度量文件。课程 87 中的端到端门读取它以设定置信度阈值。
