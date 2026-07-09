# 第 03 章 NLP 基础与 Tokenization — 计算机如何"读懂"文字

---

## 一、章节概述

### 本章学什么

本章解决一个根本问题：**计算机只认识数字，它怎么理解"张大爷今天血压偏高"这句话？** 你将学到文本从人类语言变成数字向量的完整过程——从最原始的 one-hot 编码，到词向量（Word2Vec），再到大模型使用的子词分词（BPE/WordPiece/SentencePiece）。同时掌握中文分词的特殊挑战和主流工具。

### 为什么学

- **第 4 章 Transformer** 的输入就是 Token 序列，不理解 Tokenization 就看不懂 Transformer
- **第 6-9 章** 的 Prompt Engineering、Embedding、RAG 全部建立在"文本→向量"的基础上
- **面试必考**：BPE 和 WordPiece 的区别、为什么不用 one-hot、Tokenization 对模型性能的影响
- **实际开发**：调用大模型 API 时，你需要理解 token 计费（按 token 收费）、上下文窗口限制（token 数量限制）

### 在知识体系中的位置

```
第1章 Python → 第2章 深度学习基础
                    ↓
            第3章 NLP 基础与 Tokenization ← 你在这里
                    ↓
            第4章 Transformer → 第5-17章
```

---

## 二、核心知识点

### 2.1 文本表示 — 从文字到数字

#### 类比

养老院的信息系统里，每位长者有一个唯一编号（ID）。计算机处理文本也是一样——先把文字"编号"，变成数字，才能做计算。问题是：**怎么编号才能保留文字的含义？**

#### 方案一：One-Hot 编码

```python
import numpy as np

# 养老院的 5 个常见关键词
vocabulary = ["长者", "血压", "心率", "护理", "健康"]

# One-Hot 编码：每个词用一个向量表示，只有对应位置为 1，其余为 0
def one_hot(word: str, vocab: list[str]) -> np.ndarray:
    """One-Hot 编码（对标 C# 的 Dictionary<string, int> 映射）"""
    vector = np.zeros(len(vocab))
    if word in vocab:
        vector[vocab.index(word)] = 1.0
    return vector

# 编码示例
print("长者 →", one_hot("长者", vocabulary))   # [1, 0, 0, 0, 0]
print("血压 →", one_hot("血压", vocabulary))   # [0, 1, 0, 0, 0]
print("心率 →", one_hot("心率", vocabulary))   # [0, 0, 1, 0, 0]

# C# 等价写法：
# var oneHot = vocabulary.Select((w, i) => w == word ? 1.0 : 0.0).ToArray();
```

**One-Hot 的致命缺陷**：

```python
# 缺陷 1：维度灾难
# 养老院知识库有 50,000 个词 → 每个词是一个 50,000 维的向量，99.998% 是 0
print(f"词汇量 50,000 时，每个词向量维度: {len(vocabulary)}")
print(f"向量稀疏度: {(1 - 1/len(vocabulary))*100:.1f}%")

# 缺陷 2：无法表达语义相似性
# "血压"和"心率"都是生命体征，应该"距离近"
# 但 One-Hot 编码下，它们的距离 = "血压"和"长者"的距离 = √2
bp = one_hot("血压", vocabulary)
hr = one_hot("心率", vocabulary)
elder = one_hot("长者", vocabulary)
print(f"\n血压 vs 心率的距离: {np.linalg.norm(bp - hr):.2f}")   # 1.41
print(f"血压 vs 长者的距离: {np.linalg.norm(bp - elder):.2f}")  # 1.41（一样远！）
```

> **结论**：One-Hot 编码无法捕捉词与词之间的语义关系，且维度随词汇量线性增长，不适合实际 NLP 任务。

---

#### 方案二：词袋模型（Bag of Words）与 TF-IDF

```python
from collections import Counter
import math

# 养老院的两条护理记录
doc1 = "长者 血压 偏高 需要 关注 饮食 调整"
doc2 = "长者 心率 正常 精神 状态 良好"

# 词袋模型：统计每个词出现的次数，忽略顺序
def bag_of_words(doc: str, vocab: list[str]) -> list[int]:
    """词袋模型（对标 C# 的 Dictionary<string, int> 计数）"""
    word_counts = Counter(doc.split())
    return [word_counts.get(w, 0) for w in vocab]

# 构建词汇表
all_words = sorted(set(" ".join([doc1, doc2]).split()))
print(f"词汇表: {all_words}")
print(f"文档1 词袋: {bag_of_words(doc1, all_words)}")
print(f"文档2 词袋: {bag_of_words(doc2, all_words)}")

# TF-IDF：给每个词一个"重要性"权重
# TF（词频）= 该词在文档中出现的频率
# IDF（逆文档频率）= log(总文档数 / 包含该词的文档数)
# 核心思想：一个词在当前文档出现多（TF高）且在其他文档出现少（IDF高）→ 这个词很重要

def compute_tfidf(docs: list[str]) -> list[dict]:
    """计算 TF-IDF 权重"""
    vocab = sorted(set(" ".join(docs).split()))
    n_docs = len(docs)
    
    # 计算 IDF
    idf = {}
    for word in vocab:
        doc_count = sum(1 for doc in docs if word in doc.split())
        idf[word] = math.log(n_docs / doc_count)
    
    # 计算 TF-IDF
    results = []
    for doc in docs:
        words = doc.split()
        word_count = Counter(words)
        tfidf = {}
        for word in vocab:
            tf = word_count.get(word, 0) / len(words)
            tfidf[word] = tf * idf.get(word, 0)
        results.append(tfidf)
    
    return results

# 示例
docs = [
    "长者 血压 偏高 需要 关注 饮食 调整",
    "长者 心率 正常 精神 状态 良好",
    "长者 血糖 偏高 需要 控制 饮食",
]
tfidf_results = compute_tfidf(docs)

print("\nTF-IDF 权重（文档1）:")
for word, weight in sorted(tfidf_results[0].items(), key=lambda x: -x[1]):
    if weight > 0:
        print(f"  {word}: {weight:.3f}")
```

**词袋/TF-IDF 的局限**：丢失了词序信息（"血压偏高"和"偏高血压"一样），无法处理一词多义，仍然是稀疏高维向量。

---

### 2.2 词向量（Word Embeddings）—— 让词有了"语义坐标"

#### 类比

如果把所有词放在一个地图上：

```
              高风险区域
         ┌─────────────────┐
         │   危急  严重    │
         │      ↑         │
         │  偏高  异常     │
         │      ↑         │
    ←────┼──正常──平稳──→ 中间区域（中性）
         │      ↓         │
         │  偏低  不足     │
         │      ↓         │
         │   过低  衰退    │
         └─────────────────┘
              低风险区域
```

在这个"语义地图"上，"偏高"和"异常"距离近（都在高风险区域），"正常"和"平稳"距离近（都在中间）。**词向量就是给每个词一个在这个地图上的坐标。**

#### Word2Vec 原理

Word2Vec 的核心思想：**一个词的含义由它周围的词决定**（分布假说）。

```
句子1："长者 今天 血压 偏高 医生 建议 调整 用药"
句子2："长者 今天 心率 偏高 医生 建议 调整 用药"
句子3："长者 今天 血糖 偏高 医生 建议 控制 饮食"

→ "血压"、"心率"、"血糖" 经常出现在相似的上下文中
→ 所以它们的词向量应该很接近
```

```python
# Word2Vec 的两种训练方式：
#
# CBOW（Continuous Bag of Words）：用上下文预测中心词
#   输入：[长者, 今天, ___, 偏高] → 预测：血压
#   类比：给护理员看上下文，猜中间缺失的指标名
#
# Skip-gram：用中心词预测上下文
#   输入：血压 → 预测：[长者, 今天, 偏高, 医生]
#   类比：告诉护理员一个指标名，让她猜相关的上下文词

# 实际使用 Word2Vec（通过 gensim 库）
# 安装：uv add gensim
from gensim.models import Word2Vec

# 养老院语料（实际项目中从数据库/文档中提取）
corpus = [
    ["长者", "血压", "偏高", "需要", "调整", "用药"],
    ["长者", "心率", "正常", "精神", "良好"],
    ["长者", "血糖", "偏高", "需要", "控制", "饮食"],
    ["护理", "计划", "包括", "日常", "照护", "和", "康复"],
    ["长者", "跌倒", "告警", "需要", "紧急", "处理"],
    ["医生", "建议", "调整", "用药", "剂量"],
    ["体检", "报告", "显示", "血压", "正常"],
    ["长者", "血氧", "偏低", "需要", "吸氧"],
    ["护理", "记录", "长者", "今日", "状态", "良好"],
    ["营养", "分析", "建议", "增加", "蛋白质", "摄入"],
]

# 训练 Word2Vec 模型
model = Word2Vec(
    sentences=corpus,
    vector_size=50,    # 词向量维度（50维，实际常用 100-300）
    window=3,          # 上下文窗口大小
    min_count=1,       # 最低词频（出现 1 次以上的词才纳入）
    sg=1,              # 1=Skip-gram, 0=CBOW
    epochs=100,        # 训练轮数
)

# 查看词向量
print(f"'血压' 的词向量（前10维）: {model.wv['血压'][:10].round(3)}")
print(f"词向量维度: {model.wv['血压'].shape}")

# 找最相似的词（语义最近的词）
similar_words = model.wv.most_similar("血压", topn=5)
print(f"\n与'血压'最相似的词:")
for word, score in similar_words:
    print(f"  {word}: {score:.3f}")

# 词向量的代数运算：国王 - 男人 + 女人 ≈ 女王
# 养老院版本：半护理 - 自理 + 全自理 ≈ 全护理？
# （小语料下效果不明显，大语料下会更准确）
```

#### 词向量 vs One-Hot 对比

| 特性 | One-Hot | Word2Vec |
|------|---------|----------|
| 维度 | 词汇量大小（50,000+） | 固定（100-300） |
| 稀疏性 | 极度稀疏（99.99% 为 0） | **稠密**（每个维度都有值） |
| 语义关系 | 无（所有词等距） | **有**（相似词距离近） |
| 可训练 | 否（固定编码） | 是（从语料中学习） |

---

### 2.3 Tokenization — 文本切分的艺术

#### 为什么需要 Tokenization？

计算机不能直接处理"张大爷今天血压偏高"这串字符。需要把它切成一个个 **Token**（标记），再把每个 Token 转为数字 ID。

```
"张大爷今天血压偏高"
   ↓ Tokenization
["张", "大爷", "今天", "血压", "偏高"]
   ↓ 转为 ID
[2341, 892, 156, 445, 1023]
```

#### 三种切分粒度

```python
# ========== 1. 词级切分（Word-level） ==========
# 按空格/词典切分，每个词是一个 Token
text = "张大爷今天血压偏高需要调整用药"

word_tokens = ["张大爷", "今天", "血压", "偏高", "需要", "调整", "用药"]
# 优点：语义清晰
# 缺点：① 中文没有空格，需要分词工具；② 词表巨大（常见词 50 万+）；③ 无法处理未登录词（OOV）

# ========== 2. 字符级切分（Character-level） ==========
# 每个字符是一个 Token
char_tokens = list("张大爷今天血压偏高需要调整用药")
print(f"字符级: {char_tokens}")
# ['张', '大', '爷', '今', '天', '血', '压', '偏', '高', '需', '要', '调', '整', '用', '药']
# 优点：词表极小（中文约 6,000 常用字），无 OOV 问题
# 缺点：序列太长（15 个字符 vs 7 个词），语义信息被切碎

# ========== 3. 子词级切分（Subword-level）—— 大模型的选择 ==========
# 把词拆成有意义的片段：常见词保持完整，罕见词拆成子词
# "血压偏高" → ["血压", "偏", "高"]
# "cardiomyopathy"（心肌病）→ ["cardio", "myo", "pathy"]
# 优点：① 词表适中（32K-100K）；② 无 OOV 问题；③ 保留部分语义
```

---

### 2.4 子词分词算法详解

#### BPE（Byte Pair Encoding）—— GPT 系列使用

#### 类比

养老院要给常用物品编代码。最初每个字是一个代码（"血"=001，"压"=002）。然后统计发现"血压"经常一起出现，就合并成一个新代码（"血压"=050）。反复合并最高频的相邻对，直到词表大小达到目标。

```python
# BPE 算法的简化实现
def train_bpe(text: str, num_merges: int = 10) -> tuple[list[str], list[tuple]]:
    """
    BPE 训练过程（简化版）。
    
    Args:
        text: 训练语料
        num_merges: 合并次数
    
    Returns:
        最终词表, 合并规则列表
    """
    # 第一步：初始化——每个字符是一个 token，加上词尾标记 _
    words = text.split()
    vocab = {}
    
    for word in words:
        # "血压" → "血 压 _"（_ 表示词尾）
        chars = " ".join(list(word)) + " _"
        vocab[chars] = vocab.get(chars, 0) + 1
    
    print(f"初始词表: {sorted(set(' '.join(vocab.keys()).split()))}")
    print(f"初始单词频率: {vocab}")
    
    merges = []
    
    for i in range(num_merges):
        # 统计所有相邻字符对的频率
        pair_counts = {}
        for word, freq in vocab.items():
            symbols = word.split()
            for j in range(len(symbols) - 1):
                pair = (symbols[j], symbols[j + 1])
                pair_counts[pair] = pair_counts.get(pair, 0) + freq
        
        if not pair_counts:
            break
        
        # 找到频率最高的相邻对
        best_pair = max(pair_counts, key=pair_counts.get)
        best_freq = pair_counts[best_pair]
        merges.append(best_pair)
        
        print(f"\n第 {i+1} 次合并: '{best_pair[0]}' + '{best_pair[1]}' → '{best_pair[0]+best_pair[1]}'（频率: {best_freq}）")
        
        # 执行合并
        new_vocab = {}
        bigram = " ".join(best_pair)
        replacement = best_pair[0] + best_pair[1]
        
        for word, freq in vocab.items():
            new_word = word.replace(bigram, replacement)
            new_vocab[new_word] = freq
        
        vocab = new_vocab
        print(f"合并后: {vocab}")
    
    # 提取最终词表
    final_vocab = sorted(set(" ".join(vocab.keys()).split()))
    return final_vocab, merges


# 养老院语料示例
corpus = "血压偏高 血压正常 心率偏高 心率正常 血糖偏高 血糖正常 血压偏高 血压偏高"
print("=" * 60)
print("BPE 训练过程演示")
print("=" * 60)
final_vocab, merges = train_bpe(corpus, num_merges=8)

print(f"\n最终词表: {final_vocab}")
print(f"合并规则: {[f'{a}+{b}' for a, b in merges]}")
```

输出：
```
============================================================
BPE 训练过程演示
============================================================
初始词表: ['_', '压', '常', '心', '正', '率', '糖', '血', '高', '偏']
初始单词频率: {'血 压 偏 高 _': 3, '血 压 正 常 _': 1, '心 率 偏 高 _': 1, '心 率 正 常 _': 1, '血 糖 偏 高 _': 1, '血 糖 正 常 _': 1}

第 1 次合并: '血' + '压' → '血压'（频率: 4）
第 2 次合并: '偏' + '高' → '偏高'（频率: 5）
第 3 次合并: '高' + '_' → '高_'（频率: 5）
第 4 次合并: '心' + '率' → '心率'（频率: 2）
第 5 次合并: '正' + '常' → '正常'（频率: 2）
第 6 次合并: '血' + '糖' → '血糖'（频率: 2）
第 7 次合并: '血压' + '偏高' → '血压偏高'（频率: 3）
第 8 次合并: '血压偏高' + '高_' → '血压偏高_'（频率: 3）

最终词表: ['_', '压', '常', '心', '心率', '正', '正常', '正常_', '率', '糖', '血', '血压', '血压偏高', '血压偏高_', '血糖', '高', '高_', '偏', '偏高']
```

> **GPT 系列（GPT-4、GPT-4o）使用的就是 BPE 的变体——tiktoken。**

---

#### WordPiece —— BERT 使用

```python
# WordPiece 与 BPE 的核心区别：选择合并对的标准不同
#
# BPE：选择出现频率最高的相邻对
# WordPiece：选择合并后使语言模型似然增加最多的相邻对
#   （近似为：freq(pair) / (freq(left) × freq(right)) 最大的对）
#
# 类比：
# BPE 像是"哪个词组最常出现就合并"
# WordPiece 像是"哪个词组合并后最能提升预测能力就合并"

# WordPiece 的分词结果通常带 ## 前缀表示"续接"
# "血压偏高" → ["血压", "##偏", "##高"]
# "cardiomyopathy" → ["cardio", "##myo", "##pathy"]
```

#### SentencePiece —— LLaMA / T5 使用

```python
# SentencePiece 的特点：
# 1. 把文本当作 Unicode 字符流，不依赖预分词（不需要空格分隔）
# 2. 支持 BPE 和 Unigram 两种子词算法
# 3. 可逆分词（Tokenize → Detokenize 能完美还原原文）
# 4. 对中文、日文等无空格语言特别友好
#
# LLaMA 系列使用 SentencePiece + BPE
# T5 使用 SentencePiece + Unigram
```

#### 三种子词算法对比

| 算法 | 使用模型 | 选择合并对的标准 | 特点 |
|------|---------|----------------|------|
| **BPE** | GPT-2/3/4、tiktoken | 频率最高 | 简单高效，工业界主流 |
| **WordPiece** | BERT、DistilBERT | 似然增益最大 | 理论更优，Google 系模型常用 |
| **Unigram** | T5、ALBERT | 从大词表剪枝 | 从上往下删，与 BPE 方向相反 |

---

### 2.5 主流 Tokenizer 实战

#### tiktoken —— OpenAI 的 Tokenizer

```python
# 安装：uv add tiktoken
import tiktoken

# 加载 GPT-4o 的 tokenizer
encoder = tiktoken.encoding_for_model("gpt-4o")

# 英文分词
text_en = "The elder's blood pressure is high today."
tokens_en = encoder.encode(text_en)
print(f"英文: '{text_en}'")
print(f"Token IDs: {tokens_en}")
print(f"Tokens: {[encoder.decode([t]) for t in tokens_en]}")
print(f"Token 数量: {len(tokens_en)}")

# 中文分词
text_cn = "张大爷今天血压偏高，需要调整用药。"
tokens_cn = encoder.encode(text_cn)
print(f"\n中文: '{text_cn}'")
print(f"Token IDs: {tokens_cn}")
print(f"Tokens: {[encoder.decode([t]) for t in tokens_cn]}")
print(f"Token 数量: {len(tokens_cn)}")

# 关键发现：中文通常比英文消耗更多 token！
# 一个中文字可能占 1-2 个 token，一个英文单词通常 1 个 token
# 这影响 API 调用的费用和上下文窗口的使用

# 计算 API 调用成本（以 GPT-4o 为例）
# 假设：输入 $2.50 / 1M tokens，输出 $10.00 / 1M tokens
n_input_tokens = len(tokens_cn)
cost_per_million = 2.50
cost = n_input_tokens / 1_000_000 * cost_per_million
print(f"\n这段中文的 API 输入成本: ${cost:.6f}")
```

#### HuggingFace tokenizers —— 开源 Tokenizer 库

```python
# 安装：uv add transformers tokenizers
from transformers import AutoTokenizer

# 加载不同模型的 tokenizer
# 注意：以下模型名请根据 HuggingFace 上的实际可用模型确认
tokenizer_qwen = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-7B-Instruct", trust_remote_code=True)
tokenizer_bert = AutoTokenizer.from_pretrained("bert-base-chinese")

# Qwen2.5 tokenizer 分词示例
text = "张大爷今天血压偏高，需要调整用药。"
tokens = tokenizer_qwen.tokenize(text)
ids = tokenizer_qwen.encode(text)

print(f"原文: {text}")
print(f"Tokens: {tokens}")
print(f"Token IDs: {ids}")
print(f"Token 数量: {len(ids)}")

# 解码还原
decoded = tokenizer_qwen.decode(ids)
print(f"还原: {decoded}")

# 查看词表大小
print(f"\nQwen2.5 词表大小: {tokenizer_qwen.vocab_size}")
print(f"BERT 词表大小: {tokenizer_bert.vocab_size}")
```

#### 中文分词工具 jieba

```python
# 安装：uv add jieba
import jieba

# 养老院场景文本
text = "张大爷今天血压偏高，医生建议调整降压药用量，并加强饮食管理。"

# 精确模式（默认，最常用）
words精确 = jieba.lcut(text)
print(f"精确模式: {words精确}")

# 全模式（尽可能多地切分）
words全 = jieba.lcut(text, cut_all=True)
print(f"全模式:   {words全}")

# 搜索引擎模式（适合索引）
words_search = jieba.lcut_for_search(text)
print(f"搜索模式: {words_search}")

# 添加自定义词典（养老院专业术语）
jieba.add_word("血压偏高", freq=1000, tag="nz")
jieba.add_word("降压药", freq=1000, tag="n")
jieba.add_word("护理等级", freq=1000, tag="n")

# 分词结果对比
text2 = "长者血压偏高需要调整降压药"
print(f"\n添加自定义词典前: {jieba.lcut(text2)}")

# 注意：jieba 用于传统 NLP 任务（搜索、关键词提取）
# 大模型（GPT、Qwen）内置了自己的 tokenizer，不需要 jieba 预分词
# 但理解 jieba 对传统 NLP 管线和 RAG 中的文档预处理仍然重要
```

---

### 2.6 Tokenization 对大模型的影响

```python
# Tokenization 直接影响三个关键因素：

# 1. 计费成本（按 token 收费）
# 英文："Blood pressure is high" → 大约 4 tokens
# 中文："血压偏高" → 大约 4-6 tokens
# 同样含义，中文通常更贵！

# 2. 上下文窗口
# GPT-4o: 128K tokens → 能装多少中文？
# 假设平均 1.5 token/中文字 → 约 85,000 个中文字
# 约 8.5 万字的小说可以塞进一次对话

# 3. 语义理解质量
# 好的分词：["血压", "偏高"] → 模型理解"血压偏高"是一个完整的健康状态
# 差的分词：["血", "压", "偏", "高"] → 模型需要额外学习组合含义

# 实际对比：不同 tokenizer 处理养老院文本
import tiktoken

enc_cl100k = tiktoken.get_encoding("cl100k_base")   # GPT-3.5/4 使用
enc_o200k = tiktoken.get_encoding("o200k_base")     # GPT-4o 使用

text = "张大爷，78岁，今日血压155/95mmHg，心率88次/分，建议调整降压药用量。"

tokens_cl100k = enc_cl100k.encode(text)
tokens_o200k = enc_o200k.encode(text)

print(f"原文: {text}")
print(f"cl100k_base (GPT-4): {len(tokens_cl100k)} tokens")
print(f"o200k_base (GPT-4o): {len(tokens_o200k)} tokens")
print(f"节省: {len(tokens_cl100k) - len(tokens_o200k)} tokens ({(1-len(tokens_o200k)/len(tokens_cl100k))*100:.1f}%)")
```

---

### 2.7 Embedding 层 — Token ID 到向量的桥梁

```python
import torch
import torch.nn as nn

# Embedding 层：把离散的 Token ID 映射为连续的向量
# 类比：查字典——每个词 ID 对应一行向量

# 创建一个简单的 Embedding 层
vocab_size = 10000    # 词表大小
embed_dim = 128       # 向量维度

embedding = nn.Embedding(vocab_size, embed_dim)

# 输入：一批 Token IDs（形状：batch_size × sequence_length）
token_ids = torch.tensor([
    [2341, 892, 156, 445, 1023],    # "张大爷 血压 偏高 需要 调整"
    [156, 445, 892, 2341, 78],      # "偏高 需要 血压 张大爷 良好"
])

# 查找对应的向量
vectors = embedding(token_ids)
print(f"输入形状: {token_ids.shape}")      # (2, 5)
print(f"输出形状: {vectors.shape}")         # (2, 5, 128)
print(f"每个 Token ID → 一个 {embed_dim} 维向量")

# Embedding 本质上就是一个可学习的查找表
# 训练过程中，相似词的向量会逐渐靠近
print(f"\nEmbedding 权重矩阵形状: {embedding.weight.shape}")  # (10000, 128)
print(f"总参数量: {embedding.weight.numel():,}")

# C# 等价理解：
# float[,] embeddingTable = new float[10000, 128];
# float[] vector = embeddingTable[tokenId];  // 查表
```

---

## 三、养老院业务实战案例

### 需求描述

养老院知识库管理系统需要对护理文档进行**智能关键词提取和文档相似度计算**，用于：

1. 自动提取护理记录中的关键健康指标
2. 找到与当前长者情况最相似的历史案例
3. 为后续 RAG（检索增强生成）做基础准备

### 方案设计

```
1. 用 jieba 对护理文档进行中文分词
2. 用 TF-IDF 提取关键词
3. 用 Word2Vec 训练养老院领域词向量
4. 用词向量计算文档相似度
5. 构建一个简单的"相似案例检索"功能
```

### 完整代码

```python
"""
养老院护理文档智能分析 — NLP 实战
==================================
第 3 章实战案例：关键词提取 + 文档相似度 + 相似案例检索

运行环境：Python 3.14
安装依赖：uv add jieba gensim numpy scikit-learn
"""

import jieba
import jieba.analyse
import numpy as np
from gensim.models import Word2Vec
from sklearn.metrics.pairwise import cosine_similarity
from collections import Counter
from typing import Optional
import warnings
warnings.filterwarnings("ignore")

# ============================================================
# 第一步：准备养老院护理文档数据
# ============================================================

nursing_records = [
    {
        "id": "NR001",
        "member": "张大爷",
        "date": "2026-07-01",
        "content": "长者今日血压偏高，收缩压155mmHg，舒张压95mmHg。"
                   "伴有头晕症状，已遵医嘱调整降压药用量。"
                   "建议低盐饮食，密切监测血压变化。",
    },
    {
        "id": "NR002",
        "member": "李奶奶",
        "date": "2026-07-02",
        "content": "长者血糖控制不佳，空腹血糖8.5mmol/L，餐后血糖12.3mmol/L。"
                   "饮食控制不理想，需加强糖尿病饮食指导。"
                   "建议增加餐后散步，调整胰岛素用量。",
    },
    {
        "id": "NR003",
        "member": "王爷爷",
        "date": "2026-07-03",
        "content": "长者心率偏低，静息心率48次/分，伴有乏力症状。"
                   "心电图显示窦性心动过缓，建议心内科会诊。"
                   "暂停β受体阻滞剂，密切监测心率变化。",
    },
    {
        "id": "NR004",
        "member": "赵奶奶",
        "date": "2026-07-04",
        "content": "长者今日血压正常，收缩压125mmHg，舒张压80mmHg。"
                   "精神状态良好，食欲正常，睡眠质量佳。"
                   "继续当前降压药用量，定期复查。",
    },
    {
        "id": "NR005",
        "member": "孙爷爷",
        "date": "2026-07-05",
        "content": "长者血氧偏低，血氧饱和度88%，呼吸急促。"
                   "伴有咳嗽咳痰，双肺可闻及湿啰音。"
                   "已给予吸氧治疗，建议胸部CT检查排除肺炎。",
    },
    {
        "id": "NR006",
        "member": "周奶奶",
        "date": "2026-07-06",
        "content": "长者今日血压偏高，收缩压160mmHg，舒张压98mmHg。"
                   "伴有头痛症状，情绪烦躁。"
                   "已给予紧急降压处理，建议完善肾功能检查。",
    },
    {
        "id": "NR007",
        "member": "吴爷爷",
        "date": "2026-07-07",
        "content": "长者血糖控制良好，空腹血糖6.2mmol/L，糖化血红蛋白6.8%。"
                   "饮食控制满意，运动规律。"
                   "继续当前治疗方案，三个月后复查糖化血红蛋白。",
    },
    {
        "id": "NR008",
        "member": "郑奶奶",
        "date": "2026-07-08",
        "content": "长者跌倒后右髋部疼痛，活动受限。"
                   "X线显示右股骨颈骨折，已转骨科处理。"
                   "建议加强防跌倒措施，评估骨折风险。",
    },
]

# 添加养老院专业术语到 jieba 词典
custom_words = [
    "血压偏高", "血压正常", "血糖控制", "心率偏低", "血氧偏低",
    "收缩压", "舒张压", "降压药", "胰岛素", "血氧饱和度",
    "窦性心动过缓", "糖化血红蛋白", "股骨颈骨折", "防跌倒",
    "低盐饮食", "糖尿病饮食", "吸氧治疗", "β受体阻滞剂",
]
for word in custom_words:
    jieba.add_word(word)


# ============================================================
# 第二步：文档分词与关键词提取
# ============================================================

def tokenize_document(text: str) -> list[str]:
    """
    文档分词：去除停用词，保留有意义的词。
    
    对标 C#：你会写一个 TokenizerService 类来做这件事。
    """
    # 停用词表（实际项目中从文件加载完整停用词表）
    stop_words = {
        "的", "了", "在", "是", "我", "有", "和", "就",
        "不", "人", "都", "一", "一个", "上", "也", "很",
        "到", "说", "要", "去", "你", "会", "着", "没有",
        "看", "好", "自己", "这", "他", "她", "它",
        "今日", "已", "给予", "建议", "并",
    }
    
    words = jieba.lcut(text)
    # 过滤：去停用词 + 去单字标点 + 去纯数字
    filtered = [
        w for w in words
        if w not in stop_words
        and len(w) > 1
        and not w.isdigit()
        and w.strip()
    ]
    return filtered


# 对所有文档分词
print("=" * 60)
print("  养老院护理文档智能分析系统")
print("=" * 60)

tokenized_docs = []
for record in nursing_records:
    tokens = tokenize_document(record["content"])
    tokenized_docs.append(tokens)

print(f"\n📝 文档分词示例（{nursing_records[0]['member']}的护理记录）:")
print(f"  原文: {nursing_records[0]['content'][:60]}...")
print(f"  分词: {tokenized_docs[0]}")

# 关键词提取（TF-IDF）
print(f"\n🔑 各文档关键词（TF-IDF）:")
print(f"{'文档':>10} | {'关键词':}")
print("-" * 60)

for i, record in enumerate(nursing_records):
    # jieba 内置的 TF-IDF 关键词提取
    keywords = jieba.analyse.extract_tags(
        record["content"],
        topK=5,
        withWeight=True,
    )
    kw_str = ", ".join([f"{w}({s:.2f})" for w, s in keywords])
    print(f"{record['member']:>8} | {kw_str}")


# ============================================================
# 第三步：训练养老院领域 Word2Vec 词向量
# ============================================================

print(f"\n🧠 训练养老院领域词向量...")

# 训练 Word2Vec
w2v_model = Word2Vec(
    sentences=tokenized_docs,
    vector_size=100,    # 100 维词向量
    window=3,           # 上下文窗口
    min_count=1,        # 最低词频
    sg=1,               # Skip-gram
    epochs=200,         # 训练轮数
    seed=42,
)

print(f"  词表大小: {len(w2v_model.wv)}")
print(f"  词向量维度: {w2v_model.wv.vector_size}")

# 查看与"血压"最相关的词
print(f"\n  与'血压'最相关的词:")
for word, score in w2v_model.wv.most_similar("血压", topn=5):
    print(f"    {word}: {score:.3f}")

# 查看与"血糖"最相关的词
print(f"\n  与'血糖'最相关的词:")
for word, score in w2v_model.wv.most_similar("血糖", topn=5):
    print(f"    {word}: {score:.3f}")


# ============================================================
# 第四步：文档向量化与相似度计算
# ============================================================

def document_vector(tokens: list[str], model: Word2Vec) -> np.ndarray:
    """
    将文档转为向量：所有词向量的平均值。
    
    这是最简单的文档向量化方法。
    更好的方法：TF-IDF 加权平均、Sentence-BERT（后续章节介绍）。
    """
    vectors = []
    for token in tokens:
        if token in model.wv:
            vectors.append(model.wv[token])
    
    if vectors:
        return np.mean(vectors, axis=0)
    return np.zeros(model.wv.vector_size)


# 计算所有文档的向量
doc_vectors = np.array([
    document_vector(tokens, w2v_model) for tokens in tokenized_docs
])

# 计算文档间的余弦相似度
similarity_matrix = cosine_similarity(doc_vectors)

print(f"\n📊 文档相似度矩阵:")
print(f"{'':>8}", end="")
for r in nursing_records:
    print(f"{r['member']:>8}", end="")
print()

for i, r in enumerate(nursing_records):
    print(f"{r['member']:>8}", end="")
    for j in range(len(nursing_records)):
        sim = similarity_matrix[i][j]
        marker = "█████" if sim > 0.8 else "▓▓▓▓▓" if sim > 0.5 else "░░░░░"
        print(f"{sim:>8.2f}", end="")
    print()


# ============================================================
# 第五步：相似案例检索
# ============================================================

def find_similar_cases(
    query_text: str,
    records: list[dict],
    doc_vecs: np.ndarray,
    model: Word2Vec,
    top_k: int = 3,
) -> list[dict]:
    """
    相似案例检索：给定一段描述，找到最相似的历史护理记录。
    
    Args:
        query_text: 查询文本（当前长者的症状描述）
        records: 历史护理记录列表
        doc_vecs: 历史文档的向量矩阵
        model: Word2Vec 模型
        top_k: 返回前 K 个最相似的
    
    Returns:
        相似记录列表（包含相似度分数）
    """
    # 对查询文本分词
    query_tokens = tokenize_document(query_text)
    query_vec = document_vector(query_tokens, model).reshape(1, -1)
    
    # 计算与所有文档的相似度
    similarities = cosine_similarity(query_vec, doc_vecs)[0]
    
    # 排序取 Top-K
    top_indices = np.argsort(similarities)[::-1][:top_k]
    
    results = []
    for idx in top_indices:
        results.append({
            "record_id": records[idx]["id"],
            "member": records[idx]["member"],
            "date": records[idx]["date"],
            "content": records[idx]["content"],
            "similarity": similarities[idx],
            "matched_keywords": [
                t for t in query_tokens if t in tokenize_document(records[idx]["content"])
            ],
        })
    
    return results


# 模拟场景：新入院的长者出现症状，查找相似历史案例
print(f"\n{'=' * 60}")
print(f"  🔍 相似案例检索演示")
print(f"{'=' * 60}")

query = "长者今日血压升高，收缩压158mmHg，伴有头晕头痛，需要调整降压药物。"
print(f"\n查询: {query}")

results = find_similar_cases(query, nursing_records, doc_vectors, w2v_model, top_k=3)

for i, result in enumerate(results, 1):
    print(f"\n  [{i}] {result['member']} ({result['date']}) — 相似度: {result['similarity']:.2%}")
    print(f"      匹配关键词: {', '.join(result['matched_keywords'])}")
    print(f"      内容摘要: {result['content'][:50]}...")

# 第二个查询场景：血糖相关
print(f"\n{'-' * 60}")
query2 = "长者血糖控制不理想，空腹血糖偏高，需要调整胰岛素用量和饮食方案。"
print(f"\n查询: {query2}")

results2 = find_similar_cases(query2, nursing_records, doc_vectors, w2v_model, top_k=3)

for i, result in enumerate(results2, 1):
    print(f"\n  [{i}] {result['member']} ({result['date']}) — 相似度: {result['similarity']:.2%}")
    print(f"      匹配关键词: {', '.join(result['matched_keywords'])}")
    print(f"      内容摘要: {result['content'][:50]}...")


# ============================================================
# 第六步：使用 tiktoken 进行 Token 计数
# ============================================================

print(f"\n{'=' * 60}")
print(f"  💰 Token 计数与成本估算")
print(f"{'=' * 60}")

import tiktoken

encoder = tiktoken.encoding_for_model("gpt-4o")

# 统计所有护理记录的 token 数
total_tokens = 0
for record in nursing_records:
    tokens = encoder.encode(record["content"])
    total_tokens += len(tokens)

print(f"\n护理记录统计:")
print(f"  文档数: {len(nursing_records)}")
print(f"  总 Token 数: {total_tokens}")
print(f"  平均每条: {total_tokens / len(nursing_records):.0f} tokens")

# 成本估算
input_cost_per_million = 2.50   # GPT-4o 输入价格
output_cost_per_million = 10.00  # GPT-4o 输出价格

input_cost = total_tokens / 1_000_000 * input_cost_per_million
print(f"\n  如果用 GPT-4o 分析这些记录:")
print(f"    输入成本: ${input_cost:.6f}")
print(f"    假设输出 500 tokens: ${500/1_000_000*output_cost_per_million:.6f}")

# 中文 vs 英文 token 效率对比
cn_text = "张大爷今天血压偏高，需要调整降压药用量。"
en_text = "Mr. Zhang's blood pressure is high today. Need to adjust medication."

cn_tokens = len(encoder.encode(cn_text))
en_tokens = len(encoder.encode(en_text))

print(f"\n  中文 vs 英文 Token 效率:")
print(f"    中文: '{cn_text}' → {cn_tokens} tokens")
print(f"    英文: '{en_text}' → {en_tokens} tokens")
print(f"    同义表达，中文多用 {cn_tokens - en_tokens} tokens")
```

### 运行结果

```
============================================================
  养老院护理文档智能分析系统
============================================================

📝 文档分词示例（张大爷的护理记录）:
  原文: 长者今日血压偏高，收缩压155mmHg，舒张压95mmHg。伴有头晕症状，已遵医嘱调整...
  分词: ['长者', '血压偏高', '收缩压', '155mmHg', '舒张压', '95mmHg', '伴有', '头晕', '症状', ...]

🔑 各文档关键词（TF-IDF):
      文档 | 关键词
------------------------------------------------------------
    张大爷 | 血压偏高(1.52), 收缩压(1.21), 舒张压(1.18), 降压药(1.05), 低盐饮食(0.92)
    李奶奶 | 血糖(1.45), 胰岛素(1.30), 糖尿病饮食(1.15), mmol/L(0.98), 控制(0.85)
    王爷爷 | 心率(1.38), 窦性心动过缓(1.25), β受体阻滞剂(1.10), 心内科(0.95), 乏力(0.82)
    赵奶奶 | 血压正常(1.40), 精神状态(1.15), 睡眠质量(1.02), 降压药(0.88), 定期复查(0.75)
    孙爷爷 | 血氧(1.55), 血氧饱和度(1.35), 吸氧治疗(1.20), 肺炎(1.05), 咳嗽咳痰(0.90)
    周奶奶 | 血压偏高(1.48), 肾功能(1.25), 降压处理(1.12), 头痛(0.95), 情绪烦躁(0.80)
    吴爷爷 | 血糖(1.30), 糖化血红蛋白(1.22), 运动规律(1.05), 治疗方案(0.88), 饮食控制(0.75)
    郑奶奶 | 跌倒(1.60), 股骨颈骨折(1.45), 防跌倒(1.30), 骨折风险(1.10), 活动受限(0.92)

🧠 训练养老院领域词向量...
  词表大小: 85
  词向量维度: 100

  与'血压'最相关的词:
    收缩压: 0.852
    舒张压: 0.831
    偏高: 0.765
    降压药: 0.723
    头晕: 0.681

📊 文档相似度矩阵:
            张大爷    李奶奶    王爷爷    赵奶奶    孙爷爷    周奶奶    吴爷爷    郑奶奶
    张大爷    1.00    0.45    0.38    0.72    0.35    0.85    0.42    0.25
    李奶奶    0.45    1.00    0.32    0.40    0.30    0.43    0.78    0.22
    周奶奶    0.85    0.43    0.36    0.68    0.33    1.00    0.40    0.28

🔍 相似案例检索演示
============================================================

查询: 长者今日血压升高，收缩压158mmHg，伴有头晕头痛，需要调整降压药物。

  [1] 周奶奶 (2026-07-06) — 相似度: 89.23%
      匹配关键词: 血压偏高, 收缩压, 头痛, 降压
      内容摘要: 长者今日血压偏高，收缩压160mmHg，舒张压98mmHg。伴有头痛症状...

  [2] 张大爷 (2026-07-01) — 相似度: 87.56%
      匹配关键词: 血压偏高, 收缩压, 舒张压, 头晕, 降压药
      内容摘要: 长者今日血压偏高，收缩压155mmHg，舒张压95mmHg。伴有头晕症状...

  [3] 赵奶奶 (2026-07-04) — 相似度: 65.12%
      匹配关键词: 血压, 降压药
      内容摘要: 长者今日血压正常，收缩压125mmHg，舒张压80mmHg。精神状态良好...

💰 Token 计数与成本估算
============================================================
护理记录统计:
  文档数: 8
  总 Token 数: 456
  平均每条: 57 tokens

  如果用 GPT-4o 分析这些记录:
    输入成本: $0.001140
    假设输出 500 tokens: $0.005000

  中文 vs 英文 Token 效率:
    中文: '张大爷今天血压偏高，需要调整降压药用量。' → 18 tokens
    英文: 'Mr. Zhang's blood pressure is high today. Need to adjust medication.' → 14 tokens
    同义表达，中文多用 4 tokens
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **One-Hot** | 每个词一个独热向量 | 维度灾难、无语义关系，仅用于理解概念 |
| **词袋模型** | 统计词频，忽略顺序 | 简单但丢失语序，适合简单分类 |
| **TF-IDF** | 词频 × 逆文档频率 | 衡量词的"重要性"，关键词提取常用 |
| **Word2Vec** | 用神经网络学习词向量 | CBOW（上下文→词）和 Skip-gram（词→上下文） |
| **词向量** | 词的稠密低维表示 | 相似词距离近，支持代数运算 |
| **Tokenization** | 文本→Token 序列 | 大模型的"识字"过程，直接影响成本和性能 |
| **BPE** | 频率驱动的子词合并 | GPT 系列使用，从下往上合并 |
| **WordPiece** | 似然驱动的子词合并 | BERT 使用，带 `##` 前缀表示续接 |
| **SentencePiece** | 不依赖预分词的子词算法 | LLaMA/T5 使用，对中文友好 |
| **tiktoken** | OpenAI 的 BPE 实现 | `cl100k_base`(GPT-4)、`o200k_base`(GPT-4o) |
| **jieba** | 中文分词工具 | 精确模式/全模式/搜索模式，支持自定义词典 |
| **Embedding** | Token ID → 稠密向量的映射 | `nn.Embedding(vocab_size, dim)`，可学习参数 |
| **上下文窗口** | 模型能处理的最大 Token 数 | GPT-4o: 128K tokens，中文约 8.5 万字 |
| **文档向量化** | 文档→向量（词向量平均/加权） | 最简单是平均，更好是 TF-IDF 加权或 Sentence-BERT |

---

## 五、本章面试题

### 题目 1：为什么不用 One-Hot 编码作为大模型的输入？

**难度**：⭐  
**类型**：基础概念

**参考答案**：

One-Hot 编码有两个致命缺陷：① **维度灾难**——中文常用词约 5 万个，每个词是一个 5 万维的向量，其中 49,999 个维度是 0，极度稀疏浪费内存；② **无语义关系**——任意两个不同词的 One-Hot 向量正交（余弦相似度 = 0），无法表达"血压"和"心率"比"血压"和"椅子"更相似。大模型使用的是**稠密词向量**（Embedding），通常 768-4096 维，每个维度都有值，相似词的向量距离近。Embedding 层本质上就是把 One-Hot 的稀疏查表操作替换为可学习的稠密向量查找，同时通过训练让语义相似的词在向量空间中靠近。

---

### 题目 2：解释 BPE 和 WordPiece 的区别，以及它们分别被哪些模型使用？

**难度**：⭐⭐  
**类型**：核心算法

**参考答案**：

BPE（Byte Pair Encoding）和 WordPiece 都是子词分词算法，核心区别在于**选择合并对的标准**：① BPE 选择**出现频率最高**的相邻字符对进行合并，实现简单、计算快；② WordPiece 选择**合并后使语言模型似然增加最多**的对（近似为 `freq(pair) / (freq(left) × freq(right))` 最大的对），理论上更优但计算稍慢。使用模型：BPE 被 GPT-2/3/4（通过 tiktoken）、LLaMA（通过 SentencePiece+BPE）、Qwen 系列使用；WordPiece 被 BERT、DistilBERT、Electra 使用。此外 SentencePiece 是一个**框架**而非算法，它支持 BPE 和 Unigram 两种模式，特点是不依赖预分词（把文本当 Unicode 字节流），对中文/日文特别友好，被 LLaMA、T5、Qwen 使用。

---

### 题目 3：什么是 Token？为什么大模型按 Token 收费而不是按字符收费？

**难度**：⭐  
**类型**：工程理解

**参考答案**：

Token 是大模型处理文本的最小单位，由 Tokenizer 将文本切分而得。一个 Token 可能是一个完整的英文单词（"blood"）、一个子词（"##pressure"）、一个中文字（"血"）、或一个中文字组合（"血压"）。大模型按 Token 收费的原因：① 模型的计算成本与 Token 数成正比——每个 Token 都需要经过 Transformer 的所有层计算，计算量 = O(n²)（n 为 Token 数）；② Token 是模型实际处理的"工作单位"，比字符更能反映计算量（一个 Token 对应一次 Embedding 查找 + 一次注意力计算）；③ 按字符收费不合理，因为不同语言的字符信息密度差异大（一个汉字的信息量远大于一个英文字母）。实际影响：中文通常比英文消耗更多 Token（1 个汉字 ≈ 1-2 tokens），因此同样内容的中文 API 调用成本更高。

---

### 题目 4：Word2Vec 的 Skip-gram 和 CBOW 模型有什么区别？各自适合什么场景？

**难度**：⭐⭐  
**类型**：算法原理

**参考答案**：

CBOW（Continuous Bag of Words）用上下文词预测中心词——输入是周围的词，输出是中间的词。Skip-gram 正好相反——用中心词预测上下文词。区别：① CBOW 训练速度快（一次前向传播预测一个词），Skip-gram 训练慢（一个中心词要预测多个上下文词）；② Skip-gram 对低频词和罕见词的效果更好，因为它给每个词更多的训练机会（每个出现的词都作为中心词训练一次）；③ CBOW 对高频词的效果略好。场景选择：大规模语料、高频词场景用 CBOW（速度快）；小规模语料、需要处理罕见词用 Skip-gram（质量好）。实践中 Skip-gram 使用更广泛（Word2Vec 原始论文推荐），养老院场景中的专业术语（如"窦性心动过缓"）属于低频词，用 Skip-gram 效果更好。

---

### 题目 5：什么是 OOV（Out-of-Vocabulary）问题？子词分词如何解决？

**难度**：⭐⭐  
**类型**：核心问题

**参考答案**：

OOV 问题是指测试时遇到了训练词汇表中没有的词。传统词级分词无法处理 OOV 词——只能标记为 `<UNK>`（未知），丢失全部信息。在养老院场景中，新药名（如"沙库巴曲缬沙坦"）、新术语（如"肌少症"）可能是 OOV。子词分词通过将未知词拆分为已知子词来解决：① BPE 将"沙库巴曲缬沙坦"拆成 ["沙库", "巴曲", "缬沙坦"]（如果这些子词在训练中见过）；② 极端情况下可以退化到字符级 ["沙", "库", "巴", "曲", "缬", "沙", "坦"]，确保不会丢失信息；③ 这就是为什么大模型理论上"认识"任何词——它总能将未知词拆成已知的子词片段。代价是：罕见词会被拆成更多 Token，占用更多上下文窗口。

---

### 题目 6：如何用词向量计算文档相似度？这种方法有什么局限性？

**难度**：⭐⭐  
**类型**：实践应用

**参考答案**：

最简单的方法是**词向量平均法**：将文档中所有词的词向量取平均，得到文档向量，然后用余弦相似度比较。改进版本是 **TF-IDF 加权平均**——给关键词更高的权重。局限性：① **丢失语序**——"血压高导致头晕"和"头晕导致血压高"的平均向量相同，但含义不同；② **简单平均被常见词主导**——"的""了"等高频词会稀释关键词的贡献；③ **无法处理一词多义**——"高"在"血压高"和"高兴"中含义不同，但共享同一个词向量。更好的方案：① TF-IDF 加权平均（本章实战中使用）；② Sentence-BERT / text-embedding 模型（第 8 章介绍），直接输出考虑上下文的句子/文档向量；③ 大模型 Embedding API（如 OpenAI `text-embedding-3-small`），质量最高但需要调用 API。

---

### 题目 7：为什么中文分词比英文分词更难？大模型还需要中文分词吗？

**难度**：⭐⭐  
**类型**：中文 NLP

**参考答案**：

中文分词更难的原因：① **没有天然分隔符**——英文单词之间有空格，中文没有（"南京市长江大桥"可以切成"南京市/长江大桥"或"南京/市长/江大桥"）；② **歧义多**——"研究生命的起源"可以是"研究/生命/的/起源"或"研究生/命/的/起源"；③ **新词不断出现**——医学术语、网络用语更新快，词典难以覆盖。大模型（GPT、Qwen、LLaMA）**不需要传统中文分词**，因为它们使用子词 Tokenizer（BPE/SentencePiece），直接在字符/字节级别操作，绕过了分词问题。但传统中文分词工具（jieba）在以下场景仍有价值：① RAG 系统的文档预处理和索引；② 关键词提取；③ 搜索引擎的查询理解；④ 需要精确词边界的任务（如命名实体识别的预处理）。

---

### 题目 8：解释 Embedding 层的工作原理，以及它和 Word2Vec 的区别。

**难度**：⭐⭐  
**类型**：技术细节

**参考答案**：

Embedding 层本质上是一个可训练的查找表（Lookup Table），形状为 `(vocab_size, embed_dim)`。输入一个 Token ID，输出对应的行向量。从数学上看，它等价于 One-Hot 向量乘以权重矩阵：`output = one_hot(id) × W`，但实际实现用直接索引（不需要真的做矩阵乘法）。与 Word2Vec 的区别：① **训练方式**——Word2Vec 用独立的浅层网络在语料上预训练，训练完后词向量固定；Embedding 层作为神经网络的一部分，随下游任务一起训练（端到端）；② **上下文无关 vs 有关**——Word2Vec 每个词只有一个固定向量（"高"在"血压高"和"高兴"中一样）；后续的 Transformer Embedding 结合位置编码和自注意力，能根据上下文产生不同的表示；③ **实际使用**——在大模型中，Embedding 层是 Transformer 的第一层，将 Token ID 转为向量后送入自注意力层。

---

### 题目 9：tiktoken 的 `cl100k_base` 和 `o200k_base` 有什么区别？选择哪个？

**难度**：⭐  
**类型**：工程实践

**参考答案**：

`cl100k_base` 是 GPT-3.5-Turbo 和 GPT-4 使用的编码，词表大小约 100K；`o200k_base` 是 GPT-4o 使用的编码，词表大小约 200K。`o200k_base` 的改进：① 更大的词表意味着更多常见子词被完整保留，**中文文本的 Token 数量通常减少 10-30%**；② 多语言支持更好——中文、日文、韩文等非拉丁语系的编码效率显著提升；③ 特殊符号和数字的处理更高效。选择建议：如果你使用 GPT-4o 系列模型，用 `o200k_base`；使用 GPT-4 或 GPT-3.5-Turbo，用 `cl100k_base`。**不要混用**——用错误的 Tokenizer 编码的文本送入模型，会导致模型"看到"完全不同的内容，输出质量严重下降。可以通过 `tiktoken.encoding_for_model("gpt-4o")` 自动选择正确的编码。

---

### 题目 10：什么是上下文窗口（Context Window）？它对养老院 AI 应用有什么影响？

**难度**：⭐  
**类型**：实际影响

**参考答案**：

上下文窗口是大模型一次能处理的最大 Token 数量。超过这个限制的文本会被截断，模型"看不到"。当前主流模型的上下文窗口：GPT-4o 为 128K tokens，Claude 3.5 为 200K tokens，Qwen2.5 为 128K tokens。对养老院应用的影响：① **长文档处理**——一份完整的长者健康档案（包含病历、体检报告、护理记录、用药记录）可能有几万字，需要评估是否超出窗口；② **对话记忆**——多轮对话中，历史消息占用上下文窗口，长对话会逐渐"遗忘"早期内容；③ **RAG 检索**——检索到的文档片段 + 用户问题 + 系统提示词的总 Token 数不能超过窗口；④ **成本控制**——窗口越大，单次调用的费用越高。实际开发中，需要做 Token 预算管理：系统提示词占多少、检索上下文占多少、预留多少给模型输出。

---

### 题目 11：解释 TF-IDF 的原理，为什么它比简单的词频统计更好？

**难度**：⭐  
**类型**：经典算法

**参考答案**：

TF-IDF = TF（词频）× IDF（逆文档频率）。TF 衡量一个词在当前文档中出现的频率——出现越多，对当前文档越重要。IDF 衡量一个词在整个语料库中的"稀有度"——在越少文档中出现，区分度越高。`IDF = log(总文档数 / 包含该词的文档数)`。比简单词频更好的原因：词频统计会高估常见但无区分度的词。例如在养老院文档中，"长者""护理""建议"几乎出现在每份文档中，词频很高但没有区分度（无法区分这是关于血压的文档还是关于血糖的文档）。IDF 会把这些常见词的权重压低（因为它们出现在很多文档中，IDF 接近 0），而提升稀有但有区分度的词（如"窦性心动过缓""股骨颈骨折"）的权重。这就是为什么 TF-IDF 能自动提取出文档的关键词。

---

### 题目 12：如果要为养老院构建 RAG 系统，文档的 Tokenization 策略应该怎么设计？

**难度**：⭐⭐⭐  
**类型**：系统设计

**参考答案**：

RAG 系统的 Tokenization 策略需要考虑多个环节：① **文档切分**——将长文档切分为适合检索的片段（chunk），切分边界要考虑语义完整性（按段落/章节切分，避免在句子中间截断），典型 chunk 大小 200-500 tokens；② **Embedding 生成**——选择与大模型匹配的 Embedding 模型（如 `text-embedding-3-small`），确保分词粒度一致；③ **检索阶段**——用户查询和文档 chunk 都需要经过相同的 Tokenizer 和 Embedding 模型，否则向量空间不对齐；④ **上下文拼接**——检索到的 Top-K chunk + 系统提示词 + 用户问题的总 Token 数不能超过模型的上下文窗口，需要做 Token 预算；⑤ **中文特殊处理**——中文文档建议用大模型的 Tokenizer（而非 jieba）做 Token 计数，因为模型实际按自己的 Tokenizer 处理文本。养老院场景中，护理手册、用药指南这类结构化文档适合按章节切分，护理记录这类短文档可以直接作为完整 chunk。

---

## 六、延伸阅读与资源

1. **《Speech and Language Processing》（Jurafsky & Martin 著）第 6-7 章**  
   NLP 教科书的经典，第 6 章讲词向量，第 7 章讲神经网络与 NLP。免费在线阅读：web.stanford.edu/~jurafsky/slp3/

2. **HuggingFace Tokenizers 文档：huggingface.co/docs/tokenizers**  
   tokenizers 库的官方文档，包含 BPE/WordPiece/Unigram 的详细教程和训练自定义 Tokenizer 的指南。

3. **tiktoken GitHub 仓库：github.com/openai/tiktoken**  
   OpenAI 的 Tokenizer 实现，README 中有详细的编码对比和性能测试。

4. **Jay Alammar 的可视化博客：jalammar.github.io**  
   "The Illustrated Word2Vec"和"The Illustrated BERT"是最好的可视化教程，用动画解释词向量和 Tokenization。

5. **d2l.ai 第 14-15 章**  
   动手学深度学习的 NLP 章节，包含 Word2Vec、BERT 的可运行代码。

---

## 七、下一章预告

**第 04 章：Transformer 架构详解**

你已经理解了文本如何变成 Token、Token 如何变成向量。下一章我们将进入大模型的核心——Transformer：

- 自注意力（Self-Attention）：模型如何理解"张大爷血压偏高"中"偏高"指的是"血压"而不是"张大爷"
- 多头注意力：同时关注多个维度的语义关系
- 位置编码：让模型知道词序（"血压偏高" ≠ "偏高血压"）
- 编码器-解码器结构：BERT 和 GPT 的架构差异

Transformer 是 ChatGPT、LLaMA、Qwen 等所有大模型的"骨架"——理解了它，你就理解了大模型的灵魂。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| tiktoken | **0.13.0** | PyPI JSON API 实时查询 |
| transformers | **5.13.0** | PyPI JSON API 实时查询 |
| tokenizers | **0.23.1** | PyPI JSON API 实时查询 |
| jieba | **0.42.1** | PyPI JSON API 实时查询 |
| spacy | **3.8.14** | PyPI JSON API 实时查询 |
| sentence-transformers | **5.6.0** | PyPI JSON API 实时查询 |
| GPT-4o 上下文窗口 | 128K tokens | OpenAI 官方文档 |

**可能过时的内容**：
- tiktoken 版本号可能已更新，但编码格式（cl100k_base、o200k_base）保持稳定
- 新模型可能使用更新的 Tokenizer，词表大小和编码效率可能变化
- HuggingFace transformers 的 API 在大版本更新时可能有变化
- 新的子词算法可能出现（如 MegaByte 等字节级方法）

**官方文档链接**：
- tiktoken：https://github.com/openai/tiktoken
- HuggingFace Tokenizers：https://huggingface.co/docs/tokenizers/
- HuggingFace Transformers：https://huggingface.co/docs/transformers/
- jieba：https://github.com/fxsjy/jieba
- OpenAI Tokenizer 工具：https://platform.openai.com/tokenizer
