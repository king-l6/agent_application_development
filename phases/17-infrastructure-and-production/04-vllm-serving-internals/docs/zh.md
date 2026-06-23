# vLLM 服务内部原理：PagedAttention、Continuous Batching、Chunked Prefill

> vLLM 在 2026 年的主导地位基于三个叠加的默认机制，而非单一技巧。PagedAttention 始终开启。Continuous batching 在解码迭代之间将新请求注入活动批次。Chunked prefill 将长提示切分，使解码 token 永远不匮乏。三个全部开启时，一个 H100 SXM5 上的 Llama 3.3 70B FP8 在 128 并发下可达 2,200-2,400 tok/s — 大约比 vLLM 自身默认高 25%，是朴素 PyTorch 循环的 3-4 倍。本课以你可以绘制的程度讲解调度器和注意力核心，并在 `code/main.py` 中用一个玩具版 continuous batcher 结束，它以 vLLM 的方式调度预填充和解码。

**类型：** 学习
**语言：** Python（标准库，玩具 continuous batching 调度器）
**前置知识：** 阶段 17 · 01（模型服务）、阶段 11（LLM 工程）
**时间：** ~75 分钟

## 学习目标

- 将 PagedAttention 解释为 KV 缓存分配器：块、块表，以及为什么在生产负载下碎片率保持在 4% 以下。
- 在迭代级别绘制 continuous batching：完成的序列如何离开批次，新序列如何加入而不需排空。
- 用一句话描述 chunked prefill，并指出它保护的是哪个延迟指标（提示：是 TTFT 尾部，而非平均吞吐量）。
- 指出 2026 年 vLLM v0.18.0 中那些同时启用所有优化的团队会遇到的陷阱。

## 问题

一个朴素的 PyTorch 服务循环一次处理一个请求：分词、预填充、解码直到 EOS、返回。一个用户时这没问题。一百个用户时，这是一个耐心等待的队列。显而易见的修复 — 静态批处理 — 将每个请求填充到窗口中提示的最长长度，将每个解码填充到预期输出的最长长度，并将整个批次阻塞在最慢序列上。你为从未使用的填充付费，快速请求等待慢速请求。

vLLM 同时解决了三个问题。PagedAttention 阻止 KV 缓存碎片化吞噬 60-80% 的 GPU 内存（经典连续分配方式如此）。Continuous batching 允许请求在每个解码迭代之间加入和离开批次，因此批次始终充满真正的工作。Chunked prefill 将 32k token 的提示分解为约 512 token 的切片，与解码交错，因此长提示不会冻结 GPU 上的每个解码 token。

2026 年的生产默认值是三者全部开启。你需要理解每个的作用，因为失败模式都在调度器上，而不是模型上。

## 概念

### PagedAttention 作为虚拟内存系统

KV 缓存每个序列的大小为 `num_layers x 2 x num_heads x head_dim x seq_len x bytes_per_element`。对于 8192 token 的 Llama 3.3 70B，每个序列在 BF16 下约为 1.25 GB。如果你为每个请求预分配 8192 个槽位，但平均请求只使用 1500 个 token，你会浪费约 82% 的预留 HBM。经典批处理承担这种浪费。

PagedAttention 借鉴了操作系统虚拟内存的思想。KV 缓存不是按序列连续的。它以固定大小的块（默认 16 个 token）分配。每个序列有一个块表，将其逻辑 token 位置映射到物理块 ID。当序列增长超出其已分配块时，增加一个块。当序列完成时，其块返回池中。

碎片率从 60-80%（经典）降至 4% 以下（PagedAttention）。你不需要用标志启用 PagedAttention — 它是 vLLM 唯一提供的分配器。旋钮是 `--gpu-memory-utilization`（默认 0.9），它告诉 vLLM 在加载权重和激活后为 KV 块预留多少 HBM。

### Continuous batching 在迭代级别

旧的"动态批处理"等待一个窗口（比如 10 ms）来填充一个批次，然后运行 预填充 + 解码 + 解码 + 解码 直到每个序列完成。快速序列提前离开，在 GPU 完成慢速序列时空闲等待。

Continuous batching 在每个解码步骤之间操作。将正在运行的序列集合称为 `RUNNING` 列表。在每次迭代中：

1. 任何在 `RUNNING` 中刚刚到达 EOS 或 max_tokens 的序列被移除。
2. 调度器查看等待队列。如果有空闲 KV 块，它接纳新序列（预填充或恢复）。
3. 前向传播在现在 `RUNNING` 中的任何序列上运行，每个序列产生一个新 token。

批次大小从不填充到固定数字。处于输出中不同位置的序列共享一个融合前向传播。在 2026 年的 vLLM 中，这被称为 `V1 scheduler`。关键不变性：调度器每个解码迭代运行一次，而不是每个请求运行一次。

### Chunked prefill 保护 TTFT 尾部

预填充是计算受限的。一个 H100 上的 Llama 3.3 70B 处理 32k token 提示需要约 800 ms 的纯预填充时间。当预填充运行时，批次中每个其他序列的解码 token 都在等待。在服务循环中，一个长提示的首 token 延迟（TTFT）变成了数十个其他用户的 token 间延迟（ITL）波动。

Chunked prefill 将预填充拆分为固定大小的块（默认 512 token），并将每个块作为一个单元调度。在块之间，调度器可以向前推进解码序列一个 token。你为每个块付出微小的绝对预填充延迟代价（几毫秒），换来低得多的解码时间抖动。在已发布的基准测试中，混合负载下的 P99 ITL 从 ~50 ms 降到 ~15 ms。

### 三个默认机制相互配合

三者互为前提。PagedAttention 为调度器提供了一个细粒度的 KV 资源来交易。Continuous batching 需要这种细粒度资源，以便接纳新序列不会强制全局重排。Chunked prefill 是调度器在同一个 `RUNNING` 列表上做出的决策 — 它只是另一个调度器策略，而非独立的系统。

你不需要知道每个标志。你需要知道调度器优化什么：在 KV 块预算约束下的 goodput，受限于 chunked prefill 切片。

### 2026 年 v0.18.0 的陷阱

在 vLLM v0.18.0 中，你不能同时使用 `--enable-chunked-prefill` 和草稿模型推测解码（`--speculative-model`）。文档记录的唯一例外是 V1 调度器中的 N-gram GPU 推测解码。没有阅读发布说明就开启所有标志的团队在启动时会得到运行时错误，而不是温和的性能回退。如果你之前的推测增益值得启用 chunked prefill，请重新审视这个选择 — 2026 年正确的答案往往是 EAGLE-3 不加 chunked prefill，而不是一个无法编译的草稿模型加 chunked prefill。

### 你应该记住的数字

- Llama 3.3 70B FP8，H100 SXM5，128 并发，三者全开：2,200-2,400 tok/s。
- 相同模型，默认 vLLM（无 chunked prefill）：~1,800 tok/s。
- 相同模型，朴素 PyTorch 前向循环：~600 tok/s。
- PagedAttention 在生产负载下的 KV 碎片浪费：<4%。
- 混合负载下的 P99 ITL：使用 chunked prefill 约 15 ms，不使用约 50 ms。

### 调度器的样子

```
while True:
    finished = [s for s in RUNNING if s.is_done()]
    for s in finished: release_blocks(s); RUNNING.remove(s)

    while WAITING and have_free_blocks_for(WAITING[0]):
        s = WAITING.pop(0)
        allocate_initial_blocks(s)
        RUNNING.append(s)

    # 在一个批次中调度预填充块和解码
    batch = []
    for s in RUNNING:
        if s.in_prefill:
            batch.append(next_prefill_chunk(s))   # 例如 512 个 token
        else:
            batch.append(decode_one_token(s))     # 1 个 token

    run_forward(batch)                            # 一次融合 GPU 调用
```

`code/main.py` 正是这个循环，在标准库 Python 中带有假的 token 计数和假的前向延迟。运行它展示了 chunked prefill 如何在长预填充期间保持解码序列存活。

```figure
tensor-parallel
```

## 使用它

`code/main.py` 模拟了一个 vLLM 风格的调度器，带有可开关的功能。运行它以查看：

- `NAIVE` 模式：一次一个请求，无批处理。
- `STATIC` 模式：填充并等待，经典批处理。
- `CONTINUOUS` 模式：迭代级接纳和释放。
- `CONTINUOUS + CHUNKED` 模式：预填充切片与解码交错。

输出显示总吞吐量（每秒虚拟 token）、TTFT 均值和 P99 ITL。`CONTINUOUS + CHUNKED` 行应在混合流量上占优。

## 交付物

本课产出 `outputs/skill-vllm-scheduler-reader.md`。给定服务配置（批次大小、KV 内存利用率、chunked prefill 大小、推测配置），它产生一个调度器诊断，指出三个默认机制中的哪个是瓶颈以及如何调优。

## 练习

1. 运行 `code/main.py`。在混合了短请求和长请求的工作负载上比较 `STATIC` 和 `CONTINUOUS`。吞吐量差距来自哪里 — 预填充效率、解码效率还是尾部延迟？
2. 修改玩具调度器以添加 `--max-num-batched-tokens`。对于运行 Llama 3.3 70B FP8 的 H100，合适的值是多少？（提示：它是 KV 块大小和空闲块数量的函数，而非原始 HBM。）
3. 重新阅读 vLLM v0.18.0 发布说明。哪些标志组合是互斥的？列出它们。
4. 计算 1,000 个请求的 KV 缓存碎片浪费，平均 1,500 个输出 token，标准差 600 个 token，分别使用 (a) 最大 8192 的连续按请求分配，(b) 16 token 块的 PagedAttention。
5. 用一段话解释为什么 chunked prefill 在独立情况下有助于 P99 ITL 而非吞吐量。在实践中吞吐量的提升来自哪里？

## 关键术语

| 术语 | 人们说的是 | 实际含义 |
|------|-----------|---------|
| PagedAttention | "KV 技巧" | KV 缓存的固定大小块分配器；碎片率 <4% |
| 块表 | "页表" | 从逻辑 token 位置到物理 KV 块的每序列映射 |
| Continuous batching | "动态批处理，但做对了" | 每个解码迭代做出接纳/释放决策 |
| Chunked prefill | "预填充拆分" | 将长预填充分解为 512 token 切片，与解码交错 |
| TTFT | "首 token 时间" | 预填充 + 队列 + 网络；长提示时主要由预填充主导 |
| ITL | "token 间延迟" | 连续解码 token 之间的时间；主要由批次大小主导 |
| Goodput | "满足 SLO 的吞吐量" | 每个请求仍然达到 TTFT 和 ITL 目标的 token/秒 |
| V1 scheduler | "新调度器" | vLLM 的 2026 调度器；N-gram 推测解码是与 chunked prefill 兼容的路径 |
| `--gpu-memory-utilization` | "内存旋钮" | 在权重和激活之后为 KV 块保留的 HBM 比例 |

## 进一步阅读

- [vLLM 文档 — 推测解码](https://docs.vllm.ai/en/latest/features/spec_decode/) — 关于 chunked-prefill 和推测解码兼容性的官方来源。
- [vLLM 发布说明（NVIDIA）](https://docs.nvidia.com/deeplearning/frameworks/vllm-release-notes/index.html) — 2026 年发布节奏和版本特定行为。
- [vLLM 博客 — PagedAttention](https://blog.vllm.ai/2023/06/20/vllm.html) — 仍然定义了如何看待分配器的原始文章。
- [PagedAttention 论文（arXiv:2309.06180）](https://arxiv.org/abs/2309.06180) — 碎片分析和调度器设计。
- [Aleksa Gordic — vLLM 内部](https://www.aleksagordic.com/blog/vllm) — 带有火焰图的详细 V1 调度器讲解。
