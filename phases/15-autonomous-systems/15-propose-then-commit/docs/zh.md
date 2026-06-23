# Human-in-the-Loop: Propose-Then-Commit（人在回路中：提议-提交模式）

> 2026 年关于 HITL 的共识是具体的。它不是"代理询问，用户点击批准"。而是提议-提交：提议的操作持久化到具有幂等键的持久化存储中；以意图、数据血缘、涉及的权限、影响范围和回滚计划的形式呈现给审查者；仅在获得肯定确认后提交；执行后验证以确认副作用确实发生了。LangGraph 的 `interrupt()` 加 PostgreSQL 检查点、Microsoft Agent Framework 的 `RequestInfoEvent` 和 Cloudflare 的 `waitForApproval()` 都实现了相同的形态。经典的失效模式是橡皮图章式批准：点击"批准"时未经审查。已记录的缓解措施是带有明确清单的挑战-响应机制。

**类型：** 理论学习
**语言：** Python（标准库，带有幂等性的提议-提交状态机）
**前置要求：** 第 15 阶段 · 12（持久化执行），第 15 阶段 · 14（触发机制）
**预计时间：** ~60 分钟

## 问题

代理执行一个操作。用户必须决定：批准还是不批准。如果决定是即时的，那可能不是真正的审查。如果决定是有结构的，那么它很慢但值得信赖。工程问题是如何让结构化审查成为阻力最小的路径。

2023 时代的 HITL 模式是同步提示："代理想要向 X 发送邮件，内容为 Y —— 批准？"用户点击批准。每个人都觉得系统是安全的。实际上，这种表面被大量橡皮图章式批准：用户快速批准，批准预测不了什么，当代理出错时，审计追踪显示一长串用户无法回忆的批准历史。

2026 模式——提议-提交——将 HITL 转移到持久化基础上，附加结构化元数据，并要求积极提交。每个托管代理 SDK 都发布了相应版本：LangGraph `interrupt()`、Microsoft Agent Framework `RequestInfoEvent`、Cloudflare `waitForApproval()`。API 名称不同，但形态一致。

## 概念

### 提议-提交状态机

1. **提议。** 代理生成提议的操作。持久化到持久存储（PostgreSQL、Redis、Durable Object）。包括：
   - 意图（代理为什么要这样做）
   - 数据血缘（什么源内容导致了这个提议）
   - 涉及的权限（哪些作用域/文件/端点）
   - 影响范围（最坏情况是什么）
   - 回滚计划（如果提交了，如何撤销）
   - 幂等键（每个提议唯一；重新提交返回相同记录）
2. **呈现。** 审查者看到带有所有元数据的提议。审查者是人（而非代理自我审查）。
3. **提交。** 肯定确认。操作执行。
4. **验证。** 执行后，读回副作用并确认。如果验证步骤失败，系统处于已知的坏状态，告警触发。

### 幂等键

没有幂等键，在临时故障后重试可能会重复执行已批准的操作。具体示例：用户批准"从 A 转账 100 美元到 B"。网络闪断。工作流重试。用户已批准一次，但转账执行了两次。幂等键将批准绑定到单个唯一的副作用；第二次执行是无操作的。

这与 Stripe 和 AWS API 使用的幂等模式相同。在微软 Agent Framework 文档中明确将其用于代理批准。

### 持久性：为什么批准能超越进程存活

批准等待室是一段代理不拥有的状态。工作流暂停（第 12 课）。当批准到达时，工作流从该确切点恢复。这就是为什么 LangGraph 将 `interrupt()` 与 PostgreSQL 检查点配对，而不仅仅是内存状态——两天后的批准仍然能找到完整的工作流。

### 橡皮图章式批准与挑战-响应缓解措施

HITL 的默认 UI（"批准"/"拒绝"按钮）产生快速批准，没有真正的审查。已记录的缓解措施：一个挑战-响应清单，要求在批准按钮启用之前对特定问题给出肯定回答。具体形态：

- "你理解这涉及什么资源吗？[ ]"
- "你已验证影响范围是可接受的吗？[ ]"
- "如果失败，你有回滚计划吗？[ ]"

这不是为了官僚而官僚——而是一种强制机制。无法勾选框的审查者要么要求澄清（升级），要么拒绝（安全默认）。Anthropic 的代理安全研究明确引用清单驱动的 HITL 作为橡皮图章式批准模式的缓解措施。

### 什么算关键操作

并非每个操作都需要提议-提交。2026 年的指导：

- **关键操作**（总是需要 HITL）：不可逆写入、金融交易、对外通信、生产数据库更改、破坏性文件系统操作。
- **可逆操作**（有时需要 HITL）：编辑本地文件、预发布环境更改、有明确回滚的可逆写入。
- **读取和检查**（从不需要 HITL）：读取文件、列出资源、调用只读 API。

### 操作后验证

"提交已运行"不等同于"副作用已发生"。网络分区和竞态条件可能导致工作流认为成功，而后端未持久化。验证步骤在提交后重新读取目标资源以确认。这与数据库事务中使用 `RETURNING` 子句或 AWS `PutObject` 后的 `GetObject` 模式相同。

### 欧盟 AI 法案第 14 条

第 14 条要求对欧盟高风险 AI 系统进行有效的人类监督。"有效"不是装饰性的。监管语言特别排除了橡皮图章式批准模式。带有挑战-响应机制的提议-提交是微软 Agent Governance Toolkit 合规文档中能够经受第 14 条审查的形态。

## 使用

`code/main.py` 使用标准库 Python 实现了一个提议-提交状态机。持久存储是一个 JSON 文件。幂等键是 (thread_id, action_signature) 的哈希。驱动程序模拟三种情况：干净的批准流程、临时故障后的重试（不能重复执行）、以及橡皮图章默认与挑战-响应流程的对比。

## 交付

`outputs/skill-hitl-design.md` 审查建议的 HITL 工作流是否符合提议-提交形态，并标记缺失的元数据、幂等性、验证或挑战-响应层。

## 练习

1. 运行 `code/main.py`。确认已批准提议的重试使用持久化记录且不会重新执行。然后将幂等键改为包含时间戳，显示重试会重复执行。

2. 在提议记录中添加 `rollback` 字段。模拟一个验证步骤失败的执行。显示回滚自动触发。

3. 阅读 Microsoft Agent Framework 的 `RequestInfoEvent` 文档。找出 API 包含但模拟引擎缺少的一个元数据字段。添加它并解释它防范什么。

4. 为特定操作设计一个挑战-响应清单（例如"在公共 Twitter 账号上发布"）。审查者必须回答哪三个问题？为什么是这三个？

5. 选择一个同步"批准？"提示可以足够的情况（不需要持久存储）。解释原因，并说明你接受的风险类别。

## 关键术语

| 术语 | 人们所说的 | 实际含义 |
|---|---|---|
| Propose-then-commit | "两阶段批准" | 持久化提议 + 积极提交 + 验证 |
| Idempotency key | "重试安全令牌" | 每个提议唯一；第二次执行无操作 |
| Data lineage | "数据来源" | 导致提议的特定源内容 |
| Blast radius | "最坏情况" | 如果操作失败的影响范围 |
| Rubber-stamp | "快速批准" | 未经真正审查就点击"批准" |
| Challenge-and-response | "强制清单" | 审查者必须肯定回答特定问题 |
| RequestInfoEvent | "MS Agent Framework 原语" | 带有结构化元数据的持久化 HITL 请求 |
| `interrupt()` / `waitForApproval()` | "框架原语" | LangGraph / Cloudflare 的等价实现 |

## 进一步阅读

- [Microsoft Agent Framework — Human in the loop](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop) —— `RequestInfoEvent`、持久化批准。
- [Cloudflare Agents — Human in the loop](https://developers.cloudflare.com/agents/concepts/human-in-the-loop/) —— `waitForApproval()` 和 Durable Objects。
- [Anthropic — Measuring agent autonomy in practice](https://www.anthropic.com/research/measuring-agent-autonomy) —— HITL 作为长期风险的缓解措施。
- [EU AI Act — Article 14: Human oversight](https://artificialintelligenceact.eu/article/14/) —— 高风险系统的监管基线。
- [Anthropic — Claude's Constitution (January 2026)](https://www.anthropic.com/news/claudes-constitution) —— 围绕监督的宪法框架。
