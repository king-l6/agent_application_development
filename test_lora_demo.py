"""
LoRA 微调前后对比演示
用字符级语言模型，先学白话，再微调成古诗风格
训练前后分别生成文本，肉眼可见差别
"""
import torch
import torch.nn as nn
import math


# ===== 1. 准备数据 =====

白话文本 = """
春天的西湖特别美，柳树发芽了，很多游客在湖边散步。
今天天气很好，我们去爬山，山顶可以看到整个城市。
学习编程需要耐心，每天写一点代码，慢慢就会了。
人工智能正在改变世界，很多行业都用上了新技术。
"""

古诗文本 = """
床前明月光，疑是地上霜。举头望明月，低头思故乡。
白日依山尽，黄河入海流。欲穷千里目，更上一层楼。
春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。
红豆生南国，春来发几枝。愿君多采撷，此物最相思。
""" * 3  # 重复 3 遍凑够长度

def 建词表(文本):
    字 = sorted(set(文本))
    字2idx = {c: i for i, c in enumerate(字)}
    idx2字 = {i: c for i, c in enumerate(字)}
    return 字2idx, idx2字, len(字)

字2idx, idx2字, 词表大小 = 建词表(白话文本 + 古诗文本)

def 文本转序列(文本, 字2idx, 长度=32):
    ids = [字2idx[c] for c in 文本.strip()]
    xs, ys = [], []
    stride = max(1, len(ids) - 长度)  # 防止文本比长度短
    for i in range(0, stride, 1):
        xs.append(ids[i:i + 长度])
        ys.append(ids[i + 1:i + 长度 + 1])
    return (torch.tensor(xs, dtype=torch.long), torch.tensor(ys, dtype=torch.long))


class 字符语言模型(nn.Module):
    """极简字符级语言模型"""
    def __init__(self, 词表大小, d_model=128, n_layers=2):
        super().__init__()
        self.embedding = nn.Embedding(词表大小, d_model)
        # 用 Linear 模拟 transformer 层（让 LoRA 注入目标明确）
        self.层1 = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.ReLU(),
            nn.Linear(d_model * 4, d_model),
        )
        self.层2 = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.ReLU(),
            nn.Linear(d_model * 4, d_model),
        )
        self.输出层 = nn.Linear(d_model, 词表大小)

    def forward(self, x):
        x = self.embedding(x)
        x = self.层1(x)
        x = self.层2(x)
        return self.输出层(x)


def 生成文本(模型, 起始字, 字2idx, idx2字, 长度=40):
    模型.eval()
    ids = [字2idx.get(起始字, 0)]
    上下文长度 = 16
    with torch.no_grad():
        for _ in range(长度):
            ctx = ids[-上下文长度:]
            # 补齐到上下文长度
            if len(ctx) < 上下文长度:
                ctx = [0] * (上下文长度 - len(ctx)) + ctx
            x = torch.tensor([ctx]).long()
            logits = 模型(x)
            next_id = logits[0, -1].argmax().item()
            ids.append(next_id)
    return "".join(idx2字[i] for i in ids)


# ===== LoRA 组件 =====

class LoRALayer(nn.Module):
    def __init__(self, in_features, out_features, rank=8, alpha=16):
        super().__init__()
        self.rank = rank
        self.scaling = alpha / rank
        self.A = nn.Parameter(torch.randn(in_features, rank) * (1 / math.sqrt(rank)))
        self.B = nn.Parameter(torch.zeros(rank, out_features))

    def forward(self, x):
        return (x @ self.A @ self.B) * self.scaling


class LinearWithLoRA(nn.Module):
    def __init__(self, linear, rank=8, alpha=16):
        super().__init__()
        self.linear = linear
        self.lora = LoRALayer(linear.in_features, linear.out_features, rank, alpha)
        for param in self.linear.parameters():
            param.requires_grad = False

    def forward(self, x):
        return self.linear(x) + self.lora(x)


def 注入lora(模型, rank=8, alpha=16):
    for param in 模型.parameters():
        param.requires_grad = False

    注入数 = 0
    for name, module in 模型.named_modules():
        # 找到 Sequential 里面的 Linear 层
        if isinstance(module, nn.Linear):
            # 只替换前两层（第一阶段的 Linear）
            if "层1" in name or "层2" in name:
                if "." in name:
                    parts = name.split(".")
                    parent_name = ".".join(parts[:-1])
                    child_name = parts[-1]
                    parent = dict(模型.named_modules())[parent_name]
                    setattr(parent, child_name, LinearWithLoRA(module, rank, alpha))
                    注入数 += 1
    return 注入数


def 统计参数(模型):
    total = sum(p.numel() for p in 模型.parameters())
    trainable = sum(p.numel() for p in 模型.parameters() if p.requires_grad)
    return total, trainable


def 合并lora(模型):
    for name, module in 模型.named_modules():
        if isinstance(module, LinearWithLoRA):
            with torch.no_grad():
                merged = (module.lora.A @ module.lora.B) * module.lora.scaling
                module.linear.weight.data += merged.T
            parts = name.split(".")
            parent_name = ".".join(parts[:-1])
            child_name = parts[-1]
            if parent_name:
                parent = dict(模型.named_modules())[parent_name]
            else:
                parent = 模型
            setattr(parent, child_name, module.linear)


# ===== 训练函数 =====

def 训练(模型, xs, ys, 轮数=50, 学习率=1e-3):
    优化器 = torch.optim.AdamW(
        [p for p in 模型.parameters() if p.requires_grad],
        lr=学习率
    )
    损失函数 = nn.CrossEntropyLoss()

    for 轮 in range(轮数):
        输出 = 模型(xs)
        loss = 损失函数(输出.view(-1, 词表大小), ys.view(-1))
        优化器.zero_grad()
        loss.backward()
        优化器.step()

        if (轮 + 1) % 10 == 0:
            print(f"    第 {轮+1:>2d} 轮 → loss: {loss.item():.4f}")


# ===== 主流程 =====

if __name__ == "__main__":
    torch.manual_seed(42)

    print("=" * 50)
    print("  微调前后对比演示")
    print("=" * 50)

    # 准备数据
    xs白话, ys白话 = 文本转序列(白话文本, 字2idx)
    xs古诗, ys古诗 = 文本转序列(古诗文本, 字2idx)

    # ---- 第一阶段：训练基础模型学说话 ----
    print("\n1. 创建模型并训练白话...")
    模型 = 字符语言模型(词表大小)
    total, trainable = 统计参数(模型)
    print(f"   模型参数: 总共 {total:,}, 全部可训练")

    训练(模型, xs白话, ys白话, 轮数=50)
    print("\n   训练后生成（白话风格）:")
    输出1 = 生成文本(模型, "春", 字2idx, idx2字)
    print(f"   {输出1}")

    # ---- 第二阶段：LoRA 微调成古诗风格 ----
    print("\n2. 注入 LoRA（冻结 99% 参数）...")
    注入数 = 注入lora(模型, rank=8, alpha=16)
    total, trainable = 统计参数(模型)
    print(f"   注入 {注入数} 个 LoRA 层")
    print(f"   总参数: {total:,}, 可训练: {trainable:,} ({100*trainable/total:.2f}%)")

    print("\n   微调前生成（还是白话风格）:")
    输出2 = 生成文本(模型, "春", 字2idx, idx2字)
    print(f"   {输出2}")

    print("\n3. 用古诗数据 LoRA 微调...")
    训练(模型, xs古诗, ys古诗, 轮数=100, 学习率=1e-3)

    print("\n   微调后生成（变成古诗风格）:")
    输出3 = 生成文本(模型, "春", 字2idx, idx2字)
    print(f"   {输出3}")

    # ---- 第三阶段：合并，换回白话 ----
    print("\n4. 合并 LoRA 回去...")
    合并lora(模型)

    print("\n   合并后再生成:")
    输出4 = 生成文本(模型, "春", 字2idx, idx2字)
    print(f"   {输出4}")

    print("\n" + "=" * 50)
    print("  KEY: LoRA adapter 只存了")
    print(f"        '{古诗文本[:20]}...' 的增量")
    print(f"        {trainable:,} 个参数 vs 模型 {total:,} 个")
    print(f"        = 仅 {100*trainable/total:.1f}%")
    print("=" * 50)
