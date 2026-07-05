本地大语言模型微调已从实验室走向个人电脑：LoRA、QLoRA、DoRA、GaLore 等参数高效方法与 Unsloth、LLaMA-Factory 等工具链，使 7B 模型可在 8–24 GB 消费级 GPU 或 Apple Silicon 上完成适配。

## 核心方法

**LoRA** 冻结基座权重，仅训练低秩适配器 \(W = W_0 + \alpha BA\)，可训练参数降低 3–4 个数量级。**QLoRA** 将基座量化至 4-bit NF4，配合双重量化与分页优化器，在 48 GB 单卡上微调 65B 且性能匹配 16-bit 全量微调。**DoRA** 将权重分解为幅度与方向，对方向做 LoRA 更新，稳定优于标准 LoRA 且无推理开销。**GaLore** 对梯度做低秩投影，允许全参更新同时压缩优化器显存，首次在 RTX 4090 上完成 7B 预训练。

2026 年推荐默认配置：QLoRA + DoRA，r=16，α=16，target_modules="all-linear"，lr=2e-4，2–3 epochs。

## 工具链选型

| 场景 | 推荐 |
|------|------|
| 单卡 NVIDIA 追求速度 | Unsloth |
| 初学者 / GUI | LLaMA-Factory WebUI |
| 多卡 / RLHF 管线 | Axolotl |
| Mac M 系列 | MLX-LoRA |
| 对齐训练 DPO/GRPO | TRL 或 LLaMA-Factory |

底层依赖 bitsandbytes（量化）、PEFT（适配器）、llama.cpp/Ollama（GGUF 部署）。

## 硬件容量

- **7B QLoRA**：8–16 GB（RTX 3060/4060 可尝试）
- **7B LoRA**：16–24 GB
- **7B 全参（GaLore）**：24 GB
- **13B QLoRA**：24–48 GB 或 32–64 GB 统一内存 Mac
- **70B QLoRA**：2×24 GB（FSDP）

显存充裕优先 16-bit LoRA/DoRA；显存紧张用 QLoRA。

## 训练目标

1. **SFT**（监督微调）：instruction–response 对，最常用起点
2. **DPO**（直接偏好优化）：离线偏好数据，无需奖励模型
3. **RLHF/GRPO**：需奖励模型与在线采样，本地单卡仅适合小规模 3B–7B 实验

推荐流程：SFT → DPO → [可选] GRPO → 评估（任务指标 + MMLU）。

## 端到端流程

1. 评估是否真的需要微调（先 exhaust prompt engineering 与 RAG）
2. 准备 500–5,000 条 ChatML 格式高质量数据
3. 选择 7B–8B 开源基座（Llama 3.1 8B、Qwen 2.5 7B、Mistral 7B）
4. QLoRA + DoRA 配置训练（Unsloth 或 LLaMA-Factory）
5. 监控 val loss，防止过拟合
6. 合并适配器，导出 GGUF
7. 通过 Ollama / llama.cpp 本地部署

## 要点与易错点

- **微调用于风格/行为，不用于注入知识**——知识走 RAG
- **数据质量 > 数据数量**：500 条高质量远胜 5 万条低质
- **务必 smoke test** 实测峰值显存，勿仅凭表格采购硬件
- **训练后评估通用能力**（如 MMLU），防止灾难性遗忘
- **Apple Silicon** 走 MLX 路径，无 CUDA 不可用 bitsandbytes QLoRA
- **70B 本地微调** 需双卡 FSDP+QLoRA，更常见做法是蒸馏到 7B 学生模型
