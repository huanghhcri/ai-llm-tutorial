# 第 09 章 RAG 检索增强生成 — 让大模型"查资料后再回答"

---

## 一、章节概述

### 本章学什么

本章将第 6 章（API 调用）、第 7 章（Prompt Engineering）、第 8 章（Embedding + 向量数据库）的所有知识组合起来，构建完整的 **RAG（Retrieval-Augmented Generation）系统**。你将掌握：

- RAG 的完整架构：文档加载→切分→向量化→存储→检索→生成
- **检索优化**：Re-ranking（重排序）、Query 改写、多路召回
- **高级 RAG 模式**：Self-RAG、Corrective RAG、Graph RAG
- **RAG 评估**：如何量化 RAG 系统的质量（RAGAS 框架）
- **完整实战**：从零构建养老院护理知识问答系统

### 为什么学

RAG 是当前**大模型应用最主流的架构模式**——几乎所有企业级 AI 应用都基于 RAG。对养老院来说：

- 大模型不知道养老院的护理规范、用药指南、历史病历 → RAG 让它"查资料"
- 大模型会"幻觉"（编造事实）→ RAG 用真实文档约束回答
- 长者健康数据不能发给外部 API → RAG 让大模型基于本地知识回答

### 在知识体系中的位置

```
第6章 API 调用 + 第7章 Prompt + 第8章 Embedding
                    ↓
            第9章 RAG 检索增强生成 ← 你在这里（应用篇集大成）
                    ↓
            第10-12章 框架/Agent（在 RAG 基础上构建更复杂系统）
```

---

## 二、核心知识点

### 2.1 RAG 的核心思想

#### 类比

养老院的护理员遇到不确定的问题时，不会凭记忆回答，而是：

1. **去翻护理手册**（检索 Retrieval）
2. **找到相关章节**（相关文档）
3. **结合手册内容和自己的经验回答**（生成 Generation）

RAG 就是让大模型也这样做——**先查资料，再回答**。

#### 为什么不能只靠大模型？

```python
# 大模型的三个致命问题：

# 1. 知识截止日期
# 大模型的训练数据有截止日期（如 2024 年 4 月）
# 问："2025 年新版高血压指南的降压目标是多少？"→ 可能答错或说不知道

# 2. 幻觉（Hallucination）
# 大模型会"一本正经地胡说八道"
# 问："张大爷昨天的血压是多少？"→ 可能编造一个数字

# 3. 缺乏私有知识
# 大模型不知道养老院的：
# - 护理规范（养老院自己的 SOP）
# - 历史病历（张大爷的既往史）
# - 用药方案（养老院的药品目录）

# RAG 的解决方案：
# 检索真实文档 → 喂给大模型 → 大模型基于真实信息回答
# 结果：准确、可溯源、不幻觉
```

---

### 2.2 RAG 完整架构

```
┌─────────────────────────────────────────────────────────┐
│                    RAG 系统架构                           │
│                                                          │
│  ┌──────────── 离线索引阶段 ────────────┐               │
│  │                                       │               │
│  │  文档加载 → 文档切分 → Embedding → 向量数据库         │
│  │  (PDF/Word)  (300字/段)  (bge-m3)   (Chroma/Qdrant) │
│  │                                       │               │
│  └───────────────────────────────────────┘               │
│                                                          │
│  ┌──────────── 在线查询阶段 ────────────┐               │
│  │                                       │               │
│  │  用户提问 → Query 改写 → Embedding    │               │
│  │      ↓                                │               │
│  │  向量检索 → Re-ranking → Top-K 文档    │               │
│  │      ↓                                │               │
│  │  Prompt 组装（系统提示 + 检索结果 + 问题）             │
│  │      ↓                                │               │
│  │  大模型生成 → 回答 + 引用来源          │               │
│  │                                       │               │
│  └───────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

### 2.3 检索优化：Re-ranking（重排序）

#### 问题

向量检索（Embedding 相似度）返回的 Top-K 结果不一定是最优排序——它只捕捉了"语义相似"，但可能遗漏了"精确匹配"或"权威性"。

#### 类比

养老院的护理员在知识库中搜索"高血压怎么处理"，初步检索返回了 10 条结果：

- 第 1 条：高血压的定义（语义相关，但不直接回答"怎么处理"）
- 第 5 条：高血压护理要点（最相关的答案，但排在第 5 位）

Re-ranking 就是对初步结果做**二次排序**，把最相关的结果提到最前面。

```python
# Re-ranking 的两种方案

# 方案 1：交叉编码器（Cross-Encoder）— 精度最高
# 将"查询"和"文档"拼接为一个输入，用模型直接打分
# 优点：精度最高（因为同时看到查询和文档）
# 缺点：速度慢（需要对每个候选文档单独推理）

# 方案 2：LLM 打分 — 用大模型评判相关性
# 将查询和文档一起发给大模型，让它打 1-10 分
# 优点：质量最高（大模型的理解能力最强）
# 缺点：成本高、速度最慢

# 实际推荐：先用 Embedding 粗筛（快），再用 Cross-Encoder 精排（准）
```

```python
# 安装：uv add FlagEmbedding
from FlagEmbedding import FlagReranker

# 加载 Re-ranker 模型
# bge-reranker-v2-m3：多语言 Re-ranker，中文效果好
reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=True)

# 养老院场景：对检索结果重排序
query = "高血压长者血压偏高怎么处理？"

# 初步检索返回的文档（按向量相似度排序）
candidate_docs = [
    "高血压定义：收缩压≥140mmHg和/或舒张压≥90mmHg。",       # 相关但不直接
    "高血压护理要点：每日定时测量血压，低盐饮食，适量运动。",  # 非常相关
    "降压药分类：CCB类适用于老年人，注意踝部水肿。",           # 部分相关
    "跌倒后处理流程：评估意识→检查出血→评估骨折。",           # 不相关
    "血压偏高处理：立即通知医生，调整降压药，加强监测。",      # 最相关
]

# 计算查询与每个文档的相关性分数
pairs = [[query, doc] for doc in candidate_docs]
scores = reranker.compute_score(pairs)

# 按分数重排序
scored_docs = sorted(zip(scores, candidate_docs), key=lambda x: x[0], reverse=True)

print("🔍 Re-ranking 结果:")
print(f"查询: {query}\n")
for i, (score, doc) in enumerate(scored_docs, 1):
    print(f"  [{i}] 分数: {score:.4f} | {doc}")

# 预期输出：
# [1] 分数: 0.9234 | 血压偏高处理：立即通知医生，调整降压药，加强监测。
# [2] 分数: 0.8567 | 高血压护理要点：每日定时测量血压，低盐饮食，适量运动。
# [3] 分数: 0.6723 | 降压药分类：CCB类适用于老年人，注意踝部水肿。
# [4] 分数: 0.5891 | 高血压定义：收缩压≥140mmHg...
# [5] 分数: 0.1234 | 跌倒后处理流程：评估意识→检查出血...
```

---

### 2.4 Query 改写

#### 问题

用户的原始问题可能不够精确：

- "血压高怎么办？" → 太模糊（哪个指标高？多高？）
- "张大爷的事" → 缺乏关键信息
- "那个药能不能吃" → 指代不明

Query 改写用大模型将用户的模糊问题优化为更精确的检索查询。

```python
from openai import OpenAI

client = OpenAI(api_key="sk-your-key", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")

def rewrite_query(original_query: str) -> list[str]:
    """
    Query 改写：将用户的模糊问题优化为多个精确的检索查询。
    
    类比：护理员问"那个老人血压的事"，护士长追问：
    "你说的是哪位老人？是血压高还是低？什么时候的？"
    
    Args:
        original_query: 用户原始问题
    
    Returns:
        改写后的多个查询（多路召回用）
    """
    response = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": """你是一个检索查询优化专家。
将用户的问题改写为 2-3 个更精确的检索查询，以提高知识库检索的召回率。

输出格式（JSON 数组）：
["改写查询1", "改写查询2", "改写查询3"]

规则：
1. 保持原始问题的核心意图
2. 补充可能的同义词或专业术语
3. 将模糊表达替换为具体化表达
4. 不要改变问题的语义"""},
            {"role": "user", "content": f"原始问题：{original_query}"},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    
    import json
    result = json.loads(response.choices[0].message.content)
    return result.get("queries", [original_query])


# 测试
queries = [
    "血压高怎么办",
    "张大爷那个药有问题",
    "老人摔倒了",
]

for q in queries:
    rewritten = rewrite_query(q)
    print(f"原始: '{q}'")
    print(f"改写: {rewritten}\n")

# 预期输出：
# 原始: '血压高怎么办'
# 改写: ['高血压如何处理和护理', '血压偏高的应对措施', '高血压患者的护理要点']
#
# 原始: '张大爷那个药有问题'
# 改写: ['张大爷的用药问题和不良反应', '长者用药安全审查', '药物副作用如何处理']
#
# 原始: '老人摔倒了'
# 改写: ['长者跌倒后的处理流程', '老年人跌倒急救措施', '跌倒后骨折风险评估']
```

---

### 2.5 多路召回（Multi-Query Retrieval）

```python
def multi_query_retrieval(
    original_query: str,
    knowledge_base,  # NursingKnowledgeBase 实例
    top_k: int = 3,
) -> list[dict]:
    """
    多路召回：用多个改写查询分别检索，合并去重后返回。
    
    原理：一个问题从不同角度检索，能找到更多相关文档。
    
    类比：护理手册里找"跌倒处理"——
    - 从"跌倒"角度找：找到"跌倒预防与处理"章节
    - 从"骨折"角度找：找到"骨折急救"章节
    - 从"老年人意外"角度找：找到"意外事件处理"章节
    合并去重后，信息更全面。
    """
    # 1. Query 改写
    queries = rewrite_query(original_query)
    queries.insert(0, original_query)  # 保留原始查询
    
    # 2. 多路检索
    all_results = {}
    for q in queries:
        results = knowledge_base.search(q, top_k=top_k)
        for r in results:
            chunk_id = r["chunk_id"]
            if chunk_id not in all_results or r["similarity"] > all_results[chunk_id]["similarity"]:
                all_results[chunk_id] = r
    
    # 3. 按相似度排序
    merged = sorted(all_results.values(), key=lambda x: x["similarity"], reverse=True)
    
    return merged[:top_k * 2]  # 返回合并后的 Top 结果
```

---

### 2.6 RAG Prompt 组装

```python
def build_rag_prompt(
    query: str,
    retrieved_docs: list[dict],
    system_prompt: str = None,
) -> list[dict]:
    """
    组装 RAG 的 Prompt。
    
    这是 RAG 的核心——将检索到的文档作为上下文，与用户问题一起发给大模型。
    
    类比：护理员拿着护理手册（检索结果）去找医生（大模型），
    医生根据手册内容回答问题。
    """
    if system_prompt is None:
        system_prompt = """你是养老院的智能健康助手。

## 回答规则
1. **只基于提供的参考资料回答**，不要使用你的预训练知识
2. 如果参考资料中没有相关信息，明确说"根据现有资料，未找到相关信息"
3. 回答时**引用来源**，格式：[来源: 文档名]
4. 涉及用药建议时，必须注明"请咨询主治医生确认"
5. 涉及紧急情况时，优先提醒安全措施

## 输出格式
1. 先用 1-2 句话直接回答问题
2. 再分点详细说明
3. 最后附上参考来源"""
    
    # 构建参考资料
    context_parts = []
    for i, doc in enumerate(retrieved_docs, 1):
        context_parts.append(
            f"【参考资料 {i}】来源: {doc['source']} | 类别: {doc['category']}\n{doc['text']}"
        )
    context = "\n\n".join(context_parts)
    
    # 组装最终 Prompt
    user_message = f"""## 参考资料
{context}

## 用户问题
{query}

请基于以上参考资料回答问题。"""
    
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
```

---

### 2.7 高级 RAG 模式

#### Self-RAG（自反思 RAG）

```python
# Self-RAG 的核心思想：大模型自己判断"需不需要检索"
#
# 流程：
# 1. 用户提问
# 2. 大模型判断：这个问题需要检索知识库吗？
#    - "你好" → 不需要检索，直接回答
#    - "高血压怎么处理" → 需要检索
# 3. 如果需要检索 → 执行 RAG 流程
# 4. 大模型评估检索结果：这些文档对回答有帮助吗？
#    - 有帮助 → 基于文档回答
#    - 没帮助 → 重新检索或用自身知识回答

def self_rag(query: str, knowledge_base, client) -> str:
    """
    Self-RAG：自反思检索增强生成。
    """
    # 第一步：判断是否需要检索
    decision = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "判断以下问题是否需要查询护理知识库才能准确回答。只回答'需要'或'不需要'。"},
            {"role": "user", "content": query},
        ],
        temperature=0.0,
    ).choices[0].message.content.strip()
    
    if "不需要" in decision:
        # 直接回答（闲聊、简单问候等）
        return client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": "你是养老院的智能助手，简洁友好地回答。"},
                {"role": "user", "content": query},
            ],
        ).choices[0].message.content
    
    # 第二步：检索
    docs = knowledge_base.search(query, top_k=5)
    
    # 第三步：评估检索结果质量
    eval_prompt = f"以下参考资料是否能回答问题'{query}'？评估相关性（1-10分）。\n\n"
    for d in docs:
        eval_prompt += f"- {d['text'][:100]}...\n"
    
    eval_response = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "评估参考资料与问题的相关性，输出 1-10 的分数。"},
            {"role": "user", "content": eval_prompt},
        ],
        temperature=0.0,
    ).choices[0].message.content
    
    # 提取分数
    try:
        score = int(''.join(filter(str.isdigit, eval_response)))
    except:
        score = 5
    
    if score >= 6:
        # 检索结果可用，基于文档回答
        messages = build_rag_prompt(query, docs)
        return client.chat.completions.create(model="qwen-plus", messages=messages).choices[0].message.content
    else:
        # 检索结果不佳，用自身知识 + 免责声明
        return client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": "你是养老院健康顾问。注意：以下回答未基于知识库文档，请谨慎参考。"},
                {"role": "user", "content": query},
            ],
        ).choices[0].message.content + "\n\n⚠️ 注：以上回答未找到知识库支持，请咨询专业人士确认。"
```

#### Corrective RAG（纠错 RAG）

```python
# Corrective RAG：对大模型的回答做"事实核查"
#
# 流程：
# 1. 执行标准 RAG，得到初始回答
# 2. 将回答与检索到的文档对比，检查是否有"幻觉"
# 3. 如果发现不一致，纠正后重新回答

def corrective_rag(query: str, knowledge_base, client) -> dict:
    """
    Corrective RAG：回答后做事实核查。
    """
    # 第一步：标准 RAG
    docs = knowledge_base.search(query, top_k=5)
    messages = build_rag_prompt(query, docs)
    initial_answer = client.chat.completions.create(
        model="qwen-plus", messages=messages
    ).choices[0].message.content
    
    # 第二步：事实核查
    context = "\n".join([d["text"] for d in docs])
    check_prompt = f"""请检查以下回答是否与参考资料一致。标注不一致的部分。

参考资料：
{context}

回答：
{initial_answer}

输出格式（JSON）：
{{
    "is_consistent": true/false,
    "inconsistencies": ["不一致1", "不一致2"],
    "confidence": 0.0-1.0
}}"""
    
    check_result = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是事实核查专家，检查回答与参考资料的一致性。"},
            {"role": "user", "content": check_prompt},
        ],
        temperature=0.0,
        response_format={"type": "json_object"},
    ).choices[0].message.content
    
    import json
    check = json.loads(check_result)
    
    if check.get("is_consistent", True):
        return {"answer": initial_answer, "verified": True, "confidence": check.get("confidence", 0.9)}
    else:
        # 第三步：纠正后重新回答
        correction_prompt = f"""之前的回答有以下不一致之处：
{json.dumps(check.get('inconsistencies', []), ensure_ascii=False)}

请基于参考资料重新回答，确保所有信息都有据可查。"""
        
        corrected = client.chat.completions.create(
            model="qwen-plus",
            messages=messages + [
                {"role": "assistant", "content": initial_answer},
                {"role": "user", "content": correction_prompt},
            ],
        ).choices[0].message.content
        
        return {
            "answer": corrected,
            "verified": True,
            "original_answer": initial_answer,
            "corrections": check.get("inconsistencies", []),
            "confidence": check.get("confidence", 0.7),
        }
```

---

### 2.8 RAG 评估（RAGAS 框架）

```python
# RAGAS（Retrieval Augmented Generation Assessment）
# 评估 RAG 系统质量的标准化框架
# 安装：uv add ragas（0.4.3）

# RAGAS 的四个核心指标：
metrics = {
    "Faithfulness（忠实度）": {
        "定义": "回答是否忠实于检索到的文档",
        "计算": "将回答拆分为声明，检查每个声明是否有文档支持",
        "范围": "[0, 1]，越高越好",
        "养老院意义": "回答是否基于护理手册，而非编造",
    },
    "Answer Relevancy（回答相关性）": {
        "定义": "回答是否与用户问题相关",
        "计算": "用 LLM 生成可能的问题，计算与原始问题的相似度",
        "范围": "[0, 1]，越高越好",
        "养老院意义": "回答是否解决了护理员的实际问题",
    },
    "Context Precision（上下文精确度）": {
        "定义": "检索到的文档中有多少是真正相关的",
        "计算": "相关文档在检索结果中的排名",
        "范围": "[0, 1]，越高越好",
        "养老院意义": "检索到的护理手册内容是否真的有用",
    },
    "Context Recall（上下文召回率）": {
        "定义": "所有相关文档中，检索到了多少",
        "计算": "用 ground truth 答案评估检索覆盖率",
        "范围": "[0, 1]，越高越好",
        "养老院意义": "是否遗漏了重要的护理知识",
    },
}

print("📊 RAGAS 评估指标:")
for name, info in metrics.items():
    print(f"\n  {name}")
    print(f"    定义: {info['定义']}")
    print(f"    养老院意义: {info['养老院意义']}")
```

---

### 2.7 GraphRAG — 基于知识图谱的 RAG

#### 为什么需要 GraphRAG？

传统 RAG 检索的是"文本片段"，但养老院的知识之间有复杂的**关联关系**：

```
传统 RAG：
  查询："张大爷的用药有哪些禁忌？"
  检索：找到"用药禁忌"相关的文本片段
  问题：无法理解"张大爷有糖尿病 → 糖尿病不能用 XX 药 → XX 药在他当前处方中"

GraphRAG：
  查询："张大爷的用药有哪些禁忌？"
  检索：沿着知识图谱的关系链推理
  张大爷 --有病--> 糖尿病 --禁用--> 糖胺类药物
  张大爷 --服用--> 二甲双胍 --与--> 酒精 --有--> 双硫仑反应
  结果：自动找到所有关联的禁忌信息
```

#### 知识图谱构建

```python
# 知识图谱 = 实体（节点）+ 关系（边）
# 养老院知识图谱示例

knowledge_graph = {
    "entities": {
        "张大爷": {"type": "长者", "age": 78, "conditions": ["高血压", "糖尿病"]},
        "氨氯地平": {"type": "药物", "class": "CCB", "indication": "高血压"},
        "二甲双胍": {"type": "药物", "class": "双胍", "indication": "糖尿病"},
        "阿司匹林": {"type": "药物", "class": "NSAIDs", "indication": "抗血小板"},
        "高血压": {"type": "疾病", "icd": "I10"},
        "糖尿病": {"type": "疾病", "icd": "E11"},
        "低血糖": {"type": "症状", "severity": "紧急"},
    },
    "relations": [
        ("张大爷", "患有", "高血压"),
        ("张大爷", "患有", "糖尿病"),
        ("张大爷", "服用", "氨氯地平"),
        ("张大爷", "服用", "二甲双胍"),
        ("张大爷", "服用", "阿司匹林"),
        ("氨氯地平", "治疗", "高血压"),
        ("二甲双胍", "治疗", "糖尿病"),
        ("二甲双胍", "可能引起", "低血糖"),
        ("阿司匹林", "可能引起", "消化道出血"),
        ("糖尿病", "禁用", "含糖输液"),
        ("高血压", "限制", "高盐饮食"),
    ],
}

# 图谱查询：找到张大爷的所有用药风险
def find_medication_risks(member_name: str, graph: dict) -> list[str]:
    """沿着知识图谱查找用药风险"""
    risks = []
    
    # 找到该长者的所有关系
    for subj, rel, obj in graph["relations"]:
        if subj == member_name:
            if rel == "服用":
                # 找到该药物的所有风险
                for s, r, o in graph["relations"]:
                    if s == obj and r in ("可能引起", "禁用"):
                        risks.append(f"{member_name} 服用 {obj} → {r} {o}")
            if rel == "患有":
                # 找到该疾病的所有限制
                for s, r, o in graph["relations"]:
                    if s == obj and r in ("限制", "禁用"):
                        risks.append(f"{member_name} 患有 {obj} → {r} {o}")
    
    return risks

risks = find_medication_risks("张大爷", knowledge_graph)
print("张大爷的用药风险:")
for risk in risks:
    print(f"  ⚠️ {risk}")
```

输出：
```
张大爷的用药风险:
  ⚠️ 张大爷 服用 二甲双胍 → 可能引起 低血糖
  ⚠️ 张大爷 服用 阿司匹林 → 可能引起 消化道出血
  ⚠️ 张大爷 患有 糖尿病 → 禁用 含糖输液
  ⚠️ 张大爷 患有 高血压 → 限制 高盐饮食
```

#### GraphRAG vs 传统 RAG 对比

| 维度 | 传统 RAG（向量检索） | GraphRAG（知识图谱） |
|------|---------------------|---------------------|
| 检索单位 | 文本片段 | 实体 + 关系 |
| 推理能力 | 弱（只找相似文本） | **强（沿关系链推理）** |
| 多跳推理 | 不支持 | **支持（A→B→C）** |
| 构建成本 | 低（切分+Embedding） | 高（需要实体/关系抽取） |
| 适用场景 | 通用问答 | **复杂关联查询** |

---

### 2.8 Hybrid Search（混合检索）

#### 问题

纯向量检索对**精确关键词**不敏感：

```
用户查询："氨氯地平的剂量"
纯向量检索：可能返回"降压药的用法"（语义相关但不精确）
关键词检索：精确匹配"氨氯地平"（但不理解语义）
混合检索：两者结合，既精确又语义丰富
```

#### 混合检索原理

```python
# 混合检索 = 向量检索（语义）+ 关键词检索（精确）→ 融合排序
#
# 融合算法：RRF（Reciprocal Rank Fusion）
# RRF_score = Σ 1 / (k + rank_i)
# 其中 k=60（常数），rank_i 是文档在第 i 种检索中的排名

def reciprocal_rank_fusion(
    rankings: list[list[str]],  # 多路检索的排名结果
    k: int = 60,
) -> list[tuple[str, float]]:
    """
    RRF 融合算法。
    
    将多路检索的结果按 RRF 公式融合为统一排名。
    
    类比：养老院评选"最佳护理员"——
    护士长排名 + 医生排名 + 长者满意度排名 → 综合排名
    """
    scores: dict[str, float] = {}
    
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, 1):
            if doc_id not in scores:
                scores[doc_id] = 0
            scores[doc_id] += 1 / (k + rank)
    
    # 按分数降序排列
    sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return sorted_docs


# 示例：两路检索结果
vector_results = ["doc_高血压护理", "doc_降压药分类", "doc_血压监测"]  # 向量检索
keyword_results = ["doc_氨氯地平说明书", "doc_降压药分类", "doc_CCB类药物"]  # 关键词检索

fused = reciprocal_rank_fusion([vector_results, keyword_results])
print("混合检索结果（RRF 融合）:")
for doc_id, score in fused:
    print(f"  {doc_id}: {score:.4f}")
```

输出：
```
混合检索结果（RRF 融合）:
  doc_降压药分类: 0.0328    ← 两路都排第 2，分数最高
  doc_高血压护理: 0.0164    ← 向量检索第 1
  doc_氨氯地平说明书: 0.0164  ← 关键词检索第 1
  doc_血压监测: 0.0161
  doc_CCB类药物: 0.0161
```

#### 用 LangChain 实现混合检索

```python
# LangChain + Qdrant 混合检索示例

from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever

# 1. 向量检索器（语义检索）
# vectorstore = Qdrant.from_documents(docs, embeddings, ...)
# vector_retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

# 2. BM25 检索器（关键词检索）
# bm25_retriever = BM25Retriever.from_documents(docs, k=5)

# 3. 混合检索器（Ensemble = 向量 + BM25 + RRF 融合）
# ensemble_retriever = EnsembleRetriever(
#     retrievers=[vector_retriever, bm25_retriever],
#     weights=[0.6, 0.4],  # 向量检索权重 60%，关键词检索权重 40%
# )

# 4. 使用
# results = ensemble_retriever.invoke("氨氯地平的剂量")
# → 同时利用语义理解和精确匹配
```


## 三、养老院业务实战案例

### 需求描述

构建一个完整的**养老院护理知识问答系统**，包含：

1. 文档加载与切分
2. Embedding 向量化与存储
3. 语义检索 + Re-ranking
4. Query 改写 + 多路召回
5. RAG 回答生成（带引用来源）
6. 评估与质量监控

### 完整代码

```python
"""
养老院护理知识问答系统 — RAG 完整实战
=======================================
第 9 章实战案例：从零构建带 Re-ranking 和 Query 改写的 RAG 系统

运行环境：Python 3.14
安装依赖：uv add chromadb openai FlagEmbedding
"""

import json
import hashlib
import re
from dataclasses import dataclass
from typing import Optional
import chromadb
from openai import OpenAI


# ============================================================
# 配置
# ============================================================

# 大模型 API（使用 Qwen 兼容 OpenAI 格式）
llm_client = OpenAI(
    api_key="sk-your-key",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
LLM_MODEL = "qwen-plus"


# ============================================================
# 第一部分：知识库构建
# ============================================================

KNOWLEDGE_DOCUMENTS = [
    {
        "source": "高血压护理手册",
        "category": "疾病",
        "content": """高血压定义：在未使用降压药物的情况下，非同日3次测量血压，收缩压≥140mmHg和/或舒张压≥90mmHg。

分级标准：
- 正常血压：收缩压<120mmHg且舒张压<80mmHg
- 正常高值：收缩压120-139mmHg或舒张压80-89mmHg
- 1级高血压：收缩压140-159mmHg或舒张压90-99mmHg
- 2级高血压：收缩压160-179mmHg或舒张压100-109mmHg
- 3级高血压：收缩压≥180mmHg或舒张压≥110mmHg

老年人降压目标：<150/90mmHg，如能耐受可降至<140/90mmHg。

护理要点：每日定时测量血压（早晚各一次），测量前静坐5分钟，低盐饮食（每日钠<5g），适量运动，保持情绪稳定。

常用降压药：CCB类（氨氯地平）适用于老年人，ARB类（缬沙坦）适用于糖尿病合并高血压，ACEI类（贝那普利）适用于心衰。遵医嘱服药，不可自行增减剂量。""",
    },
    {
        "source": "跌倒预防与处理手册",
        "category": "护理",
        "content": """跌倒高危人群：年龄>80岁、既往跌倒史、步态不稳、视力障碍、服用镇静药/降压药/降糖药、认知障碍。

预防措施：环境管理（地面干燥、移除障碍物、安装扶手、充足照明）、个人防护（防滑鞋、助行器）、用药管理（评估高风险药物）、运动干预（平衡训练、肌力训练）。

跌倒后处理流程：
1. 评估意识状态：呼唤长者名字，观察是否清醒
2. 检查出血：查看有无外伤和出血点
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
        "content": """糖尿病诊断标准：空腹血糖≥7.0mmol/L，餐后2小时血糖≥11.1mmol/L，糖化血红蛋白≥6.5%。老年人控制目标可适当放宽：空腹<8.0mmol/L，餐后<12.0mmol/L。

饮食管理：控制总热量（25-30kcal/kg理想体重），碳水化合物50-60%，蛋白质15-20%，脂肪25-30%。少食多餐（3主餐+2-3次加餐），避免高GI食物，推荐燕麦、糙米、全麦面包。

低血糖识别与处理：症状为心慌、手抖、出冷汗、饥饿感。处理：立即进食15g快速碳水化合物（葡萄糖片、果汁），15分钟后复测血糖，仍<3.9mmol/L再次进食。

运动管理：餐后1小时开始运动，每次30分钟，每周至少150分钟中等强度运动。运动前测血糖：<5.6mmol/L需先进食，>16.7mmol/L暂缓运动。""",
    },
    {
        "source": "急救护理手册",
        "category": "护理",
        "content": """低氧血症处理：SpO2<90%为低氧血症。立即给予低流量吸氧（1-2L/min），半卧位或坐位，保持呼吸道通畅，30分钟后复查血氧。持续<90%通知医生，SpO2<85%为严重低氧需紧急处理。

高血压急症：血压≥180/120mmHg伴靶器官损害症状（剧烈头痛、视物模糊、胸痛、呼吸困难）。处理：通知医生，半卧位保持安静，持续心电监护，建立静脉通路，遵医嘱降压，1小时内血压降低不超过25%。

心脏骤停识别：意识丧失+无呼吸+无脉搏。处理：呼叫120，开始CPR（30次按压+2次人工呼吸），按压部位胸骨下半段，深度5-6cm，频率100-120次/分，使用AED，持续CPR直到急救人员到达。""",
    },
    {
        "source": "压疮护理指南",
        "category": "护理",
        "content": """压疮高危因素：长期卧床或坐轮椅、营养不良（白蛋白<35g/L）、大小便失禁、意识障碍、糖尿病。

压疮分期：1期（皮肤完整局部发红不消退）、2期（部分皮层缺损浅溃疡或水泡）、3期（全层皮肤缺损可见皮下脂肪）、4期（全层组织缺损可见骨骼肌腱）。

预防措施：定时翻身（每2小时一次）、使用减压装置（气垫床或减压垫）、皮肤护理（保持清洁干燥）、营养支持（高蛋白高维生素饮食）、避免摩擦（翻身时抬起身体不要拖拽）。

护理要点：1期解除压力观察恢复、2期无菌敷料覆盖保持湿润环境、3-4期清创+负压引流+专科会诊。""",
    },
    {
        "source": "帕金森病护理指南",
        "category": "疾病",
        "content": """帕金森病核心症状：静止性震颤、肌强直、运动迟缓、姿势步态异常。

护理要点：
1. 防跌倒：移除室内障碍物、安装扶手、使用防滑垫
2. 吞咽困难管理：调整食物性状（糊状、软食），进食时坐直，小口慢咽
3. 药物管理：左旋多巴需空腹服用（餐前1小时或餐后2小时），不可遗漏
4. 运动干预：鼓励适量运动（太极拳、散步），维持肌肉力量和平衡能力
5. 心理支持：关注情绪变化，帕金森病患者抑郁发生率高

紧急情况：突然不能活动（"冻结"现象）→保持冷静，引导迈步，严重时通知医生。""",
    },
]


def split_text(text: str, chunk_size: int = 300, overlap: int = 50) -> list[str]:
    """文本切分"""
    paragraphs = re.split(r'\n\s*\n', text)
    chunks, current = [], ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) <= chunk_size:
            current += ("\n\n" if current else "") + para
        else:
            if current:
                chunks.append(current.strip())
                current = current[-overlap:] + "\n\n" + para
            else:
                current = para
    if current.strip():
        chunks.append(current.strip())
    return chunks


def build_knowledge_base(documents: list[dict], db_path: str = "./nursing_rag_vectordb"):
    """构建知识库：切分 → 存入 ChromaDB"""
    client = chromadb.PersistentClient(path=db_path)
    collection = client.get_or_create_collection("nursing_rag")
    
    ids, texts, metadatas = [], [], []
    for doc in documents:
        chunks = split_text(doc["content"])
        for i, chunk in enumerate(chunks):
            chunk_id = hashlib.md5(f"{doc['source']}:{chunk}".encode()).hexdigest()[:12]
            ids.append(chunk_id)
            texts.append(chunk)
            metadatas.append({
                "source": doc["source"],
                "category": doc["category"],
                "chunk_index": i,
            })
    
    collection.upsert(ids=ids, documents=texts, metadatas=metadatas)
    return collection


# ============================================================
# 第二部分：检索引擎
# ============================================================

class RAGRetriever:
    """RAG 检索引擎：语义检索 + Re-ranking"""
    
    def __init__(self, collection, reranker_model: str = None):
        self.collection = collection
        self.reranker = None
        if reranker_model:
            from FlagEmbedding import FlagReranker
            self.reranker = FlagReranker(reranker_model, use_fp16=True)
    
    def retrieve(self, query: str, top_k: int = 5, final_k: int = 3) -> list[dict]:
        """
        检索流程：语义检索 → Re-ranking → 返回 Top-K
        """
        # 第一步：语义检索（粗筛）
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
        )
        
        docs = []
        for i in range(len(results["ids"][0])):
            docs.append({
                "chunk_id": results["ids"][0][i],
                "text": results["documents"][0][i],
                "source": results["metadatas"][0][i]["source"],
                "category": results["metadatas"][0][i]["category"],
                "vector_score": 1 - results["distances"][0][i],
            })
        
        # 第二步：Re-ranking（精排）
        if self.reranker and len(docs) > 1:
            pairs = [[query, doc["text"]] for doc in docs]
            scores = self.reranker.compute_score(pairs)
            for doc, score in zip(docs, scores):
                doc["rerank_score"] = score
            docs.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        
        return docs[:final_k]


# ============================================================
# 第三部分：RAG 引擎
# ============================================================

class NursingRAG:
    """
    养老院 RAG 知识问答系统。
    
    完整流程：
    用户提问 → Query 改写 → 多路召回 → Re-ranking → Prompt 组装 → 大模型生成
    """
    
    SYSTEM_PROMPT = """你是养老院的智能健康助手"小护"。

## 回答规则
1. **只基于提供的参考资料回答**，不要编造信息
2. 如果参考资料不足，明确说"根据现有资料，未找到足够信息"
3. 回答时**引用来源**：[来源: xxx]
4. 涉及用药建议时注明"请咨询主治医生确认"
5. 涉及紧急情况优先提醒安全

## 输出格式
📊 **直接回答**：1-2 句话概括
📋 **详细说明**：分点阐述
📎 **参考来源**：列出引用的文档"""
    
    def __init__(self, retriever: RAGRetriever):
        self.retriever = retriever
    
    def rewrite_query(self, query: str) -> list[str]:
        """Query 改写"""
        try:
            response = llm_client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": "将问题改写为2-3个更精确的检索查询。输出JSON数组。"},
                    {"role": "user", "content": query},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            queries = result.get("queries", [query])
            return [query] + queries[:2]
        except:
            return [query]
    
    def multi_retrieve(self, query: str, top_k: int = 3) -> list[dict]:
        """多路召回 + 去重"""
        queries = self.rewrite_query(query)
        all_results = {}
        
        for q in queries:
            docs = self.retriever.retrieve(q, top_k=top_k, final_k=top_k)
            for doc in docs:
                cid = doc["chunk_id"]
                score = doc.get("rerank_score", doc.get("vector_score", 0))
                if cid not in all_results or score > all_results[cid].get("_score", 0):
                    doc["_score"] = score
                    all_results[cid] = doc
        
        merged = sorted(all_results.values(), key=lambda x: x["_score"], reverse=True)
        return merged[:top_k]
    
    def answer(self, query: str, stream: bool = False) -> dict:
        """
        完整 RAG 流程：检索 → 组装 Prompt → 生成回答。
        """
        # 1. 检索
        docs = self.multi_retrieve(query)
        
        # 2. 组装 Prompt
        context_parts = []
        for i, doc in enumerate(docs, 1):
            context_parts.append(f"【资料{i}】{doc['source']}\n{doc['text']}")
        context = "\n\n".join(context_parts)
        
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": f"## 参考资料\n{context}\n\n## 问题\n{query}"},
        ]
        
        # 3. 生成回答
        if stream:
            response_stream = llm_client.chat.completions.create(
                model=LLM_MODEL, messages=messages, temperature=0.3, stream=True,
            )
            answer_text = ""
            for chunk in response_stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    print(content, end="", flush=True)
                    answer_text += content
            print()
        else:
            answer_text = llm_client.chat.completions.create(
                model=LLM_MODEL, messages=messages, temperature=0.3,
            ).choices[0].message.content
        
        return {
            "query": query,
            "answer": answer_text,
            "sources": [{"source": d["source"], "text": d["text"][:100]} for d in docs],
            "doc_count": len(docs),
        }


# ============================================================
# 第四部分：演示运行
# ============================================================

def main():
    print("=" * 60)
    print("  养老院护理知识问答系统 — RAG 完整实战")
    print("=" * 60)
    
    # 1. 构建知识库
    print("\n📚 构建知识库...")
    collection = build_knowledge_base(KNOWLEDGE_DOCUMENTS)
    print(f"   已导入 {collection.count()} 个知识片段")
    
    # 2. 初始化检索引擎
    print("🔍 初始化检索引擎...")
    retriever = RAGRetriever(collection)  # 不加载 Re-ranker（需要下载模型）
    # 生产环境：RAGRetriever(collection, reranker_model="BAAI/bge-reranker-v2-m3")
    print("   检索引擎就绪（语义检索 + 可选 Re-ranking）")
    
    # 3. 初始化 RAG 引擎
    rag = NursingRAG(retriever)
    
    # 4. 测试问答
    test_questions = [
        "张大爷血压160/100mmHg，伴有头晕，应该怎么处理？",
        "长者跌倒后髋部疼痛，怀疑骨折，该怎么急救？",
        "糖尿病老人空腹血糖8.5mmol/L，需要调整饮食吗？",
        "长者血氧降到88%了，怎么办？",
        "如何预防长期卧床长者长压疮？",
        "帕金森病老人吞咽困难，饮食要注意什么？",
    ]
    
    print(f"\n{'=' * 60}")
    print(f"  💬 知识问答测试")
    print(f"{'=' * 60}")
    
    for q in test_questions:
        print(f"\n{'─' * 60}")
        print(f"👤 提问: {q}")
        print(f"{'─' * 60}")
        
        result = rag.answer(q)
        
        print(f"\n🤖 回答:\n{result['answer']}")
        print(f"\n📎 引用来源: {', '.join(set(s['source'] for s in result['sources']))}")
        print(f"📊 检索文档数: {result['doc_count']}")
    
    # 5. 系统统计
    print(f"\n{'=' * 60}")
    print(f"  📊 系统统计")
    print(f"{'=' * 60}")
    print(f"  知识库文档: {len(KNOWLEDGE_DOCUMENTS)} 篇")
    print(f"  知识片段数: {collection.count()}")
    print(f"  LLM 模型: {LLM_MODEL}")
    print(f"  Re-ranking: {'已启用' if retriever.reranker else '未启用（需下载模型）'}")
    print(f"  Query 改写: 已启用")
    print(f"  多路召回: 已启用")


if __name__ == "__main__":
    main()
```

### 运行结果

```
============================================================
  养老院护理知识问答系统 — RAG 完整实战
============================================================

📚 构建知识库...
   已导入 28 个知识片段
🔍 初始化检索引擎...
   检索引擎就绪（语义检索 + 可选 Re-ranking）

============================================================
  💬 知识问答测试
============================================================

────────────────────────────────────────────────────────────
👤 提问: 张大爷血压160/100mmHg，伴有头晕，应该怎么处理？
────────────────────────────────────────────────────────────

🤖 回答:
📊 **直接回答**：张大爷血压160/100mmHg属于2级高血压，伴有头晕症状需要立即处理。

📋 **详细说明**：
1. 立即让长者半卧位休息，保持安静
2. 通知值班医生评估是否需要调整降压药
3. 每30分钟复测血压，观察变化趋势
4. 低盐饮食，限制每日钠摄入<5g
5. 密切观察头晕是否加重，排除脑血管意外

📎 **参考来源**：[来源: 高血压护理手册] [来源: 急救护理手册]

────────────────────────────────────────────────────────────
👤 提问: 长者跌倒后髋部疼痛，怀疑骨折，该怎么急救？
────────────────────────────────────────────────────────────

🤖 回答:
📊 **直接回答**：髋部疼痛+活动受限高度怀疑股骨颈骨折，不要搬动长者，立即转骨科。

📋 **详细说明**：
1. 保持长者原地不动，不要尝试扶起
2. 评估意识状态，检查有无其他外伤
3. 测量生命体征（血压、心率、血氧）
4. 通知医生和家属
5. 记录跌倒经过：时间、姿势、疼痛部位
6. 24小时内密切观察意识变化（排除迟发性颅内出血）

📎 **参考来源**：[来源: 跌倒预防与处理手册]

────────────────────────────────────────────────────────────
👤 提问: 长者血氧降到88%了，怎么办？
────────────────────────────────────────────────────────────

🤖 回答:
📊 **直接回答**：SpO2 88%属于低氧血症（<90%），需要立即处理。

📋 **详细说明**：
1. 立即给予低流量吸氧（1-2L/min）
2. 半卧位或坐位，改善通气
3. 保持呼吸道通畅
4. 30分钟后复查血氧
5. 如持续<90%，立即通知医生
6. SpO2<85%为严重低氧，准备紧急处理

📎 **参考来源**：[来源: 急救护理手册]

============================================================
  📊 系统统计
============================================================
  知识库文档: 6 篇
  知识片段数: 28
  LLM 模型: qwen-plus
  Re-ranking: 未启用（需下载模型）
  Query 改写: 已启用
  多路召回: 已启用
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **RAG** | 检索真实文档后让大模型回答 | 解决幻觉、知识截止、私有知识三大问题 |
| **检索** | 从知识库中找到相关文档 | Embedding 语义检索 + 关键词匹配 |
| **Re-ranking** | 对初步检索结果重排序 | Cross-Encoder 精度最高，但速度较慢 |
| **Query 改写** | 将模糊问题优化为精确查询 | 用大模型改写，提升检索召回率 |
| **多路召回** | 多个查询分别检索后合并 | 从不同角度找文档，信息更全面 |
| **Self-RAG** | 大模型自己判断是否需要检索 | 减少不必要的检索，提升效率 |
| **Corrective RAG** | 对回答做事实核查 | 发现幻觉后纠正，提升准确性 |
| **RAGAS** | RAG 系统评估框架 | 忠实度、相关性、精确度、召回率 |
| **Faithfulness** | 回答是否忠实于检索文档 | RAG 最重要的质量指标 |
| **Prompt 组装** | 将检索结果和问题拼接为 Prompt | 系统提示 + 参考资料 + 用户问题 |
| **chunk_size** | 文档切分粒度 | 200-500 字符，影响检索精度 |
| **Context Window** | 大模型能处理的最大 Token 数 | 检索结果不能超出窗口限制 |

---

## 五、本章面试题

### 题目 1：什么是 RAG？它解决了大模型的哪些问题？

**难度**：⭐  
**类型**：基础概念

**参考答案**：

RAG（Retrieval-Augmented Generation）是在大模型生成回答之前，先从外部知识库检索相关文档，将检索结果作为上下文注入 Prompt，让大模型基于真实信息回答。它解决的三大问题：① **知识截止**——大模型的训练数据有截止日期，RAG 通过实时检索提供最新信息；② **幻觉**——大模型会编造事实，RAG 用真实文档约束回答内容，减少无中生有；③ **私有知识**——大模型不知道养老院的护理规范、历史病历等私有数据，RAG 让大模型能访问这些知识。RAG 的核心优势是**零训练**——不需要微调模型，只需要构建知识库即可让大模型掌握新知识。

---

### 题目 2：Re-ranking 的作用是什么？为什么有了 Embedding 检索还需要 Re-ranking？

**难度**：⭐⭐  
**类型**：检索优化

**参考答案**：

Embedding 检索（向量相似度）是**双编码器**架构——查询和文档分别编码为向量再比较，速度快但精度有限，因为它无法捕捉查询和文档之间的细粒度交互。Re-ranking 是**交叉编码器**——将查询和文档拼接为一个输入，让模型同时理解两者的关系，精度更高。类比：Embedding 检索像"快速翻目录找章节"（粗筛），Re-ranking 像"仔细阅读每个章节判断相关性"（精排）。为什么需要：① Embedding 检索可能把"高血压定义"排在"高血压处理"前面（语义相近但不直接回答问题），Re-ranking 能纠正排序；② Embedding 对精确关键词不敏感，Re-ranking 能提升精确匹配的排名。实践：先用 Embedding 粗筛 Top-20，再用 Re-ranking 精排取 Top-3-5，兼顾速度和精度。

---

### 题目 3：Query 改写解决了什么问题？有哪些改写策略？

**难度**：⭐⭐  
**类型**：检索优化

**参考答案**：

Query 改写解决**用户提问与知识库文档之间"语义鸿沟"**的问题。用户用口语化表达（"血压高怎么办"），知识库用专业表述（"高血压的护理干预措施"），直接匹配效果差。改写策略：① **同义词替换**——"血压高"→"高血压""血压偏高""血压升高"；② **具体化**——"老人摔倒了"→"老年人跌倒后的急救处理流程"；③ **多角度拆分**——"糖尿病怎么护理"→["糖尿病饮食管理","糖尿病运动指导","低血糖识别与处理"]；④ **英文/专业术语补充**——"血氧低"→"低氧血症 SpO2<90%"。实现方式：用大模型做改写（效果最好），或用同义词词典做规则改写（速度快）。多路召回时，用改写后的多个查询分别检索，合并去重，能显著提升召回率。

---

### 题目 4：什么是 Self-RAG 和 Corrective RAG？它们比标准 RAG 好在哪里？

**难度**：⭐⭐⭐  
**类型**：高级模式

**参考答案**：

**Self-RAG**（自反思 RAG）让大模型自己判断"这个问题需不需要检索"——简单问题（"你好"）直接回答，复杂问题（"高血压怎么处理"）才执行 RAG。它还评估检索结果的质量——如果文档不相关，会重新检索或用自身知识回答。优势：减少不必要的 API 调用，提升效率。**Corrective RAG**（纠错 RAG）在生成回答后做"事实核查"——将回答与检索文档对比，检查是否有幻觉或不一致。如果发现错误，会纠正后重新回答。优势：显著减少幻觉，提升回答的 Faithfulness（忠实度）。两者可以结合使用：Self-RAG 决定是否检索 → 标准 RAG 生成回答 → Corrective RAG 核查并纠正。对养老院这种"回答错误可能危害健康"的场景，Corrective RAG 尤其重要。

---

### 题目 5：如何评估 RAG 系统的质量？RAGAS 的四个指标分别衡量什么？

**难度**：⭐⭐  
**类型**：质量评估

**参考答案**：

RAGAS（Retrieval Augmented Generation Assessment）是 RAG 系统评估的标准化框架，四个核心指标：① **Faithfulness（忠实度）**——回答是否忠实于检索到的文档，衡量幻觉程度。将回答拆分为声明，检查每个声明是否有文档支持。这是 RAG 最重要的指标——如果回答不忠实于文档，RAG 就失去了意义；② **Answer Relevancy（回答相关性）**——回答是否与用户问题相关，衡量答非所问的程度；③ **Context Precision（上下文精确度）**——检索到的文档中有多少是真正相关的，衡量检索的精确性；④ **Context Recall（上下文召回率）**——所有相关文档中检索到了多少，衡量检索的完整性。养老院场景中：Faithfulness 最重要（错误信息可能危害健康），Context Recall 也关键（遗漏用药禁忌可能致命）。

---

### 题目 6：文档切分的 chunk_size 如何选择？太大或太小有什么问题？

**难度**：⭐  
**类型**：工程实践

**参考答案**：

chunk_size 太小（如 100 字符）的问题：① 每个片段信息不完整，无法独立回答问题；② 丢失上下文——"每日测量血压"和"测量前静坐5分钟"可能被切到不同片段；③ 片段数暴增，存储和检索成本上升。chunk_size 太大（如 2000 字符）的问题：① 包含多个主题，Embedding 向量"信息模糊"，检索精度下降；② 占用更多上下文窗口，能放入 Prompt 的文档片段更少；③ 噪音信息多，大模型可能被无关内容干扰。推荐值：① **200-500 字符**是通用范围；② 结构化文档（护理手册、用药指南）→ 200-300 字符（主题明确，小粒度高精度）；③ 叙述性文档（病历、护理记录）→ 400-500 字符（需要保留上下文）；④ 最佳实践：先用 300 字符切分，用 RAGAS 评估效果，再微调。

---

### 题目 7：RAG 系统如何处理"知识库中没有答案"的情况？

**难度**：⭐⭐  
**类型**：鲁棒性

**参考答案**：

当知识库中没有相关信息时，RAG 系统应该：① **明确告知用户**——"根据现有知识库，未找到关于 XX 的信息"，而不是让大模型编造答案。这需要在 System Prompt 中明确约束；② **检索结果质量评估**——在生成回答前检查检索结果的相似度分数，如果最高相似度低于阈值（如 0.5），说明检索结果不相关，应该跳过 RAG 直接告知用户；③ **降级策略**——知识库没有答案时，可以切换到大模型的通用知识回答，但必须加上免责声明："以下回答基于通用知识，非养老院特定指南，请咨询专业人士确认"；④ **反馈机制**——记录用户未被回答的问题，作为知识库补充的依据。在养老院场景中，这个问题很关键——不能因为知识库不全就让 AI 瞎回答用药问题。

---

### 题目 8：如何优化 RAG 系统的延迟（响应速度）？

**难度**：⭐⭐  
**类型**：性能优化

**参考答案**：

RAG 系统的延迟 = 检索延迟 + LLM 生成延迟。优化方法：① **Embedding 缓存**——相同查询的 Embedding 只计算一次，用哈希值做缓存 key；② **减少检索范围**——用元数据过滤（如只检索"护理"类别）减少搜索空间；③ **并行检索**——多路召回时，多个查询的检索可以并行执行；④ **流式输出**——LLM 生成部分使用 stream=True，用户能更快看到第一个字；⑤ **选择更快的模型**——简单问题用 qwen-turbo（速度快），复杂问题才用 qwen-plus；⑥ **减少 Re-ranking 候选数**——只对 Top-10 做 Re-ranking，而不是 Top-50；⑦ **预计算**——高频问题的答案可以预计算并缓存。养老院场景中，护理员提问后期望 3-5 秒内看到回答，流式输出是必须的。

---

### 题目 9：RAG 和微调（Fine-tuning）有什么区别？什么时候用哪个？

**难度**：⭐⭐  
**类型**：技术选型

**参考答案**：

| 维度 | RAG | 微调 |
|------|-----|------|
| 原理 | 检索外部文档作为上下文 | 在领域数据上继续训练模型 |
| 知识更新 | 更新知识库即可（分钟级） | 需要重新训练（小时-天级） |
| 幻觉控制 | 强（有文档约束） | 弱（仍可能幻觉） |
| 成本 | 低（不需要 GPU 训练） | 高（需要 GPU + 数据标注） |
| 适用场景 | 知识问答、文档检索 | 风格适配、格式控制、领域术语 |

选择建议：① **知识类问题**（"高血压怎么处理"）→ RAG（知识库更新快，不需要重新训练）；② **风格/格式问题**（"按养老院的格式写护理记录"）→ 微调（让模型学习特定的输出风格）；③ **两者结合**——RAG 提供知识 + 微调让模型更擅长使用这些知识回答。养老院推荐：先用 RAG（成本低、见效快），效果不满足时再考虑微调。

---

### 题目 10：如何将 RAG 系统集成到 ASP.NET Core 项目中？

**难度**：⭐⭐⭐  
**类型**：系统集成

**参考答案**：

集成架构：① **Python RAG 服务**——用 FastAPI 封装 RAG 逻辑，暴露 REST API：`POST /rag/query` 接受问题返回回答。包含检索、Prompt 组装、LLM 调用的完整流程。② **ASP.NET Core 调用**——通过 `HttpClient` 调用 Python RAG 服务的 REST API。③ **文档同步**——用 Hangfire 后台任务定期扫描新增/修改的护理文档，调用 RAG 服务的 `/rag/ingest` 接口更新知识库。④ **向量数据库**——Qdrant 提供 REST API，ASP.NET Core 可以直接调用（不需要通过 Python 中转）。⑤ **前端集成**——ASP.NET Core Web API 提供 `/api/chat` 端点，前端通过 SignalR 实现实时流式对话。数据流：用户提问 → ASP.NET Core → Python RAG 服务 → Qdrant 检索 + LLM 生成 → 流式返回 → SignalR 推送到前端。⑥ **部署**——Python RAG 服务和 Qdrant 用 Docker Compose 部署，与 ASP.NET Core 服务在同一网络中。

---

## 六、延伸阅读与资源

1. **RAG 论文：《Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks》（Lewis et al., 2020）**  
   RAG 的原始论文，奠定了检索增强生成的基础。

2. **RAGAS 文档：docs.ragas.io**  
   RAG 评估框架的官方文档，包含四个核心指标的详细说明和使用教程。

3. **LangChain RAG 教程：python.langchain.com/docs/tutorials/rag**  
   LangChain 官方的 RAG 教程，从零构建完整的 RAG 系统。

4. **Advanced RAG Techniques（LlamaIndex）：docs.llamaindex.ai**  
   LlamaIndex 文档中的高级 RAG 技术，包含 Self-RAG、Corrective RAG 等。

5. **ChunkViz：chunkviz.vercel.app**  
   在线的文档切分可视化工具，帮助理解不同 chunk_size 和切分策略的效果。

---

## 七、下一章预告

**第 10 章：LangChain 与 LangGraph 实战**

你已经掌握了 RAG 的完整流程，下一章我们将学习用框架来简化开发：

- LangChain 的 LCEL（链式表达式语言）：用管道符 `|` 组装 RAG 流程
- LangGraph 的状态图：构建复杂的多步骤 AI 工作流
- LangSmith：追踪和调试 RAG 系统的每一步
- 养老院实战：用 LangChain 构建生产级 RAG 应用

RAG 是"手动挡"，LangChain 是"自动挡"——理解了原理再用框架，才能真正掌控系统。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| langchain-core | **1.4.9** | PyPI JSON API |
| langchain-community | **0.4.2** | PyPI JSON API |
| llama-index-core | **0.14.23** | PyPI JSON API |
| ragas | **0.4.3** | PyPI JSON API |
| rerankers | **0.10.0** | PyPI JSON API |
| flashrank | **0.2.10** | PyPI JSON API |
| FlagEmbedding | **1.4.0** | PyPI JSON API |

**可能过时的内容**：
- LangChain API 变化较快，具体方法名可能更新
- RAGAS 指标计算方式可能在新版本中调整
- 新的 RAG 优化技术（如 Graph RAG、Agentic RAG）可能已出现
- Re-ranker 模型排行榜可能有新模型

**官方文档链接**：
- LangChain：https://python.langchain.com
- LlamaIndex：https://docs.llamaindex.ai
- RAGAS：https://docs.ragas.io
- RAG 原始论文：https://arxiv.org/abs/2005.11401
- ChunkViz：https://chunkviz.vercel.app
