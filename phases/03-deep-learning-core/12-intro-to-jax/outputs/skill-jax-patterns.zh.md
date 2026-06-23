---
name: skill-jax-patterns
description: JAX 中的函数式编程模式 —— 何时以及如何使用 grad、jit、vmap 和 pmap
version: 1.0.0
phase: 3
lesson: 12
tags: [jax, functional-programming, autodiff, compilation, vectorization]
---

# JAX 函数式模式

JAX 变换纯函数。下面的每个模式都遵循一个规则：编写一个接收输入并返回输出的函数，没有副作用。然后变换它。

## 四种变换

### grad —— 对函数求导

```python
grads = jax.grad(loss_fn)(params, x, y)
loss, grads = jax.value_and_grad(loss_fn)(params, x, y)
```

何时使用：你需要梯度进行优化时。
约束：函数必须返回标量。对于非标量输出，使用 `jax.jacobian`。

### jit —— 编译函数

```python
fast_fn = jax.jit(f)
```

何时使用：函数将被多次调用且输入形状相同时。
约束：不能有依赖于跟踪值的 Python 控制流。条件判断使用 `jax.lax.cond`，循环使用 `jax.lax.scan`。

### vmap —— 向量化函数

```python
batch_fn = jax.vmap(f, in_axes=(None, 0))
```

何时使用：你为一个样本编写了函数，需要它在批次上工作。
`in_axes` 指定要批处理哪个参数轴。`None` 表示不批处理（广播）。

### pmap —— 跨设备并行化

```python
parallel_fn = jax.pmap(f, axis_name='devices')
```

何时使用：你有多个 GPU/TPU 并且想要数据并行。
在函数内部，`jax.lax.pmean(x, 'devices')` 跨设备取平均。

## 组合规则

变换可以组合。顺序很重要：

```python
per_example_grads = jax.jit(jax.vmap(jax.grad(loss_fn), in_axes=(None, 0, 0)))
```

从右到左阅读：对 loss_fn 取梯度、在样本上向量化、编译结果。

有效的组合：
- `jit(grad(f))` —— 编译后的梯度计算
- `jit(vmap(f))` —— 编译后的批处理计算
- `vmap(grad(f))` —— 逐样本梯度
- `pmap(jit(f))` —— 并行编译计算
- `grad(jit(f))` —— 编译后函数的梯度（与 jit(grad(f)) 相同）

## 参数管理模式

JAX 参数是 pytree（数组的嵌套字典）：

```python
params = {
    'layer1': {'w': jnp.zeros((784, 256)), 'b': jnp.zeros(256)},
    'layer2': {'w': jnp.zeros((256, 10)),  'b': jnp.zeros(10)},
}
```

一次性更新所有参数：
```python
params = jax.tree.map(lambda p, g: p - lr * g, params, grads)
```

统计参数数量：
```python
n_params = sum(p.size for p in jax.tree.leaves(params))
```

## PRNG 密钥管理

JAX 需要显式的随机密钥：

```python
key = jax.random.PRNGKey(0)
key, subkey = jax.random.split(key)
noise = jax.random.normal(subkey, shape)
```

对于多个随机操作，一次性分割：
```python
keys = jax.random.split(key, n)
```

永远不要重复使用密钥。使用前总是分割。

## 常见错误

1. **在 jit 内部修改数组**：JAX 数组是不可变的。使用 `x.at[i].set(v)` 而不是 `x[i] = v`。

2. **在 jit 内部使用 Python print**：`print` 在跟踪期间运行，而不是执行期间。使用 `jax.debug.print("{}", x)`。

3. **在 jit 内部对跟踪值使用 Python if/for**：使用 `jax.lax.cond`、`jax.lax.switch`、`jax.lax.scan`、`jax.lax.fori_loop`。

4. **忘记 `.block_until_ready()`**：JAX 使用异步调度。进行基准测试时，调用 `.block_until_ready()` 等待实际完成。

5. **重复使用 PRNG 密钥**：两个使用相同密钥的操作产生相同的"随机"值。总是分割。

6. **JIT 函数中的全局状态**：全局变量在跟踪时被捕获。跟踪后的更改不可见。将所有内容作为参数传递。

## 决策检查清单

1. 函数被多次调用？添加 `@jax.jit`。
2. 需要梯度？用 `jax.grad` 或 `jax.value_and_grad` 包装。
3. 处理一个样本但有批次？用 `jax.vmap` 包装。
4. 有多个设备？用 `jax.pmap` 包装。
5. 使用随机性？显式传递 PRNG 密钥。
6. 对数组值有 Python 控制流？替换为 `jax.lax` 原语。

## 何时使用 JAX

使用 JAX 当：
- 你需要逐样本梯度（差分隐私、Fisher 信息）
- 你在 TPU 上训练（JAX 是原生框架）
- 你需要高阶导数（Hessians、Jacobians）
- 你想将整个训练步骤编译为一个内核
- 你的团队在 Google DeepMind 或 Anthropic

使用 PyTorch 当：
- 你想要最大的生态系统（HuggingFace、torchvision、Lightning）
- 你优先考虑调试便利性而不是原始速度
- 你使用 TorchServe/Triton 在 NVIDIA GPU 上部署
- 你在招聘（更多 PyTorch 开发者存在）
- 你想快速迭代新架构
