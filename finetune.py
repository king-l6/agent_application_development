import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
import json

# 1. 加载模型
model_name = "Qwen/Qwen2.5-0.5B-Instruct"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="mps",
)

# 2. 加 LoRA
lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# 3. 加载数据
with open("train_data.jsonl") as f:
    data = [json.loads(line) for line in f]

# 4. 准备训练格式
def format_example(p):
    return f"用户：{p['prompt']}\n客服：{p['response']}"

texts = [format_example(d) for d in data]
tokens = tokenizer(
    texts, padding=True, truncation=True,
    max_length=128, return_tensors="pt"
)
tokens = {k: v.to("mps") for k, v in tokens.items()}

# 5. 训练
from torch.utils.data import DataLoader, TensorDataset
dataset = TensorDataset(tokens["input_ids"], tokens["attention_mask"])
loader = DataLoader(dataset, batch_size=2, shuffle=True)

optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)

model.train()
for epoch in range(10):
    total_loss = 0
    for batch in loader:
        input_ids, attn_mask = batch
        outputs = model(
            input_ids=input_ids,
            attention_mask=attn_mask,
            labels=input_ids
        )
        loss = outputs.loss
        total_loss += loss.item()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    print(f"Epoch {epoch+1}: loss = {total_loss/len(loader):.4f}")

# 6. 保存 adapter
model.save_pretrained("./my-customer-service-adapter")
print("训练完成，adapter 已保存到 ./my-customer-service-adapter/")