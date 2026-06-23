# 浏览器agent与长时域Web任务

> ChatGPT agent（2025年7月）将Operator和深度研究合并为一个浏览器/终端agent，并将BrowseComp SOTA设定在68.9%。OpenAI于2025年8月31日关闭了独立的Operator——产品层的整合。Anthropic收购Vercept将Claude Sonnet在OSWorld上的表现从低于15%提升到72.5%。WebArena-Verified（ServiceNow，ICLR 2026）修复了原始WebArena中11.3个百分点的假阴性率，并发布了258任务的Hard子集。这些数字是真实的。攻击面也是真实的：OpenAI的预备性负责人公开表示对浏览器agent的间接提示注入"不是一个可以完全修补的漏洞"。2025-2026年有记录的攻击：Tainted Memories（Atlas CSRF）、HashJack（Cato Networks）以及Perplexity Comet中的一次点击劫持。

**类型：** 学习
**语言：** Python（标准库，间接提示注入攻击面模型）
**前置知识：** 第15阶段第10课（权限模式），第15阶段第01课（长时域agent）
**时间：** 约45分钟

## 问题

浏览器agent是一种读取不受信任内容并执行有后果动作的长时域agent。agent访问的每个页面都是用户未编写的输入。每个页面上的每个表单都是潜在的命令通道。2025-2026年的攻击语料库表明这不是假设的：Tainted Memories让攻击者通过精心构造的页面将恶意指令绑定到agent的记忆中；HashJack将命令隐藏在agent访问的URL片段中；Perplexity Comet劫持在一次点击中完成。

防御图景令人不安。OpenAI的预备性负责人说了不该明说的话：间接提示注入"不是一个可以完全修补的漏洞"。这是因为攻击存在于agent的读取与行动边界中，这个边界在架构上是模糊的——模型读取的每个token原则上都可以被解读为指令。

本课命名了攻击面，命名了基准全景（BrowseComp、OSWorld、WebArena-Verified），并建模了一个最小的间接提示注入场景，以便你能够推理第14课和第18课中的实际防御措施。

## 概念

### 2026年全景，每个系统一段话

**ChatGPT agent（OpenAI）。** 2025年7月发布。统一了Operator（浏览器）和深度研究（多小时研究）。2025年8月31日关闭了独立的Operator。BrowseComp上SOTA为68.9%；OSWorld和WebArena-Verified上表现强劲。

**Claude Sonnet + Vercept（Anthropic）。** Anthropic收购Vercept聚焦于计算机使用能力。将Claude Sonnet在OSWorld上从低于15%提升到72.5%。Claude Computer Use作为工具API提供。

**Gemini 3 Pro + Browser Use（DeepMind）。** Browser Use集成提供了计算机使用控制；FSF v3（2026年4月，第20课）特别追踪ML研发领域的自主性。

**WebArena-Verified（ServiceNow，ICLR 2026）。** 修复了一个有充分记录的问题：原始WebArena有约11.3%的假阴性率（被标记为失败但实际已解决的任务）。Verified版本使用人工策展的成功标准重新评分，并增加了258任务的Hard子集（ICLR 2026论文，openreview.net/forum?id=94tlGxmqkN）。

### BrowseComp vs OSWorld vs WebArena

| 基准 | 测量内容 | 时域 |
|---|---|---|
| BrowseComp | 在时间压力下在开放网络上查找特定事实 | 分钟 |
| OSWorld | agent操作完整桌面（鼠标、键盘、shell） | 数十分钟 |
| WebArena-Verified | 模拟站点中的事务性Web任务 | 分钟 |
| Hard子集 | 跨多页状态转换的WebArena-Verified任务 | 数十分钟 |

不同维度。高BrowseComp分数说明agent能找到事实；不代表agent能预订航班。OSWorld分数更接近"能否在我的桌面上工作"。WebArena-Verified更接近"能否完成一个流程"。任何生产决策都需要与任务分布匹配的基准。

### 攻击面，命名

1. **间接提示注入。** 不受信任的页面内容包含指令。agent读取它们。agent执行它们。公开例子：2024年Kai Greshake等人，2025年Tainted Memories论文，2026年HashJack（Cato Networks）。
2. **URL片段/查询注入。** 爬取URL的 `#fragment` 或查询字符串包含命令。从未可见渲染；仍在agent的上下文中。
3. **记忆绑定攻击。** 页面指示agent写入持久记忆（第12课涵盖持久状态）。下个会话中，记忆在没有可见触发器的情况下发射载荷。
4. **面向认证会话的CSRF型攻击。** Tainted Memories类别：agent在某处登录；攻击者的页面发出状态更改请求，agent使用用户的cookie执行。
5. **一次点击劫持。** 视觉上无害的按钮附带agent会跟随的载荷。Comet类别。
6. **agent主机面中的内容安全策略漏洞。** 渲染和工具层本身可能成为攻击向量；浏览器中的浏览器agent栈非常宽。

### 为什么"不能完全修补"

攻击与agent的能力同构。agent必须读取不受信任内容才能完成工作。agent读取的任何内容都可能包含指令。agent遵循的任何指令都可能与用户的实际请求不一致。防御（信任边界、分类器、工具允许列表、有后果动作的人工介入）提高了攻击成本并缩小了其爆炸半径。它们不能闭合该类别。

这与Lob定理（第8课）是相同的推理模式：agent无法证明下一个token是安全的；它只能建立一个使不安全token更可检测的系统。

### 实际落地的防御态势

- **读/写边界。** 读取从不产生后果。写入（提交表单、发布内容、调用有副作用的工具）在发起内容来自信任边界之外时需要新的人工批准。
- **每个任务的工具允许列表。** Agent可以浏览；它不能发起电汇，除非该工具被显式启用用于该任务。第13课涵盖预算。
- **会话隔离。** 浏览器agent会话仅使用限定范围的凭证运行。无生产认证，无个人邮箱。每个HTTP请求的日志保留用于审计。
- **内容清理器。** 获取的HTML在连接到模型上下文之前剥离已知的不良模式。（减少简单攻击；不能阻止复杂载荷。）
- **有后果动作的人工介入。** 提议-然后-提交模式（第15课）。
- **记忆上的金丝雀令牌。** 如果记忆条目被触发，用户会看到（第14课）。

## 使用

`code/main.py` 模拟一个针对三个合成页面的微型浏览器agent运行。一个页面是良性的，一个在可见文本中有直接的提示注入块，一个有URL片段注入（不可见但在agent的上下文中）。脚本展示了（a）朴素agent会做什么，（b）读/写边界捕获什么，（c）清理器捕获什么，（d）两者都未捕获什么。

## 交付

`outputs/skill-browser-agent-trust-boundary.md` 划定提议的浏览器agent部署范围：它接触哪些信任区域，它被授权写入什么，以及首次运行前必须就位的防御措施。

## 练习

1. 运行 `code/main.py`。识别清理器能捕获但读/写边界不能捕获的攻击，以及只有读/写边界能捕获的攻击。

2. 扩展清理器以检测一类HashJack风格的URL片段注入。在带有合法片段的良性URL上测量假阳性率。

3. 选择你熟悉的一个真实浏览器agent工作流（例如"预订航班"）。列出每次读取和每次写入。标记哪些写入需要人工介入及其原因。

4. 阅读WebArena-Verified ICLR 2026论文。找出一类原始WebArena评分不可靠的任务，并解释Verified子集如何解决该问题。

5. 为浏览器agent环境设计一个记忆金丝雀。你会存储什么，在哪里存储，什么会触发警报？

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|---|---|---|
| 间接提示注入 | "恶意页面文本" | agent读取的页面中的不受信任内容包含agent执行的指令 |
| Tainted Memories | "记忆攻击" | Agent将攻击者提供的指令写入持久记忆；下个会话中触发 |
| HashJack | "URL片段攻击" | 隐藏在URL片段/查询字符串中的载荷在agent上下文中但未可见渲染 |
| 一次点击劫持 | "恶意按钮" | 可见的界面元素附带agent跟随的后续载荷 |
| BrowseComp | "Web搜索基准" | 在开放网络上查找特定事实；分钟级时域 |
| OSWorld | "桌面基准" | 完整的操作系统控制；多步骤GUI任务 |
| WebArena-Verified | "修复后的Web任务基准" | ServiceNow重新评分的WebArena，带Hard子集 |
| 读/写边界 | "副作用门控" | 读取从不产生后果；内容来自信任外时写入需要新批准 |

## 延伸阅读

- [OpenAI — Introducing ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/) — Operator和深度研究的合并；BrowseComp SOTA。
- [OpenAI — Computer-Using Agent](https://openai.com/index/computer-using-agent/) — Operator谱系和成为ChatGPT agent的架构。
- [Zhou等人 — WebArena](https://webarena.dev/) — 原始基准。
- [WebArena-Verified（OpenReview）](https://openreview.net/forum?id=94tlGxmqkN) — ICLR 2026修复子集论文。
- [Anthropic — 在实践中测量agent自主性](https://www.anthropic.com/research/measuring-agent-autonomy) — 包含计算机使用agent的攻击面讨论。
