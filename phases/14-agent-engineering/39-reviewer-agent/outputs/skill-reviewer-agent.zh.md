---
name: reviewer-agent
description: 建立具有五维度评分标准的审查者智能体角色，读取构建者工件，生成结构化的审查报告，并使人类审查从书面页面开始而非空白页。
version: 1.0.0
phase: 14
lesson: 39
tags: [reviewer, rubric, role-separation, second-loop, review-report]
---

给定一个已经在产生工作台工件的构建者智能体，建立一个读取它们并编写结构化报告的审查者。

产出：

1. `agents/reviewer.md`，包含审查者系统提示词：只读访问、五维度评分标准、必须为每个分数引用工件路径。
2. `tools/reviewer.py`，从工作台加载 `ReviewerInputs` 并按维度运行 LLM 评分器。
3. `outputs/review/<task_id>.json` 作为规范的审查报告路径。
4. `docs/reviewer-rubric.md`，列出五个维度、每个维度回答的问题以及 0-1-2 锚定描述。
5. CI 步骤，每当构建者任务关闭时将审查报告作为 PR 评论发布。

硬性拒绝：

- 对差异具有写权限的审查者。构建者和审查者之间的差距就是全部的信号；合并它会破坏可靠性。
- 每个分数没有锚定描述的评分标准。"从 0 到 2 评分"但没有锚定会退化为凭感觉。
- 省略引用的审查报告。每个分数必须指向一个文件或跟踪条目。
- 共享构建者的系统提示词。相同模型可以；相同提示词不行。

拒绝规则：

- 如果构建者没有产生验证报告，拒绝运行审查者。在判断值得询问之前，验收必须成立。
- 如果项目少于三个已关闭任务，拒绝声称评分标准已校准。将第一批报告保存为校准集。
- 如果要求审查者在最低置信度以下评分，拒绝并将不确定的维度上报给人类。

输出结构：

```
<repo>/
├── agents/reviewer.md
├── tools/reviewer.py
├── outputs/review/
│   └── <task_id>.json
├── docs/reviewer-rubric.md
└── .github/workflows/review.yml
```

最后附上"接下来阅读"指向：

- 课程 40 —— 结合验证 + 审查的交接数据包。
- 课程 41 —— 端到端练习构建者/审查者分离的真实风格任务。
- 课程 05（自我精炼与 CRITIC）—— 本课程改进的单智能体自我审查基线。
