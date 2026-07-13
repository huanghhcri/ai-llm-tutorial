# AI 大模型篇

<p align="center">
  <strong>面向 C# 开发者的 AI 大模型全栈学习指南</strong><br>
  从 Python 基础到 Agent 开发，17 章系统教学
</p>

---

## 🎯 教程特色

- **面向 C# 开发者**：所有概念均对标 ASP.NET Core / C# 概念，快速建立映射
- **养老院业务场景**：所有代码示例基于真实养老院管理系统
- **面试准备**：每章 10+ 道面试题，标注难度和详细参考答案
- **时效性保障**：所有工具/框架版本均通过 PyPI/HuggingFace API 实时验证

---

## 📚 教程大纲

### 基础篇（第 1-3 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 01 章](第01章_Python基础.md) | Python 基础 | 面向 C# 开发者的快速入门，对标 OOP/async/类型系统 |
| [第 02 章](第02章_深度学习基础.md) | 深度学习基础 | 神经网络、反向传播、损失函数、PyTorch 实战 |
| [第 03 章](第03章_NLP基础与Tokenization.md) | NLP 基础 | 分词、BPE/WordPiece、词向量、文本表示 |

### 原理篇（第 4-5 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 04 章](第04章_Transformer架构详解.md) | Transformer 架构 | 自注意力、多头注意力、位置编码、编码器-解码器 |
| [第 05 章](第05章_大模型原理与发展脉络.md) | 大模型原理 | GPT/LLaMA/Qwen/DeepSeek 演进、Scaling Law、涌现能力 |

### 应用篇（第 6-9 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 06 章](第06章_大模型API调用实战.md) | API 调用 | OpenAI/Qwen/DeepSeek 三端对比、流式输出、Function Calling |
| [第 07 章](第07章_PromptEngineering提示词工程.md) | Prompt Engineering | CoT、角色提示、Structured Outputs、Tree-of-Thought |
| [第 08 章](第08章_Embedding与向量数据库.md) | Embedding 与向量数据库 | Embedding 原理、Chroma/Qdrant/Milvus 对比与实战 |
| [第 09 章](第09章_RAG检索增强生成.md) | RAG 检索增强生成 | 架构设计、文档切分、GraphRAG、Hybrid Search、Re-ranking |

### 框架篇（第 10-12 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 10 章](第10章_LangChain与LangGraph实战.md) | LangChain/LangGraph | LCEL 管道、状态图、LangSmith 追踪 |
| [第 11 章](第11章_AI_Agent开发.md) | AI Agent 开发 | ReAct、Tool Use、MCP 协议、记忆机制 |
| [第 12 章](第12章_多Agent系统.md) | 多 Agent 系统 | 架构模式、通信协作、任务编排 |

### 进阶篇（第 13-17 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 13 章](第13章_模型微调.md) | 模型微调 | LoRA/QLoRA、数据集准备、PEFT/Unsloth |
| [第 14 章](第14章_模型量化.md) | 模型量化 | INT8/INT4、GPTQ/AWQ/GGUF |
| [第 15 章](第15章_私有化部署.md) | 私有化部署 | Ollama、vLLM、Docker 部署、GPU 规划 |
| [第 16 章](第16章_多模态大模型.md) | 多模态大模型 | VLM、多模态 RAG、多模态 Agent |
| [第 17 章](第17章_模型评估与对齐.md) | 模型评估与对齐 | RLHF、DPO、安全对齐 |

### 题库

- [面试题汇总](interview-questions.md) — 179 道面试题，覆盖全部 17 章

---

## 📋 版本信息

| 工具/框架 | 版本 | 验证方式 |
|-----------|------|---------|
| Python | 3.14 | 系统安装 |
| PyTorch | 2.13.0 | PyPI API |
| transformers | 5.13.0 | PyPI API |
| langchain-core | 1.4.9 | PyPI API |
| langgraph | 1.2.8 | PyPI API |
| chromadb | 1.5.9 | PyPI API |
| openai | 2.44.0 | PyPI API |
| trl | 1.7.1 | PyPI API |
| peft | 0.19.1 | PyPI API |

> 所有版本信息通过 PyPI JSON API 实时查询确认（2026 年 7 月）
