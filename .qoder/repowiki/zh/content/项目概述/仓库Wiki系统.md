# 仓库Wiki系统

<cite>
**本文引用的文件**   
- [README.md](file://README.md)
- [AGENTS.md](file://AGENTS.md)
- [ROADMAP.md](file://ROADMAP.md)
- [requirements.txt](file://requirements.txt)
- [guardrails-sandbox/backend/main.py](file://guardrails-sandbox/backend/main.py)
- [guardrails-sandbox/backend/pipeline.py](file://guardrails-sandbox/backend/pipeline.py)
- [guardrails-sandbox/backend/adapters/base.py](file://guardrails-sandbox/backend/adapters/base.py)
- [guardrails-sandbox/backend/adapters/rate_limiter.py](file://guardrails-sandbox/backend/adapters/rate_limiter.py)
- [guardrails-sandbox/backend/adapters/injection.py](file://guardrails-sandbox/backend/adapters/injection.py)
- [guardrails-sandbox/backend/adapters/pii_detector.py](file://guardrails-sandbox/backend/adapters/pii_detector.py)
- [guardrails-sandbox/backend/benchmark.py](file://guardrails-sandbox/backend/benchmark.py)
- [guardrails-sandbox/frontend/package.json](file://guardrails-sandbox/frontend/package.json)
- [scripts/install_skills.py](file://scripts/install_skills.py)
- [site/vue-app/summary/scripts/gen-wiki.mjs](file://site/vue-app/summary/scripts/gen-wiki.mjs)
- [site/vue-app/summary/scripts/gen-code-refs.mjs](file://site/vue-app/summary/scripts/gen-code-refs.mjs)
- [site/vue-app/summary/src/components/WikiView.vue](file://site/vue-app/summary/src/components/WikiView.vue)
- [site/vue-app/summary/src/components/SectionCard.vue](file://site/vue-app/summary/src/components/SectionCard.vue)
- [site/vue-app/summary/src/App.vue](file://site/vue-app/summary/src/App.vue)
- [site/vue-app/summary/package.json](file://site/vue-app/summary/package.json)
</cite>

## 更新摘要
**所做更改**   
- 新增GitHub源文件链接功能，支持将本地file://路径转换为可点击的GitHub blob链接
- 改进标题锚点生成算法，支持中文标题和精确匹配跳转
- 优化构建流程，引入Wiki数据预生成和代码引用自动注入机制
- 新增可视化组件架构，包括WikiView、SectionCard等Vue组件
- 移除学习总结章节的相关依赖和影响

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能与可扩展性](#性能与可扩展性)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本仓库是一个"从原理到工程"的AI课程与工具集，包含20个阶段、数百课时的系统化内容，覆盖数学基础、机器学习、深度学习、计算机视觉、NLP、语音、Transformer、生成式AI、强化学习、大模型、多模态、工具协议、智能体工程、基础设施与生产实践、伦理与安全等。同时提供Guardrails交互式沙箱（后端FastAPI + 前端Vue）用于演示安全护栏管线、基准测试与实验台模块；并提供脚本将课程产出物（技能/提示词/智能体）安装到目标环境。

**更新** 新增了Repo Wiki系统，支持GitHub源文件链接、中文标题锚点和可视化的文档浏览体验。

## 项目结构
- 课程组织：phases/<NN>-phase/<NN>-lesson 下统一包含 docs/en.md、code/、outputs/、quiz.json 等，遵循一致的契约。
- 站点与构建：site/ 由 build.js 解析 README 与 ROADMAP 生成 data.js，CI 自动同步。
- **新增** Vue应用：site/vue-app/summary/ 包含Wiki系统、学习笔记和实验台的完整前端实现。
- Guardrails 沙箱：guardrails-sandbox/backend 提供 FastAPI 服务、适配器管线、基准测试与实验台；frontend 为 Vue 应用。
- 自动化脚本：scripts/ 提供审计、计数、安装产物等能力。

```mermaid
graph TB
A["课程根目录"] --> B["phases/ 课程目录"]
A --> C["site/ 站点与构建"]
A --> D["guardrails-sandbox/ 沙箱"]
A --> E["scripts/ 自动化脚本"]
C --> C1["build.js 站点构建"]
C --> C2["vue-app/summary/ Vue应用"]
C2 --> C2a["WikiView.vue Wiki视图"]
C2 --> C2b["SectionCard.vue 内容卡片"]
C2 --> C2c["gen-wiki.mjs Wiki构建脚本"]
C2 --> C2d["gen-code-refs.mjs 代码引用脚本"]
D --> D1["backend/ FastAPI 服务与管线"]
D --> D2["frontend/ Vue 前端"]
E --> E1["install_skills.py 产物安装"]
```

**图表来源**
- [site/vue-app/summary/src/App.vue:1-70](file://site/vue-app/summary/src/App.vue#L1-L70)
- [site/vue-app/summary/src/components/WikiView.vue:1-50](file://site/vue-app/summary/src/components/WikiView.vue#L1-L50)
- [site/vue-app/summary/scripts/gen-wiki.mjs:1-30](file://site/vue-app/summary/scripts/gen-wiki.mjs#L1-L30)
- [site/vue-app/summary/scripts/gen-code-refs.mjs:1-24](file://site/vue-app/summary/scripts/gen-code-refs.mjs#L1-L24)

**章节来源**
- [README.md:87-111](file://README.md#L87-L111)
- [AGENTS.md:15-34](file://AGENTS.md#L15-L34)
- [AGENTS.md:128-136](file://AGENTS.md#L128-L136)
- [site/vue-app/summary/src/App.vue:1-70](file://site/vue-app/summary/src/App.vue#L1-L70)

## 核心组件
- 课程契约与规范：文档前导元数据、代码自终止、单元测试、问答题格式、提交与冲突解决规则。
- 站点构建与同步：README/ROADMAP 驱动站点数据生成，CI 自动修复与重建。
- **新增** Wiki构建系统：gen-wiki.mjs 处理Qoder生成的Wiki数据，gen-code-refs.mjs 注入真实源码引用。
- **新增** 可视化组件：WikiView提供树形导航和内容渲染，SectionCard支持代码引用显示。
- Guardrails 沙箱：
  - 适配器基类与结果对象：统一的 check 接口与返回结构。
  - 管线编排：输入/输出检查、短路拦截、统计与历史。
  - API 路由：聊天、对比模式、开关、基准测试、MCP 代理、实验台。
  - 基准测试：用例执行、指标计算（TPR/FPR/准确率/F1）。
  - 实验台注册表：按 phase 分组、统一运行入口。
- 产物安装器：扫描 outputs 下的 skill/prompt/agent 文件，支持过滤与布局输出。

**章节来源**
- [AGENTS.md:63-113](file://AGENTS.md#L63-L113)
- [AGENTS.md:115-136](file://AGENTS.md#L115-L136)
- [site/vue-app/summary/scripts/gen-wiki.mjs:1-55](file://site/vue-app/summary/scripts/gen-wiki.mjs#L1-L55)
- [site/vue-app/summary/scripts/gen-code-refs.mjs:1-24](file://site/vue-app/summary/scripts/gen-code-refs.mjs#L1-L24)
- [site/vue-app/summary/src/components/WikiView.vue:179-208](file://site/vue-app/summary/src/components/WikiView.vue#L179-L208)
- [site/vue-app/summary/src/components/SectionCard.vue:24-39](file://site/vue-app/summary/src/components/SectionCard.vue#L24-L39)
- [guardrails-sandbox/backend/main.py:1-86](file://guardrails-sandbox/backend/main.py#L1-L86)
- [guardrails-sandbox/backend/pipeline.py:12-56](file://guardrails-sandbox/backend/pipeline.py#L12-L56)
- [guardrails-sandbox/backend/benchmark.py:10-27](file://guardrails-sandbox/backend/benchmark.py#L10-L27)
- [guardrails-sandbox/backend/playground/registry.py:48-84](file://guardrails-sandbox/backend/playground/registry.py#L48-L84)
- [scripts/install_skills.py:229-287](file://scripts/install_skills.py#L229-L287)

## 架构总览
Guardrails 沙箱采用"适配器 + 管线 + 服务"的分层设计，同时新增Wiki系统的"构建脚本 + 可视化组件"架构：
- **新增** Wiki构建层：gen-wiki.mjs 处理分类树和正文，gen-code-refs.mjs 注入源码引用。
- **新增** 可视化层：WikiView提供树形导航和Markdown渲染，SectionCard支持代码引用展示。
- 适配器层：实现具体安全检查逻辑（速率限制、注入检测、PII 检测等），通过统一基类接入。
- 管线层：按类别与顺序调度适配器，支持短路拦截、统计与历史记录。
- 服务层：暴露 REST API，串联输入检查、LLM 调用、输出检查，并集成基准测试与实验台。

```mermaid
graph TB
subgraph "Wiki构建层"
GW["gen-wiki.mjs<br/>Wiki数据处理"]
GC["gen-code-refs.mjs<br/>代码引用注入"]
end
subgraph "可视化组件层"
WV["WikiView.vue<br/>树形导航+渲染"]
SC["SectionCard.vue<br/>内容卡片"]
end
subgraph "服务层"
M["main.py<br/>FastAPI 路由"]
P["pipeline.py<br/>Pipeline 编排"]
B["benchmark.py<br/>BenchmarkRunner"]
R["playground/registry.py<br/>实验台注册表"]
end
subgraph "适配器层"
BASE["adapters/base.py<br/>GuardrailAdapter/GuardrailResult"]
RL["adapters/rate_limiter.py<br/>RateLimiter"]
INJ["adapters/injection.py<br/>InjectionDetector"]
PII["adapters/pii_detector.py<br/>PiiDetector"]
end
GW --> WV
GC --> SC
WV --> M
SC --> P
M --> BASE
M --> B
M --> R
P --> RL
P --> INJ
P --> PII
```

**图表来源**
- [site/vue-app/summary/scripts/gen-wiki.mjs:1-55](file://site/vue-app/summary/scripts/gen-wiki.mjs#L1-L55)
- [site/vue-app/summary/scripts/gen-code-refs.mjs:1-24](file://site/vue-app/summary/scripts/gen-code-refs.mjs#L1-L24)
- [site/vue-app/summary/src/components/WikiView.vue:1-50](file://site/vue-app/summary/src/components/WikiView.vue#L1-L50)
- [site/vue-app/summary/src/components/SectionCard.vue:1-40](file://site/vue-app/summary/src/components/SectionCard.vue#L1-L40)
- [guardrails-sandbox/backend/main.py:78-128](file://guardrails-sandbox/backend/main.py#L78-L128)
- [guardrails-sandbox/backend/pipeline.py:12-56](file://guardrails-sandbox/backend/pipeline.py#L12-L56)
- [guardrails-sandbox/backend/adapters/base.py:14-30](file://guardrails-sandbox/backend/adapters/base.py#L14-L30)

## 详细组件分析

### Wiki构建系统
- gen-wiki.mjs：处理Qoder生成的Wiki数据，将分类树和正文打包成前端可用的数据结构。
- gen-code-refs.mjs：扫描笔记中的代码引用，读取真实源码并生成映射文件。
- GitHub源文件链接：自动将本地file://路径转换为可点击的GitHub blob链接。
- 密钥脱敏：在构建过程中自动清理敏感信息。

```mermaid
flowchart TD
Start(["开始构建"]) --> ReadMeta["读取repowiki-metadata.json"]
ReadMeta --> ProcessContent["处理content目录下的MD文件"]
ProcessContent --> CleanLinks["清理file://链接为GitHub链接"]
CleanLinks --> RedactSecrets["脱敏敏感信息"]
RedactSecrets --> GenerateData["生成wiki.generated.js"]
GenerateData --> Done(["构建完成"])
```

**图表来源**
- [site/vue-app/summary/scripts/gen-wiki.mjs:57-135](file://site/vue-app/summary/scripts/gen-wiki.mjs#L57-L135)
- [site/vue-app/summary/scripts/gen-code-refs.mjs:59-107](file://site/vue-app/summary/scripts/gen-code-refs.mjs#L59-L107)

**章节来源**
- [site/vue-app/summary/scripts/gen-wiki.mjs:1-138](file://site/vue-app/summary/scripts/gen-wiki.mjs#L1-L138)
- [site/vue-app/summary/scripts/gen-code-refs.mjs:1-107](file://site/vue-app/summary/scripts/gen-code-refs.mjs#L1-L107)

### 可视化组件架构
- WikiView：提供树形导航、搜索过滤、Markdown渲染和Mermaid图表支持。
- SectionCard：支持多种内容块类型，包括文本、列表、表格、流程图、问答和代码引用。
- 中文标题锚点：改进的headingId函数支持中文标题的精确匹配和跳转。
- 异步加载：WikiView使用defineAsyncComponent避免拖慢首屏加载。

```mermaid
classDiagram
class WikiView {
+ref q 搜索关键词
+ref expanded 展开状态
+ref activeDocId 当前文档ID
+computed filteredTree 过滤后的树
+function headingId() 生成标题ID
+function onDocClick() 处理锚点点击
}
class SectionCard {
+props section 内容区块
+ref expanded 代码引用展开状态
+function resolveRef() 解析代码引用
}
class App {
+ref topTab 顶层标签
+ref pgTab 实验台标签
+const noteTabs 笔记标签
}
WikiView --> SectionCard : 使用
App --> WikiView : 异步加载
App --> SectionCard : 间接使用
```

**图表来源**
- [site/vue-app/summary/src/components/WikiView.vue:127-177](file://site/vue-app/summary/src/components/WikiView.vue#L127-L177)
- [site/vue-app/summary/src/components/SectionCard.vue:72-91](file://site/vue-app/summary/src/components/SectionCard.vue#L72-L91)
- [site/vue-app/summary/src/App.vue:73-98](file://site/vue-app/summary/src/App.vue#L73-L98)

**章节来源**
- [site/vue-app/summary/src/components/WikiView.vue:1-575](file://site/vue-app/summary/src/components/WikiView.vue#L1-L575)
- [site/vue-app/summary/src/components/SectionCard.vue:1-92](file://site/vue-app/summary/src/components/SectionCard.vue#L1-L92)
- [site/vue-app/summary/src/App.vue:1-157](file://site/vue-app/summary/src/App.vue#L1-L157)

### 适配器基类与结果对象
- GuardrailAdapter：定义 name、display_name、description、group、category、order、enabled 等元信息，以及 check(text, context) 抽象方法。
- GuardrailResult：结构化返回 passed、reason、details、confidence、latency_ms。

```mermaid
classDiagram
class GuardrailAdapter {
+string name
+string display_name
+string description
+string group
+string category
+int order
+bool enabled
+check(text, context) GuardrailResult
}
class GuardrailResult {
+bool passed
+string reason
+dict details
+float confidence
+float latency_ms
}
class RateLimiter {
+check(text, context) GuardrailResult
}
class InjectionDetector {
+check(text, context) GuardrailResult
}
class PiiDetector {
+check(text, context) GuardrailResult
}
GuardrailAdapter <|-- RateLimiter
GuardrailAdapter <|-- InjectionDetector
GuardrailAdapter <|-- PiiDetector
GuardrailAdapter --> GuardrailResult : "返回"
```

**图表来源**
- [guardrails-sandbox/backend/adapters/base.py:14-30](file://guardrails-sandbox/backend/adapters/base.py#L14-L30)
- [guardrails-sandbox/backend/adapters/rate_limiter.py:7-14](file://guardrails-sandbox/backend/adapters/rate_limiter.py#L7-L14)
- [guardrails-sandbox/backend/adapters/injection.py:44-51](file://guardrails-sandbox/backend/adapters/injection.py#L44-L51)
- [guardrails-sandbox/backend/adapters/pii_detector.py:19-26](file://guardrails-sandbox/backend/adapters/pii_detector.py#L19-L26)

**章节来源**
- [guardrails-sandbox/backend/adapters/base.py:1-34](file://guardrails-sandbox/backend/adapters/base.py#L1-L34)

### 管线编排（Pipeline）
- 注册与排序：register(adapter) 后按 (order, name) 排序。
- 输入检查：run_input_checks 遍历 input 适配器，遇到未通过则短路返回。
- 输出检查：process_output 对 LLM 输出进行校验，支持脱敏文本回传。
- 统计与历史：by_layer 统计、block_history 保留最近若干条。

```mermaid
flowchart TD
Start(["进入 process_output"]) --> RunChecks["运行 output 适配器链"]
RunChecks --> AnyBlocked{"是否被拦截?"}
AnyBlocked --> |是| RecordBlock["记录拦截历史与统计"]
RecordBlock --> ReturnBlocked["返回 blocked=True 与日志"]
AnyBlocked --> |否| UseScrubbed["使用脱敏后的输出(如有)"]
UseScrubbed --> RecordPass["更新通过统计"]
RecordPass --> ReturnOK["返回 blocked=False 与最终文本"]
```

**图表来源**
- [guardrails-sandbox/backend/pipeline.py:129-160](file://guardrails-sandbox/backend/pipeline.py#L129-L160)
- [guardrails-sandbox/backend/pipeline.py:264-285](file://guardrails-sandbox/backend/pipeline.py#L264-L285)

**章节来源**
- [guardrails-sandbox/backend/pipeline.py:12-56](file://guardrails-sandbox/backend/pipeline.py#L12-L56)
- [guardrails-sandbox/backend/pipeline.py:129-160](file://guardrails-sandbox/backend/pipeline.py#L129-L160)
- [guardrails-sandbox/backend/pipeline.py:188-235](file://guardrails-sandbox/backend/pipeline.py#L188-L235)

### 服务层（FastAPI）
- 预加载模型：启动前加载本地语义模型，避免异步环境下载问题。
- 路由：
  - /api/chat：输入检查 → LLM 调用 → 输出检查 → 返回响应与延迟。
  - /api/chat/compare：无护栏 vs 有护栏对比。
  - /api/guardrails/*：获取适配器树、统计、历史、开关。
  - /api/benchmark：运行基准测试。
  - /api/mcp/*：通过 MCP SDK 调用外部工具。
  - /api/playground/*：实验台模块列表与运行。
  - /api/checkpoints/*：检查点数据库查看。

```mermaid
sequenceDiagram
participant Client as "客户端"
participant API as "FastAPI(main.py)"
participant Pipe as "Pipeline(pipeline.py)"
participant LLM as "LLM 客户端(llm_client.py)"
Client->>API : POST /api/chat
API->>Pipe : run_input_checks(message, context)
alt 输入被拦截
Pipe-->>API : blocked=True, logs
API-->>Client : ChatResponse(blocked=True)
else 输入通过
API->>LLM : chat_with_retry(messages)
LLM-->>API : llm_text
API->>Pipe : process_output(input, llm_text)
Pipe-->>API : blocked? + logs + scrubbed
API-->>Client : ChatResponse(response, blocked, logs, latency)
end
```

**图表来源**
- [guardrails-sandbox/backend/main.py:155-220](file://guardrails-sandbox/backend/main.py#L155-L220)
- [guardrails-sandbox/backend/pipeline.py:129-160](file://guardrails-sandbox/backend/pipeline.py#L129-L160)

**章节来源**
- [guardrails-sandbox/backend/main.py:61-86](file://guardrails-sandbox/backend/main.py#L61-L86)
- [guardrails-sandbox/backend/main.py:121-153](file://guardrails-sandbox/backend/main.py#L121-L153)
- [guardrails-sandbox/backend/main.py:223-256](file://guardrails-sandbox/backend/main.py#L223-L256)
- [guardrails-sandbox/backend/main.py:272-280](file://guardrails-sandbox/backend/main.py#L272-L280)
- [guardrails-sandbox/backend/main.py:324-356](file://guardrails-sandbox/backend/main.py#L324-L356)
- [guardrails-sandbox/backend/main.py:368-377](file://guardrails-sandbox/backend/main.py#L368-L377)
- [guardrails-sandbox/backend/main.py:389-403](file://guardrails-sandbox/backend/main.py#L389-L403)

### 基准测试引擎
- 用例执行：对每个用例仅运行输入检查（不调 LLM），对比预期与实际。
- 指标计算：准确率、TPR/FPR、精确率、F1、平均延迟等。
- 分类与分层统计：按类别与拦截层汇总。

```mermaid
flowchart TD
Init(["初始化 BenchmarkRunner"]) --> Cases["遍历 ALL_CASES 或指定类别"]
Cases --> RunCheck["pipeline.run_input_checks(tc.input, ctx)"]
RunCheck --> Compare{"expected_pass == actual_pass ?"}
Compare --> |是| RecordCorrect["标记正确"]
Compare --> |否| RecordWrong["标记错误"]
RecordCorrect --> Next["继续下一个用例"]
RecordWrong --> Next
Next --> Report["_build_report() 计算指标与报告"]
```

**图表来源**
- [guardrails-sandbox/backend/benchmark.py:14-27](file://guardrails-sandbox/backend/benchmark.py#L14-L27)
- [guardrails-sandbox/backend/benchmark.py:82-168](file://guardrails-sandbox/backend/benchmark.py#L82-L168)

**章节来源**
- [guardrails-sandbox/backend/benchmark.py:10-27](file://guardrails-sandbox/backend/benchmark.py#L10-L27)
- [guardrails-sandbox/backend/benchmark.py:82-168](file://guardrails-sandbox/backend/benchmark.py#L82-L168)

### 实验台模块注册表
- 集中注册 PlaygroundModule，提供 list_grouped() 与 run(name, inputs)。
- 按 phase 分组展示，支持 input_schema 描述，便于前端渲染导航与表单。

**章节来源**
- [guardrails-sandbox/backend/playground/registry.py:48-84](file://guardrails-sandbox/backend/playground/registry.py#L48-L84)
- [guardrails-sandbox/backend/playground/registry.py:87-118](file://guardrails-sandbox/backend/playground/registry.py#L87-L118)

### 课程产物安装器
- 扫描 phases/**/outputs 下的 skill/prompt/agent 文件，解析 frontmatter。
- 支持类型、阶段、标签过滤，三种布局（flat/by-phase/skills），输出 manifest.json。

**章节来源**
- [scripts/install_skills.py:229-287](file://scripts/install_skills.py#L229-L287)
- [scripts/install_skills.py:91-136](file://scripts/install_skills.py#L91-L136)
- [scripts/install_skills.py:157-191](file://scripts/install_skills.py#L157-L191)
- [scripts/install_skills.py:200-226](file://scripts/install_skills.py#L200-L226)

## 依赖关系分析
- 运行时依赖：Python 生态库（numpy、torch、transformers、datasets、tokenizers、accelerate、scikit-learn、pandas、pillow、librosa、soundfile、tiktoken、anthropic、openai 等）。
- **新增** Vue应用依赖：Vue 3、Vite、TypeScript、marked、highlight.js、mermaid。
- 服务依赖：FastAPI、uvicorn、pydantic、CORS、MCP SDK（在沙箱中调用外部 MCP 服务器）。

```mermaid
graph LR
Req["requirements.txt"] --> PyLibs["Python 库集合"]
FE["frontend/package.json"] --> Vue["Vue/Vite/TS"]
SummaryFE["vue-app/summary/package.json"] --> SummaryDeps["marked/highlight.js/mermaid"]
Main["main.py"] --> FastAPI["FastAPI/Uvicorn"]
Main --> Pipeline["pipeline.py"]
Pipeline --> Adapters["adapters/*.py"]
Main --> Bench["benchmark.py"]
Main --> Play["playground/registry.py"]
```

**图表来源**
- [requirements.txt:1-19](file://requirements.txt#L1-L19)
- [guardrails-sandbox/frontend/package.json:1-21](file://guardrails-sandbox/frontend/package.json#L1-L21)
- [site/vue-app/summary/package.json:16-26](file://site/vue-app/summary/package.json#L16-L26)
- [guardrails-sandbox/backend/main.py:78-86](file://guardrails-sandbox/backend/main.py#L78-L86)

**章节来源**
- [requirements.txt:1-19](file://requirements.txt#L1-L19)
- [guardrails-sandbox/frontend/package.json:1-21](file://guardrails-sandbox/frontend/package.json#L1-L21)
- [site/vue-app/summary/package.json:1-28](file://site/vue-app/summary/package.json#L1-L28)

## 性能与可扩展性
- 适配器短路：输入/输出检查一旦失败立即返回，降低不必要开销。
- 统计与历史：by_layer 统计与 block_history 有助于定位瓶颈与误拦热点。
- 基准测试：提供 TPR/FPR/准确率/F1 等指标，便于评估不同适配器的效果与代价。
- **新增** 异步加载：WikiView使用defineAsyncComponent避免拖慢首屏加载。
- **新增** 代码引用缓存：gen-code-refs.mjs生成映射文件，避免重复读取源码。
- 扩展建议：
  - 新增适配器：继承 GuardrailAdapter，实现 check，设置 group/category/order/name，并在 main 中 register。
  - 并行化：对独立适配器可考虑并发执行（注意上下文共享与线程安全）。
  - 缓存：对高成本适配器引入语义缓存或键值缓存，减少重复计算。
  - 配置化：将阈值、白名单、黑名单外置为配置，支持热更新。

## 故障排查指南
- 模型加载失败：启动时预加载本地模型，若离线不可用需确保缓存存在或网络可达。
- 适配器未生效：确认已 register 且 enabled=True，order 合理，category 匹配 input/output。
- 基准测试异常：检查用例 expected_pass 与实际逻辑一致性，关注 rate_limiter 状态隔离。
- 站点构建不一致：README 链接缺失会导致 site/data.js 无法解析，按 AGENTS.md 冲突解决流程修复。
- **新增** Wiki构建失败：检查.gen-wiki.mjs和gen-code-refs.mjs的执行权限，确认.qoder/repowiki目录存在。
- **新增** 中文锚点失效：确认headingId函数正确处理中文标题，检查CSS.escape编码。

**章节来源**
- [guardrails-sandbox/backend/main.py:61-76](file://guardrails-sandbox/backend/main.py#L61-L76)
- [guardrails-sandbox/backend/pipeline.py:18-23](file://guardrails-sandbox/backend/pipeline.py#L18-L23)
- [guardrails-sandbox/backend/benchmark.py:29-60](file://guardrails-sandbox/backend/benchmark.py#L29-L60)
- [AGENTS.md:161-183](file://AGENTS.md#L161-L183)
- [site/vue-app/summary/scripts/gen-wiki.mjs:57-62](file://site/vue-app/summary/scripts/gen-wiki.mjs#L57-L62)
- [site/vue-app/summary/src/components/WikiView.vue:184-189](file://site/vue-app/summary/src/components/WikiView.vue#L184-L189)

## 结论
该仓库以"从原理到工程"的课程体系为核心，辅以 Guardrails 沙箱与自动化脚本，形成"学-练-用-产"闭环。新增的Wiki系统提供了更好的文档浏览体验，支持GitHub源文件链接、中文标题锚点和可视化的内容展示。适配器+管线的解耦设计使安全策略易于扩展与评估；基准测试与实验台为教学与工程实践提供了直观工具。建议在持续演进中完善配置化与缓存机制，提升性能与可维护性。

## 附录
- 课程契约要点：
  - 文档前导元数据、代码自终止、单元测试、问答题格式。
  - 提交规范、依赖白名单、禁止提交生成文件。
- 站点构建与 CI：
  - README/ROADMAP 驱动 data.js 生成，CI 自动修复与重建。
- **新增** Wiki构建流程：
  - gen-wiki.mjs处理分类树和正文，gen-code-refs.mjs注入源码引用。
  - 支持predev和prebuild钩子自动执行构建脚本。
- 沙箱运行方式：
  - 启动 uvicorn 服务，访问 /api/* 端点；前端静态资源挂载于根路径。
- **新增** Vue应用架构：
  - 顶层标签页：学习笔记、实验台、Repo Wiki。
  - 异步加载WikiView避免拖慢首屏。
  - 支持Mermaid图表渲染和代码高亮。

**章节来源**
- [AGENTS.md:63-113](file://AGENTS.md#L63-L113)
- [AGENTS.md:115-136](file://AGENTS.md#L115-L136)
- [guardrails-sandbox/backend/main.py:406-421](file://guardrails-sandbox/backend/main.py#L406-L421)
- [site/vue-app/summary/package.json:6-14](file://site/vue-app/summary/package.json#L6-L14)
- [site/vue-app/summary/src/App.vue:73-98](file://site/vue-app/summary/src/App.vue#L73-L98)