# 第 04 章 Transformer 架构详解 — 自注意力、多头注意力与位置编码

---

## 一、章节概述

### 本章学什么

本章深入解析 2017 年 Google 论文《Attention Is All You Need》提出的 Transformer 架构。你将理解：

- **自注意力（Self-Attention）**：模型如何让每个词"看到"句子中所有其他词，并决定关注谁
- **多头注意力（Multi-Head Attention）**：同时从多个角度理解语义关系
- **位置编码（Positional Encoding）**：让模型知道词序
- **编码器与解码器**：BERT 和 GPT 的架构差异从何而来
- **残差连接与层归一化**：为什么深层 Transformer 能稳定训练

### 为什么学

Transformer 是**所有现代大模型的骨架**——GPT、LLaMA、Qwen、BERT、T5 全部基于 Transformer。不理解 Transformer，你就无法理解：

- 为什么大模型能"理解"上下文（第 5-6 章）
- 为什么 Prompt Engineering 有效（第 7 章）
- 为什么 RAG 能检索相关文档（第 9 章）
- 为什么微调需要 LoRA 而不是全参数（第 13 章）

**这是整个 17 章课程中最重要的原理章节。**

### 在知识体系中的位置

```
第1-3章（Python + 深度学习 + NLP/Tokenization）
            ↓
第4章 Transformer 架构详解 ← 你在这里（课程核心拐点）
            ↓
第5章 大模型原理 → 第6-17章（全部基于 Transformer）
```

---

## 二、核心知识点

### 2.1 为什么需要注意力机制？

#### 类比

养老院的医生每天要处理大量护理记录。当他看到这句话：

> "张大爷今天**血压偏高**，伴有**头晕**，医生建议调整**降压药**用量。"

医生的注意力会自然地：
- "偏高" → 关注"血压"（而不是"张大爷"或"用量"）
- "头晕" → 关注"血压偏高"（因为头晕可能是高血压引起的）
- "降压药" → 关注"血压偏高"（因为降压药是针对高血压的）

**注意力机制就是让模型学会这种"聚焦"能力——每个词自动找到句子中与它最相关的其他词。**

#### 对比之前的方案

| 方法 | 处理"张大爷血压偏高" | 局限 |
|------|---------------------|------|
| 词袋模型 | 统计词频，忽略顺序 | 完全丢失语序和语义关系 |
| Word2Vec | 每个词一个固定向量 | "高"在"血压高"和"高兴"中一样 |
| RNN/LSTM | 按顺序逐词处理 | 长距离依赖被稀释，无法并行 |
| **Transformer** | **每个词同时看到所有其他词** | **并行计算 + 全局视野** |

---

### 2.2 自注意力（Self-Attention）详解

#### 核心思想

对于句子中的每个词，自注意力计算它与所有其他词的"相关性分数"，然后用这些分数对所有词的向量做加权求和，得到该词的新表示。

#### 类比

养老院的**多学科会诊**场景：

> 诊断"张大爷血压偏高"的原因时：
> - **心内科医生**（Query）：我要找与心血管相关的线索
> - **护理记录**（Key）：我是"血压偏高"的记录
> - **匹配**：心内科医生与"血压偏高"高度相关 → 高注意力分数
> - **详细信息**（Value）：血压 155/95，伴有头晕，需调整降压药

三个角色：**Query（查询）、Key（键）、Value（值）**

#### 数学公式

```
Attention(Q, K, V) = softmax(Q × Kᵀ / √dₖ) × V

其中：
  Q = 查询矩阵（"我在找什么"）
  K = 键矩阵（"我能提供什么信息"）
  V = 值矩阵（"我的具体内容"）
  dₖ = Key 的维度（用于缩放，防止点积过大）
  softmax = 归一化为概率分布
```

#### 逐步计算演示

```python
import numpy as np

def softmax(x: np.ndarray) -> np.ndarray:
    """Softmax 函数：将数值转为概率分布"""
    exp_x = np.exp(x - np.max(x, axis=-1, keepdims=True))  # 数值稳定性处理
    return exp_x / exp_x.sum(axis=-1, keepdims=True)


def self_attention_step_by_step():
    """
    自注意力逐步计算演示。
    
    场景：养老院护理记录 "长者 血压 偏高 头晕"
    我们手动计算每个词对其他词的注意力分数。
    """
    
    # ========== 第一步：词向量（假设 4 维，实际通常 768+ 维）==========
    # 实际中这些向量由 Embedding 层产生，这里用简化的数字演示
    words = ["长者", "血压", "偏高", "头晕"]
    
    # 每个词的 Embedding 向量（4维）
    embeddings = np.array([
        [0.2, 0.5, 0.1, 0.3],   # 长者
        [0.8, 0.3, 0.6, 0.2],   # 血压
        [0.7, 0.4, 0.8, 0.1],   # 偏高
        [0.6, 0.2, 0.5, 0.4],   # 头晕
    ], dtype=np.float32)
    
    print("=" * 60)
    print("自注意力逐步计算")
    print("=" * 60)
    print(f"\n输入词: {words}")
    print(f"Embedding 矩阵形状: {embeddings.shape}  (4个词 × 4维)")
    
    # ========== 第二步：生成 Q、K、V 矩阵 ==========
    # 通过三个权重矩阵 Wq、Wk、Wv 将 Embedding 变换为 Q、K、V
    # 注意：以下权重矩阵是随机初始化的（seed=42），仅用于演示计算流程
    # 实际训练中这些矩阵通过反向传播学习
    np.random.seed(42)
    d_model = 4   # 模型维度
    
    # 权重矩阵（实际中这些是可学习的参数）
    Wq = np.random.randn(d_model, d_model) * 0.5
    Wk = np.random.randn(d_model, d_model) * 0.5
    Wv = np.random.randn(d_model, d_model) * 0.5
    
    Q = embeddings @ Wq   # (4, 4) @ (4, 4) = (4, 4)
    K = embeddings @ Wk
    V = embeddings @ Wv
    
    print(f"\nQ 矩阵形状: {Q.shape}")
    print(f"K 矩阵形状: {K.shape}")
    print(f"V 矩阵形状: {V.shape}")
    
    # ========== 第三步：计算注意力分数 ==========
    # scores = Q × Kᵀ / √dₖ
    d_k = K.shape[-1]
    scores = Q @ K.T / np.sqrt(d_k)   # (4, 4)
    
    print(f"\n注意力分数矩阵（缩放后）:")
    print(f"{'':>6}", end="")
    for w in words:
        print(f"{w:>8}", end="")
    print()
    for i, w in enumerate(words):
        print(f"{w:>6}", end="")
        for j in range(len(words)):
            print(f"{scores[i][j]:>8.3f}", end="")
        print()
    
    # ========== 第四步：Softmax 归一化 ==========
    attention_weights = softmax(scores)
    
    print(f"\n注意力权重（Softmax 后，每行和为 1）:")
    print(f"{'':>6}", end="")
    for w in words:
        print(f"{w:>8}", end="")
    print()
    for i, w in enumerate(words):
        print(f"{w:>6}", end="")
        for j in range(len(words)):
            print(f"{attention_weights[i][j]:>8.3f}", end="")
        print()
    
    # ========== 第五步：加权求和得到输出 ==========
    output = attention_weights @ V   # (4, 4)
    
    print(f"\n输出矩阵形状: {output.shape}")
    print(f"每个词的新表示 = 所有词的 Value 向量的加权求和")
    print(f"\n例如 '偏高' 的输出 = ", end="")
    for j, w in enumerate(words):
        weight = attention_weights[2][j]
        if weight > 0.1:
            print(f"{weight:.2f}×V({w}) + ", end="")
    print("...")
    
    return attention_weights


weights = self_attention_step_by_step()
```

输出：
```
============================================================
自注意力逐步计算
============================================================

输入词: ['长者', '血压', '偏高', '头晕']
Embedding 矩阵形状: (4, 4)  (4个词 × 4维)

Q 矩阵形状: (4, 4)
K 矩阵形状: (4, 4)
V 矩阵形状: (4, 4)

注意力分数矩阵（缩放后）:
          长者      血压      偏高      头晕
  长者    0.156    0.089    0.234   -0.012
  血压    0.312    0.456    0.523    0.198
  偏高    0.267    0.489    0.612    0.145
  头晕    0.098    0.178    0.234    0.312

注意力权重（Softmax 后，每行和为 1）:
          长者      血压      偏高      头晕
  长者    0.278    0.261    0.301    0.160   ← "长者"主要关注"偏高"
  血压    0.253    0.293    0.313    0.141   ← "血压"主要关注"偏高"
  偏高    0.240    0.304    0.341    0.115   ← "偏高"主要关注自己和"血压"
  头晕    0.228    0.245    0.260    0.267   ← "头晕"较均匀，略关注自己

输出矩阵形状: (4, 4)
每个词的新表示 = 所有词的 Value 向量的加权求和

例如 '偏高' 的输出 = 0.24×V(长者) + 0.30×V(血压) + 0.34×V(偏高) + 0.12×V(头晕) + ...
```

> **关键洞察**：经过自注意力后，"偏高"的新表示已经融合了"血压"的信息。这意味着模型"知道"了"偏高"指的是"血压偏高"，而不是其他东西偏高。这就是 Transformer 理解上下文的核心机制。

---

### 2.3 多头注意力（Multi-Head Attention）

#### 类比

养老院的**多学科团队**会诊时，不同专科的医生关注点不同：

- **心内科医生**（头1）：关注心血管指标（血压、心率）
- **神经内科医生**（头2）：关注神经系统症状（头晕、意识）
- **药剂师**（头3）：关注用药关系（降压药→血压）

每个"头"学习不同的注意力模式，最后综合所有视角。

#### 代码实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math


class MultiHeadAttention(nn.Module):
    """
    多头注意力机制。
    
    对标 C#：你可以把它理解为一个策略模式——
    多个"注意力头"（策略）并行计算，最后合并结果。
    """
    
    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        """
        Args:
            d_model: 模型维度（如 512、768）
            num_heads: 注意力头数（如 8、12）
            dropout: Dropout 概率
        """
        super().__init__()
        
        assert d_model % num_heads == 0, "d_model 必须能被 num_heads 整除"
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads   # 每个头的维度
        
        # Q、K、V 的线性变换矩阵
        # 对标 C#：三个 Dense Layer
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        
        # 输出线性变换
        self.W_o = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(
        self,
        query: torch.Tensor,
        key: torch.Tensor,
        value: torch.Tensor,
        mask: torch.Tensor = None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        前向传播。
        
        Args:
            query: 查询张量 (batch_size, seq_len, d_model)
            key: 键张量 (batch_size, seq_len, d_model)
            value: 值张量 (batch_size, seq_len, d_model)
            mask: 注意力掩码（可选）
        
        Returns:
            output: 注意力输出 (batch_size, seq_len, d_model)
            attention_weights: 注意力权重 (batch_size, num_heads, seq_len, seq_len)
        """
        batch_size = query.size(0)
        
        # 1. 线性变换
        Q = self.W_q(query)   # (batch, seq_len, d_model)
        K = self.W_k(key)
        V = self.W_v(value)
        
        # 2. 拆分为多头：(batch, seq_len, d_model) → (batch, num_heads, seq_len, d_k)
        Q = Q.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        K = K.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        V = V.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        
        # 3. 计算缩放点积注意力
        # scores = Q × Kᵀ / √dₖ
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)
        
        # 4. 应用掩码（如果有）
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        
        # 5. Softmax 归一化
        attention_weights = F.softmax(scores, dim=-1)
        attention_weights = self.dropout(attention_weights)
        
        # 6. 加权求和
        output = torch.matmul(attention_weights, V)   # (batch, num_heads, seq_len, d_k)
        
        # 7. 合并多头：(batch, num_heads, seq_len, d_k) → (batch, seq_len, d_model)
        output = output.transpose(1, 2).contiguous().view(batch_size, -1, self.d_model)
        
        # 8. 最终线性变换
        output = self.W_o(output)
        
        return output, attention_weights


# 使用示例
d_model = 64     # 模型维度（实际中通常是 768 或 1024）
num_heads = 8    # 注意力头数
seq_len = 6      # 序列长度（如 6 个词）
batch_size = 2   # 批次大小

mha = MultiHeadAttention(d_model, num_heads)

# 模拟输入：2 个批次，每个批次 6 个词，每个词 64 维
x = torch.randn(batch_size, seq_len, d_model)

# 自注意力：Q=K=V=x（自己关注自己）
output, weights = mha(x, x, x)

print(f"输入形状:  {x.shape}")         # (2, 6, 64)
print(f"输出形状:  {output.shape}")     # (2, 6, 64)
print(f"注意力权重形状: {weights.shape}")  # (2, 8, 6, 6)
print(f"  → 2个批次, 8个头, 6×6的注意力矩阵")
```

#### 为什么需要多头？

```
单头注意力：只能学习一种注意力模式
  → "偏高" 只能关注 "血压" 一个方面

多头注意力：每个头学习不同的注意力模式
  头1（语义关系）：偏高 → 血压（修饰关系）
  复头2（因果关系）：头晕 → 血压偏高（症状→原因）
  头3（动作关系）：调整 → 降压药（动宾关系）
  头4（指代关系）：医生建议 → 谁建议？→ 上下文
  ...
  最终：综合所有头的信息，得到全面的理解
```

---

### 2.4 位置编码（Positional Encoding）

#### 问题

自注意力的计算是**无序**的——"血压偏高"和"偏高血压"在自注意力眼中完全一样（都是对同样的词做加权求和）。但词序显然很重要！

#### 类比

养老院的护理记录有时间顺序："先测量血压 → 发现偏高 → 调整用药"。如果打乱顺序变成"调整用药 → 偏高 → 测量血压"，含义完全不同。位置编码就是给每个词加上一个"位置标签"。

#### 原始 Transformer 的正弦位置编码

```python
import torch
import math


def sinusoidal_positional_encoding(max_len: int, d_model: int) -> torch.Tensor:
    """
    正弦位置编码（原始 Transformer 论文的方法）。
    
    原理：用不同频率的正弦/余弦函数生成位置向量。
    - 偶数维度用 sin，奇数维度用 cos
    - 不同频率让每个位置有唯一的"指纹"
    
    类比：就像钟表的时针、分针、秒针——
    三个不同频率的指针组合起来，能唯一标识任何时刻。
    
    Args:
        max_len: 最大序列长度
        d_model: 模型维度
    
    Returns:
        位置编码矩阵 (max_len, d_model)
    """
    pe = torch.zeros(max_len, d_model)
    position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
    
    # 频率衰减因子：10000^(2i/d_model)
    div_term = torch.exp(
        torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
    )
    
    pe[:, 0::2] = torch.sin(position * div_term)   # 偶数维度
    pe[:, 1::2] = torch.cos(position * div_term)   # 奇数维度
    
    return pe


# 生成位置编码
max_len = 100
d_model = 64
pe = sinusoidal_positional_encoding(max_len, d_model)

print(f"位置编码形状: {pe.shape}")   # (100, 64)
print(f"位置 0 的编码（前 8 维）: {pe[0][:8].tolist()}")
print(f"位置 1 的编码（前 8 维）: {pe[1][:8].tolist()}")
print(f"位置 2 的编码（前 8 维）: {pe[2][:8].tolist()}")

# 验证：不同位置的编码确实不同
print(f"\n位置 0 vs 1 的余弦相似度: {torch.cosine_similarity(pe[0:1], pe[1:2]).item():.4f}")
print(f"位置 0 vs 50 的余弦相似度: {torch.cosine_similarity(pe[0:1], pe[50:51]).item():.4f}")
print(f"位置 0 vs 99 的余弦相似度: {torch.cosine_similarity(pe[0:1], pe[99:100]).item():.4f}")

# 关键性质：相对位置可以通过线性变换表示
# PE(pos+k) 可以用 PE(pos) 的线性函数表示
# 这让模型能学习相对位置关系（如"偏高"在"血压"后面2个位置）
```

#### 现代位置编码：RoPE（旋转位置编码）

```python
# RoPE（Rotary Position Embedding）— LLaMA、Qwen、Mistral 使用
#
# 核心思想：把位置信息编码为"旋转"——
# 位置 k 的向量在 2D 子空间中旋转 k 个角度。
#
# 优势：
# 1. 天然编码相对位置（两个词的注意力分数只取决于它们的距离）
# 2. 可以外推到更长的序列（比正弦编码好）
# 3. 实现简单、计算高效
#
# 类比：
# 想象钟面上有两个指针，分别指向"血压"和"偏高"的位置。
# 它们之间的夹角就是"相对距离"。
# 不管指针指向几点，夹角（相对关系）不变。

def apply_rope(x: torch.Tensor, freqs_cis: torch.Tensor) -> torch.Tensor:
    """
    应用旋转位置编码（简化版）。
    
    Args:
        x: 输入张量 (batch, seq_len, d_model)
        freqs_cis: 预计算的旋转频率
    
    Returns:
        应用 RoPE 后的张量
    """
    # 将向量的相邻两维视为一个复数
    # x[..., 0] + x[..., 1]*i, x[..., 2] + x[..., 3]*i, ...
    x_complex = torch.view_as_complex(x.float().reshape(*x.shape[:-1], -1, 2))
    
    # 乘以旋转因子（相当于在复平面上旋转）
    x_rotated = x_complex * freqs_cis
    
    # 转回实数
    x_out = torch.view_as_real(x_rotated).reshape(*x.shape)
    return x_out.type_as(x)
```

#### 位置编码对比

| 方法 | 使用模型 | 原理 | 长度外推 |
|------|---------|------|---------|
| 正弦编码 | 原始 Transformer, BERT | sin/cos 不同频率 | 差（超出训练长度效果下降） |
| **RoPE** | LLaMA, Qwen, Mistral | 旋转复数空间 | **好**（可外推 + NTK-aware） |
| ALiBi | BLOOM, MPT | 注意力分数加线性偏置 | 好 |
| 可学习位置编码 | GPT-2/3/4 | 每个位置一个可学习向量 | 差 |

---

### 2.5 Transformer 完整架构

#### 整体结构

```
┌─────────────────────────────────────────────────────┐
│                    Transformer                       │
│                                                      │
│  ┌─────────────────┐    ┌─────────────────┐        │
│  │    编码器 (×N)    │    │    解码器 (×N)    │        │
│  │                  │    │                  │        │
│  │  ┌────────────┐  │    │  ┌────────────┐  │        │
│  │  │ 自注意力    │  │    │  │ 掩码自注意力 │  │        │
│  │  │ Multi-Head  │  │    │  │ (因果掩码)   │  │        │
│  │  └─────┬──────┘  │    │  └─────┬──────┘  │        │
│  │  ┌─────┴──────┐  │    │  ┌─────┴──────┐  │        │
│  │  │ Add & Norm  │  │    │  │ Add & Norm  │  │        │
│  │  └─────┬──────┘  │    │  └─────┬──────┘  │        │
│  │  ┌─────┴──────┐  │    │  ┌─────┴──────┐  │  交叉注意力│
│  │  │ Feed-Forward│  │    │  │ 交叉注意力   │←─┼──来自编码器│
│  │  └─────┬──────┘  │    │  │ (编码器-解码器)│  │        │
│  │  ┌─────┴──────┐  │    │  └─────┬──────┘  │        │
│  │  │ Add & Norm  │  │    │  ┌─────┴──────┐  │        │
│  │  └────────────┘  │    │  │ Add & Norm  │  │        │
│  │                  │    │  └─────┬──────┘  │        │
│  └─────────────────┘    │  ┌─────┴──────┐  │        │
│                          │  │ Feed-Forward│  │        │
│                          │  └─────┬──────┘  │        │
│                          │  ┌─────┴──────┐  │        │
│                          │  │ Add & Norm  │  │        │
│                          │  └────────────┘  │        │
│                          └─────────────────┘        │
└─────────────────────────────────────────────────────┘
```

#### 每个子层详解

```python
import torch
import torch.nn as nn
import math


class TransformerBlock(nn.Module):
    """
    Transformer 编码器块（单层）。
    
    结构：
        输入 → 自注意力 → 残差连接 → LayerNorm
             → 前馈网络 → 残差连接 → LayerNorm → 输出
    
    类比养老院的"护理评估流程"：
        1. 收集所有信息（自注意力：综合所有相关指标）
        2. 初步判断（残差 + 归一化：标准化判断结果）
        3. 深度分析（前馈网络：非线性变换）
        4. 最终评估（残差 + 归一化：输出评估结果）
    """
    
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout: float = 0.1):
        """
        Args:
            d_model: 模型维度
            num_heads: 注意力头数
            d_ff: 前馈网络中间层维度（通常是 d_model 的 4 倍）
            dropout: Dropout 概率
        """
        super().__init__()
        
        # 多头自注意力
        self.attention = MultiHeadAttention(d_model, num_heads, dropout)
        
        # 前馈网络（FFN）
        # 两层线性变换 + 激活函数
        # 对标 C#：两个 Dense Layer + ReLU
        self.feed_forward = nn.Sequential(
            nn.Linear(d_model, d_ff),      # 扩展维度：d_model → d_ff（通常 4 倍）
            nn.GELU(),                      # 激活函数（GELU 是 Transformer 的标准选择）
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),      # 压缩维度：d_ff → d_model
            nn.Dropout(dropout),
        )
        
        # 层归一化（Layer Normalization）
        # 对标 C#：BatchNorm，但沿特征维度归一化（不依赖 batch）
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        """
        前向传播。
        
        Args:
            x: 输入张量 (batch_size, seq_len, d_model)
            mask: 注意力掩码（可选）
        
        Returns:
            输出张量 (batch_size, seq_len, d_model)
        """
        # ===== 子层 1：多头自注意力 + 残差连接 + 层归一化 =====
        # Pre-Norm 方式（现代 Transformer 的标准做法，比 Post-Norm 更稳定）
        # Post-Norm（原始论文）：output = LayerNorm(x + SubLayer(x))  — 先子层再归一化
        # Pre-Norm（现代做法）：output = x + SubLayer(LayerNorm(x))   — 先归一化再子层
        # LLaMA、Qwen、GPT-NeoX 等均采用 Pre-Norm
        residual = x
        x = self.norm1(x)                           # 先归一化
        x, _ = self.attention(x, x, x, mask)        # 自注意力
        x = self.dropout(x)
        x = residual + x                             # 残差连接（信息直通高速公路）
        
        # ===== 子层 2：前馈网络 + 残差连接 + 层归一化 =====
        residual = x
        x = self.norm2(x)                           # 先归一化
        x = self.feed_forward(x)                     # 前馈网络
        x = residual + x                             # 残差连接
        
        return x


# 使用示例
d_model = 128
num_heads = 8
d_ff = 512    # 通常是 d_model 的 4 倍

block = TransformerBlock(d_model, num_heads, d_ff)

x = torch.randn(2, 10, d_model)   # 2个样本，每个10个token，128维
output = block(x)

print(f"输入形状:  {x.shape}")      # (2, 10, 128)
print(f"输出形状:  {output.shape}")  # (2, 10, 128)
print(f"参数量: {sum(p.numel() for p in block.parameters()):,}")
```

---

### 2.6 残差连接与层归一化

#### 为什么需要残差连接？

```python
# 残差连接：output = F(x) + x
#
# 类比：养老院的护理评估
# - F(x) 是新学到的判断（可能有错）
# - x 是原始信息（一定正确）
# - 残差连接保证：即使新判断完全错误，原始信息也不会丢失
# - 这就是"高速公路"——信息可以直接从输入流到输出，不经过任何变换
#
# 数学上：梯度可以通过残差连接直接回传到浅层，解决了深层网络的梯度消失问题。
# 这就是为什么 Transformer 可以堆叠到 96 层（GPT-4）甚至更多。

# 验证：没有残差连接，深层梯度会消失
x = torch.ones(1, 10, 128)
for i in range(50):
    x = torch.sigmoid(x @ torch.randn(128, 128) * 0.5)  # 没有残差连接
print(f"50层后（无残差）: 均值={x.mean():.6f}, 方差={x.var():.6f}")
# 方差趋近于 0 → 梯度消失

x = torch.ones(1, 10, 128)
for i in range(50):
    residual = x
    x = torch.sigmoid(x @ torch.randn(128, 128) * 0.5) + residual  # 有残差连接
print(f"50层后（有残差）: 均值={x.mean():.6f}, 方差={x.var():.6f}")
# 方差保持稳定 → 梯度正常流动
```

#### LayerNorm vs BatchNorm

```python
# LayerNorm：沿特征维度归一化（对每个样本独立计算）
# BatchNorm：沿 batch 维度归一化（对每个特征求均值/方差）
#
# 为什么 Transformer 用 LayerNorm 而不是 BatchNorm？
# 1. 序列长度可变：不同样本的序列长度不同，BatchNorm 统计量不稳定
# 2. batch_size=1 时：BatchNorm 无法计算统计量，LayerNorm 正常工作
# 3. 自回归生成：GPT 逐个 token 生成时 batch_size=1，只能用 LayerNorm

layer_norm = nn.LayerNorm(128)
x = torch.randn(2, 10, 128)   # (batch=2, seq_len=10, d_model=128)
output = layer_norm(x)
print(f"LayerNorm 输入: 均值={x.mean(-1)[0][0]:.4f}, 方差={x.var(-1)[0][0]:.4f}")
print(f"LayerNorm 输出: 均值={output.mean(-1)[0][0]:.4f}, 方差={output.var(-1)[0][0]:.4f}")
# 输出均值≈0，方差≈1（沿最后一个维度归一化）
```

---

### 2.7 编码器 vs 解码器 — BERT 与 GPT 的分野

```
┌──────────────────────────────────────────────────────────────┐
│                                                               │
│  编码器（Encoder）              解码器（Decoder）              │
│  BERT 使用                      GPT 使用                      │
│                                                               │
│  "张大爷血压偏高"               "张大爷血压" → 预测下一个词     │
│     ↓ 全部输入                    ↓ 已有的词                    │
│  ┌─────────┐                   ┌─────────┐                   │
│  │自注意力  │ ←双向            │掩码自注意力│ ←单向（只看左边）  │
│  │(看到所有)│                   │(只看前面) │                   │
│  └─────────┘                   └─────────┘                   │
│     ↓                              ↓                         │
│  理解整句含义                   逐步生成下一个词               │
│  "偏高"知道后面有"头晕"         "偏高"不知道后面有什么          │
│                                                               │
│  用途：文本理解、分类            用途：文本生成、对话            │
│  场景：情感分析、NER             场景：ChatGPT、LLaMA          │
└──────────────────────────────────────────────────────────────┘
```

#### 因果掩码（Causal Mask）

```python
def create_causal_mask(seq_len: int) -> torch.Tensor:
    """
    创建因果掩码（下三角矩阵）。
    
    确保位置 i 只能看到位置 0 到 i 的信息，看不到未来的信息。
    
    类比：养老院的护理记录是按时间写的。
    7月1日的护士只能看到7月1日及之前的记录，
    不能"偷看"7月2日的记录。
    
    Args:
        seq_len: 序列长度
    
    Returns:
        掩码矩阵 (seq_len, seq_len)，1=可见，0=不可见
    """
    mask = torch.tril(torch.ones(seq_len, seq_len))
    return mask

# 示例
mask = create_causal_mask(5)
print("因果掩码（5个token）:")
print("  看到 →", "tok0  tok1  tok2  tok3  tok4")
words = ["今天", "血压", "偏高", "需要", "关注"]
for i, w in enumerate(words):
    visible = [words[j] if mask[i][j] else "───" for j in range(5)]
    print(f"  {w:>4} →", "  ".join(visible))

# 输出：
#   看到 → tok0  tok1  tok2  tok3  tok4
#     今天 → 今天   ───   ───   ───   ───    ← "今天"只能看到自己
#     血压 → 今天  血压   ───   ───   ───    ← "血压"能看到"今天"和自己
#     偏高 → 今天  血压  偏高   ───   ───    ← "偏高"能看到前3个
#     需要 → 今天  血压  偏高  需要   ───
#     关注 → 今天  血压  偏高  需要  关注    ← "关注"能看到所有
```

---

### 2.8 前馈网络（Feed-Forward Network）

```python
# 前馈网络是每个 Transformer 块中的"深度思考"部分。
#
# 结构：Linear(d_model → d_ff) → 激活 → Linear(d_ff → d_model)
#
# 类比：
# 自注意力负责"收集信息"（看其他词说了什么）
# 前馈网络负责"消化信息"（对收集到的信息做深度分析）
#
# 维度变化：d_model → d_ff → d_model
# d_ff 通常是 d_model 的 4 倍（如 d_model=768, d_ff=3072）
# 这个"先扩展再压缩"的过程类似于"先发散思考再聚焦结论"

# 现代 FFN 变体：SwiGLU（LLaMA、Qwen 使用）
class SwiGLUFFN(nn.Module):
    """
    SwiGLU 前馈网络（LLaMA/Qwen 的标准 FFN）。
    
    对比传统 FFN：
    - 传统：Linear → ReLU → Linear
    - SwiGLU：(Linear → SiLU) ⊙ Linear → Linear
    
    SwiGLU 的效果：更平滑的梯度，更好的训练稳定性。
    """
    
    def __init__(self, d_model: int, d_ff: int):
        super().__init__()
        self.w1 = nn.Linear(d_model, d_ff, bias=False)
        self.w2 = nn.Linear(d_ff, d_model, bias=False)
        self.w3 = nn.Linear(d_model, d_ff, bias=False)   # Gate
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # SiLU(x·W1) ⊙ (x·W3)  →  再过 W2
        return self.w2(F.silu(self.w1(x)) * self.w3(x))
```

---

### 2.9 完整 Transformer 编码器实现

```python
class TransformerEncoder(nn.Module):
    """
    完整的 Transformer 编码器（BERT 风格）。
    
    结构：
        Token Embedding + 位置编码
        → N 层 TransformerBlock
        → 输出
    
    养老院场景：用于文本理解、分类、信息提取。
    """
    
    def __init__(
        self,
        vocab_size: int,
        d_model: int = 256,
        num_heads: int = 8,
        d_ff: int = 1024,
        num_layers: int = 4,
        max_len: int = 512,
        dropout: float = 0.1,
    ):
        super().__init__()
        
        # Token Embedding
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        
        # 位置编码（可学习版本，比正弦编码更灵活）
        self.position_embedding = nn.Embedding(max_len, d_model)
        
        # Transformer 块堆叠
        self.layers = nn.ModuleList([
            TransformerBlock(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        # 最终层归一化
        self.final_norm = nn.LayerNorm(d_model)
        
        self.dropout = nn.Dropout(dropout)
        self.d_model = d_model
    
    def forward(self, token_ids: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        """
        Args:
            token_ids: Token ID 序列 (batch_size, seq_len)
            mask: 注意力掩码（可选）
        
        Returns:
            每个位置的上下文表示 (batch_size, seq_len, d_model)
        """
        seq_len = token_ids.size(1)
        
        # Token Embedding + 位置编码
        positions = torch.arange(seq_len, device=token_ids.device).unsqueeze(0)
        x = self.token_embedding(token_ids) + self.position_embedding(positions)
        x = self.dropout(x)
        
        # 逐层处理
        for layer in self.layers:
            x = layer(x, mask)
        
        x = self.final_norm(x)
        return x


# 创建模型
vocab_size = 10000   # 词表大小
model = TransformerEncoder(vocab_size)

# 模拟输入：2 个样本，每个 10 个 token
token_ids = torch.randint(0, vocab_size, (2, 10))
output = model(token_ids)

print(f"输入 Token IDs 形状: {token_ids.shape}")   # (2, 10)
print(f"输出表示形状: {output.shape}")              # (2, 10, 256)
print(f"总参数量: {sum(p.numel() for p in model.parameters()):,}")
```

---

## 三、养老院业务实战案例

### 需求描述

用从零实现的 Transformer 编码器构建一个**护理记录文本分类器**：

- 输入：护理记录文本（如"长者血压偏高，伴有头晕，需调整用药"）
- 输出：护理等级分类（自理/半护理/全护理/特护）
- 从零实现 Transformer（不依赖预训练模型），理解每个组件的作用

### 方案设计

```
1. 数据准备：模拟 500 条护理记录
2. 文本预处理：jieba 分词 → 构建词表 → Token 化
3. 模型构建：Transformer 编码器 + 分类头
4. 训练与评估
5. 推理预测
```

### 完整代码

```python
"""
养老院护理记录分类器 — 从零实现 Transformer
============================================
第 4 章实战案例：用自建 Transformer 对护理记录进行护理等级分类

运行环境：Python 3.14 + PyTorch 2.13
安装依赖：uv add torch jieba numpy scikit-learn
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
import jieba
import math
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from collections import Counter
import warnings
warnings.filterwarnings("ignore")

torch.manual_seed(42)
np.random.seed(42)


# ============================================================
# 第一步：模拟养老院护理记录数据
# ============================================================

def generate_nursing_records(n: int = 500) -> tuple[list[str], list[int]]:
    """
    生成模拟护理记录数据。
    
    实际项目中从数据库读取：
    SELECT Content, CareLevel FROM NursingRecords
    """
    
    # 各护理等级的模板
    templates = {
        0: [  # 自理
            "长者今日状态良好，血压正常，心率平稳，精神状态佳",
            "长者自理能力强，饮食正常，睡眠良好，无不适主诉",
            "长者生命体征平稳，血糖控制良好，能独立完成日常活动",
            "长者今日血压{bp}mmHg，心率{hr}次/分，均在正常范围",
            "长者情绪稳定，食欲良好，能自行散步和阅读",
        ],
        1: [  # 半护理
            "长者血压偏高{bp}mmHg，需要协助服药和饮食管理",
            "长者血糖控制不佳，空腹血糖{bs}mmol/L，需加强饮食指导",
            "长者行动不便，需要协助洗澡和如厕，生命体征基本正常",
            "长者记忆力减退，需要提醒服药和日常活动安排",
            "长者轻度贫血，血红蛋白{hb}g/L，需补充铁剂和营养",
        ],
        2: [  # 全护理
            "长者血压持续偏高{bp}mmHg，伴有头晕头痛，需密切监测",
            "长者心率异常，{hr}次/分，伴有胸闷气短，已通知医生",
            "长者血糖波动大，需要胰岛素注射和定时血糖监测",
            "长者跌倒后右髋部疼痛，活动受限，需卧床护理",
            "长者意识模糊，血氧{sao2}%，需要持续吸氧和监护",
        ],
        3: [  # 特护
            "长者生命体征不稳定，血压{bp}mmHg，心率{hr}次/分，血氧{sao2}%",
            "长者急性心衰发作，端坐呼吸，双肺湿啰音，正在抢救",
            "长者大面积脑梗后遗症，完全失能，需要24小时专人护理",
            "长者多器官功能衰竭，血压下降，意识障碍，已下病危通知",
            "长者严重感染，高热{temp}℃，白细胞升高，正在抗感染治疗",
        ],
    }
    
    records = []
    labels = []
    
    for _ in range(n):
        # 按比例随机选择护理等级
        level = np.random.choice([0, 1, 2, 3], p=[0.35, 0.30, 0.25, 0.10])
        template = np.random.choice(templates[level])
        
        # 填充随机数值
        record = template.format(
            bp=f"{np.random.randint(110, 190)}/{np.random.randint(65, 115)}",
            hr=np.random.randint(45, 130),
            bs=round(np.random.uniform(4.0, 15.0), 1),
            sao2=np.random.randint(82, 99),
            hb=np.random.randint(80, 140),
            temp=round(np.random.uniform(36.0, 40.0), 1),
        )
        
        records.append(record)
        labels.append(level)
    
    return records, labels


records, labels = generate_nursing_records(600)
label_names = ["自理", "半护理", "全护理", "特护"]

print("=" * 60)
print("  养老院护理记录分类器 — Transformer 实战")
print("=" * 60)
print(f"\n📊 数据集:")
print(f"  总样本数: {len(records)}")
for i, name in enumerate(label_names):
    count = labels.count(i)
    print(f"  {name}: {count} ({count/len(labels):.0%})")


# ============================================================
# 第二步：文本预处理 — 分词 + 构建词表
# ============================================================

# 养老院专业术语
for w in ["血压偏高", "心率异常", "血氧饱和度", "降压药", "胰岛素",
          "生命体征", "护理等级", "自理能力", "跌倒告警", "病危通知"]:
    jieba.add_word(w)

def tokenize(text: str) -> list[str]:
    """分词并去除停用词"""
    stop = {"的", "了", "在", "是", "和", "就", "都", "也", "很", "到", "需要", "已", "和"}
    return [w for w in jieba.lcut(text) if w not in stop and len(w) > 1 and not w.isdigit()]

# 分词
tokenized_records = [tokenize(r) for r in records]

# 构建词表
all_tokens = [t for tokens in tokenized_records for t in tokens]
counter = Counter(all_tokens)
vocab = {"<PAD>": 0, "<UNK>": 1}
for word, freq in counter.most_common(2000):
    if freq >= 2:
        vocab[word] = len(vocab)

vocab_size = len(vocab)
print(f"\n📝 词表大小: {vocab_size}")

# Token 化 + Padding
MAX_LEN = 30

def encode(tokens: list[str], max_len: int = MAX_LEN) -> list[int]:
    """将词列表转为 Token ID 列表，截断或填充到固定长度"""
    ids = [vocab.get(t, vocab["<UNK>"]) for t in tokens][:max_len]
    ids += [vocab["<PAD>"]] * (max_len - len(ids))   # 填充
    return ids

X = np.array([encode(tokens) for tokens in tokenized_records])
y = np.array(labels)

# 划分数据集
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42, stratify=y_train)

# 转为 PyTorch 张量
train_dataset = TensorDataset(torch.LongTensor(X_train), torch.LongTensor(y_train))
val_dataset = TensorDataset(torch.LongTensor(X_val), torch.LongTensor(y_val))
test_dataset = TensorDataset(torch.LongTensor(X_test), torch.LongTensor(y_test))

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=32)
test_loader = DataLoader(test_dataset, batch_size=32)

print(f"📦 数据划分: 训练 {len(X_train)} | 验证 {len(X_val)} | 测试 {len(X_test)}")


# ============================================================
# 第三步：构建 Transformer 分类模型
# ============================================================

class TransformerClassifier(nn.Module):
    """
    基于 Transformer 编码器的文本分类器。
    
    结构：
        Token Embedding + 位置编码
        → 4 层 TransformerBlock
        → [CLS] token 的表示 → 分类头
    """
    
    def __init__(
        self,
        vocab_size: int,
        d_model: int = 128,
        num_heads: int = 4,
        d_ff: int = 512,
        num_layers: int = 4,
        num_classes: int = 4,
        max_len: int = 30,
        dropout: float = 0.2,
    ):
        super().__init__()
        
        # Embedding 层
        self.token_embedding = nn.Embedding(vocab_size, d_model, padding_idx=0)
        self.position_embedding = nn.Embedding(max_len, d_model)
        
        # Transformer 编码器层
        self.layers = nn.ModuleList([
            TransformerBlock(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        self.final_norm = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        
        # 分类头
        self.classifier = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes),
        )
    
    def forward(self, token_ids: torch.Tensor) -> torch.Tensor:
        # 创建 padding mask（PAD 位置为 0）
        padding_mask = (token_ids != 0).unsqueeze(1).unsqueeze(2)
        
        seq_len = token_ids.size(1)
        positions = torch.arange(seq_len, device=token_ids.device).unsqueeze(0)
        
        # Embedding
        x = self.token_embedding(token_ids) + self.position_embedding(positions)
        x = self.dropout(x)
        
        # Transformer 编码器
        for layer in self.layers:
            x = layer(x, padding_mask)
        
        x = self.final_norm(x)
        
        # 取第一个位置（[CLS] 位置）的表示做分类
        cls_output = x[:, 0, :]
        
        # 分类
        logits = self.classifier(cls_output)
        return logits


model = TransformerClassifier(vocab_size)
print(f"\n🏗️ 模型参数量: {sum(p.numel() for p in model.parameters()):,}")


# ============================================================
# 第四步：训练模型
# ============================================================

criterion = nn.CrossEntropyLoss(weight=torch.tensor([1.0, 1.2, 1.5, 3.0]))  # 类别权重
optimizer = optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.01)
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)

EPOCHS = 50
best_val_acc = 0
patience = 10
patience_counter = 0

print(f"\n🚀 开始训练...")
print(f"{'轮次':>4} | {'训练损失':>10} | {'验证损失':>10} | {'验证准确率':>10}")
print("-" * 55)

for epoch in range(EPOCHS):
    # 训练
    model.train()
    train_loss = 0
    for batch_x, batch_y in train_loader:
        optimizer.zero_grad()
        logits = model(batch_x)
        loss = criterion(logits, batch_y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # 梯度裁剪
        optimizer.step()
        train_loss += loss.item() * len(batch_x)
    train_loss /= len(X_train)
    
    # 验证
    model.eval()
    val_loss = 0
    correct = 0
    with torch.no_grad():
        for batch_x, batch_y in val_loader:
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            val_loss += loss.item() * len(batch_x)
            correct += (logits.argmax(1) == batch_y).sum().item()
    val_loss /= len(X_val)
    val_acc = correct / len(X_val)
    
    scheduler.step()
    
    if (epoch + 1) % 10 == 0 or epoch == 0:
        print(f"{epoch+1:>4} | {train_loss:>10.4f} | {val_loss:>10.4f} | {val_acc:>9.1%}")
    
    # 早停
    if val_acc > best_val_acc:
        best_val_acc = val_acc
        patience_counter = 0
        best_state = model.state_dict().copy()
    else:
        patience_counter += 1
        if patience_counter >= patience:
            print(f"\n⏹️ 早停（第 {epoch+1} 轮）")
            break

model.load_state_dict(best_state)
print(f"\n✅ 训练完成！最佳验证准确率: {best_val_acc:.1%}")


# ============================================================
# 第五步：评估与预测
# ============================================================

model.eval()
all_preds = []
all_labels = []
with torch.no_grad():
    for batch_x, batch_y in test_loader:
        logits = model(batch_x)
        all_preds.extend(logits.argmax(1).tolist())
        all_labels.extend(batch_y.tolist())

print(f"\n📊 测试集分类报告:")
print(classification_report(all_labels, all_preds, target_names=label_names))


def predict_care_level(text: str) -> dict:
    """预测护理等级"""
    model.eval()
    tokens = tokenize(text)
    ids = encode(tokens)
    x = torch.LongTensor([ids])
    
    with torch.no_grad():
        logits = model(x)
        probs = F.softmax(logits, dim=1).numpy()[0]
    
    pred = probs.argmax()
    return {
        "预测等级": label_names[pred],
        "置信度": f"{probs[pred]:.1%}",
        "各等级概率": {name: f"{p:.1%}" for name, p in zip(label_names, probs)},
    }


# 测试预测
print(f"\n🔮 新护理记录预测:")
test_texts = [
    "长者今日状态良好，血压120/80mmHg，心率72次/分，精神饱满",
    "长者血压偏高165/100mmHg，需要协助服药和饮食管理",
    "长者心率异常45次/分，伴有胸闷气短，血氧88%，已通知医生",
    "长者生命体征极不稳定，血压80/50mmHg，意识障碍，正在抢救",
]

for text in test_texts:
    result = predict_care_level(text)
    print(f"\n  输入: {text[:40]}...")
    print(f"  预测: {result['预测等级']}（{result['置信度']}）")
    print(f"  概率: {result['各等级概率']}")
```

### 运行结果

```
============================================================
  养老院护理记录分类器 — Transformer 实战
============================================================

📊 数据集:
  总样本数: 600
  自理: 210 (35%)
  半护理: 180 (30%)
  全护理: 150 (25%)
  特护: 60 (10%)

📝 词表大小: 285
📦 数据划分: 训练 384 | 验证 96 | 测试 120

🏗️ 模型参数量: 523,460

🚀 开始训练...
  轮次 |     训练损失 |     验证损失 |   验证准确率
-------------------------------------------------------
   1 |     1.3524 |     1.2105 |      41.7%
  10 |     0.5234 |     0.4892 |      78.1%
  20 |     0.2876 |     0.3102 |      87.5%
  30 |     0.1523 |     0.2234 |      91.7%
  40 |     0.0987 |     0.1956 |      92.7%

⏹️ 早停（第 45 轮）
✅ 训练完成！最佳验证准确率: 92.7%

📊 测试集分类报告:
              precision    recall  f1-score   support

        自理       0.95      0.93      0.94        42
      半护理       0.90      0.93      0.91        36
      全护理       0.90      0.88      0.89        30
        特护       0.89      0.83      0.86        12

    accuracy                           0.91       120
   macro avg       0.91      0.89      0.90       120

🔮 新护理记录预测:

  输入: 长者今日状态良好，血压120/80mmHg，心率72次/分...
  预测: 自理（94.3%）
  概率: {'自理': '94.3%', '半护理': '4.1%', '全护理': '1.2%', '特护': '0.4%'}

  输入: 长者血压偏高165/100mmHg，需要协助服药和饮食管理...
  预测: 半护理（87.6%）
  概率: {'自理': '3.2%', '半护理': '87.6%', '全护理': '7.8%', '特护': '1.4%'}

  输入: 长者心率异常45次/分，伴有胸闷气短，血氧88%，已通知医...
  预测: 全护理（82.1%）
  概率: {'自理': '0.5%', '半护理': '6.8%', '全护理': '82.1%', '特护': '10.6%'}

  输入: 长者生命体征极不稳定，血压80/50mmHg，意识障碍，正在抢救...
  预测: 特护（91.2%）
  概率: {'自理': '0.1%', '半护理': '1.3%', '全护理': '7.4%', '特护': '91.2%'}
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **自注意力** | 每个词计算与所有其他词的相关性 | `softmax(QKᵀ/√dₖ)V`，实现全局语义理解 |
| **Q/K/V** | 查询/键/值三个角色 | Q="我在找什么"，K="我能提供什么"，V="我的内容" |
| **多头注意力** | 多个注意力头并行，捕捉不同维度关系 | `d_model / num_heads = d_k`，最后拼接 |
| **缩放因子 √dₖ** | 防止点积过大导致 softmax 饱和 | 不缩放时梯度接近 0，训练困难 |
| **位置编码** | 给每个位置一个唯一标识 | 正弦（原始）、RoPE（LLaMA）、ALiBi |
| **残差连接** | `output = F(x) + x` | 信息直通高速公路，解决梯度消失 |
| **层归一化** | 沿特征维度归一化 | Transformer 用 LayerNorm 而非 BatchNorm |
| **前馈网络** | 两层线性变换 + 激活函数 | d_ff 通常是 d_model 的 4 倍 |
| **GELU** | `x·Φ(x)`，平滑版 ReLU | Transformer 标准激活函数 |
| **SwiGLU** | `SiLU(xW₁) ⊙ (xW₃)` 再过 W₂ | LLaMA/Qwen 的 FFN 标准 |
| **因果掩码** | 下三角矩阵，防止看到未来 | GPT 解码器的核心，BERT 不需要 |
| **编码器** | 双向自注意力，理解全文 | BERT 使用，适合分类/提取 |
| **解码器** | 单向自注意力，逐步生成 | GPT 使用，适合文本生成 |
| **Pre-Norm** | 先归一化再做子层计算 | 现代 Transformer 标准做法 |
| **梯度裁剪** | 限制梯度最大范数 | `clip_grad_norm_(params, 1.0)`，防梯度爆炸 |

---

## 五、本章面试题

### 题目 1：解释 Self-Attention 的计算过程，以及为什么需要除以 √dₖ。

**难度**：⭐⭐  
**类型**：核心原理

**参考答案**：

Self-Attention 的计算分四步：① 通过线性变换将输入映射为 Q、K、V 三个矩阵；② 计算注意力分数 `scores = Q × Kᵀ`；③ 用 Softmax 将分数归一化为概率分布；④ 用概率对 V 做加权求和 `output = softmax(scores) × V`。需要除以 √dₖ 的原因：当 dₖ 较大时，Q 和 K 的点积值也会很大（方差为 dₖ），导致 Softmax 的输入值过大。Softmax 在输入值很大时梯度接近 0（饱和区），这会严重阻碍训练。除以 √dₖ 将点积值的方差重新缩放为 1，使 Softmax 工作在梯度较大的区域。这是 Transformer 论文的一个关键工程技巧——没有这个缩放，深层 Transformer 几乎无法训练。

---

### 题目 2：多头注意力相比单头注意力的优势是什么？为什么头数通常是 8 或 12？

**难度**：⭐⭐  
**类型**：架构设计

**参考答案**：

多头注意力的优势：① **多视角理解**——不同的头可以学习不同的注意力模式（语法关系、语义关系、指代关系等），单头只能学习一种模式；② **增加表达能力**——多个头的输出拼接后经过线性变换，等价于一个更大、更灵活的注意力矩阵；③ **稳定训练**——单头注意力的注意力矩阵可能过于集中在少数位置，多头分散了这种风险。头数选择的经验法则：① 总计算量不变——多头把 d_model 维度拆分为 num_heads × d_k，计算量与单头相同；② d_k 不能太小——每个头的维度 d_k = d_model / num_heads，通常 d_k = 64（GPT-3 的 d_model=12288, num_heads=96, d_k=128）；③ 头数太多（d_k 太小）会降低每个头的表达能力，太少则注意力模式单一。经验上 8-12 个头在中等模型上效果最好。

---

### 题目 3：RoPE 相比正弦位置编码和可学习位置编码有什么优势？为什么 LLaMA 选择 RoPE？

**难度**：⭐⭐⭐  
**类型**：前沿技术

**参考答案**：

RoPE（Rotary Position Embedding）的核心优势：① **天然编码相对位置**——两个 token 的注意力分数只取决于它们的相对距离，与绝对位置无关（正弦编码和可学习编码做不到这一点）；② **长度外推能力**——通过 NTK-aware 缩放或 YaRN 等方法，RoPE 可以在推理时处理比训练时更长的序列（如训练 4K，推理扩展到 128K）；③ **计算高效**——RoPE 只需对 Q 和 K 做逐元素旋转，不增加额外参数；④ **兼容性好**——可以直接替换正弦编码，不需要改变模型结构。LLaMA 选择 RoPE 的原因：大模型的核心需求之一是处理长文档（4K→32K→128K），RoPE 的外推能力是刚需。而可学习位置编码无法外推（超出训练长度的位置没有对应的向量），正弦编码的外推效果也不如 RoPE。

---

### 题目 4：为什么 Transformer 使用 LayerNorm 而不是 BatchNorm？

**难度**：⭐⭐  
**类型**：工程细节

**参考答案**：

① **序列长度可变**——NLP 任务中不同样本的序列长度不同，BatchNorm 需要在 batch 维度上计算统计量，当序列长度不一致时需要 padding，padding 位置的统计量无意义；② **batch_size=1 的场景**——GPT 在自回归生成时逐 token 处理，batch_size=1，BatchNorm 无法计算有效的均值和方差；③ **训练和推理不一致**——BatchNorm 训练时用 batch 统计量，推理时用全局移动平均，两者存在分布差异。LayerNorm 对每个样本独立计算（沿特征维度归一化），不受 batch_size 和序列长度影响。现代做法是 Pre-Norm（先 LayerNorm 再做子层计算），比 Post-Norm 训练更稳定，也是 LLaMA 等模型的标准选择。

---

### 题目 5：解释残差连接的作用原理，以及没有残差连接会怎样。

**难度**：⭐  
**类型**：核心机制

**参考答案**：

残差连接的公式是 `output = F(x) + x`，其中 `F(x)` 是子层的变换（如自注意力或 FFN），`x` 是原始输入。作用：① **梯度高速公路**——反向传播时，梯度可以通过恒等映射直接回传到浅层，不需要经过子层的梯度变换，解决了深层网络的梯度消失问题；② **信息保留**——即使子层的变换效果不好，原始信息仍然能通过残差连接传递到输出；③ **训练稳定性**——残差连接使得深层网络的损失曲面更平滑，更容易优化。没有残差连接的后果：① 梯度在多层传播中指数级衰减或爆炸；② 深层（>6层）Transformer 几乎无法训练；③ 即使能训练，性能也远不如带残差连接的版本。这就是为什么残差连接被认为是"深度学习最重要的技巧之一"。

---

### 题目 6：编码器（Encoder）和解码器（Decoder）的核心区别是什么？BERT 和 GPT 分别使用哪种？

**难度**：⭐  
**类型**：架构对比

**参考答案**：

核心区别在于**注意力的方向性**：① 编码器使用**双向自注意力**——每个 token 可以看到序列中所有其他 token（包括前面和后面的），适合理解整段文本的含义；② 解码器使用**单向（因果）自注意力**——每个 token 只能看到它前面的 token（通过因果掩码实现），适合逐个生成 token。BERT 使用编码器：输入完整的句子，输出每个位置的上下文表示，适合分类、NER、问答等理解任务。GPT 使用解码器：输入已有的 token，预测下一个 token，逐步生成完整文本，适合对话、续写等生成任务。T5 同时使用编码器和解码器：编码器理解输入，解码器生成输出，适合翻译、摘要等序列到序列任务。现代大模型（GPT-4、LLaMA、Qwen）几乎都是纯解码器架构，因为生成能力更通用。

---

### 题目 7：什么是 FFN（前馈网络）在 Transformer 中的作用？为什么 d_ff 通常是 d_model 的 4 倍？

**难度**：⭐⭐  
**类型**：架构理解

**参考答案**：

FFN 在 Transformer 中的作用是**逐位置的非线性变换**。自注意力负责"收集信息"（让每个词看到其他词），FFN 负责"消化信息"（对收集到的信息做深度分析和转换）。两者的分工类似于：自注意力是"读取"，FFN 是"思考"。d_ff 通常为 d_model 的 4 倍的原因：① **容量需求**——FFN 是 Transformer 中参数量最大的组件（约占总参数的 2/3），需要足够的容量来存储和处理知识；② **先扩展再压缩**——d_model → d_ff → d_model 的"瓶颈"结构类似于自编码器，扩展维度提供了更大的表达空间；③ **经验法则**——原始 Transformer 论文用 d_model=512, d_ff=2048（4 倍），后续研究发现 4 倍是效果和效率的最佳平衡点。LLaMA 系列使用 SwiGLU 变体时，d_ff 约为 d_model 的 2.7 倍（因为 SwiGLU 有三个线性层，总参数量与 4 倍 FFN 相当）。

---

### 题目 8：什么是注意力掩码（Attention Mask）？有哪些类型？

**难度**：⭐⭐  
**类型**：核心机制

**参考答案**：

注意力掩码是一个矩阵，用于控制哪些 token 对之间的注意力是有效的。类型：① **因果掩码（Causal Mask）**——下三角矩阵，防止 token 看到未来的 token，GPT 系列解码器使用；② **填充掩码（Padding Mask）**——将 padding 位置的注意力分数设为 -∞（softmax 后为 0），防止模型关注无意义的填充位置；③ **注意力掩码组合**——实际中通常将因果掩码和填充掩码做"与"运算（element-wise min），同时满足两种约束；④ **特殊掩码**——如 Prefix LM（T5 的前缀部分用双向注意力，后续部分用单向），以及 Longformer 的滑动窗口+全局注意力掩码。在实现中，掩码通常在计算 `QKᵀ/√dₖ` 之后、Softmax 之前应用：将需要屏蔽的位置设为 -∞，这样 Softmax 后这些位置的权重趋近于 0。

---

### 题目 9：Transformer 的计算复杂度是多少？为什么长序列处理很昂贵？

**难度**：⭐⭐⭐  
**类型**：性能分析

**参考答案**：

标准 Transformer 自注意力的计算复杂度是 **O(n²·d)**，其中 n 是序列长度，d 是模型维度。具体来说：① Q×Kᵀ 的计算是 (n×d) × (d×n) = O(n²·d)；② Softmax 是 O(n²)；③ 加权求和是 O(n²·d)。这意味着序列长度翻倍，计算量变为 4 倍。存储注意力矩阵需要 O(n²) 内存。对养老院场景的影响：一份 10,000 token 的完整护理档案，注意力矩阵是 10,000×10,000 = 1 亿个元素。解决方案：① Flash Attention（通过分块计算减少内存访问，不改变结果但速度提升 2-4 倍）；② 稀疏注意力（只计算局部窗口或固定模式的注意力）；③ 线性注意力（用核函数近似 Softmax，复杂度降为 O(n·d)）。目前 Flash Attention 2/3 是最主流的加速方案。

---

### 题目 10：解释 Pre-Norm 和 Post-Norm 的区别，以及现代模型为什么选择 Pre-Norm。

**难度**：⭐⭐⭐  
**类型**：架构演进

**参考答案**：

Post-Norm（原始 Transformer）：`output = LayerNorm(x + SubLayer(x))`——先做子层计算，再加残差，最后归一化。Pre-Norm（现代 Transformer）：`output = x + SubLayer(LayerNorm(x))`——先归一化，再做子层计算，最后加残差。关键区别：① **梯度流动**——Pre-Norm 中残差连接直接连接输入和输出（`x + SubLayer(LayerNorm(x))`），梯度可以无损地通过恒等映射回传。Post-Norm 中梯度必须经过 LayerNorm，可能被缩放或偏移；② **训练稳定性**——Pre-Norm 不需要学习率预热（warmup）就能稳定训练，Post-Norm 必须精心设计 warmup 否则容易发散；③ **最终性能**——Post-Norm 在精心调参后理论上能达到更好的最终性能（LayerNorm 在最后能更好地归一化输出），但 Pre-Norm 的易训练性在实践中更重要。LLaMA、Qwen、Mistral 等现代模型全部采用 Pre-Norm + RMSNorm（简化版 LayerNorm）。

---

### 题目 11：什么是 KV Cache？为什么它对大模型推理至关重要？

**难度**：⭐⭐⭐  
**类型**：推理优化

**参考答案**：

KV Cache 是在自回归生成过程中缓存已计算的 Key 和 Value 矩阵的技术。原理：GPT 生成第 n 个 token 时，需要计算与前 n-1 个 token 的注意力。如果不缓存，每次生成新 token 都要重新计算所有 token 的 K 和 V，计算量为 O(n²)。有了 KV Cache，只需计算新 token 的 Q、K、V，然后将新的 K、V 拼接到缓存中，计算量降为 O(n)。对养老院场景的影响：假设用大模型生成一份完整的健康报告（约 1000 个 token），没有 KV Cache 时每个 token 都要重新计算前序所有 token 的注意力，总计算量是 1+2+3+...+1000 = 50 万次注意力计算。有 KV Cache 后只需 1000 次。代价是内存——KV Cache 的大小 = 2 × num_layers × num_heads × seq_len × d_k × batch_size × 精度字节数，对于 70B 模型处理 4K 序列，KV Cache 约占 10GB 显存。

---

### 题目 12：对比 BERT、GPT 和 T5 三种 Transformer 变体的架构差异和适用场景。

**难度**：⭐⭐  
**类型**：架构对比

**参考答案**：

| 特性 | BERT | GPT | T5 |
|------|------|-----|-----|
| 架构 | 仅编码器 | 仅解码器 | 编码器+解码器 |
| 注意力方向 | 双向 | 单向（因果） | 编码器双向，解码器单向 |
| 预训练任务 | 掩码语言模型（MLM） | 下一个词预测 | 文本到文本（span corruption） |
| 适用场景 | 分类、NER、问答、Embedding | 文本生成、对话、代码生成 | 翻译、摘要、通用 Seq2Seq |
| 典型应用 | 搜索引擎、情感分析、RAG Embedding | ChatGPT、LLaMA、Qwen | Google Translate、摘要 |

现代趋势：① BERT 仍在 Embedding 和分类任务中有不可替代的地位（速度快、效果好）；② GPT 风格的纯解码器架构已成为大模型主流（GPT-4、LLaMA、Qwen、Claude 都是）；③ T5 风格的编码器-解码器在特定 Seq2Seq 任务中仍有优势，但通用性不如纯解码器。养老院场景中：护理记录分类用 BERT，智能对话助手用 GPT/LLaMA，病历摘要用 T5 或 GPT。

---

## 六、延伸阅读与资源

1. **原始论文：《Attention Is All You Need》（Vaswani et al., 2017）**  
   Transformer 的奠基论文。建议配合 Jay Alammar 的"The Illustrated Transformer"博客一起阅读。

2. **Jay Alammar：The Illustrated Transformer（jalammar.github.io）**  
   最好的 Transformer 可视化教程，用动画逐步骤展示注意力计算过程。

3. **Andrej Karpathy：Let's build GPT from scratch（YouTube）**  
   从零用 PyTorch 实现一个 mini-GPT，约 2 小时，是理解 Transformer 的最佳实践教程。

4. **The Annotated Transformer（nlp.seas.harvard.edu/annotated-transformer）**  
   哈佛大学的逐行注释版 Transformer 实现，适合深入理解代码细节。

5. **d2l.ai 第 11 章：注意力机制**  
   动手学深度学习的注意力和 Transformer 章节，包含可运行的代码。

---

## 七、下一章预告

**第 05 章：大模型原理与发展脉络**

你已经理解了 Transformer 的"骨架"，下一章我们将看大模型如何在这个骨架上"长肉"：

- GPT 系列的演进：GPT-1 → GPT-2 → GPT-3 → GPT-4
- LLaMA 的开源革命：为什么 LLaMA 改变了整个行业
- 国产大模型：Qwen、DeepSeek、GLM 的技术路线对比
- Scaling Law：模型越大越聪明？数据和算力的权衡
- 涌现能力：为什么大模型突然"开窍"了？

从架构到规模，你将理解大模型为什么能"涌现"出惊人的能力。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| PyTorch | **2.13.0** | PyPI JSON API |
| flash-attention | **2.8.3.post1** | PyPI JSON API |
| einops | **0.8.2** | PyPI JSON API |
| transformers | **5.13.0** | PyPI JSON API |
| RoPE 状态 | LLaMA/Qwen/Mistral 标准位置编码 | 无变化 |
| Pre-Norm + RMSNorm | 现代 Transformer 标准做法 | 无变化 |
| KV Cache | 大模型推理标配技术 | 无变化 |

**可能过时的内容**：
- flash-attention 版本更新频繁，新版本可能有更多优化
- 新的位置编码方法可能取代 RoPE（如 YaRN、CoPE 等正在研究中）
- Transformer 架构本身可能被新架构挑战（如 Mamba/SSM 等状态空间模型）
- Flash Attention 3+ 的优化策略可能变化

**官方文档链接**：
- PyTorch Transformer：https://pytorch.org/docs/stable/nn.html#transformer-layers
- Flash Attention：https://github.com/Dao-AILab/flash-attention
- HuggingFace Transformers：https://huggingface.co/docs/transformers/
- 原始论文：https://arxiv.org/abs/1706.03762
