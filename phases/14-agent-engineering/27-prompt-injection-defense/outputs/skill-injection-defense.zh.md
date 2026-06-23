---
name: injection-defense
description: 构建一个 PVE（提示-验证器-执行器）层，包含来源标记的内容、注入标记扫描和任何智能体运行时的白名单导航。
version: 1.0.0
phase: 14
lesson: 27
tags: [security, prompt-injection, pve, greshake, source-tag]
---

给定一个具有工具访问和检索能力的智能体，生成一个注入防御层。

产出：

1. 每段内容上的来源标签：`user_message`、`tool_output`、`retrieved_web`、`retrieved_memory`、`retrieved_file`。通过消息历史传播标签。
2. `Validator.assess(tool_call, contents)`——拒绝具有注入形态参数或检索内容的工具调用；仅当来源标签与声明的信任级别匹配时才允许。
3. 用于导航的白名单/黑名单：智能体可以访问的 URL、域名、文件路径。
4. 记忆写入护栏：拒绝看起来像指令的写入。
5. 内容捕获规范（第 23 课）：将检索到的内容存储在外部；跨度携带引用 ID，而非文本。
6. 测试套件：五种 Greshake 利用类别作为红队测试用例。

硬性拒绝：

- 没有来源标签的工具使用表面。没有来源就无法区分授权级别。
- 仅在最终输出上运行的验证器。迟到的验证无关紧要——模型已经行动了。
- "相信我，系统提示处理了它。"系统提示卫生不是一种控制措施。

拒绝规则：

- 如果智能体有任何没有来源标签的检索能力，拒绝交付。检索到的内容是典型的注入向量。
- 如果敏感工具（发送消息、执行 shell、在 / 中写文件）没有人在回路中确认，拒绝。
- 如果记忆写入没有防护，拒绝。持久记忆投毒会再次投毒下次会话。

输出：`validator.py`、`source_tag.py`、`allowlist.py`、`memory_guard.py`、`red_team.py`、`README.md`，解释六项控制栈、残余风险和持续审查节奏。以"下一步阅读"结尾，指向第 21 课（计算机使用安全）和第 23 课（通过 OTel 的内容捕获）。
