# 降维

> 高维数据有结构。你通过从正确的角度观察来发现它。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 1，第 01 课（线性代数直觉）、第 02 课（向量、矩阵与运算）、第 03 课（特征值与特征向量）、第 06 课（概率与分布）
**时间：** ~90 分钟

## 学习目标

- 从头实现 PCA：居中数据、计算协方差矩阵、特征分解和投影
- 使用解释方差比和肘部法选择主成分数量
- 比较 PCA、t-SNE 和 UMAP 在 2D 中可视化 MNIST 数字，并解释它们的权衡
- 使用带 RBF 核的核 PCA 来分离标准 PCA 无法处理的非线性数据结构

## 问题

你有一个每样本 784 个特征的数据集。可能是手写数字的像素值。可能是基因表达水平。可能是用户行为信号。你无法可视化 784 个维度。你无法绘制它们。你甚至无法思考它们。

但其中 784 个特征中的大部分是冗余的。实际信息存在于一个更小的表面上。一个手写的"7"不需要 784 个独立的数字来描述。它只需要几个：笔画的倾斜角度、横杠的长度、它有多倾斜。其余的是噪声。

降维找到那个更小的表面。它将你的 784 维数据压缩到 2、10 或 50 维，同时保留重要的结构。

## 概念

### 维度的诅咒

高维空间是反直觉的。随着维度的增长，三件事会崩溃。

**距离变得毫无意义。** 在高维空间中，任意两个随机点之间的距离收敛到相同的值。如果每个点与其他每个点的距离大致相同，最近邻搜索就停止工作了。

```
维度    平均距离比（随机点之间的最大/最小）
2           ~5.0
10          ~1.8
100         ~1.2
1000        ~1.02
```

**体积集中在角落。** d 维的单位超立方体有 2^d 个角落。在 100 维中，几乎所有的体积都在角落中，远离中心。数据点扩散到边缘，你的模型在内部缺乏数据。

**你需要指数级更多的数据。** 为了在空间中维持相同的样本密度，从 2D 到 20D 意味着你需要 10^18 倍的数据。你永远不会有这么多。降低维度使数据密度恢复到可用的水平。

### PCA：找到重要的方向

主成分分析（PCA）找到数据变化最大的轴。它旋转你的坐标系，使得第一个轴捕获最大的方差，第二个轴捕获次大的，以此类推。

算法：

```
1. 居中数据        （从每个特征中减去均值）
2. 计算协方差      （特征如何一起变化）
3. 特征分解        （找到主要方向）
4. 按特征值排序    （最大方差优先）
5. 投影            （保留前 k 个特征向量，丢弃其余的）
```

为什么用特征分解？协方差矩阵是对称且半正定的。它的特征向量是特征空间中的正交方向。特征值告诉你每个方向捕获了多少方差。具有最大特征值的特征向量指向最大方差的方向。

```mermaid
graph LR
    A["原始数据（2D）\n数据在 x 和 y\n方向都扩散"] -->|"PCA 旋转"| B["PCA 后\nPC1 捕获拉长的扩散方向\nPC2 捕获狭窄的扩散方向\n丢弃 PC2 几乎不丢失信息"]
```

- **PCA 前：** 数据云在 x 和 y 轴上对角扩散
- **PCA 后：** 坐标系被旋转，使得 PC1 与最大方差方向（拉长的扩散）对齐，PC2 与最小方差方向（狭窄的扩散）对齐
- **降维：** 丢弃 PC2 将数据投影到 PC1 上，损失非常少的信息

### 解释方差比

每个主成分捕获总方差的一部分。解释方差比告诉你多少。

```
成分        特征值      解释比例      累积
PC1          4.73        0.473        0.473
PC2          2.51        0.251        0.724
PC3          1.12        0.112        0.836
PC4          0.89        0.089        0.925
...
```

当累积解释方差达到 0.95 时，你知道这么多成分捕获了 95% 的信息。之后的几乎都是噪声。

### 选择成分数量

三种策略：

1. **阈值。** 保留足够多的成分以解释 90-95% 的方差。
2. **肘部法。** 绘制每个成分的解释方差。寻找急剧下降处。
3. **下游性能。** 使用 PCA 作为预处理。扫描 k 并测量模型的精度。最佳 k 是精度趋于稳定的地方。

### t-SNE：保留邻域

t-分布随机邻域嵌入（t-SNE）专为可视化设计。它将高维数据映射到 2D（或 3D），同时保留哪些点彼此靠近。

直觉：在原始空间中，基于点对之间的距离计算概率分布。近的点获得高概率。远的点获得低概率。然后找到保持相同概率分布的 2D 排列。在 784 维中相邻的点在 2D 中保持相邻。

t-SNE 的关键特性：
- 非线性。它可以展开 PCA 无法处理的复杂流形。
- 随机性。不同的运行产生不同的布局。
- 困惑度参数控制要考虑多少个邻居（典型范围：5-50）。
- 输出中簇之间的距离没有意义。只有簇本身有意义。
- 在大数据集上慢。默认为 O(n^2)。

### UMAP：更快，更好的全局结构

均匀流形近似与投影（UMAP）的工作方式与 t-SNE 类似，但有两个优势：
- 更快。它使用近似最近邻图而不是计算所有成对距离。
- 更好的全局结构。输出中簇的相对位置往往比 t-SNE 中更有意义。

UMAP 在高维空间中构建一个加权图（"模糊拓扑表示"），然后找到一个尽可能保留这个图的低维布局。

关键参数：
- `n_neighbors`：多少个邻居定义局部结构（类似于困惑度）。更高的值保留更多的全局结构。
- `min_dist`：输出中点之间的紧密程度。更低的值产生更密集的簇。

### 何时使用哪种

| 方法 | 使用场景 | 保留 | 速度 |
|-----|---------|------|------|
| PCA | 训练前的预处理 | 全局方差 | 快速（精确），适用于数百万样本 |
| PCA | 快速探索性可视化 | 线性结构 | 快速 |
| t-SNE | 出版质量的 2D 图 | 局部邻域 | 慢（< 10k 样本最理想） |
| UMAP | 大规模 2D 可视化 | 局部 + 一些全局结构 | 中等（处理数百万） |
| PCA | 模型的特征降维 | 按方差排序的特征 | 快速 |
| t-SNE / UMAP | 理解聚类结构 | 簇分离 | 中等到慢 |

经验法则：PCA 用于预处理和数据压缩。需要可视化 2D 结构时使用 t-SNE 或 UMAP。

### 核 PCA

标准 PCA 寻找线性子空间。它旋转你的坐标系并丢弃轴。但如果数据位于非线性流形上呢？2D 中的圆无法被任何直线分开。标准 PCA 帮不了你。

核 PCA 在由核函数诱导的高维特征空间中应用 PCA，而无需显式计算该空间中的坐标。这就是核技巧——与 SVM 背后的想法相同。

算法：
1. 计算核矩阵 K，其中 K_ij = k(x_i, x_j)
2. 在特征空间中对核矩阵居中
3. 对居中的核矩阵进行特征分解
4. 顶部特征向量（按 1/sqrt(特征值) 缩放）就是投影

常见核函数：

| 核 | 公式 | 适用于 |
|-----|------|-------|
| RBF（高斯） | exp(-gamma * \|\|x - y\|\|^2) | 大多数非线性数据，平滑流形 |
| 多项式 | (x . y + c)^d | 多项式关系 |
| Sigmoid | tanh(alpha * x . y + c) | 类神经网络映射 |

何时使用核 PCA vs 标准 PCA：

| 标准 | 标准 PCA | 核 PCA |
|-----|---------|--------|
| 数据结构 | 线性子空间 | 非线性流形 |
| 速度 | O(min(n^2 d, d^2 n)) | O(n^2 d + n^3) |
| 可解释性 | 成分是特征的线性组合 | 成分缺乏直接特征解释 |
| 可扩展性 | 适用于数百万样本 | 核矩阵为 n x n，受内存限制 |
| 重构 | 直接逆变换 | 需要预图像近似 |

经典示例：2D 中的同心圆。两圈点，一个在另一个内部。标准 PCA 将两者投影到同一条线上——对分类无意义。使用 RBF 核的核 PCA 将内圈和外圈映射到不同区域，使它们线性可分。

### 重构误差

你的降维有多好？你将 784 维压缩到 50 维。你损失了什么？

衡量重构误差：
1. 将数据投影到 k 维：X_reduced = X @ W_k
2. 重构：X_hat = X_reduced @ W_k^T
3. 计算 MSE：mean((X - X_hat)^2)

对于 PCA，重构误差与解释方差有清晰的关系：

```
重构误差 = 未包含的特征值之和
总方差 = 所有特征值之和
损失的比例 = （丢弃的特征值之和）/（所有特征值之和）
```

每个成分的解释方差比为：

```
explained_ratio_k = eigenvalue_k / sum(所有特征值)
```

绘制累积解释方差与成分数量的关系给你"肘部"曲线。正确的成分数量是：
- 曲线变平的地方（收益递减）
- 累积方差超过你的阈值（通常为 0.90 或 0.95）的地方
- 下游任务性能趋于稳定的地方

重构误差在选择 k 之外也很有用。你可以用它做异常检测：重构误差高的样本是不符合学习到的子空间的离群点。这是生产系统中基于 PCA 的异常检测的基础。

```figure
pca-axes
```

## 构建

### 步骤 1：从头实现 PCA

```python
import numpy as np

class PCA:
    def __init__(self, n_components):
        self.n_components = n_components
        self.components = None
        self.mean = None
        self.eigenvalues = None
        self.explained_variance_ratio_ = None

    def fit(self, X):
        self.mean = np.mean(X, axis=0)
        X_centered = X - self.mean

        cov_matrix = np.cov(X_centered, rowvar=False)

        eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)

        sorted_idx = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[sorted_idx]
        eigenvectors = eigenvectors[:, sorted_idx]

        self.components = eigenvectors[:, :self.n_components].T
        self.eigenvalues = eigenvalues[:self.n_components]
        total_var = np.sum(eigenvalues)
        self.explained_variance_ratio_ = self.eigenvalues / total_var

        return self

    def transform(self, X):
        X_centered = X - self.mean
        return X_centered @ self.components.T

    def fit_transform(self, X):
        self.fit(X)
        return self.transform(X)
```

### 步骤 2：在合成数据上测试

```python
np.random.seed(42)
n_samples = 500

t = np.random.uniform(0, 2 * np.pi, n_samples)
x1 = 3 * np.cos(t) + np.random.normal(0, 0.2, n_samples)
x2 = 3 * np.sin(t) + np.random.normal(0, 0.2, n_samples)
x3 = 0.5 * x1 + 0.3 * x2 + np.random.normal(0, 0.1, n_samples)

X_synthetic = np.column_stack([x1, x2, x3])

pca = PCA(n_components=2)
X_reduced = pca.fit_transform(X_synthetic)

print(f"原始形状: {X_synthetic.shape}")
print(f"缩减形状:  {X_reduced.shape}")
print(f"解释方差比: {pca.explained_variance_ratio_}")
print(f"捕获的总方差: {sum(pca.explained_variance_ratio_):.4f}")
```

### 步骤 3：2D 中的 MNIST 数字

```python
from sklearn.datasets import fetch_openml

mnist = fetch_openml("mnist_784", version=1, as_frame=False, parser="auto")
X_mnist = mnist.data[:5000].astype(float)
y_mnist = mnist.target[:5000].astype(int)

pca_mnist = PCA(n_components=50)
X_pca50 = pca_mnist.fit_transform(X_mnist)
print(f"50 个成分捕获了 {sum(pca_mnist.explained_variance_ratio_):.2%} 的方差")

pca_2d = PCA(n_components=2)
X_pca2d = pca_2d.fit_transform(X_mnist)
print(f"2 个成分捕获了 {sum(pca_2d.explained_variance_ratio_):.2%} 的方差")
```

### 步骤 4：与 sklearn 比较

```python
from sklearn.decomposition import PCA as SklearnPCA
from sklearn.manifold import TSNE

sklearn_pca = SklearnPCA(n_components=2)
X_sklearn_pca = sklearn_pca.fit_transform(X_mnist)

print(f"\n我们 PCA 的解释方差:     {pca_2d.explained_variance_ratio_}")
print(f"Sklearn PCA 的解释方差: {sklearn_pca.explained_variance_ratio_}")

diff = np.abs(np.abs(X_pca2d) - np.abs(X_sklearn_pca))
print(f"最大绝对差异: {diff.max():.10f}")

tsne = TSNE(n_components=2, perplexity=30, random_state=42)
X_tsne = tsne.fit_transform(X_mnist)
print(f"\nt-SNE 输出形状: {X_tsne.shape}")
```

### 步骤 5：UMAP 比较

```python
try:
    from umap import UMAP

    reducer = UMAP(n_components=2, n_neighbors=15, min_dist=0.1, random_state=42)
    X_umap = reducer.fit_transform(X_mnist)
    print(f"UMAP 输出形状: {X_umap.shape}")
except ImportError:
    print("安装 umap-learn: pip install umap-learn")
```

## 使用

PCA 作为分类器前的预处理：

```python
from sklearn.decomposition import PCA as SklearnPCA
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

X_train, X_test, y_train, y_test = train_test_split(
    X_mnist, y_mnist, test_size=0.2, random_state=42
)

results = {}
for k in [10, 30, 50, 100, 200]:
    pca_k = SklearnPCA(n_components=k)
    X_tr = pca_k.fit_transform(X_train)
    X_te = pca_k.transform(X_test)

    clf = LogisticRegression(max_iter=1000, random_state=42)
    clf.fit(X_tr, y_train)
    acc = accuracy_score(y_test, clf.predict(X_te))
    var_captured = sum(pca_k.explained_variance_ratio_)
    results[k] = (acc, var_captured)
    print(f"k={k:>3d}  精度={acc:.4f}  方差={var_captured:.4f}")
```

性能在远未达到 784 维之前就趋于稳定。那个稳定点就是你的操作点。

## 交付

本课程生成：
- `outputs/skill-dimensionality-reduction.md` - 为给定任务选择正确降维技术的技能

## 练习

1. 修改 PCA 类以支持 `inverse_transform`。从 10、50 和 200 个成分重构 MNIST 数字。打印每种情况的重构误差（与原始的均方差）。

2. 在相同的 MNIST 子集上使用困惑度值 5、30 和 100 运行 t-SNE。描述输出如何变化。为什么困惑度会影响簇的紧密程度？

3. 取一个 50 个特征的数据集，其中只有 5 个是有信息的（用 `sklearn.datasets.make_classification` 生成）。应用 PCA 并检查解释方差曲线是否正确识别出数据在本质上是 5 维的。

## 关键术语

| 术语 | 人们说的话 | 实际含义 |
|------|----------|---------|
| 维度诅咒 | "特征太多" | 随着维度增长，距离、体积和数据密度都变得反直觉。模型需要指数级更多的数据来补偿。 |
| PCA | "降维" | 旋转你的坐标系使轴与最大方差方向对齐，然后丢弃低方差轴。 |
| 主成分 | "一个重要方向" | 协方差矩阵的特征向量。特征空间中数据变化最大的方向。 |
| 解释方差比 | "这个成分有多少信息" | 一个主成分捕获的总方差的比例。对前 k 个比例求和可看出 k 个成分保留了多大量。 |
| 协方差矩阵 | "特征如何相关" | 一个对称矩阵，其中 (i,j) 项衡量特征 i 和特征 j 一起变化的程度。对角线项是各自的方差。 |
| t-SNE | "那个聚类图" | 一种非线性方法，通过保留成对邻域概率将高维数据映射到 2D。适合可视化，不适合预处理。 |
| UMAP | "更快的 t-SNE" | 一种基于拓扑数据分析的非线性方法。保留局部和一些全局结构。比 t-SNE 可扩展性更好。 |
| 困惑度 | "一个 t-SNE 旋钮" | 控制每个点考虑的有效邻居数量。低困惑度专注于非常局部的结构。高困惑度捕捉更广泛的模式。 |
| 流形 | "数据所在的表面" | 嵌入在高维空间中的低维表面。在 3D 中揉成一团的纸就是一个 2D 流形。 |

## 进一步阅读

- [主成分分析教程](https://arxiv.org/abs/1404.1100)（Shlens）- 从头开始的清晰 PCA 推导
- [如何有效使用 t-SNE](https://distill.pub/2016/misread-tsne/)（Wattenberg 等）- t-SNE 陷阱和参数选择的交互式指南
- [UMAP 文档](https://umap-learn.readthedocs.io/)- 来自 UMAP 作者的理论和实践指导
