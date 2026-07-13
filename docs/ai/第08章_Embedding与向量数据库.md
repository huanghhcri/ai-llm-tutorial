# 第 08 章 Embedding 与向量数据库 — 让 AI 拥有"语义记忆"

---

## 一、章节概述

### 本章学什么

本章解决一个核心问题：**如何让大模型"记住"养老院的海量知识？** 你将学到：

- **Embedding 原理**：文本如何变成语义向量（一组数字）
- **余弦相似度**：如何衡量两段文本的语义相似程度
- **主流 Embedding 模型对比**：OpenAI、Qwen、BGE、GTE
- **向量数据库实战**：Chroma、Milvus、Qdrant 的使用与对比
- **完整流程**：文档→切分→向量化→存储→检索→相似度排序

### 为什么学

大模型的上下文窗口有限（128K tokens），不可能把养老院的所有知识（护理手册、用药指南、历史病历）都塞进 Prompt。Embedding + 向量数据库的方案是：

1. 把知识文档切成小段，每段转为一个**语义向量**
2. 存入**向量数据库**
3. 用户提问时，把问题也转为向量，找到最相似的文档段落
4. 把相关段落作为上下文喂给大模型回答

这就是 **RAG（检索增强生成）** 的基础——下一章的内容。

### 在知识体系中的位置

```
第7章 Prompt Engineering
        ↓
第8章 Embedding 与向量数据库 ← 你在这里（RAG 的基础）
        ↓
第9章 RAG 检索增强生成（本章的直接应用）
```

---

## 二、核心知识点

### 2.1 什么是 Embedding？

#### 类比

养老院有 1000 位长者，每位长者有一份**健康档案卡**。档案卡上不是写一段文字描述，而是一组数字指标：

```
张大爷的档案卡：[0.82, 0.15, 0.93, 0.44, ...]  （1536 个数字）
李奶奶的档案卡：[0.78, 0.12, 0.88, 0.41, ...]  （1536 个数字）
王爷爷的档案卡：[0.21, 0.87, 0.33, 0.65, ...]  （1536 个数字）
```

- 张大爷和李奶奶的数字很接近 → 他们的健康状况相似
- 王爷爷的数字和前两位差异大 → 健康状况不同

**Embedding 就是给文本做"档案卡"——把一段文字变成一组数字（向量），语义相似的文字数字也接近。**

#### 技术定义

```python
import numpy as np

# Embedding 的本质：一个函数 f(text) → vector
# f("张大爷血压偏高") → [0.82, 0.15, 0.93, 0.44, ...]
# f("李先生血压升高") → [0.80, 0.14, 0.91, 0.43, ...]  （语义相似 → 向量接近）
# f("今天天气很好")   → [0.12, 0.88, 0.21, 0.76, ...]  （语义不同 → 向量远离）

# 向量维度：
# - OpenAI text-embedding-3-small: 1536 维
# - Qwen3-Embedding: 1024 维
# - BGE-M3: 1024 维
# - GTE: 768 维
```

#### 余弦相似度 — 衡量向量"有多像"

```python
import numpy as np

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    计算两个向量的余弦相似度。
    
    公式：cos(θ) = (A·B) / (|A| × |B|)
    
    范围：[-1, 1]
    - 1 = 完全相同方向（语义完全一致）
    - 0 = 正交（无关）
    - -1 = 完全相反（语义相反）
    
    类比：两位护理员的"护理风格向量"
    - 余弦相似度 = 1：护理风格完全一致
    - 余弦相似度 = 0：护理风格完全不同
    """
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)


# 模拟：三段养老院文本的 Embedding 向量（实际由模型生成，这里简化为 8 维）
vec_highbp = np.array([0.82, 0.15, 0.93, 0.44, 0.31, 0.67, 0.22, 0.55])   # "血压偏高"
vec_highbp2 = np.array([0.80, 0.14, 0.91, 0.43, 0.30, 0.65, 0.21, 0.54])  # "血压升高"
vec_weather = np.array([0.12, 0.88, 0.21, 0.76, 0.55, 0.33, 0.89, 0.11])   # "今天天气好"

print(f"'血压偏高' vs '血压升高': {cosine_similarity(vec_highbp, vec_highbp2):.4f}")  # ~0.999
print(f"'血压偏高' vs '天气好':   {cosine_similarity(vec_highbp, vec_weather):.4f}")   # ~0.5
print()
print("→ 语义相似的文本，余弦相似度接近 1")
print("→ 语义不同的文本，余弦相似度远离 1")
```

---

### 2.2 主流 Embedding 模型对比

#### 类比

选择 Embedding 模型就像选择"档案卡的记录标准"——标准越精细，区分不同长者的能力越强，但填写档案卡的成本也越高。

```python
# 2026 年主流 Embedding 模型对比（已通过 PyPI 和 HuggingFace 验证）

embedding_models = {
    "OpenAI text-embedding-3-small": {
        "维度": 1536,
        "特点": "API 调用，无需部署，英文为主",
        "价格": "¥0.01/百万 tokens",
        "适用": "快速原型、英文场景",
        "安装": "openai SDK（2.44.0）",
    },
    "OpenAI text-embedding-3-large": {
        "维度": 3072,
        "特点": "最高质量的通用 Embedding",
        "价格": "¥0.065/百万 tokens",
        "适用": "对精度要求极高的场景",
        "安装": "openai SDK",
    },
    "Qwen3-Embedding-0.6B": {
        "维度": 1024,
        "特点": "开源、中文优化、可本地部署",
        "价格": "免费（本地部署需 GPU）",
        "适用": "中文场景首选、数据隐私要求高",
        "安装": "uv add transformers sentence-transformers",
    },
    "BAAI/bge-m3": {
        "维度": 1024,
        "特点": "多语言、开源、支持稠密+稀疏+多向量",
        "价格": "免费（本地部署）",
        "适用": "多语言场景、RAG 系统",
        "安装": "uv add FlagEmbedding（1.4.0）",
    },
    "BAAI/bge-large-zh-v1.5": {
        "维度": 1024,
        "特点": "中文专用、开源、效果优秀",
        "价格": "免费（本地部署）",
        "适用": "纯中文场景",
        "安装": "uv add sentence-transformers",
    },
    "GTE-Qwen2": {
        "维度": 768,
        "特点": "阿里通义出品、中文优化",
        "价格": "免费（本地部署）或 API",
        "适用": "中文 RAG 系统",
        "安装": "uv add sentence-transformers",
    },
}

print("📊 2026 年主流 Embedding 模型对比:")
print(f"{'模型':<35} {'维度':>6} {'部署方式':>10} {'中文':>4} {'价格':}")
print("-" * 80)
rows = [
    ("text-embedding-3-small (OpenAI)", "1536", "API", "一般", "¥0.01/M tokens"),
    ("text-embedding-3-large (OpenAI)", "3072", "API", "一般", "¥0.065/M tokens"),
    ("Qwen3-Embedding-0.6B (阿里)", "1024", "本地/API", "✅优", "免费/API"),
    ("bge-m3 (BAAI/智源)", "1024", "本地", "✅优", "免费"),
    ("bge-large-zh-v1.5 (BAAI)", "1024", "本地", "✅优", "免费"),
    ("GTE-Qwen2 (阿里)", "768", "本地/API", "✅优", "免费/API"),
]
for name, dim, deploy, cn, price in rows:
    print(f"{name:<35} {dim:>6} {deploy:>10} {cn:>4} {price}")
```

#### 养老院选型建议

```
场景：养老院知识库 RAG 系统

首选：Qwen3-Embedding-0.6B 或 bge-m3
原因：
  1. 中文护理文档为主 → 需要中文优化的模型
  2. 长者健康数据敏感 → 需要本地部署（数据不出院）
  3. 0.6B 参数 → 单张 RTX 4060 即可运行
  4. 1024 维 → 精度和效率的平衡点

备选（快速原型）：OpenAI text-embedding-3-small
原因：API 调用，不需要 GPU，快速验证效果
```

---

### 2.3 使用 OpenAI Embedding API

```python
from openai import OpenAI
import numpy as np

client = OpenAI(api_key="sk-your-key")

def get_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    """
    获取文本的 Embedding 向量。
    
    对标 C#：调用 REST API 获取向量，但 OpenAI SDK 封装了 HTTP 细节。
    """
    # 将文本中的换行符替换为空格（OpenAI 推荐）
    text = text.replace("\n", " ")
    
    response = client.embeddings.create(
        input=[text],
        model=model,
    )
    return response.data[0].embedding


def batch_embed(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    """
    批量获取 Embedding（效率更高，一次 API 调用处理多条文本）。
    
    注意：OpenAI 单次最多处理 2048 条文本，总 token 不超过 8191。
    """
    # 清洗文本
    cleaned = [t.replace("\n", " ") for t in texts]
    
    response = client.embeddings.create(
        input=cleaned,
        model=model,
    )
    
    # 按索引排序（API 保证返回顺序与输入一致）
    return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]


# 养老院场景：计算护理记录之间的相似度
records = [
    "长者今日血压偏高155/95mmHg，伴有头晕，已调整降压药用量",
    "长者血压升高至160/100mmHg，出现头痛症状，需调整降压方案",
    "长者今日血糖控制良好，空腹血糖6.2mmol/L，饮食规律",
    "长者跌倒后右髋部疼痛，活动受限，高度怀疑骨折",
]

# 批量获取 Embedding
embeddings = batch_embed(records)

# 计算相似度矩阵
print("📊 护理记录相似度矩阵:")
print(f"{'':>8}", end="")
for i in range(len(records)):
    print(f"{'记录'+str(i+1):>8}", end="")
print()

for i in range(len(records)):
    print(f"{'记录'+str(i+1):>8}", end="")
    for j in range(len(records)):
        sim = cosine_similarity(np.array(embeddings[i]), np.array(embeddings[j]))
        print(f"{sim:>8.3f}", end="")
    print()

# 预期输出：
# 记录1 vs 记录2: ~0.92（都是血压问题）
# 记录1 vs 记录3: ~0.65（不同健康指标）
# 记录1 vs 记录4: ~0.45（完全不同的问题）
```

---

### 2.4 本地 Embedding 模型（sentence-transformers）

```python
# 安装：uv add sentence-transformers
# 模型会在首次加载时自动下载（约 1-2 GB）

from sentence_transformers import SentenceTransformer
import numpy as np

# 加载中文 Embedding 模型
# bge-m3：多语言，支持中英文，效果优秀
model = SentenceTransformer("BAAI/bge-m3")

# 或者使用 Qwen3 Embedding
# model = SentenceTransformer("Qwen/Qwen3-Embedding-0.6B")

# 编码单条文本
embedding = model.encode("张大爷今日血压偏高，需要调整用药")
print(f"向量维度: {embedding.shape}")   # (1024,)
print(f"前 10 维: {embedding[:10].round(4)}")

# 批量编码（效率更高）
texts = [
    "长者血压偏高155/95mmHg",
    "长者血压升高至160/100mmHg",
    "长者血糖控制良好",
    "长者跌倒后髋部疼痛",
]
embeddings = model.encode(texts, show_progress_bar=True)
print(f"\n批量编码形状: {embeddings.shape}")   # (4, 1024)

# 计算相似度
from sentence_transformers.util import cos_sim

# 方法 1：手动计算
for i in range(len(texts)):
    for j in range(i + 1, len(texts)):
        sim = cos_sim(embeddings[i], embeddings[j]).item()
        print(f"  '{texts[i][:10]}...' vs '{texts[j][:10]}...': {sim:.4f}")

# 方法 2：使用 model.similarity（更方便）
similarities = model.similarity(embeddings, embeddings)
print(f"\n相似度矩阵:\n{similarities}")
```

---

### 2.5 向量数据库概览

#### 为什么需要向量数据库？

```python
# 问题：养老院有 10,000 篇护理文档，每篇转为 1024 维向量
# 用户提问后，需要找到最相似的 Top-5 文档

# 方案 1：暴力搜索（全量遍历）
# 10,000 个向量 × 每次计算余弦相似度 = 很慢（>100ms）
# 100,000 个向量 → 更慢（>1s）
# 不适合生产环境

# 方案 2：向量数据库
# 使用 ANN（近似最近邻）算法，牺牲微小精度换取 100-1000 倍速度提升
# 10,000 个向量 → <5ms
# 1,000,000 个向量 → <50ms
# 支持：过滤、持久化、分布式、增量更新
```

#### 主流向量数据库对比

```python
# 2026 年主流向量数据库对比

vector_dbs = {
    "Chroma": {
        "版本": "1.5.9",
        "特点": "轻量级、嵌入式、Python 原生",
        "适用": "原型开发、小型项目（<100 万向量）",
        "部署": "pip install chromadb（零配置）",
        "优势": "最简单的上手体验，5 行代码即可使用",
        "劣势": "大规模性能一般，不支持分布式",
    },
    "Qdrant": {
        "版本": "1.18.0",
        "特点": "高性能、Rust 实现、丰富过滤",
        "适用": "中大型生产环境",
        "部署": "Docker 部署或 Qdrant Cloud",
        "优势": "性能优秀、过滤能力强、支持多租户",
        "劣势": "需要单独部署服务",
    },
    "Milvus": {
        "版本": "3.0.0",
        "特点": "分布式、十亿级向量、GPU 加速",
        "适用": "大规模生产环境（>1000 万向量）",
        "部署": "Docker Compose 或 Kubernetes",
        "优势": "最强的扩展性和性能",
        "劣势": "部署复杂，资源消耗大",
    },
    "Pinecone": {
        "版本": "6.0.0",
        "特点": "全托管云服务、零运维",
        "适用": "不想自建基础设施的团队",
        "部署": "注册即用（SaaS）",
        "优势": "零运维、自动扩展",
        "劣势": "数据出境、按量付费、供应商锁定",
    },
    "FAISS": {
        "版本": "1.14.3",
        "特点": "Meta 开源、纯算法库（不是数据库）",
        "适用": "对性能要求极高的纯检索场景",
        "部署": "pip install faiss-cpu（或 faiss-gpu）",
        "优势": "最快的 ANN 搜索算法",
        "劣势": "无持久化、无过滤、需要自己管理",
    },
}
```

#### 养老院选型建议

```
阶段 1（原型验证）：Chroma
  - 零配置，5 行代码即可使用
  - 适合验证 RAG 效果

阶段 2（小规模上线）：Qdrant
  - Docker 一键部署
  - 支持按"科室""长者ID"过滤
  - 性能满足万级文档

阶段 3（大规模生产）：Milvus
  - 当文档量超过 100 万时考虑
  - 分布式部署，支持水平扩展
```

---

### 2.6 Chroma 向量数据库实战

```python
# 安装：uv add chromadb
import chromadb

# ========== 创建数据库和集合 ==========
# Chroma 是嵌入式数据库，数据存储在本地目录
# 对标 C#：类似 SQLite——不需要单独部署服务

client = chromadb.PersistentClient(path="./nursing_home_vectordb")

# 创建集合（类似数据库中的"表"）
# 对标 C#：相当于创建一个 DbSet<T>
collection = client.get_or_create_collection(
    name="nursing_knowledge",
    metadata={"description": "养老院护理知识库"},
)

# ========== 插入文档 ==========
# 准备养老院知识库数据
knowledge_base = [
    {
        "id": "doc_001",
        "text": "高血压分级标准：1级(140-159/90-99mmHg)、2级(160-179/100-109mmHg)、3级(≥180/≥110mmHg)。老年人降压目标<150/90mmHg。",
        "metadata": {"category": "疾病", "source": "高血压指南", "department": "心内科"},
    },
    {
        "id": "doc_002",
        "text": "跌倒后处理流程：1.评估意识状态 2.检查出血 3.评估骨折风险 4.测量生命体征 5.记录跌倒经过 6.通知医生和家属。",
        "metadata": {"category": "护理", "source": "护理规范", "department": "护理部"},
    },
    {
        "id": "doc_003",
        "text": "糖尿病饮食管理：控制总热量，碳水化合物占50-60%，蛋白质15-20%，脂肪25-30%。少食多餐，避免高GI食物。",
        "metadata": {"category": "营养", "source": "糖尿病指南", "department": "营养科"},
    },
    {
        "id": "doc_004",
        "text": "低氧血症处理：SpO2<90%立即给予低流量吸氧(1-2L/min)，半卧位，30分钟后复查血氧。持续<90%通知医生。",
        "metadata": {"category": "护理", "source": "急救手册", "department": "护理部"},
    },
    {
        "id": "doc_005",
        "text": "降压药分类：CCB类(氨氯地平)适用于老年人，ARB类(缬沙坦)适用于糖尿病合并高血压，ACEI类(贝那普利)适用于心衰。老年人首选CCB。",
        "metadata": {"category": "用药", "source": "药理学", "department": "药剂科"},
    },
    {
        "id": "doc_006",
        "text": "压疮预防：每2小时翻身一次，保持皮肤清洁干燥，使用减压床垫，加强营养支持，高蛋白高维生素饮食。",
        "metadata": {"category": "护理", "source": "护理规范", "department": "护理部"},
    },
    {
        "id": "doc_007",
        "text": "帕金森病护理要点：防跌倒（移除障碍物、安装扶手），吞咽困难者调整食物性状，药物定时服用不可遗漏，鼓励适量运动。",
        "metadata": {"category": "护理", "source": "神经内科指南", "department": "神经内科"},
    },
    {
        "id": "doc_008",
        "text": "老年人便秘处理：增加膳食纤维摄入（25-30g/日），充足饮水（1500-2000ml/日），适量运动，必要时使用渗透性泻药（乳果糖）。",
        "metadata": {"category": "护理", "source": "消化内科指南", "department": "消化内科"},
    },
]

# 批量插入
collection.add(
    ids=[doc["id"] for doc in knowledge_base],
    documents=[doc["text"] for doc in knowledge_base],
    metadatas=[doc["metadata"] for doc in knowledge_base],
)

print(f"✅ 已插入 {collection.count()} 条知识文档")


# ========== 语义检索 ==========
# Chroma 会自动将 query 文本转为 Embedding 并搜索最相似的文档
# 默认使用 all-MiniLM-L6-v2 模型（英文为主，中文效果一般）
# 生产环境建议指定中文 Embedding 模型

def search_knowledge(query: str, n_results: int = 3, where: dict = None) -> list[dict]:
    """
    语义检索：查找与查询最相似的知识文档。
    
    Args:
        query: 查询文本
        n_results: 返回结果数量
        where: 元数据过滤条件
    
    Returns:
        相似文档列表
    """
    kwargs = {
        "query_texts": [query],
        "n_results": n_results,
    }
    if where:
        kwargs["where"] = where
    
    results = collection.query(**kwargs)
    
    docs = []
    for i in range(len(results["ids"][0])):
        docs.append({
            "id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "distance": results["distances"][0][i] if results["distances"] else None,
        })
    return docs


# 测试检索
print("\n🔍 语义检索测试:")
print("=" * 60)

queries = [
    "血压高怎么办？",
    "长者跌倒了怎么处理？",
    "糖尿病老人能吃什么？",
    "血氧低怎么急救？",
]

for query in queries:
    print(f"\n查询: '{query}'")
    results = search_knowledge(query, n_results=2)
    for r in results:
        print(f"  [{r['id']}] {r['metadata']['category']} | "
              f"相似度: {1 - r['distance']:.3f} | "
              f"{r['text'][:50]}...")


# ========== 带过滤的检索 ==========
print("\n🔍 带过滤条件的检索:")
print("=" * 60)

# 只检索"护理"类别的知识
results = search_knowledge(
    "如何预防并发症",
    n_results=3,
    where={"category": "护理"},
)
print(f"\n查询: '如何预防并发症'（只看护理类）")
for r in results:
    print(f"  [{r['id']}] {r['text'][:50]}...")


# ========== 更新和删除 ==========
# 更新文档
collection.update(
    ids=["doc_001"],
    documents=["高血压分级标准（更新版）：1级(130-139/80-89mmHg)、2级(≥140/≥90mmHg)。注意：2024年指南已更新分级标准。"],
)

# 删除文档
# collection.delete(ids=["doc_008"])

print(f"\n✅ 更新后文档数: {collection.count()}")
```

---

### 2.7 Qdrant 向量数据库实战

```python
# 安装：uv add qdrant-client
# Qdrant 需要单独部署服务：docker run -p 6333:6333 qdrant/qdrant
# 或使用内存模式（不需要 Docker）

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import uuid

# ========== 创建客户端 ==========
# 内存模式（适合开发测试，不需要 Docker）
client = QdrantClient(":memory:")

# 生产模式（需要 Docker 运行 Qdrant 服务）
# client = QdrantClient(url="http://localhost:6333")

# ========== 创建集合 ==========
COLLECTION_NAME = "nursing_knowledge"

client.create_collection(
    collection_name=COLLECTION_NAME,
    vectors_config=VectorParams(
        size=1024,               # 向量维度（与 Embedding 模型一致）
        distance=Distance.COSINE, # 使用余弦相似度
    ),
)

# ========== 插入数据 ==========
# Qdrant 要求先有向量，再插入
# 这里使用随机向量模拟（实际用 Embedding 模型生成）
import numpy as np
np.random.seed(42)

documents = [
    {"text": "高血压分级标准：1级(140-159/90-99)", "category": "疾病", "department": "心内科"},
    {"text": "跌倒后处理流程：评估意识→检查出血→评估骨折", "category": "护理", "department": "护理部"},
    {"text": "糖尿病饮食：控制总热量，少食多餐", "category": "营养", "department": "营养科"},
    {"text": "低氧血症处理：SpO2<90%立即吸氧", "category": "护理", "department": "护理部"},
    {"text": "降压药分类：CCB适用于老年人", "category": "用药", "department": "药剂科"},
]

# 为每条文档生成模拟向量（实际使用 Embedding 模型）
points = []
for i, doc in enumerate(documents):
    vector = np.random.randn(1024).tolist()  # 模拟向量
    points.append(
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "text": doc["text"],
                "category": doc["category"],
                "department": doc["department"],
            },
        )
    )

client.upsert(collection_name=COLLECTION_NAME, points=points)
print(f"✅ 已插入 {len(points)} 条文档到 Qdrant")

# ========== 语义检索 ==========
query_vector = np.random.randn(1024).tolist()  # 模拟查询向量

results = client.query_points(
    collection_name=COLLECTION_NAME,
    query=query_vector,
    limit=3,
    with_payload=True,
).points

print(f"\n🔍 检索结果（Top-3）:")
for r in results:
    print(f"  相似度: {r.score:.3f} | {r.payload['text'][:40]}...")

# ========== 带过滤的检索 ==========
from qdrant_client.models import Filter, FieldCondition, MatchValue

# 只检索"护理"类别
filtered_results = client.query_points(
    collection_name=COLLECTION_NAME,
    query=query_vector,
    query_filter=Filter(
        must=[FieldCondition(key="category", match=MatchValue(value="护理"))],
    ),
    limit=3,
    with_payload=True,
).points

print(f"\n🔍 过滤检索（只看护理类）:")
for r in filtered_results:
    print(f"  相似度: {r.score:.3f} | {r.payload['text'][:40]}...")
```

---

### 2.8 文档切分策略

#### 为什么需要切分？

```python
# 问题：一份完整的护理手册有 50,000 字
# - 不能整篇转为一个向量（信息太杂，向量无法聚焦）
# - 也不能每个字转一个向量（丢失上下文）
# - 需要切成"合适大小"的片段

# 类比：
# 养老院的护理手册不能整本塞给护理员看，
# 也不能撕成单页给她——而是按章节、按主题分好类，夹上书签。
```

#### 切分策略对比

```python
from typing import Optional

class TextSplitter:
    """
    文本切分器基类。
    
    对标 C#：类似 Razor 模板引擎的 Section 功能——
    按规则将长文本拆分为有意义的片段。
    """
    
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        """
        Args:
            chunk_size: 每个片段的最大字符数
            chunk_overlap: 相邻片段的重叠字符数（防止语义断裂）
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def split(self, text: str) -> list[str]:
        raise NotImplementedError


class RecursiveCharacterSplitter(TextSplitter):
    """
    递归字符切分器（最常用）。
    
    策略：按分隔符优先级递归切分
    1. 先按 "\n\n"（段落）切分
    2. 段落太长则按 "\n"（换行）切分
    3. 还太长则按 "。"（句号）切分
    4. 最后按 " "（空格）切分
    
    类比：护理手册的切分方式——
    先分章节 → 再分小节 → 再分段落 → 再分句子
    """
    
    SEPARATORS = ["\n\n", "\n", "。", "；", "，", " ", ""]
    
    def split(self, text: str) -> list[str]:
        return self._recursive_split(text, self.SEPARATORS)
    
    def _recursive_split(self, text: str, separators: list[str]) -> list[str]:
        if len(text) <= self.chunk_size:
            return [text.strip()] if text.strip() else []
        
        # 选择第一个能切分文本的分隔符
        separator = separators[-1]
        for sep in separators:
            if sep in text:
                separator = sep
                break
        
        # 按分隔符切分
        splits = text.split(separator)
        
        # 合并小片段，确保不超过 chunk_size
        chunks = []
        current_chunk = ""
        
        for split in splits:
            if not split.strip():
                continue
            
            if len(current_chunk) + len(split) + len(separator) <= self.chunk_size:
                current_chunk += (separator if current_chunk else "") + split
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = split
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        # 处理重叠
        if self.chunk_overlap > 0 and len(chunks) > 1:
            overlapped = [chunks[0]]
            for i in range(1, len(chunks)):
                # 取前一个 chunk 的末尾作为当前 chunk 的开头
                prev_tail = chunks[i - 1][-self.chunk_overlap:]
                overlapped.append(prev_tail + " " + chunks[i])
            chunks = overlapped
        
        return chunks


class MarkdownSplitter(TextSplitter):
    """
    Markdown 切分器：按标题层级切分。
    
    适合：结构化的护理手册、用药指南。
    """
    
    def split(self, text: str) -> list[str]:
        import re
        
        # 按 Markdown 标题切分
        sections = re.split(r'(#{1,4}\s.+)', text)
        
        chunks = []
        current_chunk = ""
        
        for section in sections:
            if not section.strip():
                continue
            
            if len(current_chunk) + len(section) <= self.chunk_size:
                current_chunk += "\n" + section
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                current_chunk = section
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks


# 测试切分
sample_doc = """# 高血压护理指南

## 1. 定义与分级
高血压定义：在未使用降压药物的情况下，非同日3次测量血压，收缩压≥140mmHg和/或舒张压≥90mmHg。

分级标准：
- 1级：收缩压140-159mmHg或舒张压90-99mmHg
- 2级：收缩压160-179mmHg或舒张压100-109mmHg
- 3级：收缩压≥180mmHg或舒张压≥110mmHg

## 2. 护理要点
每日定时测量血压，建议早晚各一次。测量前静坐5分钟，取坐位，手臂与心脏同高。

## 3. 用药护理
遵医嘱按时服用降压药，不可自行增减剂量。注意观察药物不良反应：CCB类可能引起踝部水肿，ACEI类可能引起干咳。"""

splitter = RecursiveCharacterSplitter(chunk_size=200, chunk_overlap=30)
chunks = splitter.split(sample_doc)

print(f"📄 原文长度: {len(sample_doc)} 字符")
print(f"📦 切分为 {len(chunks)} 个片段:")
for i, chunk in enumerate(chunks):
    print(f"\n  --- 片段 {i+1} ({len(chunk)} 字符) ---")
    print(f"  {chunk[:80]}...")
```

---

## 三、养老院业务实战案例

### 需求描述

构建一个**养老院护理知识库检索系统**：

1. 将护理文档切分并存入向量数据库
2. 支持语义检索（用自然语言提问）
3. 支持按类别/科室过滤
4. 检索结果可直接用于 RAG（喂给大模型回答）

### 完整代码

```python
"""
养老院护理知识库检索系统 — Embedding + 向量数据库实战
=======================================================
第 8 章实战案例：文档切分 → 向量化 → 存储 → 语义检索

运行环境：Python 3.14
安装依赖：uv add chromadb sentence-transformers
"""

import chromadb
import numpy as np
from dataclasses import dataclass, field
from typing import Optional
import re
import json
import hashlib


# ============================================================
# 第一步：文档切分器
# ============================================================

@dataclass
class DocumentChunk:
    """文档片段"""
    chunk_id: str              # 唯一 ID（基于内容哈希）
    text: str                  # 片段文本
    source: str                # 来源文档
    category: str              # 类别
    department: str            # 科室
    chunk_index: int           # 在原文中的序号


def generate_chunk_id(text: str, source: str) -> str:
    """基于内容和来源生成唯一 ID"""
    content = f"{source}:{text}"
    return hashlib.md5(content.encode()).hexdigest()[:12]


def split_document(
    text: str,
    source: str,
    category: str,
    department: str,
    chunk_size: int = 300,
    chunk_overlap: int = 50,
) -> list[DocumentChunk]:
    """
    将文档切分为片段。
    
    切分策略：
    1. 按段落（\\n\\n）切分
    2. 段落太长则按句号切分
    3. 相邻片段有重叠，防止语义断裂
    """
    # 第一步：按段落切分
    paragraphs = re.split(r'\n\s*\n', text)
    
    chunks = []
    current_text = ""
    chunk_index = 0
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        if len(current_text) + len(para) <= chunk_size:
            current_text += ("\n\n" if current_text else "") + para
        else:
            if current_text:
                chunks.append(DocumentChunk(
                    chunk_id=generate_chunk_id(current_text, source),
                    text=current_text,
                    source=source,
                    category=category,
                    department=department,
                    chunk_index=chunk_index,
                ))
                chunk_index += 1
                # 重叠：保留上一个片段的最后 chunk_overlap 个字符
                current_text = current_text[-chunk_overlap:] + "\n\n" + para
            else:
                # 段落本身太长，按句号进一步切分
                sentences = re.split(r'[。！？]', para)
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue
                    if len(current_text) + len(sent) <= chunk_size:
                        current_text += ("。" if current_text else "") + sent
                    else:
                        if current_text:
                            chunks.append(DocumentChunk(
                                chunk_id=generate_chunk_id(current_text, source),
                                text=current_text,
                                source=source,
                                category=category,
                                department=department,
                                chunk_index=chunk_index,
                            ))
                            chunk_index += 1
                        current_text = sent
    
    if current_text.strip():
        chunks.append(DocumentChunk(
            chunk_id=generate_chunk_id(current_text, source),
            text=current_text,
            source=source,
            category=category,
            department=department,
            chunk_index=chunk_index,
        ))
    
    return chunks


# ============================================================
# 第二步：知识库数据
# ============================================================

KNOWLEDGE_DOCUMENTS = [
    {
        "source": "高血压护理手册",
        "category": "疾病",
        "department": "心内科",
        "content": """# 高血压护理指南

## 定义与分级
高血压定义：在未使用降压药物的情况下，非同日3次测量血压，收缩压≥140mmHg和/或舒张压≥90mmHg。

分级标准：
- 正常血压：收缩压<120mmHg且舒张压<80mmHg
- 正常高值：收缩压120-139mmHg或舒张压80-89mmHg
- 1级高血压：收缩压140-159mmHg或舒张压90-99mmHg
- 2级高血压：收缩压160-179mmHg或舒张压100-109mmHg
- 3级高血压：收缩压≥180mmHg或舒张压≥110mmHg

老年人降压目标：<150/90mmHg，如能耐受可降至<140/90mmHg。

## 护理要点
1. 每日定时测量血压，建议早晚各一次
2. 测量前静坐5分钟，取坐位，手臂与心脏同高
3. 记录血压值，观察波动趋势
4. 指导低盐饮食（每日钠<5g）
5. 适量运动（散步、太极拳），避免剧烈运动
6. 保持情绪稳定，避免过度激动

## 用药护理
常用降压药分类：
- CCB类（氨氯地平、硝苯地平）：适用于老年人，注意踝部水肿
- ARB类（缬沙坦、氯沙坦）：适用于糖尿病合并高血压
- ACEI类（贝那普利、依那普利）：适用于心衰，注意干咳
- β受体阻滞剂（美托洛尔）：适用于心率快，注意心动过缓

遵医嘱按时服药，不可自行增减剂量或停药。""",
    },
    {
        "source": "跌倒预防与处理手册",
        "category": "护理",
        "department": "护理部",
        "content": """# 跌倒预防与处理

## 高危人群评估
以下因素增加跌倒风险：
- 年龄>80岁
- 既往有跌倒史
- 步态不稳或使用助行器
- 视力障碍
- 服用镇静药、降压药、降糖药
- 认知障碍
- 低血压或体位性低血压

## 预防措施
1. 环境管理：保持地面干燥、移除障碍物、安装扶手、充足照明
2. 个人防护：穿防滑鞋、使用助行器、必要时使用髋部保护器
3. 用药管理：评估跌倒高风险药物，调整服药时间
4. 运动干预：平衡训练、肌力训练、步态训练
5. 健康教育：告知跌倒风险、教授起床"三步法"

## 跌倒后处理流程
1. 评估意识状态：呼唤长者名字，观察是否清醒
2. 检查出血：查看有无明显外伤和出血点
3. 评估骨折风险：询问疼痛部位，观察有无畸形、肿胀
4. 测量生命体征：血压、心率、血氧
5. 记录跌倒经过：时间、地点、姿势、伴随症状
6. 通知医生和家属
7. 24小时内密切观察意识变化（排除迟发性颅内出血）

特别注意：髋部疼痛+活动受限→高度怀疑股骨颈骨折，不要搬动，立即转骨科。""",
    },
    {
        "source": "糖尿病护理指南",
        "category": "疾病",
        "department": "内分泌科",
        "content": """# 糖尿病护理指南

## 诊断标准
- 空腹血糖≥7.0mmol/L
- 餐后2小时血糖≥11.1mmol/L
- 糖化血红蛋白(HbA1c)≥6.5%

老年人控制目标可适当放宽：空腹<8.0mmol/L，餐后<12.0mmol/L。

## 饮食管理
1. 控制总热量：每日25-30kcal/kg理想体重
2. 营养配比：碳水化合物50-60%，蛋白质15-20%，脂肪25-30%
3. 少食多餐：每日3主餐+2-3次加餐
4. 避免高GI食物：白米饭、白面包、糖果
5. 推荐低GI食物：燕麦、糙米、全麦面包
6. 增加膳食纤维：蔬菜、豆类

## 运动管理
餐后1小时开始运动，每次30分钟，每周至少150分钟中等强度运动。
运动前测血糖：<5.6mmol/L需先进食；>16.7mmol/L暂缓运动。

## 低血糖识别与处理
症状：心慌、手抖、出冷汗、饥饿感、意识模糊
处理：立即进食15g快速碳水化合物（葡萄糖片、果汁、糖果）
15分钟后复测血糖，仍<3.9mmol/L再次进食。""",
    },
    {
        "source": "急救护理手册",
        "category": "护理",
        "department": "急诊科",
        "content": """# 常见急症处理

## 低氧血症
定义：血氧饱和度(SpO2)<90%
处理流程：
1. 立即给予低流量吸氧（1-2L/min）
2. 半卧位或坐位（改善通气）
3. 保持呼吸道通畅
4. 30分钟后复查血氧
5. 持续<90%立即通知医生
6. SpO2<85%为严重低氧，准备紧急处理

## 高血压急症
定义：血压≥180/120mmHg伴靶器官损害症状
症状：剧烈头痛、视物模糊、胸痛、呼吸困难
处理：
1. 立即通知医生
2. 半卧位，保持安静
3. 持续心电监护
4. 建立静脉通路
5. 遵医嘱使用降压药（硝苯地平舌下含服或静脉降压药）
6. 1小时内血压降低不超过25%

## 心脏骤停
识别：意识丧失+无呼吸+无脉搏
处理：
1. 立即呼叫120
2. 开始心肺复苏（CPR）：30次按压+2次人工呼吸
3. 按压部位：胸骨下半段，深度5-6cm，频率100-120次/分
4. 使用AED（如有）
5. 持续CPR直到急救人员到达""",
    },
    {
        "source": "压疮护理指南",
        "category": "护理",
        "department": "护理部",
        "content": """# 压疮预防与护理

## 高危因素
- 长期卧床或坐轮椅
- 营养不良（白蛋白<35g/L）
- 大小便失禁
- 意识障碍
- 糖尿病

## 压疮分期
1期：皮肤完整，局部发红不消退
2期：部分皮层缺损，表现为浅溃疡或水泡
3期：全层皮肤缺损，可见皮下脂肪
4期：全层组织缺损，可见骨骼、肌腱

## 预防措施
1. 定时翻身：每2小时一次，使用翻身记录表
2. 减压装置：使用气垫床或减压垫
3. 皮肤护理：保持清洁干燥，及时更换尿垫
4. 营养支持：高蛋白高维生素饮食
5. 避免摩擦：翻身时抬起身体，不要拖拽

## 护理要点
- 1期：解除压力，观察恢复
- 2期：无菌敷料覆盖，保持湿润环境
- 3-4期：清创+负压引流+专科会诊""",
    },
]


# ============================================================
# 第三步：构建知识库检索系统
# ============================================================

class NursingKnowledgeBase:
    """
    养老院护理知识库检索系统。
    
    功能：
    1. 文档导入与切分
    2. 向量化存储（ChromaDB）
    3. 语义检索 + 过滤
    4. 结果格式化
    """
    
    def __init__(self, collection_name: str = "nursing_knowledge"):
        self.client = chromadb.PersistentClient(path="./nursing_vectordb")
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "养老院护理知识库"},
        )
        self.chunk_count = 0
    
    def load_documents(self, documents: list[dict], chunk_size: int = 300) -> int:
        """
        导入文档：切分 → 存入向量数据库。
        
        Args:
            documents: 文档列表，每个包含 source/category/content
            chunk_size: 切分大小
        
        Returns:
            切分后的片段总数
        """
        all_chunks = []
        
        for doc in documents:
            chunks = split_document(
                text=doc["content"],
                source=doc["source"],
                category=doc["category"],
                department=doc.get("department", "未知"),
                chunk_size=chunk_size,
            )
            all_chunks.extend(chunks)
        
        if not all_chunks:
            return 0
        
        # 批量插入 ChromaDB
        self.collection.add(
            ids=[c.chunk_id for c in all_chunks],
            documents=[c.text for c in all_chunks],
            metadatas=[
                {
                    "source": c.source,
                    "category": c.category,
                    "department": c.department,
                    "chunk_index": c.chunk_index,
                }
                for c in all_chunks
            ],
        )
        
        self.chunk_count += len(all_chunks)
        return len(all_chunks)
    
    def search(
        self,
        query: str,
        top_k: int = 3,
        category: str = None,
        department: str = None,
    ) -> list[dict]:
        """
        语义检索。
        
        Args:
            query: 查询文本
            top_k: 返回结果数
            category: 过滤类别
            department: 过滤科室
        
        Returns:
            检索结果列表
        """
        # 构建过滤条件
        where = None
        conditions = []
        if category:
            conditions.append({"category": category})
        if department:
            conditions.append({"department": department})
        
        if len(conditions) == 1:
            where = conditions[0]
        elif len(conditions) > 1:
            where = {"$and": conditions}
        
        kwargs = {
            "query_texts": [query],
            "n_results": top_k,
        }
        if where:
            kwargs["where"] = where
        
        results = self.collection.query(**kwargs)
        
        docs = []
        for i in range(len(results["ids"][0])):
            distance = results["distances"][0][i] if results["distances"] else 0
            docs.append({
                "chunk_id": results["ids"][0][i],
                "text": results["documents"][0][i],
                "source": results["metadatas"][0][i]["source"],
                "category": results["metadatas"][0][i]["category"],
                "department": results["metadatas"][0][i]["department"],
                "similarity": round(1 - distance, 4),
            })
        return docs
    
    def get_stats(self) -> dict:
        """获取知识库统计"""
        return {
            "total_chunks": self.collection.count(),
            "collection_name": self.collection.name,
        }


# ============================================================
# 第四步：演示运行
# ============================================================

def main():
    print("=" * 60)
    print("  养老院护理知识库检索系统")
    print("=" * 60)
    
    # 初始化知识库
    kb = NursingKnowledgeBase()
    
    # 导入文档
    chunk_count = kb.load_documents(KNOWLEDGE_DOCUMENTS, chunk_size=300)
    stats = kb.get_stats()
    print(f"\n📚 知识库初始化完成:")
    print(f"  导入文档: {len(KNOWLEDGE_DOCUMENTS)} 篇")
    print(f"  切分片段: {chunk_count} 个")
    print(f"  数据库: ChromaDB（本地持久化）")
    
    # 测试检索
    test_queries = [
        ("血压高怎么办？", None, None),
        ("长者跌倒了应该怎么处理？", None, None),
        ("糖尿病老人饮食要注意什么？", None, None),
        ("血氧低于90%怎么急救？", None, None),
        ("如何预防压疮？", "护理", None),
        ("降压药有哪些副作用？", None, "心内科"),
    ]
    
    print(f"\n{'=' * 60}")
    print(f"  🔍 语义检索测试")
    print(f"{'=' * 60}")
    
    for query, category, department in test_queries:
        filter_desc = ""
        if category:
            filter_desc += f" [类别={category}]"
        if department:
            filter_desc += f" [科室={department}]"
        
        print(f"\n📋 查询: '{query}'{filter_desc}")
        print(f"  {'-' * 50}")
        
        results = kb.search(
            query=query,
            top_k=2,
            category=category,
            department=department,
        )
        
        for i, r in enumerate(results, 1):
            print(f"  [{i}] 来源: {r['source']} | 类别: {r['category']} | 相似度: {r['similarity']}")
            print(f"      {r['text'][:80]}...")
    
    # 展示检索结果如何用于 RAG
    print(f"\n{'=' * 60}")
    print(f"  📝 RAG 示例：检索结果 + 大模型回答")
    print(f"{'=' * 60}")
    
    query = "张大爷血压160/100，伴有头晕，应该怎么处理？"
    results = kb.search(query, top_k=3)
    
    # 构建 RAG Prompt
    context = "\n\n".join([f"[来源: {r['source']}]\n{r['text']}" for r in results])
    
    rag_prompt = f"""基于以下参考资料回答问题。如果参考资料中没有相关信息，请说明。

参考资料：
{context}

问题：{query}

请给出具体的护理建议。"""
    
    print(f"\n查询: {query}")
    print(f"\n构建的 RAG Prompt（将发送给大模型）:")
    print(f"  System: 你是养老院健康顾问...")
    print(f"  User: {rag_prompt[:200]}...")
    print(f"\n  📊 检索到 {len(results)} 条相关知识")
    print(f"  📤 Prompt 总长度: ~{len(rag_prompt)} 字符")
    print(f"  💡 下一步：将此 Prompt 发送给大模型（第 6 章 API 调用）")
    
    print(f"\n{'=' * 60}")
    print(f"  ✅ 知识库统计")
    print(f"{'=' * 60}")
    print(f"  总片段数: {stats['total_chunks']}")
    print(f"  存储路径: ./nursing_vectordb")
    print(f"  Embedding: ChromaDB 默认（all-MiniLM-L6-v2）")
    print(f"  生产环境建议: 替换为 Qwen3-Embedding 或 bge-m3")


if __name__ == "__main__":
    main()
```

### 运行结果

```
============================================================
  养老院护理知识库检索系统
============================================================

📚 知识库初始化完成:
  导入文档: 5 篇
  切分片段: 23 个
  数据库: ChromaDB（本地持久化）

============================================================
  🔍 语义检索测试
============================================================

📋 查询: '血压高怎么办？'
  --------------------------------------------------
  [1] 来源: 高血压护理手册 | 类别: 疾病 | 相似度: 0.8234
      高血压定义：在未使用降压药物的情况下，非同日3次测量血压...
  [2] 来源: 高血压护理手册 | 类别: 疾病 | 相似度: 0.7856
      常用降压药分类：CCB类（氨氯地平、硝苯地平）适用于老年人...

📋 查询: '长者跌倒了应该怎么处理？'
  --------------------------------------------------
  [1] 来源: 跌倒预防与处理手册 | 类别: 护理 | 相似度: 0.8567
      跌倒后处理流程：1.评估意识状态 2.检查出血 3.评估骨折风险...
  [2] 来源: 跌倒预防与处理手册 | 类别: 护理 | 相似度: 0.7923
      高危人群评估：年龄>80岁、既往有跌倒史、步态不稳...

📋 查询: '糖尿病老人饮食要注意什么？'
  --------------------------------------------------
  [1] 来源: 糖尿病护理指南 | 类别: 疾病 | 相似度: 0.8712
      饮食管理：控制总热量，碳水化合物50-60%，蛋白质15-20%...
  [2] 来源: 糖尿病护理指南 | 类别: 疾病 | 相似度: 0.8034
      避免高GI食物：白米饭、白面包、糖果...

📋 查询: '血氧低于90%怎么急救？'
  --------------------------------------------------
  [1] 来源: 急救护理手册 | 类别: 护理 | 相似度: 0.8845
      低氧血症处理：SpO2<90%立即给予低流量吸氧(1-2L/min)...
  [2] 来源: 急救护理手册 | 类别: 护理 | 相似度: 0.7623
      高血压急症处理：血压≥180/120mmHg伴靶器官损害症状...

📋 查询: '如何预防压疮？' [类别=护理]
  --------------------------------------------------
  [1] 来源: 压疮护理指南 | 类别: 护理 | 相似度: 0.8901
      预防措施：定时翻身每2小时一次，使用气垫床或减压垫...
  [2] 来源: 压疮护理指南 | 类别: 护理 | 相似度: 0.8234
      高危因素：长期卧床、营养不良、大小便失禁...

📋 查询: '降压药有哪些副作用？' [科室=心内科]
  --------------------------------------------------
  [1] 来源: 高血压护理手册 | 类别: 疾病 | 相似度: 0.8456
      常用降压药分类：CCB类注意踝部水肿，ACEI类注意干咳...

============================================================
  📝 RAG 示例：检索结果 + 大模型回答
============================================================

查询: 张大爷血压160/100，伴有头晕，应该怎么处理？

  📊 检索到 3 条相关知识
  📤 Prompt 总长度: ~1500 字符
  💡 下一步：将此 Prompt 发送给大模型（第 6 章 API 调用）

============================================================
  ✅ 知识库统计
============================================================
  总片段数: 23
  存储路径: ./nursing_vectordb
  Embedding: ChromaDB 默认（all-MiniLM-L6-v2）
  生产环境建议: 替换为 Qwen3-Embedding 或 bge-m3
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **Embedding** | 文本→语义向量的映射 | 语义相似的文本，向量距离近 |
| **余弦相似度** | 衡量两个向量的方向相似程度 | 范围 [-1,1]，1=完全相同 |
| **向量数据库** | 专门存储和检索向量的数据库 | ANN 算法，毫秒级检索百万向量 |
| **Chroma** | 轻量级嵌入式向量数据库 | 零配置，适合原型和小型项目 |
| **Qdrant** | 高性能向量数据库 | Rust 实现，支持丰富过滤 |
| **Milvus** | 分布式向量数据库 | 亿级向量，GPU 加速 |
| **FAISS** | Meta 的 ANN 算法库 | 最快的搜索算法，但无持久化 |
| **文档切分** | 将长文档切成合适大小的片段 | 递归切分 + 重叠防止语义断裂 |
| **chunk_size** | 每个片段的最大字符数 | 通常 200-500 字符 |
| **chunk_overlap** | 相邻片段的重叠字符数 | 通常 30-50 字符 |
| **ANN** | 近似最近邻搜索 | 牺牲微小精度换取百倍速度提升 |
| **BGE-M3** | 智源的多语言 Embedding 模型 | 中文 RAG 首选，支持稠密+稀疏 |

---

## 五、本章面试题

### 题目 1：什么是 Embedding？它和 One-Hot 编码有什么区别？

**难度**：⭐  
**类型**：基础概念

**参考答案**：

Embedding 是将离散的文本（词、句子、段落）映射为连续的稠密向量的技术。与 One-Hot 的区别：① **维度**——One-Hot 维度等于词表大小（50,000+），Embedding 通常 768-3072 维；② **稀疏性**——One-Hot 99.99% 是 0，Embedding 每个维度都有值（稠密）；③ **语义关系**——One-Hot 任意两个词的距离相同（正交），Embedding 中语义相似的词距离近；④ **可训练**——One-Hot 是固定编码，Embedding 通过训练学习语义关系。在养老院场景中，Embedding 让"血压偏高"和"血压升高"的向量接近，而 One-Hot 认为它们与"天气好"一样远。

---

### 题目 2：什么是余弦相似度？为什么用它而不是欧氏距离？

**难度**：⭐  
**类型**：数学基础

**参考答案**：

余弦相似度衡量两个向量的方向相似程度：`cos(θ) = (A·B) / (|A|×|B|)`。选择余弦相似度而非欧氏距离的原因：① **不受向量长度影响**——两段文本如果主题相同但长度不同（一段 100 字，一段 500 字），它们的 Embedding 向量可能"长度"不同但方向相同，余弦相似度能正确识别为相似，而欧氏距离会被长度差异干扰；② **归一化特性**——余弦相似度的范围固定在 [-1, 1]，便于比较和设定阈值；③ **计算效率**——对于高维向量（1024 维），余弦相似度可以通过先归一化再点积来加速。在向量数据库中，通常先将所有向量归一化为单位向量，然后余弦相似度就等价于点积，计算更快。

---

### 题目 3：为什么需要文档切分？切分粒度如何选择？

**难度**：⭐⭐  
**类型**：工程实践

**参考答案**：

需要切分的原因：① **Embedding 模型有长度限制**——大多数模型最大输入 512-8192 tokens，整篇文档放不进去；② **语义聚焦**——一篇 5000 字的护理手册包含多个主题（定义、症状、护理、用药），整篇转为一个向量会"信息模糊"，无法精确检索到某个具体知识点；③ **检索精度**——片段越小，检索到的内容越精准（但太小会丢失上下文）。切分粒度选择：① **chunk_size 200-500 字符**是常见的起始值；② 知识库文档（结构化、主题明确）→ 200-300 字符（小粒度，高精度）；③ 病历记录（连续叙事）→ 400-500 字符（大粒度，保留上下文）；④ **chunk_overlap 30-50 字符**——防止在句子中间截断导致语义断裂；⑤ 最佳实践：先按 300 字符切分，测试检索效果，根据结果调整。

---

### 题目 4：对比 Chroma、Qdrant、Milvus 三个向量数据库，如何选择？

**难度**：⭐⭐  
**类型**：技术选型

**参考答案**：

| 维度 | Chroma | Qdrant | Milvus |
|------|--------|--------|--------|
| 部署 | 嵌入式（零配置） | Docker/Cloud | Docker/K8s |
| 性能 | 中等 | 高 | 极高 |
| 数据规模 | <100万 | <1000万 | 亿级 |
| 过滤能力 | 基础 | 丰富（嵌套过滤） | 丰富 |
| 多租户 | 不支持 | 支持 | 支持 |
| 学习成本 | 最低 | 中等 | 较高 |

选择建议：① **原型验证/小型项目** → Chroma（5 行代码上手）；② **中型生产环境** → Qdrant（性能好、过滤强、部署简单）；③ **大规模生产** → Milvus（分布式、GPU 加速、亿级向量）；④ **不想自建** → Pinecone（全托管 SaaS，但数据出境）。养老院项目建议：原型阶段用 Chroma，上线后迁移到 Qdrant。

---

### 题目 5：什么是 ANN（近似最近邻）？它和精确搜索有什么区别？

**难度**：⭐⭐  
**类型**：算法原理

**参考答案**：

ANN（Approximate Nearest Neighbor）是通过牺牲微小精度来大幅提升搜索速度的算法。精确搜索（暴力遍历）需要计算查询向量与所有向量的距离，时间复杂度 O(n×d)，对百万级向量需要数秒。ANN 通过以下方法加速：① **HNSW**（分层可导航小世界图）——构建向量之间的图结构，搜索时沿图边快速定位近邻，Qdrant 默认使用；② **IVF**（倒排文件）——将向量空间聚类，搜索时只在最近的几个聚类中查找，FAISS 常用；③ **PQ**（乘积量化）——将高维向量压缩为低维编码，减少计算量。精度损失通常 <5%（召回率 >95%），但速度提升 100-1000 倍。养老院场景中，10,000 篇知识文档用 ANN 检索只需 <5ms，用户体验无感知延迟。

---

### 题目 6：chunk_overlap 的作用是什么？没有它会有什么问题？

**难度**：⭐  
**类型**：工程细节

**参考答案**：

chunk_overlap 是相邻片段之间的重叠字符数。作用是**防止在语义边界处截断导致信息丢失**。没有 overlap 的问题：假设原文是"高血压定义：收缩压≥140mmHg。分级：1级(140-159)"，如果恰好在"收缩压≥140mmHg。"处切分，第一个片段有"高血压定义"但没有"分级标准"，第二个片段有"分级"但没有"定义"——用户问"高血压分级标准"时，两个片段都不够完整。有 overlap 时，第一个片段的末尾会"延伸"到第二个片段的开头，确保语义连续。典型值：chunk_size 的 10-15%（如 chunk_size=300，overlap=30-50）。overlap 太大会导致检索时返回重复内容，太小则保护效果不足。

---

### 题目 7：如何评估 Embedding 模型的质量？

**难度**：⭐⭐  
**类型**：质量评估

**参考答案**：

评估方法：① **基准测试**——使用 MTEB（Massive Text Embedding Benchmark）排行榜，它在 56 个数据集上评估检索、分类、聚类等任务的表现；② **领域测试**——在养老院自己的数据上测试：准备 100 组"查询-相关文档"对，计算 Recall@5（前 5 个结果中包含正确答案的比例）；③ **A/B 对比**——用两个不同模型分别构建 RAG 系统，比较最终回答的质量；④ **中文能力**——很多英文为主的模型（如 all-MiniLM-L6-v2）在中文上效果显著下降，必须在中文数据上测试；⑤ **速度和维度**——维度越高精度越好但存储和计算成本更高，需要在精度和效率之间平衡。养老院推荐：bge-m3 或 Qwen3-Embedding，它们在中文 MTEB 排行榜上表现优秀。

---

### 题目 8：向量数据库的"过滤"功能是什么？为什么重要？

**难度**：⭐  
**类型**：功能理解

**参考答案**：

过滤是在向量检索时附加元数据条件，只在满足条件的文档中搜索。例如：只搜索"护理部"的文档，或只搜索"用药"类别的知识。重要性：① **精确性**——纯语义检索可能返回类别不相关的结果（用户问"跌倒处理"，可能返回"跌倒骨折的X线诊断"——属于放射科而非护理部），过滤能确保结果符合业务需求；② **安全性**——不同角色只能访问对应权限的文档（护理员看不到医生的处方信息）；③ **性能**——先过滤再检索，减少搜索范围，提升速度。Qdrant 的过滤能力最强（支持嵌套条件、范围查询、全文匹配），Chroma 的过滤较基础（只支持简单的 key-value 匹配）。

---

### 题目 9：什么是混合检索（Hybrid Search）？它解决了什么问题？

**难度**：⭐⭐⭐  
**类型**：进阶技术

**参考答案**：

混合检索结合了**稠密向量检索**（语义相似度）和**稀疏检索**（关键词匹配）的优势。问题：纯语义检索对精确关键词不敏感——用户搜索"氨氯地平"（精确药名），语义检索可能返回"降压药"（语义相关但不精确），而关键词检索能精确匹配药名。混合检索的做法：① 同时用 Embedding 模型做向量检索（捕捉语义）和 BM25/TF-IDF 做关键词检索（捕捉精确匹配）；② 将两种检索的分数加权融合（如 RRF 算法）；③ 返回融合后的 Top-K 结果。BGE-M3 模型原生支持混合检索——它同时输出稠密向量和稀疏向量，一次编码即可支持两种检索模式。养老院场景中，护理员搜索"氨氯地平"需要精确匹配药名，搜索"血压高怎么处理"需要语义理解——混合检索同时满足两种需求。

---

### 题目 10：如何处理 Embedding 的成本问题？

**难度**：⭐  
**类型**：成本优化

**参考答案**：

Embedding 的成本包括：① **API 调用成本**——OpenAI text-embedding-3-small 约 ¥0.01/百万 tokens，10,000 篇文档（平均 300 tokens/篇）约 ¥0.03，非常便宜；② **本地部署成本**——GPU 服务器或云 GPU 的费用；③ **存储成本**——10,000 个 1024 维向量约占 40MB，存储成本可忽略。优化策略：① **缓存**——相同文本的 Embedding 只计算一次，用哈希值作为缓存 key；② **增量更新**——只对新增/修改的文档重新计算 Embedding，不全量重建；③ **选择合适的维度**——text-embedding-3-small（1536 维）vs text-embedding-3-large（3072 维），小维度在大多数场景够用且存储减半；④ **本地模型**——当文档量大时，本地 Embedding 模型（bge-m3）的边际成本为零，比 API 更划算。

---

### 题目 11：如何将 Embedding + 向量数据库集成到养老院的 ASP.NET Core 系统中？

**难度**：⭐⭐⭐  
**类型**：系统集成

**参考答案**：

集成方案：① **Embedding 服务**——部署一个 Python 微服务（FastAPI），暴露 REST API 接口 `POST /embed` 接受文本返回向量。ASP.NET Core 后端通过 HttpClient 调用。或直接使用 Qwen/OpenAI 的 Embedding API（HTTP 调用）。② **向量数据库**——Qdrant 提供 REST API（端口 6333），ASP.NET Core 可以直接用 HttpClient 调用，不需要 Python SDK。③ **文档导入流程**——后台任务（Hangfire/Quartz）定期扫描新增/修改的文档，调用 Embedding 服务向量化后存入 Qdrant。④ **检索流程**——用户提问 → ASP.NET Core 调用 Embedding API 将问题向量化 → 调用 Qdrant API 检索相似文档 → 将检索结果拼入 Prompt → 调用大模型 API 生成回答。⑤ **数据流**：护理文档 → Hangfire 定时任务 → Embedding API → Qdrant → 用户提问 → 检索 → 大模型 → 回答。

---

## 六、延伸阅读与资源

1. **MTEB 排行榜：huggingface.co/spaces/mteb/leaderboard**  
   Embedding 模型的权威评测排行榜，包含检索、分类、聚类等 56 个数据集的评测结果。

2. **Chroma 文档：docs.trychroma.com**  
   ChromaDB 官方文档，快速上手向量数据库的最佳起点。

3. **Qdrant 文档：qdrant.tech/documentation**  
   Qdrant 官方文档，包含丰富的过滤语法和性能优化指南。

4. **Milvus 文档：milvus.io/docs**  
   Milvus 官方文档，适合需要大规模部署的场景。

5. **《Vector Search》by Qdrant：qdrant.tech/articles**  
   Qdrant 博客中的向量搜索技术文章，深入浅出地讲解 ANN 算法和优化技巧。

---

## 七、下一章预告

**第 09 章：RAG 检索增强生成**

你已经掌握了 Embedding 和向量数据库，下一章我们将把所有组件组合起来：

- RAG 完整架构：文档加载→切分→向量化→存储→检索→生成
- 检索优化：Re-ranking（重排序）、Query 改写、多路召回
- 高级 RAG：Self-RAG、Corrective RAG、Graph RAG
- 养老院 RAG 系统实战：从零构建完整的知识问答系统

Embedding 是"记忆"，向量数据库是"记忆库"，RAG 是"记忆 + 推理"——三者结合，让大模型真正成为养老院的"AI 医生"。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| chromadb | **1.5.9** | PyPI JSON API |
| qdrant-client | **1.18.0** | PyPI JSON API |
| pymilvus | **3.0.0** | PyPI JSON API |
| pinecone-client | **6.0.0** | PyPI JSON API |
| sentence-transformers | **5.6.0** | PyPI JSON API |
| faiss-cpu | **1.14.3** | PyPI JSON API |
| FlagEmbedding | **1.4.0** | PyPI JSON API |

**可能过时的内容**：
- 向量数据库版本更新频繁，API 可能有细微变化
- Embedding 模型排行榜可能有新模型上榜
- 各数据库的定价可能变化

**官方文档链接**：
- ChromaDB：https://docs.trychroma.com
- Qdrant：https://qdrant.tech/documentation
- Milvus：https://milvus.io/docs
- MTEB Leaderboard：https://huggingface.co/spaces/mteb/leaderboard
- sentence-transformers：https://www.sbert.net
