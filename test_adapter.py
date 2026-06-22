from transformers import AutoModelForCausalLM, AutoTokenizer
  from peft import PeftModel
  import torch

  model_name = "Qwen/Qwen2.5-1.5B-Instruct"
  tokenizer = AutoTokenizer.from_pretrained(model_name)

  # 加载原始模型
  base_model = AutoModelForCausalLM.from_pretrained(
      model_name, torch_dtype=torch.float16, device_map="mps"
  )

  # 加载 adapter
  model = PeftModel.from_pretrained(base_model, "./my-customer-service-adapter")

  # 测试
  questions = ["我的货丢了", "退款要多久", "怎么联系人工"]
  for q in questions:
      prompt = f"用户：{q}\n客服："
      inputs = tokenizer(prompt, return_tensors="pt").to("mps")
      outputs = model.generate(**inputs, max_new_tokens=50)
      print(f"问: {q}")
      print(f"答: {tokenizer.decode(outputs[0], skip_special_tokens=True)}")
      print("---")