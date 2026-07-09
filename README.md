# 🧠 AI 大模型全栈教程

<p align="center">
  <strong>面向 C# 后端开发者的 AI 大模型全栈学习指南</strong><br>
  从 Python 基础到 Agent 开发，17 章系统教学 · 179 道面试题 · 养老院业务场景贯穿
</p>

<p align="center">
  <a href="https://huanghhcri.github.io/ai-llm-tutorial/">📖 在线阅读</a> ·
  <a href="#-快速开始">🚀 快速开始</a> ·
  <a href="#-教程大纲">📚 教程大纲</a> ·
  <a href="#-面试题库">🎯 面试题库</a>
</p>

---

## ✨ 教程特色

| 特色 | 说明 |
|------|------|
| 🎯 **面向 C# 开发者** | 所有概念对标 ASP.NET Core / C# 概念，快速建立映射 |
| 🏥 **养老院业务场景** | 所有代码示例基于真实养老院管理系统，禁用通用示例 |
| 📝 **179 道面试题** | 每章 10+ 道，标注难度（⭐/⭐⭐/⭐⭐⭐）和详细参考答案 |
| ⏰ **版本实时验证** | 所有工具/框架版本均通过 PyPI/HuggingFace API 实时查询 |
| 💻 **完整代码示例** | Python + 详细中文注释，基础篇附 C# 等价写法 |
| 🔄 **持续更新** | 跟踪最新模型和框架版本，定期更新内容 |

---

## 📚 教程大纲

### 基础篇（第 1-3 章）

| 章节 | 主题 | 核心内容 | 字数 |
|------|------|---------|------|
| [第 01 章](docs/第01章_Python基础.md) | Python 基础 | 面向 C# 开发者的快速入门，对标 OOP/async/类型系统 | ~56K |
| [第 02 章](docs/第02章_深度学习基础.md) | 深度学习基础 | 神经网络、反向传播、损失函数、PyTorch 实战 | ~57K |
| [第 03 章](docs/第03章_NLP基础与Tokenization.md) | NLP 基础 | 分词、BPE/WordPiece、词向量、文本表示 | ~55K |

### 原理篇（第 4-5 章）

| 章节 | 主题 | 核心内容 | 字数 |
|------|------|---------|------|
| [第 04 章](docs/第04章_Transformer架构详解.md) | Transformer 架构 | 自注意力、多头注意力、位置编码、编码器-解码器 | ~66K |
| [第 05 章](docs/第05章_大模型原理与发展脉络.md) | 大模型原理 | GPT/LLaMA/Qwen/DeepSeek 演进、Scaling Law、涌现能力 | ~55K |

### 应用篇（第 6-9 章）

| 章节 | 主题 | 核心内容 | 字数 |
|------|------|---------|------|
| [第 06 章](docs/第06章_大模型API调用实战.md) | API 调用 | OpenAI/Qwen/DeepSeek 三端对比、流式输出、Function Calling | ~59K |
| [第 07 章](docs/第07章_PromptEngineering提示词工程.md) | Prompt Engineering | CoT、角色提示、Structured Outputs、Tree-of-Thought | ~57K |
| [第 08 章](docs/第08章_Embedding与向量数据库.md) | Embedding 与向量数据库 | Embedding 原理、Chroma/Qdrant/Milvus 对比与实战 | ~63K |
| [第 09 章](docs/第09章_RAG检索增强生成.md) | RAG 检索增强生成 | 架构设计、文档切分、GraphRAG、Hybrid Search、Re-ranking | ~61K |

### 框架篇（第 10-12 章）

| 章节 | 主题 | 核心内容 | 字数 |
|------|------|---------|------|
| [第 10 章](docs/第10章_LangChain与LangGraph实战.md) | LangChain/LangGraph | LCEL 管道、状态图、LangSmith 追踪 | ~46K |
| [第 11 章](docs/第11章_AI_Agent开发.md) | AI Agent 开发 | ReAct、Tool Use、MCP 协议、记忆机制 | ~47K |
| [第 12 章](docs/第12章_多Agent系统.md) | 多 Agent 系统 | 架构模式、通信协作、任务编排 | ~47K |

### 进阶篇（第 13-17 章）

| 章节 | 主题 | 核心内容 | 字数 |
|------|------|---------|------|
| [第 13 章](docs/第13章_模型微调.md) | 模型微调 | LoRA/QLoRA、数据集准备、PEFT/Unsloth | ~43K |
| [第 14 章](docs/第14章_模型量化.md) | 模型量化 | INT8/INT4、GPTQ/AWQ/GGUF | ~38K |
| [第 15 章](docs/第15章_私有化部署.md) | 私有化部署 | Ollama、vLLM、Docker 部署、GPU 规划 | ~39K |
| [第 16 章](docs/第16章_多模态大模型.md) | 多模态大模型 | VLM、多模态 RAG、多模态 Agent | ~41K |
| [第 17 章](docs/第17章_模型评估与对齐.md) | 模型评估与对齐 | RLHF、DPO、安全对齐 | ~42K |

---

## 🎯 面试题库

[面试题汇总](docs/interview-questions.md) 包含 **179 道面试题**，覆盖全部 17 章：

| 难度 | 数量 | 说明 |
|------|------|------|
| ⭐ 基础 | ~70 道 | 概念理解、API 使用、工具选型 |
| ⭐⭐ 进阶 | ~80 道 | 架构设计、性能优化、方案对比 |
| ⭐⭐⭐ 高级 | ~29 道 | 系统设计、前沿技术、深度原理 |

每道题包含：题目、难度、类型、详细参考答案。

---

## 🚀 快速开始

### 在线阅读（推荐）

直接访问 **[GitHub Pages](https://huanghhcri.github.io/ai-llm-tutorial/)** 即可在线阅读全部内容。

### 本地预览

```bash
# 1. 克隆仓库
git clone https://github.com/huanghhcri/ai-llm-tutorial.git
cd ai-llm-tutorial

# 2. 安装 MkDocs
pip install mkdocs mkdocs-material

# 3. 启动本地预览
mkdocs serve

# 4. 浏览器打开 http://127.0.0.1:8000
```

> 💡 详细的本地预览指南（含 Windows/WSL/Docker 三种方案）请参阅 [LOCAL_PREVIEW.md](docs/LOCAL_PREVIEW.md)

### 学习建议

```
推荐学习路线（约 4-6 周）：

第 1 周：基础篇（第 1-3 章）
  → 掌握 Python + 深度学习基础 + NLP 基础

第 2 周：原理篇（第 4-5 章）
  → 理解 Transformer 架构和大模型发展脉络

第 3 周：应用篇（第 6-9 章）
  → 掌握 API 调用、Prompt Engineering、RAG

第 4 周：框架篇（第 10-12 章）
  → 掌握 LangChain、Agent 开发、多 Agent 系统

第 5-6 周：进阶篇（第 13-17 章）
  → 掌握微调、量化、部署、多模态、评估对齐
```

---

## 🛠️ 技术栈

| 类别 | 工具/框架 | 版本 |
|------|---------|------|
| 语言 | Python | 3.14 |
| 深度学习 | PyTorch | 2.13.0 |
| NLP | transformers | 5.13.0 |
| 框架 | LangChain / LangGraph | 1.4.9 / 1.2.8 |
| 向量数据库 | ChromaDB | 1.5.9 |
| 微调 | PEFT / TRL | 0.19.1 / 1.7.1 |
| API | OpenAI SDK | 2.44.0 |

> 所有版本通过 PyPI JSON API 实时验证（2026 年 7 月）

---

## 📁 项目结构

```
ai-llm-tutorial/
├── .github/workflows/deploy.yml   # GitHub Actions 自动部署
├── .gitignore
├── mkdocs.yml                     # MkDocs 配置
├── README.md                      # 本文件
├── docs/
│   ├── index.md                   # 首页
│   ├── interview-questions.md     # 面试题汇总（179 道）
│   ├── LOCAL_PREVIEW.md           # 本地预览指南
│   ├── assets/stylesheets/        # 自定义样式
│   ├── 第01章_Python基础.md
│   ├── 第02章_深度学习基础.md
│   ├── ...
│   └── 第17章_模型评估与对齐.md
└── site/                          # 构建产物（自动生成，不提交）
```

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

### 报告问题

如果发现内容错误或过时信息，请 [提交 Issue](https://github.com/huanghhcri/ai-llm-tutorial/issues/new)：

1. 说明是哪一章、哪个知识点
2. 描述错误内容和正确内容
3. 附上参考资料链接

### 提交改进

```bash
# 1. Fork 仓库
# 2. 创建分支
git checkout -b fix/chapter-xx-typo

# 3. 修改 docs/ 目录下的 .md 文件

# 4. 本地预览确认
mkdocs serve

# 5. 提交并推送
git commit -m "fix: 修正第XX章xxx错误"
git push origin fix/chapter-xx-typo

# 6. 创建 Pull Request
```

---

## 📄 许可证

本教程采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可证。

- ✅ 可以分享、复制
- ✅ 可以修改、演绎
- ❌ 不可商用
- 📝 必须注明出处

---

## 🙏 致谢

- [ABP Framework](https://abp.io/) — 项目架构参考
- [HuggingFace](https://huggingface.co/) — 模型和数据集平台
- [LangChain](https://python.langchain.com/) — AI 应用框架
- [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) — 文档站点主题

---

<p align="center">
  <strong>⭐ 如果这个教程对你有帮助，请给个 Star 支持一下！</strong>
</p>
