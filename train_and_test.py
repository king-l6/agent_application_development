"""
LoRA 微调完整流程：加载 → 训练 → 对比
直接在本地 MPS 上跑
"""
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, PeftModel
import json

model_name = "Qwen/Qwen2.5-0.5B-Instruct"

# 1. 加载模型（MPS = Mac GPU）
print("1. 加载模型...")
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token  # Qwen 没有 pad_token，用 eos 代替
model = AutoModelForCausalLM.from_pretrained(
    model_name, torch_dtype=torch.float16, device_map="mps"
)

# 2. 注入 LoRA
print("2. 注入 LoRA...")
lora_config = LoraConfig(
    r=8, lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# 3. 准备数据
print("3. 准备数据...")
data = [
    {"prompt": "我的货丢了", "response": "很抱歉，请提供订单号，我帮您查询物流"},
    {"prompt": "我要退货", "response": "好的，请问您的订单编号是多少？"},
    {"prompt": "退款要多久", "response": "退款通常在3-5个工作日原路返回"},
    {"prompt": "怎么还不到", "response": "我帮您查一下物流进度，请稍等"},
    {"prompt": "怎么联系人工", "response": "您可以拨打 400-888-8888，客服会在30分钟内回复"},
]

texts = [f"用户：{d['prompt']}\n客服：{d['response']}" for d in data]
tokens = tokenizer(
    texts, padding=True, truncation=True,
    max_length=128, return_tensors="pt"
).to("mps")

# 只训练"客服："后面的部分，"用户：..."部分不参与 loss 计算
labels = tokens["input_ids"].clone()
客服_ids = tokenizer.encode("客服：", add_special_tokens=False)
for i in range(len(texts)):
    for pos in range(len(tokens["input_ids"][i]) - len(客服_ids)):
        if (tokens["input_ids"][i][pos:pos+len(客服_ids)] == torch.tensor(客服_ids).to("mps")).all():
            labels[i, :pos] = -100  # 客服前面的内容忽略
            break

from torch.utils.data import DataLoader, TensorDataset
dataset = TensorDataset(tokens["input_ids"], tokens["attention_mask"], labels)
loader = DataLoader(dataset, batch_size=2, shuffle=True)

optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)
model.train()

# 4. 训练
print("4. 开始训练（5轮）...")
for epoch in range(5):
    total_loss = 0
    for batch in loader:
        input_ids, attn_mask, lbl = batch
        outputs = model(input_ids=input_ids, attention_mask=attn_mask, labels=lbl)
        loss = outputs.loss
        total_loss += loss.item()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    print(f"  第{epoch+1}轮: loss = {total_loss/len(loader):.4f}")

# 5. 保存 adapter
model.save_pretrained("./my-customer-service-adapter")
print("5. ✅ 训练完成，adapter 已保存")

# 6. 测试前后对比
print("\n6. 前后对比测试")
base = AutoModelForCausalLM.from_pretrained(
    model_name, torch_dtype=torch.float16, device_map="mps"
)
model = PeftModel.from_pretrained(base, "./my-customer-service-adapter")

questions = ["我的货丢了", "退款要多久", "怎么联系人工"]
for q in questions:
    prompt = f"用户：{q}\n客服："
    inputs = tokenizer(prompt, return_tensors="pt").to("mps")

    out1 = base.generate(**inputs, max_new_tokens=50)
    out2 = model.generate(**inputs, max_new_tokens=50)

    print(f"\n问: {q}")
    print(f"微调前: {tokenizer.decode(out1[0], skip_special_tokens=True)}")
    print(f"微调后: {tokenizer.decode(out2[0], skip_special_tokens=True)}")
