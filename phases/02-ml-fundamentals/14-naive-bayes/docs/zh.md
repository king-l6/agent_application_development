# 朴素贝叶斯

> "朴素"的假设是错误的，但它仍然有效。这就是它的美妙之处。

**类型：** 构建
**语言：** Python
**前置知识：** 第二阶段，第01-07课（分类、贝叶斯定理）
**时间：** 约75分钟

## 学习目标

- 从头实现带拉普拉斯平滑的多项式朴素贝叶斯，用于文本分类
- 解释为什么朴素的独立性假设在数学上是错误的，但在实践中产生了正确的类别排序
- 比较多项式、伯努利和高斯朴素贝叶斯变体，并为给定的特征类型选择正确的变体
- 在高维稀疏数据上评估朴素贝叶斯与逻辑回归，并解释偏差-方差权衡的运作

## 问题

你需要对文本进行分类。邮件分成垃圾邮件或非垃圾邮件。客户评论分成正面或负面。支持工单分成不同类别。你有数千个特征（每个词一个）和有限的训练数据。

大多数分类器在这里失效。逻辑回归需要足够的样本来可靠地估计数千个权重。决策树一次在一个词上分裂，严重过拟合。在10,000维空间中的KNN是无意义的，因为每个点与每个其他点距离都差不多。

朴素贝叶斯处理了这个问题。它做了一个数学上错误的假设（给定类别时每个特征与其他特征独立），并且在文本分类上仍然优于"更智能"的模型，尤其是在训练集较小时。它单次遍历数据就能完成训练。它可以扩展到数百万个特征。它产生概率估计（尽管由于独立性假设通常校准不佳）。

理解为什么一个错误的假设能带来好的预测，教你一些关于机器学习的基本知识：最好的模型不是最正确的模型，而是对你的数据具有最佳偏差-方差权衡的模型。

## 概念

### 贝叶斯定理（快速回顾）

贝叶斯定理翻转条件概率：

```
P(类别 | 特征) = P(特征 | 类别) * P(类别) / P(特征)
```

我们想要 `P(类别 | 特征)` —— 给定文档中的词，文档属于某个类别的概率。我们可以从以下计算：
- `P(特征 | 类别)` —— 在这个类别的文档中看到这些词的可能性
- `P(类别)` —— 类别的先验概率（垃圾邮件总体上有多常见？）
- `P(特征)` —— 证据，所有类别相同，所以在比较时可以忽略

具有最高 `P(类别 | 特征)` 的类别获胜。

### 朴素独立性假设

精确计算 `P(特征 | 类别)` 需要估计所有特征一起的联合概率。对于10,000个词的词汇表，你需要估计2^10,000个可能组合上的分布。不可能。

朴素假设：给定类别时，每个特征条件独立。

```
P(w1, w2, ..., wn | 类别) = P(w1 | 类别) * P(w2 | 类别) * ... * P(wn | 类别)
```

不需要一个不可能的联合分布，你估计n个简单的每特征分布。每个只需要一个计数。

这个假设显然是错误的。在任何文档中，"machine"和"learning"并不是独立的。但分类器不需要正确的概率估计。它需要正确的排序——哪个类别的概率最高。独立性假设引入了系统性错误，但这些错误对所有类别的影响相似，所以排序保持正确。

### 为什么它仍然有效

三个原因：

1. **排序重于校准。** 分类只需要排名最高的类别是正确的。即使P(垃圾)=0.99999而真实概率是0.7，分类器仍然正确选择了垃圾。我们不需要正确的概率。我们需要正确的获胜者。

2. **高偏差，低方差。** 独立性假设是一个强先验。它严重约束了模型，防止过拟合。对于有限的训练数据，一个略有错误但稳定的模型胜过理论上正确但不稳定的模型。这就是偏差-方差权衡的实际应用。

3. **特征冗余相互抵消。** 相关特征提供冗余证据。分类器重复计算了这个证据，但它也为正确的类别重复计算了它。如果"machine"和"learning"总是一起出现，两者都为"技术"类别提供证据。NB将它们计算了两次，但它是为正确的类别计算了两次。

第四个实际原因：朴素贝叶斯极快。训练是单次遍历数据计数频率。预测是矩阵乘法。你可以在几秒内训练百万份文档。这种速度意味着你可以更快地迭代、尝试更多特征集、比慢模型运行更多实验。

### 逐步数学推导

让我们跟踪一个具体例子。假设有两个类别：垃圾邮件和非垃圾邮件。词汇表有三个词："free"、"money"、"meeting"。

训练数据：
- 垃圾邮件中"free"出现80次、"money"60次、"meeting"10次（共150个词）
- 非垃圾邮件中"free"出现5次、"money"10次、"meeting"100次（共115个词）
- 40%的邮件是垃圾邮件，60%是非垃圾邮件

使用拉普拉斯平滑（alpha=1）：

```
P(free | 垃圾)    = (80 + 1) / (150 + 3) = 81/153 = 0.529
P(money | 垃圾)   = (60 + 1) / (150 + 3) = 61/153 = 0.399
P(meeting | 垃圾) = (10 + 1) / (150 + 3) = 11/153 = 0.072

P(free | 非垃圾)    = (5 + 1) / (115 + 3) = 6/118 = 0.051
P(money | 非垃圾)   = (10 + 1) / (115 + 3) = 11/118 = 0.093
P(meeting | 非垃圾) = (100 + 1) / (115 + 3) = 101/118 = 0.856
```

新邮件包含："free"（2次）、"money"（1次）、"meeting"（0次）。

```
log P(垃圾 | 邮件) = log(0.4) + 2*log(0.529) + 1*log(0.399) + 0*log(0.072)
                    = -0.916 + 2*(-0.637) + (-0.919) + 0
                    = -3.109

log P(非垃圾 | 邮件) = log(0.6) + 2*log(0.051) + 1*log(0.093) + 0*log(0.856)
                        = -0.511 + 2*(-2.976) + (-2.375) + 0
                        = -8.838
```

垃圾邮件以较大优势胜出。词"free"出现两次是垃圾邮件的强证据。注意"meeting"没有出现对两个对数求和贡献为零（0 * log(P)）——在多项式NB中，不存在的词没有影响。是伯努利NB显式建模了词的不存在。

### 三种变体

朴素贝叶斯有三种变体。每种建模 `P(特征 | 类别)` 的方式不同。

#### 多项式朴素贝叶斯

将每个特征建模为计数。最适合特征是词频或TF-IDF值的文本数据。

```
P(word_i | 类别) = (词i在类别中的计数 + alpha) / (类别中的总词数 + alpha * 词汇表大小)
```

`alpha` 是拉普拉斯平滑（见下方说明）。此变体是文本分类的主力。

#### 高斯朴素贝叶斯

将每个特征建模为正态分布。最适合连续特征。

```
P(x_i | 类别) = (1 / sqrt(2 * pi * var)) * exp(-(x_i - mean)^2 / (2 * var))
```

每个类别获得每个特征的自己的均值和方差。当特征在每个类别内真正遵循钟形曲线时效果很好。

#### 伯努利朴素贝叶斯

将每个特征建模为二值（存在或不存在）。最适合短文本或二值特征向量。

```
P(word_i | 类别) = (包含词i的类别文档数 + alpha) / (类别中的总文档数 + 2 * alpha)
```

与多项式不同，伯努利显式惩罚词的不存在。如果"free"通常出现在垃圾邮件中但在此邮件中缺失，伯努利将其计为反对垃圾邮件的证据。

### 何时使用每种变体

| 变体 | 特征类型 | 最适合 | 示例 |
|---------|-------------|----------|---------|
| 多项式 | 计数或频率 | 文本分类、词袋 | 邮件垃圾、主题分类 |
| 高斯 | 连续值 | 特征近似正态的表格数据 | 鸢尾花分类、传感器数据 |
| 伯努利 | 二值（0/1） | 短文本、二值特征向量 | SMS垃圾、存在/不存在特征 |

### 拉普拉斯平滑

当一个词在测试数据中出现但在训练数据中从未出现在某个类别的文档中时会发生什么？

无平滑：`P(词 | 类别) = 0/N = 0`。一个零乘透整个乘积使 `P(类别 | 特征) = 0`，无论所有其他证据如何。单个未见过的词摧毁了整个预测，无论其他证据有多强。

拉普拉斯平滑为每个特征计数添加一个小计数 `alpha`（通常为1）：

```
P(word_i | 类别) = (count(word_i, 类别) + alpha) / (类别中的总词数 + alpha * 词汇表大小)
```

当alpha=1时，每个词至少获得一个极小的概率。词"discombobulate"出现在测试邮件中不再杀死垃圾邮件的概率。平滑有贝叶斯解释：它等同于在词分布上放置一个均匀的狄利克雷先验。

更高的alpha意味着更强的平滑（更均匀的分布）。更低的alpha意味着模型更信任数据。Alpha是一个需要调优的超参数。

Alpha的影响：

| Alpha | 效果 | 何时使用 |
|-------|--------|-------------|
| 0.001 | 几乎没有平滑，信任数据 | 非常大的训练集，不期望有未见特征 |
| 0.1 | 轻度平滑 | 大训练集 |
| 1.0 | 标准拉普拉斯平滑 | 默认起点 |
| 10.0 | 强平滑，平坦化分布 | 非常小的训练集，预期有许多未见特征 |

### 对数空间计算

将数百个概率（每个小于1）相乘会导致浮点下溢。即使在浮点中乘积变为零，而真实值是一个非常小的正数。

解决方案：在对数空间中工作。不是乘概率，而是加它们的对数：

```
log P(类别 | x1, x2, ..., xn) = log P(类别) + sum_i log P(xi | 类别)
```

这使预测变成了点积：

```
log_scores = X @ log_feature_probs.T + log_class_priors
prediction = argmax(log_scores)
```

矩阵乘法。这就是为什么朴素贝叶斯预测如此之快——它与单层线性模型是相同的操作。

### 朴素贝叶斯 vs 逻辑回归

两者都是文本的线性分类器。区别在于它们建模的内容。

| 方面 | 朴素贝叶斯 | 逻辑回归 |
|--------|------------|-------------------|
| 类型 | 生成式（建模 P(X\|Y)） | 判别式（建模 P(Y\|X)） |
| 训练 | 计数频率 | 优化损失函数 |
| 小数据 | 更好（强先验帮助） | 更差（不足以估计权重） |
| 大数据 | 更差（错误假设伤害） | 更好（灵活的边界） |
| 特征 | 假设独立 | 处理相关性 |
| 速度 | 单次遍历，非常快 | 迭代优化 |
| 校准 | 概率差 | 概率更好 |

经验法则：从朴素贝叶斯开始。如果你有足够的数据且NB达到瓶颈，切换到逻辑回归。

### 分类流程

```mermaid
flowchart LR
    A[原始文本] --> B[分词]
    B --> C[构建词汇表]
    C --> D[统计词频]
    D --> E[应用平滑]
    E --> F[计算对数概率]
    F --> G[预测：给定词下argmax P(类别)]

    style A fill:#f9f,stroke:#333
    style G fill:#9f9,stroke:#333
```

在实践中，我们在对数空间中工作以避免浮点下溢。不乘许多小概率，我们加它们的对数：

```
log P(类别 | 特征) = log P(类别) + sum_i log P(特征_i | 类别)
```

```figure
naive-bayes
```

## 构建

`code/naive_bayes.py`中的代码从头实现了MultinomialNB和GaussianNB。

### MultinomialNB

从头实现：

1. **fit(X, y)**：对每个类别，统计每个特征的频率。添加拉普拉斯平滑。计算对数概率。存储类别先验（类别频率的对数）。

2. **predict_log_proba(X)**：对每个样本，计算所有类别的 log P(类别) + sum of log P(特征_i | 类别)。这是一个矩阵乘法：X @ log_probs.T + log_priors。

3. **predict(X)**：返回具有最高对数概率的类别。

```python
class MultinomialNB:
    def __init__(self, alpha=1.0):
        self.alpha = alpha

    def fit(self, X, y):
        classes = np.unique(y)
        n_classes = len(classes)
        n_features = X.shape[1]

        self.classes_ = classes
        self.class_log_prior_ = np.zeros(n_classes)
        self.feature_log_prob_ = np.zeros((n_classes, n_features))

        for i, c in enumerate(classes):
            X_c = X[y == c]
            self.class_log_prior_[i] = np.log(X_c.shape[0] / X.shape[0])
            counts = X_c.sum(axis=0) + self.alpha
            self.feature_log_prob_[i] = np.log(counts / counts.sum())

        return self
```

关键洞察：拟合后，预测就是矩阵乘法加偏置。这就是为什么朴素贝叶斯如此之快。

### GaussianNB

对于连续特征，我们估计每个类别每个特征的均值和方差：

```python
class GaussianNB:
    def __init__(self):
        pass

    def fit(self, X, y):
        classes = np.unique(y)
        self.classes_ = classes
        self.means_ = np.zeros((len(classes), X.shape[1]))
        self.vars_ = np.zeros((len(classes), X.shape[1]))
        self.priors_ = np.zeros(len(classes))

        for i, c in enumerate(classes):
            X_c = X[y == c]
            self.means_[i] = X_c.mean(axis=0)
            self.vars_[i] = X_c.var(axis=0) + 1e-9
            self.priors_[i] = X_c.shape[0] / X.shape[0]

        return self
```

预测使用每个特征的Gaussian PDF，跨特征相乘（在对数空间中相加）。

### 演示：文本分类

代码生成合成词袋数据，模拟两个类别（科技文章 vs 体育文章）。每个类别有不同的词频分布。MultinomialNB使用词频对它们进行分类。

合成数据的工作原理：我们创建200个"词"（特征列）。词0-39在科技文章中频率高，在体育中低。词80-119在体育文章中频率高，在科技中低。词40-79在两者中频率中等。这创建了一个现实场景，其中一些词是强类别指标，其他是噪音。

### 演示：连续特征

代码生成鸢尾花风格的数据（3个类别、4个特征、高斯簇）。GaussianNB使用每类均值和方差进行分类。每个类别有不同的中心（均值向量）和不同的离散程度（方差），模拟了现实世界中测量值在类别之间存在系统性差异的数据。

代码还演示了：
- **平滑比较：** 使用不同alpha值训练MultinomialNB，展示平滑强度对准确率的影响。
- **训练规模实验：** NB准确率随训练数据从20增长到1600样本时如何提高。即使样本非常少，NB也能达到不错的准确率——这是它的主要优势。
- **混淆矩阵：** 每类精确率、召回率和F1分数，展示NB在哪里犯错。

### 预测速度

朴素贝叶斯预测是一个矩阵乘法。对于n个样本、d个特征和k个类别：
- MultinomialNB：一个矩阵乘 (n x d) @ (d x k) = O(n * d * k)
- GaussianNB：n * k次Gaussian PDF评估，每次在d个特征上 = O(n * d * k)

两者在每个维度上都是线性的。这与KNN（需要计算到所有训练点的距离）或带RBF核的SVM（需要与所有支持向量进行核评估）形成对比。NB在预测时快了几个数量级。

## 使用

使用sklearn，两个变体都是一行代码：

```python
from sklearn.naive_bayes import GaussianNB, MultinomialNB

gnb = GaussianNB()
gnb.fit(X_train, y_train)
print(f"GaussianNB准确率: {gnb.score(X_test, y_test):.3f}")

mnb = MultinomialNB(alpha=1.0)
mnb.fit(X_train_counts, y_train)
print(f"MultinomialNB准确率: {mnb.score(X_test_counts, y_test):.3f}")
```

使用sklearn进行文本分类：

```python
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

text_clf = Pipeline([
    ("vectorizer", CountVectorizer()),
    ("classifier", MultinomialNB(alpha=1.0)),
])

text_clf.fit(train_texts, train_labels)
accuracy = text_clf.score(test_texts, test_labels)
```

`naive_bayes.py`中的代码在相同数据上比较了从头实现与sklearn的实现，以验证正确性。

### TF-IDF与朴素贝叶斯

原始词频给每个词每次出现相同的权重。但像"the"和"is"这样的常见词在每个类别中都频繁出现——它们不携带信息。TF-IDF（词频-逆文档频率）降低常见词的权重，提高罕见、有判别力的词的权重。

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

text_clf = Pipeline([
    ("tfidf", TfidfVectorizer()),
    ("classifier", MultinomialNB(alpha=0.1)),
])
```

TF-IDF值是非负的，所以它们与MultinomialNB兼容。TF-IDF + MultinomialNB的组合是文本分类最强的基线之一。在训练样本少于10,000的数据集上，它经常能击败更复杂的模型。

### 用于短文本的BernoulliNB

对于短文本（推文、SMS、聊天消息），BernoulliNB可能优于MultinomialNB。短文本词数少，因此MultinomialNB依赖的频率信息噪音较大。BernoulliNB只关心存在或不存在，这在短文本中更可靠。

```python
from sklearn.naive_bayes import BernoulliNB
from sklearn.feature_extraction.text import CountVectorizer

text_clf = Pipeline([
    ("vectorizer", CountVectorizer(binary=True)),
    ("classifier", BernoulliNB(alpha=1.0)),
])
```

CountVectorizer中的 `binary=True` 标志将所有计数转换为0/1。没有它，BernoulliNB仍然可以工作，但看到的不是它设计的输入。

### 校准NB概率

NB概率校准不佳。当NB说P(垃圾)=0.95时，真实概率可能是0.7。如果你需要可靠的概率估计（例如，设置阈值或与其他模型组合），使用sklearn的CalibratedClassifierCV：

```python
from sklearn.calibration import CalibratedClassifierCV

calibrated_nb = CalibratedClassifierCV(MultinomialNB(), cv=5, method="sigmoid")
calibrated_nb.fit(X_train, y_train)
proba = calibrated_nb.predict_proba(X_test)
```

这使用交叉验证在NB的原始分数上拟合了一个逻辑回归。得到的概率更接近真实的类别频率。

### 常见陷阱

1. **负特征值。** MultinomialNB需要非负特征。如果你有负值（如某些设置下的TF-IDF或标准化特征），请改用GaussianNB，或将特征偏移为正。

2. **零方差特征。** GaussianNB除以方差。如果一个特征在某个类别中有零方差（所有值相同），概率计算会出错。代码向所有方差添加了一个小的平滑项（1e-9）来防止这种情况。

3. **类别不平衡。** 如果99%的邮件是非垃圾邮件，先验P(非垃圾)=0.99如此之强，以至于压倒了似然证据。你可以手动设置类别先验或使用sklearn中的class_prior参数。

4. **特征缩放。** MultinomialNB不需要缩放（它在计数上工作）。GaussianNB也不需要缩放（它估计每特征统计量）。这是相较于逻辑回归和SVM的优势，后者对特征尺度敏感。

## 交付

本课程产出：
- `outputs/skill-naive-bayes-chooser.md` -- 一个选择正确NB变体的决策技能
- `code/naive_bayes.py` -- 从头实现的MultinomialNB和GaussianNB，附带sklearn比较

### 朴素贝叶斯何时失败

NB在独立性假设导致错误排序（而不仅仅是错误概率）时失败。这发生在：

1. **强特征交互。** 如果类别取决于两个特征的组合而不是单独任何一个（XOR类模式），NB会完全错过它。每个特征单独不提供证据，而NB无法非线性地组合它们。

2. **具有相反证据的高度相关特征。** 如果特征A说"垃圾"而特征B说"非垃圾"，但A和B完全相关（它们实际上总是一致），NB会看到冲突的证据，而实际上没有。

3. **非常大的训练集。** 有了足够的数据，像逻辑回归这样的判别模型能学习真正的决策边界并超过NB。在小数据上帮助过模型的独立性假设现在拖了后腿。

在实践中，这些失败模式对于文本分类是罕见的。文本特征众多、单个体弱，且独立性假设的错误倾向于相互抵消。对于特征少、强相关特征的表格数据，首先考虑逻辑回归或基于树的模型。

## 练习

1. **平滑实验。** 在文本数据上用alpha值0.01、0.1、1.0、10.0和100.0训练MultinomialNB。绘制准确率对alpha的图。性能在哪里达到峰值？为什么非常高的alpha有害？

2. **特征独立性测试。** 取一个真实文本数据集。选择两个明显相关的词（"machine"和"learning"）。计算 P(word1 | 类别) * P(word2 | 类别) 并与 P(word1 AND word2 | 类别) 比较。独立性假设错得有多离谱？它会影响分类准确率吗？

3. **伯努利实现。** 扩展代码以包含BernoulliNB类。将词袋转换为二值（存在/不存在）并在文本数据上与MultinomialNB比较准确率。Bernoulli何时胜出？

4. **NB vs 逻辑回归。** 在文本数据上训练两者。从100个训练样本开始，增加到10,000。绘制两者的准确率对训练集大小的图。逻辑回归在哪个点超过朴素贝叶斯？

5. **垃圾邮件过滤器。** 构建一个完整的垃圾邮件分类器：分词原始邮件文本、构建词汇表、创建词袋特征、训练MultinomialNB、用精确率和召回率评估（不仅仅是准确率——为什么？）。

## 关键术语

| 术语 | 通俗说法 | 实际含义 |
|------|---------|---------|
| 朴素贝叶斯 | "简单的概率分类器" | 应用贝叶斯定理的分类器，假设特征在给定类别时条件独立 |
| 条件独立 | "特征互不影响" | P(A, B \| C) = P(A \| C) * P(B \| C) —— 知道C后，知道B不会告诉你关于A的新信息 |
| 拉普拉斯平滑 | "加一平滑" | 为每个特征添加一个小计数，防止零概率主导预测 |
| 先验 | "看数据前的信念" | P(类别) —— 在观察任何特征之前每个类别的概率 |
| 似然 | "数据与模型的匹配程度" | P(特征 \| 类别) —— 如果知道类别，观察这些特征的概率 |
| 后验 | "看到数据后的信念" | P(类别 \| 特征) —— 观察特征后类别更新的概率 |
| 生成式模型 | "建模数据如何生成" | 学习 P(X \| Y) 和 P(Y)，然后使用贝叶斯定理得到 P(Y \| X) 的模型 |
| 判别式模型 | "建模决策边界" | 直接学习 P(Y \| X) 而不建模X如何生成的模型 |
| 对数概率 | "避免下溢" | 使用 log P 代替 P，防止许多小数的乘积在浮点中变为零 |

## 扩展阅读

- [scikit-learn Naive Bayes docs](https://scikit-learn.org/stable/modules/naive_bayes.html) -- 所有三个变体及数学细节
- [McCallum and Nigam, A Comparison of Event Models for Naive Bayes Text Classification (1998)](https://www.cs.cmu.edu/~knigam/papers/multinomial-aaaiws98.pdf) -- 多项式与伯努利用于文本的经典比较
- [Rennie et al., Tackling the Poor Assumptions of Naive Bayes Text Classifiers (2003)](https://people.csail.mit.edu/jrennie/papers/icml03-nb.pdf) -- NB用于文本的改进
- [Ng and Jordan, On Discriminative vs. Generative Classifiers (2001)](https://ai.stanford.edu/~ang/papers/nips01-discriminativegenerative.pdf) -- 证明NB比LR用更少的数据更快收敛
