---
name: skill-latency-profiler
description: 编写包含预热、同步、百分位数和内存追踪的完整延迟基准测试脚本
version: 1.0.0
phase: 4
lesson: 15
tags: [edge, deployment, profiling, benchmarking]
---

# 延迟分析器

为任意 PyTorch 模型生成严谨的延迟基准测试。报告结果可为下游任何人所信赖。

## 使用时机

- 在多个候选骨干网络之间进行比较，选择部署目标。
- 量化或剪枝前后。
- 运行时变更后（eager vs ONNX vs TensorRT）。
- 生成部署就绪报告。

## 输入

- `model`: PyTorch `nn.Module`。
- `input_shape`: 元组，如 `(1, 3, 224, 224)`。
- `device`: `cpu` | `cuda` | `mps`。
- `warmup`: 默认 10。
- `iters`: 默认 100。

## 检查项

### 1. 预热
在不计时的情况下运行模型 `warmup` 次。捕获首次前向 JIT 编译和冷缓存效应。

### 2. 同步
对于 `cuda`，在每次计时前向传播前后调用 `torch.cuda.synchronize()`。
对于 `mps`，调用 `torch.mps.synchronize()`。

### 3. 计时器
使用 `time.perf_counter()` 进行时钟计时。转换为毫秒。

### 4. 百分位数
对完整的时间列表排序。报告 `p50, p90, p95, p99, mean, std`。

### 5. 内存
对于 `cuda`，在运行后调用 `torch.cuda.max_memory_allocated()` 并减去基线。
对于 `cpu`，使用 `tracemalloc` 或 `psutil.Process().memory_info().rss` 前后对比。

### 6. 批次大小扫描
可选：对 `batch_size in [1, 4, 16, 32]` 重复基准测试，以揭示吞吐量与延迟的权衡。

## 输出模板

```python
import time
import torch
import psutil, os

def profile(model, input_shape, device="cpu", warmup=10, iters=100):
    proc = psutil.Process(os.getpid())
    baseline_rss = proc.memory_info().rss / 1e6

    model = model.to(device).eval()
    x = torch.randn(input_shape, device=device)

    def sync():
        if device == "cuda":
            torch.cuda.synchronize()
        elif device == "mps":
            torch.mps.synchronize()

    with torch.no_grad():
        for _ in range(warmup):
            model(x)
        sync()
        if device == "cuda":
            torch.cuda.reset_peak_memory_stats()

        times = []
        for _ in range(iters):
            sync()
            t0 = time.perf_counter()
            model(x)
            sync()
            times.append((time.perf_counter() - t0) * 1000)

    times.sort()
    mean = sum(times) / len(times)
    std  = (sum((t - mean) ** 2 for t in times) / len(times)) ** 0.5

    def pct(p):
        idx = max(0, min(len(times) - 1, int(len(times) * p) - 1))
        return times[idx]

    report = {
        "p50_ms":  pct(0.50),
        "p90_ms":  pct(0.90),
        "p95_ms":  pct(0.95),
        "p99_ms":  pct(0.99),
        "mean_ms": mean,
        "std_ms":  std,
        "rss_mb":  proc.memory_info().rss / 1e6 - baseline_rss,
    }
    if device == "cuda":
        report["peak_cuda_mb"] = torch.cuda.max_memory_allocated() / 1e6

    return report
```

## 规则

- 始终运行预热；绝不信赖首次前向的计时。
- 使用百分位数而非平均值——一个离群值可能使平均值翻倍，但对 p50 几乎无影响。
- 使用与生产环境相同的 input_shape；224x224 上的延迟不等于 384x384 上的延迟。
- 对于 CUDA，绝不能省略 `torch.cuda.synchronize()`；没有它，数据毫无意义。
- 将 torch 版本、CUDA 版本和设备名称与数据一同记录——否则数据将失去可比性。
