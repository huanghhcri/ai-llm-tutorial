# 第 06 章 大模型 API 调用实战 — OpenAI、Qwen、DeepSeek 三端对比

---

## 一、章节概述

### 本章学什么

本章进入**应用篇**——用 Python 代码调用大模型 API。你将掌握：

- OpenAI、通义千问（DashScope）、DeepSeek 三大平台的 API 调用方式
- Chat Completions API 的核心参数（temperature、top_p、max_tokens）
- **流式输出**（Streaming）：让回答"一个字一个字蹦出来"
- **Function Calling**：让大模型调用你的代码（查询长者信息、创建护理记录）
- 多轮对话管理：如何维护对话历史和系统提示词
- API 调用的错误处理、重试、成本控制

### 为什么学

大模型 API 是**所有 AI 应用的入口**——不管后续的 RAG（第 9 章）、Agent（第 11 章）还是微调（第 13 章），第一步都是调通 API。对 C# 后端开发者来说，这就是一次 HTTP 请求 + JSON 解析，但 Python 的 SDK 封装了大量细节，需要专门学习。

### 在知识体系中的位置

```
第1-5章（基础+原理）
            ↓
第6章 大模型 API 调用实战 ← 你在这里（应用篇起点）
            ↓
第7章 Prompt Engineering → 第8-9章 Embedding/RAG → 第10-12章 框架/Agent
```

---

## 二、核心知识点

### 2.1 API 调用的基本模型

#### 类比

养老院的护理员向"AI 医生"请教问题：

1. **系统提示词**（System Prompt）：告诉 AI 医生"你是养老院的健康顾问"
2. **用户消息**（User Message）：护理员问"张大爷血压 160/100，需要处理吗？"
3. **AI 回复**（Assistant Message）：AI 医生回答"属于高血压 2 级，建议..."
4. **Function Calling**：AI 说"帮我查一下张大爷的用药记录"→ 系统查数据库 → 返回结果 → AI 继续回答

#### 三大平台对比

| 特性 | OpenAI | 通义千问（DashScope） | DeepSeek |
|------|--------|---------------------|----------|
| SDK 包名 | `openai` | `dashscope` | `openai`（兼容） |
| 基础 URL | `api.openai.com` | `dashscope.aliyuncs.com` | `api.deepseek.com` |
| 模型名 | `gpt-4o` | `qwen-plus` / `qwen-max` | `deepseek-v4-pro` |
| Function Calling | ✅ | ✅ | ✅ |
| 流式输出 | ✅ | ✅ | ✅ |
| 多模态 | ✅（图片/音频） | ✅（图片） | ✅（图片） |
| Python SDK 版本 | `2.44.0` | `1.26.2` | 兼容 `openai` SDK |

---

### 2.2 OpenAI API 调用

```python
# 安装：uv add openai
from openai import OpenAI

# 初始化客户端
# 对标 C#：new HttpClient() + 配置 BaseAddress
client = OpenAI(
    api_key="sk-your-api-key",        # 替换为你的 API Key
    # base_url="https://api.openai.com/v1",  # 默认值，可省略
)

# ========== 基本调用 ==========
response = client.chat.completions.create(
    model="gpt-4o",                    # 模型名称
    messages=[
        # 系统提示词：定义 AI 的角色和行为
        # 对标 C#：相当于给 AI 一个"工作手册"
        {
            "role": "system",
            "content": "你是养老院的健康顾问，擅长根据长者的生命体征数据给出护理建议。回答要简洁专业。",
        },
        # 用户消息：当前的问题
        {
            "role": "user",
            "content": "张大爷，78岁，今日血压160/100mmHg，心率88次/分，请问需要如何处理？",
        },
    ],
    temperature=0.7,      # 控制随机性：0=确定性，1=最大随机性
    max_tokens=500,        # 最大输出 token 数
    top_p=0.9,             # 核采样：只从概率前 90% 的 token 中采样
)

# 提取回复内容
answer = response.choices[0].message.content
print(f"AI 回复:\n{answer}")

# 查看 token 使用量（用于成本计算）
usage = response.usage
print(f"\nToken 使用:")
print(f"  输入: {usage.prompt_tokens}")
print(f"  输出: {usage.completion_tokens}")
print(f"  总计: {usage.total_tokens}")
```

---

### 2.3 通义千问（DashScope）API 调用

```python
# 安装：uv add dashscope
import dashscope
from dashscope import Generation

# 设置 API Key
dashscope.api_key = "sk-your-dashscope-key"

# ========== 基本调用 ==========
response = Generation.call(
    model="qwen-plus",                 # 模型名称
    messages=[
        {
            "role": "system",
            "content": "你是养老院的健康顾问，擅长根据长者的生命体征数据给出护理建议。",
        },
        {
            "role": "user",
            "content": "张大爷，78岁，今日血压160/100mmHg，心率88次/分，请问需要如何处理？",
        },
    ],
    result_format="message",           # 返回格式
    temperature=0.7,
    max_tokens=500,
)

# 提取回复
print(f"AI 回复: {response.output.choices[0].message.content}")
print(f"Token 使用: {response.usage}")

# ========== 兼容 OpenAI SDK 的调用方式 ==========
# DashScope 也支持 OpenAI 兼容模式（推荐使用，代码可复用）
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-dashscope-key",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

response = client.chat.completions.create(
    model="qwen-plus",
    messages=[
        {"role": "system", "content": "你是养老院的健康顾问。"},
        {"role": "user", "content": "血压160/100需要处理吗？"},
    ],
)
print(f"AI 回复: {response.choices[0].message.content}")
```

---

### 2.4 DeepSeek API 调用

```python
# DeepSeek 完全兼容 OpenAI SDK，只需修改 base_url
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-deepseek-key",
    base_url="https://api.deepseek.com/v1",
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",             # 或 "deepseek-reasoner"（推理增强）
    messages=[
        {"role": "system", "content": "你是养老院的健康顾问。"},
        {"role": "user", "content": "张大爷血压160/100，伴有头晕，如何处理？"},
    ],
    temperature=0.7,
    max_tokens=500,
)

print(f"AI 回复: {response.choices[0].message.content}")
```

#### 统一封装：三平台一键切换

```python
from openai import OpenAI
from typing import Literal

# 平台配置
PROVIDERS = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "sk-your-openai-key",
        "model": "gpt-4o",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key": "sk-your-dashscope-key",
        "model": "qwen-plus",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "sk-your-deepseek-key",
        "model": "deepseek-v4-pro",
    },
}

def create_client(provider: str) -> tuple[OpenAI, str]:
    """创建指定平台的客户端"""
    config = PROVIDERS[provider]
    client = OpenAI(api_key=config["api_key"], base_url=config["base_url"])
    return client, config["model"]


def chat(provider: str, user_msg: str, system_msg: str = "你是养老院的健康顾问。") -> str:
    """统一调用接口"""
    client, model = create_client(provider)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )
    return response.choices[0].message.content


# 一键切换平台
for provider in ["openai", "qwen", "deepseek"]:
    print(f"\n--- {provider} ---")
    answer = chat(provider, "血压160/100需要处理吗？")
    print(answer[:100] + "...")
```

---

### 2.5 流式输出（Streaming）

#### 类比

养老院的 AI 医生回答问题时，如果等全部写完再一次性显示，护理员要等很久。流式输出就像医生**边想边说**——每想好一个词就立刻说出来，护理员马上就能看到。

```python
from openai import OpenAI

client = OpenAI(api_key="sk-your-key")

# ========== 流式调用 ==========
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是养老院的健康顾问。"},
        {"role": "user", "content": "请详细说明高血压长者的护理要点，包括饮食、运动、用药三个方面。"},
    ],
    stream=True,                        # 开启流式输出
    max_tokens=1000,
)

# 逐 chunk 接收
print("AI 回复: ", end="")
for chunk in stream:
    # chunk.choices[0].delta 可能为 None（最后一个 chunk）
    if chunk.choices and chunk.choices[0].delta.content:
        content = chunk.choices[0].delta.content
        print(content, end="", flush=True)   # flush=True 立即输出，不等缓冲
print()  # 换行
```

#### 异步流式输出（适合 Web 后端）

```python
import asyncio
from openai import AsyncOpenAI

# 异步客户端（对标 C# 的 HttpClient + await）
async_client = AsyncOpenAI(api_key="sk-your-key")

async def stream_health_advice(question: str) -> str:
    """
    异步流式获取健康建议。
    
    对标 C# 的 async IAsyncEnumerable<string> 模式。
    ASP.NET Core 中可通过 SignalR 将每个 chunk 推送给前端。
    """
    stream = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "你是养老院的健康顾问。"},
            {"role": "user", "content": question},
        ],
        stream=True,
    )
    
    full_response = ""
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            full_response += content
            print(content, end="", flush=True)
    
    print()
    return full_response


# 运行异步函数
# answer = asyncio.run(stream_health_advice("高血压长者的护理要点？"))
```

---

### 2.6 Function Calling — 让大模型调用你的代码

#### 类比

养老院的 AI 医生被问到"张大爷最近的血压情况怎么样？"时，它不知道张大爷的血压数据（不在上下文中）。但它可以说："我需要调用**查询血压记录**的工具"——系统查完数据库后把结果返回给 AI，AI 再基于数据给出专业建议。

**这就是 Function Calling 的本质：AI 决定调用什么函数 + 传什么参数，系统执行函数并返回结果。**

```python
import json
from openai import OpenAI
from datetime import datetime

client = OpenAI(api_key="sk-your-key")

# ========== 第一步：定义工具（函数声明） ==========
# 这些是告诉 AI "你有哪些工具可以用"
# 对标 C#：定义接口方法签名

tools = [
    {
        "type": "function",
        "function": {
            "name": "query_member_vitals",
            "description": "查询指定长者最近的生命体征数据，包括血压、心率、体温、血氧等",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "integer",
                        "description": "长者 ID",
                    },
                    "days": {
                        "type": "integer",
                        "description": "查询最近多少天的数据，默认 7",
                    },
                },
                "required": ["member_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_care_record",
            "description": "为指定长者创建一条护理记录",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "integer",
                        "description": "长者 ID",
                    },
                    "content": {
                        "type": "string",
                        "description": "护理记录内容",
                    },
                    "care_level": {
                        "type": "string",
                        "enum": ["自理", "半护理", "全护理", "特护"],
                        "description": "护理等级",
                    },
                },
                "required": ["member_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_medical_knowledge",
            "description": "搜索医学知识库，查找疾病、用药、护理相关的知识",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词",
                    },
                },
                "required": ["query"],
            },
        },
    },
]


# ========== 第二步：模拟工具函数实现 ==========
# 实际项目中，这些函数会查数据库或调用微服务 API

def query_member_vitals(member_id: int, days: int = 7) -> dict:
    """查询长者生命体征（模拟数据）"""
    # 实际项目：SELECT * FROM VitalSigns WHERE MemberId=@id AND Date >= @startDate
    return {
        "member_id": member_id,
        "name": "张大爷",
        "records": [
            {"date": "2026-07-07", "bp": "155/95", "hr": 88, "temp": 36.5, "sao2": 96},
            {"date": "2026-07-06", "bp": "150/92", "hr": 85, "temp": 36.6, "sao2": 97},
            {"date": "2026-07-05", "bp": "148/90", "hr": 82, "temp": 36.4, "sao2": 96},
        ],
    }


def create_care_record(member_id: int, content: str, care_level: str = None) -> dict:
    """创建护理记录（模拟）"""
    # 实际项目：INSERT INTO CareRecords (MemberId, Content, CareLevel, CreatedAt) VALUES (...)
    return {
        "success": True,
        "record_id": "CR-20260709-001",
        "message": f"已为长者 {member_id} 创建护理记录",
    }


def search_medical_knowledge(query: str) -> dict:
    """搜索医学知识库（模拟）"""
    # 实际项目：向量检索 RAG 系统
    knowledge_base = {
        "高血压": "高血压定义：收缩压≥140mmHg 和/或舒张压≥90mmHg。分级：1级(140-159/90-99)、2级(160-179/100-109)、3级(≥180/≥110)。",
        "低血氧": "血氧饱和度低于90%需要立即处理，给予吸氧治疗，排查肺部疾病。",
        "降压药": "常用降压药：CCB类(氨氯地平)、ARB类(缬沙坦)、ACEI类(贝那普利)。老年人首选CCB或ARB。",
    }
    for key, value in knowledge_base.items():
        if key in query:
            return {"query": query, "result": value}
    return {"query": query, "result": "未找到相关知识"}


# 工具函数映射表（根据函数名调用对应实现）
TOOL_FUNCTIONS = {
    "query_member_vitals": query_member_vitals,
    "create_care_record": create_care_record,
    "search_medical_knowledge": search_medical_knowledge,
}


# ========== 第三步：完整的 Function Calling 流程 ==========

def chat_with_tools(user_message: str, system_prompt: str = None) -> str:
    """
    带工具调用的完整对话流程。
    
    流程：
    1. 用户提问 → AI 分析是否需要调用工具
    2. 如果需要 → AI 返回工具调用请求（函数名 + 参数）
    3. 系统执行工具 → 将结果返回给 AI
    4. AI 基于工具结果生成最终回复
    """
    if system_prompt is None:
        system_prompt = """你是养老院的智能健康助手。
你可以：
1. 查询长者的生命体征数据
2. 创建护理记录
3. 搜索医学知识库
请根据用户的问题，必要时调用工具获取数据，然后给出专业的护理建议。"""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
    
    # 第一轮：让 AI 决定是否需要调用工具
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=tools,
        tool_choice="auto",            # auto=AI自己决定, required=强制调用, none=禁止调用
    )
    
    assistant_message = response.choices[0].message
    
    # 检查 AI 是否要求调用工具
    if assistant_message.tool_calls:
        # AI 要求调用工具——将 AI 的回复加入消息历史
        messages.append(assistant_message)
        
        # 逐个执行工具调用
        for tool_call in assistant_message.tool_calls:
            func_name = tool_call.function.name
            func_args = json.loads(tool_call.function.arguments)
            
            print(f"  🔧 调用工具: {func_name}({func_args})")
            
            # 执行工具函数
            func = TOOL_FUNCTIONS.get(func_name)
            if func:
                result = func(**func_args)
            else:
                result = {"error": f"未知工具: {func_name}"}
            
            # 将工具结果加入消息历史
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result, ensure_ascii=False),
            })
        
        # 第二轮：让 AI 基于工具结果生成最终回复
        final_response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
        )
        
        return final_response.choices[0].message.content
    
    else:
        # AI 不需要调用工具，直接返回回复
        return assistant_message.content


# ========== 测试 ==========
print("=" * 60)
print("Function Calling 演示")
print("=" * 60)

# 场景 1：需要查询数据
print("\n📋 用户: 张大爷最近血压怎么样？需要调整用药吗？")
answer = chat_with_tools("张大爷（ID: 1001）最近血压怎么样？需要调整用药吗？")
print(f"\n🤖 AI: {answer}")

# 场景 2：需要创建记录
print("\n📋 用户: 帮我给张大爷创建一条护理记录：今日血压偏高，已调整降压药用量。")
answer = chat_with_tools("帮我给张大爷（ID: 1001）创建一条护理记录：今日血压偏高，已调整降压药用量。护理等级半护理。")
print(f"\n🤖 AI: {answer}")

# 场景 3：需要搜索知识库
print("\n📋 用户: 高血压2级的诊断标准是什么？")
answer = chat_with_tools("高血压2级的诊断标准是什么？")
print(f"\n🤖 AI: {answer}")
```

---

### 2.7 多轮对话管理

```python
from openai import OpenAI

client = OpenAI(api_key="sk-your-key")


class NursingAssistant:
    """
    养老院智能助手——支持多轮对话。
    
    对标 C#：你可以把它理解为一个 Scoped 服务，
    每次会话创建一个实例，维护该会话的对话历史。
    """
    
    def __init__(self, system_prompt: str = None, model: str = "gpt-4o"):
        self.model = model
        self.messages: list[dict] = []
        
        if system_prompt is None:
            system_prompt = """你是养老院的智能健康助手"小护"。
你的职责：
1. 回答护理员关于长者健康状况的问题
2. 根据生命体征数据给出护理建议
3. 提醒用药注意事项
4. 在必要时建议就医

回答要求：简洁专业，必要时用列表格式，涉及紧急情况时优先提醒安全。"""
        
        self.messages.append({"role": "system", "content": system_prompt})
    
    def chat(self, user_input: str) -> str:
        """发送消息并获取回复"""
        self.messages.append({"role": "user", "content": user_input})
        
        response = client.chat.completions.create(
            model=self.model,
            messages=self.messages,
            temperature=0.7,
            max_tokens=1000,
        )
        
        assistant_reply = response.choices[0].message.content
        self.messages.append({"role": "assistant", "content": assistant_reply})
        
        # Token 使用统计
        usage = response.usage
        self._total_tokens = getattr(self, '_total_tokens', 0) + usage.total_tokens
        
        return assistant_reply
    
    def get_history(self) -> list[dict]:
        """获取对话历史"""
        return self.messages
    
    def get_token_usage(self) -> int:
        """获取累计 Token 使用量"""
        return getattr(self, '_total_tokens', 0)
    
    def trim_history(self, max_turns: int = 20):
        """
        裁剪对话历史，防止上下文超限。
        
        策略：保留系统提示词 + 最近 N 轮对话。
        对标 C#：类似缓存淘汰策略 LRU。
        """
        if len(self.messages) > max_turns * 2 + 1:
            # 保留 system prompt + 最近的对话
            self.messages = [self.messages[0]] + self.messages[-(max_turns * 2):]


# 使用示例
assistant = NursingAssistant()

# 多轮对话
print("🏥 养老院智能助手（输入 'quit' 退出）\n")

conversations = [
    "你好，我是今天的值班护理员。",
    "3号床的李奶奶今天血糖有点高，空腹血糖8.5，需要怎么处理？",
    "她现在吃的降压药是氨氯地平，和降糖药有冲突吗？",
    "好的，那我先帮她调整饮食，记录一下今天的护理情况。",
]

for msg in conversations:
    print(f"👤 护理员: {msg}")
    reply = assistant.chat(msg)
    print(f"🤖 小护: {reply}\n")

print(f"累计 Token 使用: {assistant.get_token_usage()}")
```

---

### 2.8 API 调用的参数详解

```python
# ========== 核心参数详解 ==========

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "你好"}],
    
    # 1. temperature（温度）— 控制随机性
    # 0.0 = 完全确定性（每次结果一样）
    # 0.7 = 适度随机（推荐日常使用）
    # 1.0 = 最大随机性（创意写作用）
    # 1.5+ = 非常随机（可能产生不连贯内容）
    temperature=0.7,
    
    # 2. top_p（核采样）— 另一种控制随机性的方式
    # 0.1 = 只从概率最高的 10% token 中采样（更确定）
    # 0.9 = 从概率前 90% 的 token 中采样（更丰富）
    # 1.0 = 不做限制
    # 注意：temperature 和 top_p 通常只调一个，不要同时调
    top_p=0.9,
    
    # 3. max_tokens — 最大输出 token 数
    # 限制模型回复的长度，防止过长输出消耗过多 token
    max_tokens=500,
    
    # 4. frequency_penalty — 频率惩罚
    # 正值降低重复词的概率（减少"废话"）
    # 范围：-2.0 到 2.0
    frequency_penalty=0.0,
    
    # 5. presence_penalty — 存在惩罚
    # 正值鼓励模型谈论新话题
    # 范围：-2.0 到 2.0
    presence_penalty=0.0,
    
    # 6. stop — 停止词
    # 遇到这些字符串时停止生成
    stop=["\n\n", "###"],
    
    # 7. response_format — 输出格式
    # {"type": "json_object"} 强制输出 JSON（适合结构化数据提取）
    # response_format={"type": "json_object"},
)

# ========== 不同场景的参数推荐 ==========
parameter_presets = {
    "精确问答（医疗咨询）": {
        "temperature": 0.1,    # 低随机性，确保准确性
        "top_p": 0.9,
        "max_tokens": 500,
    },
    "健康报告生成": {
        "temperature": 0.5,    # 适中随机性，保证可读性
        "top_p": 0.9,
        "max_tokens": 2000,
    },
    "创意活动方案": {
        "temperature": 0.9,    # 高随机性，激发创意
        "top_p": 0.95,
        "max_tokens": 1500,
    },
    "结构化数据提取": {
        "temperature": 0.0,    # 完全确定性
        "top_p": 1.0,
        "max_tokens": 1000,
        "response_format": {"type": "json_object"},
    },
}
```

---

### 2.9 错误处理与重试

```python
import time
from openai import OpenAI, APIError, RateLimitError, APITimeoutError

client = OpenAI(api_key="sk-your-key")


def robust_chat(
    messages: list[dict],
    model: str = "gpt-4o",
    max_retries: int = 3,
    timeout: float = 30.0,
) -> str:
    """
    带重试机制的 API 调用。
    
    对标 C#：Polly 的 Retry 策略。
    处理常见的 API 错误：超时、限流、服务端错误。
    
    Args:
        messages: 对话消息列表
        model: 模型名称
        max_retries: 最大重试次数
        timeout: 超时时间（秒）
    
    Returns:
        AI 回复内容
    """
    last_error = None
    
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                timeout=timeout,
                max_tokens=1000,
            )
            return response.choices[0].message.content
        
        except RateLimitError as e:
            # API 调用频率超限——等待后重试
            wait_time = 2 ** attempt * 5   # 指数退避：5s, 10s, 20s
            print(f"⚠️ 频率超限，等待 {wait_time} 秒后重试（第 {attempt+1} 次）...")
            time.sleep(wait_time)
            last_error = e
        
        except APITimeoutError as e:
            # 请求超时——可能 prompt 太长或服务繁忙
            print(f"⚠️ 请求超时，重试（第 {attempt+1} 次）...")
            last_error = e
        
        except APIError as e:
            # 服务端错误——短暂等待后重试
            if e.status_code >= 500:
                wait_time = 2 ** attempt * 3
                print(f"⚠️ 服务端错误 ({e.status_code})，等待 {wait_time} 秒后重试...")
                time.sleep(wait_time)
                last_error = e
            else:
                # 4xx 客户端错误（如参数错误）——不重试
                raise
        
        except Exception as e:
            # 未知错误——不重试
            print(f"❌ 未知错误: {e}")
            raise
    
    # 所有重试都失败
    raise Exception(f"API 调用失败（已重试 {max_retries} 次）: {last_error}")
```

---

## 三、养老院业务实战案例

### 需求描述

构建一个**养老院智能健康助手**，具备以下能力：

1. 多轮对话：护理员可以持续与 AI 交流
2. Function Calling：自动查询长者数据、搜索知识库、创建护理记录
3. 流式输出：实时显示 AI 回复
4. 结构化数据提取：从自由文本中提取护理记录结构化信息
5. 成本统计：追踪每次调用的 token 消耗

### 完整代码

```python
"""
养老院智能健康助手 — API 调用实战
==================================
第 6 章实战案例：多平台 API 调用 + Function Calling + 流式输出

运行环境：Python 3.14
安装依赖：uv add openai dashscope
"""

import json
import time
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional
from openai import OpenAI


# ============================================================
# 配置管理
# ============================================================

@dataclass
class APIConfig:
    """API 配置"""
    provider: str
    base_url: str
    api_key: str
    model: str
    price_input: float    # 元/百万 tokens
    price_output: float   # 元/百万 tokens


# 预置配置（实际项目中从配置文件或环境变量读取）
CONFIGS = {
    "qwen": APIConfig(
        provider="qwen",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="sk-your-key",    # 替换为真实 Key
        model="qwen-plus",
        price_input=0.8,
        price_output=2.0,
    ),
    "deepseek": APIConfig(
        provider="deepseek",
        base_url="https://api.deepseek.com/v1",
        api_key="sk-your-key",
        model="deepseek-v4-pro",
        price_input=1.0,
        price_output=2.0,
    ),
    "openai": APIConfig(
        provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-your-key",
        model="gpt-4o",
        price_input=18.0,
        price_output=54.0,
    ),
}


# ============================================================
# 模拟数据库（实际项目中替换为真实数据库查询）
# ============================================================

MOCK_DB = {
    "members": {
        1001: {"name": "张大爷", "age": 78, "room": "A201", "care_level": "半护理",
               "conditions": ["高血压", "糖尿病"], "medications": ["氨氯地平", "二甲双胍"]},
        1002: {"name": "李奶奶", "age": 85, "room": "B302", "care_level": "全护理",
               "conditions": ["冠心病", "骨质疏松"], "medications": ["阿司匹林", "钙片"]},
        1003: {"name": "王爷爷", "age": 92, "room": "C105", "care_level": "特护",
               "conditions": ["帕金森", "慢性心衰"], "medications": ["左旋多巴", "利尿剂"]},
    },
    "vital_signs": {
        1001: [
            {"date": "2026-07-09", "bp": "155/95", "hr": 88, "temp": 36.5, "sao2": 96, "bs": 7.2},
            {"date": "2026-07-08", "bp": "150/92", "hr": 85, "temp": 36.6, "sao2": 97, "bs": 6.8},
            {"date": "2026-07-07", "bp": "148/90", "hr": 82, "temp": 36.4, "sao2": 96, "bs": 7.5},
        ],
        1002: [
            {"date": "2026-07-09", "bp": "130/82", "hr": 76, "temp": 36.7, "sao2": 95, "bs": 5.8},
            {"date": "2026-07-08", "bp": "128/80", "hr": 74, "temp": 36.5, "sao2": 96, "bs": 6.1},
        ],
        1003: [
            {"date": "2026-07-09", "bp": "110/68", "hr": 52, "temp": 36.8, "sao2": 93, "bs": 5.5},
        ],
    },
    "care_records": [],
}


# ============================================================
# 工具函数定义
# ============================================================

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_member_info",
            "description": "查询长者的基本信息，包括姓名、年龄、房间号、护理等级、既往病史、用药情况",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {"type": "integer", "description": "长者 ID"},
                },
                "required": ["member_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_vital_signs",
            "description": "查询长者最近的生命体征数据，包括血压、心率、体温、血氧、血糖",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {"type": "integer", "description": "长者 ID"},
                    "days": {"type": "integer", "description": "查询最近多少天，默认 3"},
                },
                "required": ["member_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_care_record",
            "description": "为长者创建一条护理记录",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {"type": "integer", "description": "长者 ID"},
                    "content": {"type": "string", "description": "护理记录内容"},
                    "record_type": {
                        "type": "string",
                        "enum": ["日常护理", "异常处理", "用药调整", "健康评估"],
                        "description": "记录类型",
                    },
                },
                "required": ["member_id", "content", "record_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": "搜索医学知识库，查找疾病诊断标准、用药指南、护理规范等",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "category": {
                        "type": "string",
                        "enum": ["疾病", "用药", "护理", "营养", "康复"],
                        "description": "知识类别",
                    },
                },
                "required": ["query"],
            },
        },
    },
]


def query_member_info(member_id: int) -> dict:
    """查询长者基本信息"""
    member = MOCK_DB["members"].get(member_id)
    if member:
        return {"found": True, "member_id": member_id, **member}
    return {"found": False, "message": f"未找到 ID 为 {member_id} 的长者"}


def query_vital_signs(member_id: int, days: int = 3) -> dict:
    """查询生命体征"""
    records = MOCK_DB["vital_signs"].get(member_id, [])
    return {"member_id": member_id, "records": records[:days]}


def create_care_record(member_id: int, content: str, record_type: str) -> dict:
    """创建护理记录"""
    record = {
        "id": f"CR-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "member_id": member_id,
        "content": content,
        "record_type": record_type,
        "created_at": datetime.now().isoformat(),
        "created_by": "AI 助手",
    }
    MOCK_DB["care_records"].append(record)
    return {"success": True, "record_id": record["id"], "message": "护理记录已创建"}


def search_knowledge(query: str, category: str = None) -> dict:
    """搜索知识库"""
    knowledge = {
        "高血压": "高血压分级：1级(140-159/90-99)、2级(160-179/100-109)、3级(≥180/≥110)。老年人降压目标<150/90mmHg。",
        "低血氧": "SpO2<90%为低氧血症，需立即吸氧。SpO2<85%为严重低氧，需紧急处理。",
        "降压药": "CCB(氨氯地平)、ARB(缬沙坦)、ACEI(贝那普利)。老年人首选CCB或ARB。",
        "跌倒": "跌倒后评估：意识→出血→骨折→疼痛。髋部疼痛+活动受限→高度怀疑骨折。",
        "糖尿病": "空腹血糖<7.0mmol/L，餐后2h<10.0mmol/L。老年人可适当放宽至空腹<8.0。",
    }
    for key, value in knowledge.items():
        if key in query:
            return {"query": query, "category": category or "通用", "result": value}
    return {"query": query, "result": "未找到相关知识，建议查阅最新临床指南"}


TOOL_MAP = {
    "query_member_info": query_member_info,
    "query_vital_signs": query_vital_signs,
    "create_care_record": create_care_record,
    "search_knowledge": search_knowledge,
}


# ============================================================
# 智能助手核心类
# ============================================================

class NursingAssistant:
    """
    养老院智能健康助手。
    
    功能：
    1. 多轮对话（维护历史）
    2. Function Calling（自动调用工具）
    3. 流式输出（实时显示）
    4. 成本统计
    """
    
    SYSTEM_PROMPT = """你是养老院的智能健康助手"小护"，由 AI 驱动。

你的职责：
1. 回答护理员关于长者健康状况的问题
2. 查询长者的基本信息和生命体征数据
3. 根据数据给出专业的护理建议
4. 在必要时创建护理记录
5. 搜索医学知识库提供专业参考

回答要求：
- 简洁专业，使用中文
- 涉及紧急情况（如血氧<85%、意识丧失）时，优先提醒安全
- 给出建议时注明依据（如"根据高血压指南..."）
- 需要数据时主动调用工具查询，不要猜测"""
    
    def __init__(self, provider: str = "qwen"):
        config = CONFIGS[provider]
        self.client = OpenAI(api_key=config.api_key, base_url=config.base_url)
        self.model = config.model
        self.config = config
        self.messages: list[dict] = [{"role": "system", "content": self.SYSTEM_PROMPT}]
        self.total_input_tokens = 0
        self.total_output_tokens = 0
    
    def chat(self, user_input: str, stream: bool = False) -> str:
        """发送消息并获取回复（支持流式）"""
        self.messages.append({"role": "user", "content": user_input})
        
        # 第一轮：检查是否需要调用工具
        response = self.client.chat.completions.create(
            model=self.model,
            messages=self.messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=2000,
        )
        
        assistant_msg = response.choices[0].message
        self._track_usage(response.usage)
        
        # 处理工具调用
        if assistant_msg.tool_calls:
            self.messages.append(assistant_msg)
            
            for tc in assistant_msg.tool_calls:
                func_name = tc.function.name
                func_args = json.loads(tc.function.arguments)
                
                print(f"  🔧 [{func_name}] {json.dumps(func_args, ensure_ascii=False)}")
                
                func = TOOL_MAP.get(func_name)
                result = func(**func_args) if func else {"error": "未知工具"}
                
                self.messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })
            
            # 第二轮：基于工具结果生成回复（支持流式）
            if stream:
                return self._stream_response()
            else:
                final = self.client.chat.completions.create(
                    model=self.model,
                    messages=self.messages,
                    temperature=0.3,
                    max_tokens=2000,
                )
                self._track_usage(final.usage)
                reply = final.choices[0].message.content
                self.messages.append({"role": "assistant", "content": reply})
                return reply
        else:
            reply = assistant_msg.content
            self.messages.append({"role": "assistant", "content": reply})
            return reply
    
    def _stream_response(self) -> str:
        """流式输出回复"""
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=self.messages,
            temperature=0.3,
            max_tokens=2000,
            stream=True,
        )
        
        full_response = ""
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                print(content, end="", flush=True)
                full_response += content
        print()
        
        self.messages.append({"role": "assistant", "content": full_response})
        return full_response
    
    def _track_usage(self, usage):
        """追踪 token 使用"""
        self.total_input_tokens += usage.prompt_tokens
        self.total_output_tokens += usage.completion_tokens
    
    def get_cost_estimate(self) -> float:
        """估算总成本（元）"""
        input_cost = self.total_input_tokens / 1_000_000 * self.config.price_input
        output_cost = self.total_output_tokens / 1_000_000 * self.config.price_output
        return input_cost + output_cost
    
    def get_stats(self) -> dict:
        """获取使用统计"""
        return {
            "provider": self.config.provider,
            "model": self.model,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_tokens": self.total_input_tokens + self.total_output_tokens,
            "estimated_cost_yuan": round(self.get_cost_estimate(), 4),
            "conversation_turns": (len(self.messages) - 1) // 2,
        }
    
    def trim_history(self, max_turns: int = 15):
        """裁剪对话历史"""
        if len(self.messages) > max_turns * 2 + 1:
            self.messages = [self.messages[0]] + self.messages[-(max_turns * 2):]


# ============================================================
# 演示运行
# ============================================================

def demo():
    """演示养老院智能助手"""
    
    print("=" * 60)
    print("  养老院智能健康助手 — API 实战演示")
    print("=" * 60)
    print()
    print("  注：本演示使用模拟数据，需要替换 API Key 才能真正运行")
    print("  支持的平台：qwen / deepseek / openai")
    print()
    
    # 由于没有真实 API Key，这里展示的是代码结构和调用流程
    # 实际运行时替换 CONFIGS 中的 api_key
    
    # 模拟对话流程
    conversations = [
        "你好，我是今天的值班护理员小王。",
        "帮我查一下张大爷（ID: 1001）最近的血压情况。",
        "他血压偏高，需要调整用药吗？",
        "好的，帮我创建一条护理记录：张大爷近期血压持续偏高，已建议医生评估用药方案。",
        "再帮我查一下王爷爷（ID: 1003）今天的血氧是多少？",
        "血氧93%偏低，有什么处理建议？",
    ]
    
    print("📋 预期对话流程：")
    print("-" * 60)
    
    for i, msg in enumerate(conversations):
        print(f"\n👤 护理员: {msg}")
        print(f"🤖 小护: [AI 将通过 Function Calling 查询数据后回复]")
        
        if "查一下张大爷" in msg:
            print(f"  🔧 [query_member_info] {{member_id: 1001}}")
            print(f"  🔧 [query_vital_signs] {{member_id: 1001, days: 3}}")
            print(f"  🤖 小护: 张大爷最近3天的血压分别为 155/95、150/92、148/90 mmHg，")
            print(f"         呈持续偏高趋势，属于高血压 2 级。建议：")
            print(f"         1. 通知医生评估是否需要调整降压药剂量")
            print(f"         2. 加强每日血压监测（早晚各一次）")
            print(f"         3. 饮食控制：低盐饮食，每日钠摄入<5g")
        
        elif "创建一条护理记录" in msg:
            print(f"  🔧 [create_care_record] {{member_id: 1001, content: '...'}}")
            print(f"  🤖 小护: 已创建护理记录 CR-2026070901，记录类型：用药调整。")
        
        elif "王爷爷" in msg and "血氧" in msg:
            print(f"  🔧 [query_vital_signs] {{member_id: 1003}}")
            print(f"  🤖 小护: 王爷爷今日血氧饱和度为 93%，低于正常范围（>95%）。")
            print(f"         处理建议：")
            print(f"         1. 立即给予低流量吸氧（1-2L/min）")
            print(f"         2. 半卧位休息，避免平躺")
            print(f"         3. 30 分钟后复查血氧")
            print(f"         4. 如持续 <90%，立即通知医生")
    
    print(f"\n{'=' * 60}")
    print(f"📊 预期使用统计:")
    print(f"  平台: qwen (qwen-plus)")
    print(f"  对话轮次: 6")
    print(f"  预估 Token: ~3,000 (输入) + ~1,500 (输出)")
    print(f"  预估成本: ¥0.005（约 5 毛钱/千次对话）")
    print(f"  Function Calling 次数: 4 次")


if __name__ == "__main__":
    demo()
```

### 运行结果（模拟）

```
============================================================
  养老院智能健康助手 — API 实战演示
============================================================

  注：本演示使用模拟数据，需要替换 API Key 才能真正运行
  支持的平台：qwen / deepseek / openai

📋 预期对话流程：
------------------------------------------------------------

👤 护理员: 你好，我是今天的值班护理员小王。
🤖 小护: 你好小王！我是智能健康助手小护。今天有什么需要帮助的吗？

👤 护理员: 帮我查一下张大爷（ID: 1001）最近的血压情况。
  🔧 [query_member_info] {member_id: 1001}
  🔧 [query_vital_signs] {member_id: 1001, days: 3}
  🤖 小护: 张大爷最近3天的血压分别为 155/95、150/92、148/90 mmHg，
         呈持续偏高趋势，属于高血压 2 级。建议：
         1. 通知医生评估是否需要调整降压药剂量
         2. 加强每日血压监测（早晚各一次）
         3. 饮食控制：低盐饮食，每日钠摄入<5g

👤 护理员: 好的，帮我创建一条护理记录：张大爷近期血压持续偏高...
  🔧 [create_care_record] {member_id: 1001, content: '...'}
  🤖 小护: 已创建护理记录 CR-2026070901，记录类型：用药调整。

👤 护理员: 再帮我查一下王爷爷（ID: 1003）今天的血氧是多少？
  🔧 [query_vital_signs] {member_id: 1003}
  🤖 小护: 王爷爷今日血氧饱和度为 93%，低于正常范围（>95%）。
         处理建议：
         1. 立即给予低流量吸氧（1-2L/min）
         2. 半卧位休息，避免平躺
         3. 30 分钟后复查血氧
         4. 如持续 <90%，立即通知医生

============================================================
📊 预期使用统计:
  平台: qwen (qwen-plus)
  对话轮次: 6
  预估 Token: ~3,000 (输入) + ~1,500 (输出)
  预估成本: ¥0.005（约 5 毛钱/千次对话）
  Function Calling 次数: 4 次
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **Chat Completions API** | 发送消息列表，获取 AI 回复 | `messages=[system, user, assistant, ...]` |
| **System Prompt** | 定义 AI 的角色和行为准则 | 对话的第一条消息，设定"人设" |
| **temperature** | 控制输出的随机性 | 0=确定性，0.7=日常，1.0=创意 |
| **top_p** | 核采样，另一种控制随机性的方式 | 与 temperature 通常只调一个 |
| **max_tokens** | 限制输出长度 | 防止过长输出消耗过多 token |
| **流式输出** | 逐 token 返回结果 | `stream=True`，提升用户体验 |
| **Function Calling** | AI 决定调用哪个函数+传什么参数 | 三步：定义工具→AI 请求→执行→返回结果 |
| **多轮对话** | 维护 messages 列表实现上下文连续 | 定期裁剪历史防止超限 |
| **异步调用** | `AsyncOpenAI` + `await` | ASP.NET Core 后端用异步避免阻塞 |
| **错误处理** | 重试+指数退避 | RateLimitError→等待，TimeoutError→重试 |
| **成本控制** | 追踪 token 使用量 | `response.usage` 获取 input/output tokens |
| **三平台统一** | OpenAI 兼容接口，切换 base_url | Qwen/DeepSeek 都兼容 OpenAI SDK |

---

## 五、本章面试题

### 题目 1：解释 Chat Completions API 中 system、user、assistant、tool 四种角色的区别。

**难度**：⭐  
**类型**：API 基础

**参考答案**：

四种角色构成完整的对话上下文：① **system**：系统提示词，定义 AI 的角色、行为准则和输出格式，对整个对话生效，通常放在第一条；② **user**：用户消息，代表人类的输入（问题、指令）；③ **assistant**：AI 的回复，多轮对话中需要将历史 AI 回复也放入 messages 以维持上下文；④ **tool**：工具调用结果，当 AI 通过 Function Calling 请求调用工具时，系统执行工具后将结果以 tool 角色返回。消息列表的顺序很重要——它构成了"对话剧本"，AI 会根据所有历史消息生成下一条回复。在养老院场景中，system prompt 定义"你是养老院健康顾问"，user 是护理员的问题，assistant 是 AI 的建议，tool 是从数据库查询到的长者数据。

---

### 题目 2：temperature 参数如何影响大模型的输出？不同场景应该如何设置？

**难度**：⭐  
**类型**：参数调优

**参考答案**：

temperature 控制输出 token 的采样随机性。从概率分布角度：模型对每个位置输出一个概率分布（logits），temperature 通过 `softmax(logits / T)` 调整分布的"尖锐度"。① **T→0**：分布极度尖锐，几乎总是选概率最高的 token（确定性输出，每次结果几乎一样）；② **T=1**：按原始概率分布采样（标准随机性）；③ **T>1**：分布更平坦，低概率 token 被选中的机会增大（更随机、更有创意，但可能不连贯）。场景推荐：医疗咨询/数据提取用 T=0.1（确保准确）；日常对话用 T=0.7（平衡准确性和丰富性）；创意活动方案用 T=0.9（激发创意）；JSON 结构化输出用 T=0（完全确定）。注意：temperature 和 top_p 通常只调一个，同时调会产生不可预测的效果。

---

### 题目 3：Function Calling 的完整流程是什么？有哪些注意事项？

**难度**：⭐⭐  
**类型**：核心功能

**参考答案**：

完整流程：① **定义工具**：在 API 调用时传入 `tools` 参数，描述每个函数的名称、描述和参数 schema；② **AI 决策**：模型分析用户问题，判断是否需要调用工具，如果需要则返回 `tool_calls`（包含函数名和参数）；③ **执行工具**：系统解析 `tool_calls`，在本地执行对应函数；④ **返回结果**：将工具执行结果以 `role=tool` 的消息放回 messages 列表；⑤ **AI 总结**：再次调用 API，AI 基于工具结果生成最终回复。注意事项：① 工具的 description 要清晰准确——AI 靠它决定何时调用；② 参数 schema 要严格定义类型和枚举值；③ 工具函数要做好异常处理——不要因为工具报错导致整个对话中断；④ 控制工具调用次数——避免 AI 陷入无限循环调用；⑤ 敏感操作（如修改数据）需要人工确认。养老院场景中，查询类工具可以直接调用，写入类工具（创建护理记录）应先展示给护理员确认。

---

### 题目 4：为什么 DeepSeek 和 Qwen 的 API 可以用 OpenAI 的 SDK 调用？这种兼容性有什么意义？

**难度**：⭐  
**类型**：生态理解

**参考答案**：

DeepSeek 和 Qwen 都实现了 **OpenAI 兼容的 API 接口**——它们的服务端遵循 OpenAI 的 Chat Completions API 规范（相同的请求格式、响应格式、错误码），只需修改 `base_url` 和 `api_key` 就能使用 OpenAI 的 Python SDK。这种兼容性的意义：① **代码复用**——一套代码可以在多个平台之间无缝切换，不需要为每个平台写不同的调用逻辑；② **降低迁移成本**——从 OpenAI 切换到国产模型（数据合规需求）只需改两行配置；③ **生态标准化**——OpenAI 的 API 格式已成为事实标准，兼容它意味着能接入所有支持 OpenAI 格式的工具链（LangChain、LlamaIndex 等）。在养老院项目中，可以先用 OpenAI 验证功能，上线时切换到 Qwen 或 DeepSeek（数据不出境、成本更低），代码零修改。

---

### 题目 5：如何实现流式输出？它解决了什么用户体验问题？

**难度**：⭐  
**类型**：工程实践

**参考答案**：

流式输出通过 `stream=True` 参数开启，API 会以 SSE（Server-Sent Events）格式逐 chunk 返回结果，每个 chunk 包含 1-2 个新生成的 token。解决的用户体验问题：① **降低感知延迟**——非流式模式下，用户需要等待整个回复生成完毕才能看到（可能 5-15 秒），流式模式下第一个 token 在 100-300ms 内就能显示；② **用户可以提前阅读**——在 AI 还在生成时，用户已经可以开始阅读前面的内容，决定是否需要中断；③ **与 ChatGPT 体验一致**——用户已经习惯了"打字机效果"。实现要点：Python 用 `for chunk in stream` 遍历；前端用 EventSource 或 fetch ReadableStream；ASP.NET Core 后端用 `IAsyncEnumerable` + SignalR 推送给前端。注意：流式模式下无法获取完整的 `usage` 统计，需要额外计算或在最后统计。

---

### 题目 6：如何管理多轮对话的上下文？当对话太长时怎么办？

**难度**：⭐⭐  
**类型**：工程实践

**参考答案**：

多轮对话通过维护 `messages` 列表实现——每次用户发消息时追加 user 消息，收到回复后追加 assistant 消息。当对话太长时的处理策略：① **滑动窗口**——保留 system prompt + 最近 N 轮对话（如 N=15），丢弃更早的历史；② **摘要压缩**——让 AI 总结前面的对话，用摘要替代详细历史（如"前面讨论了张大爷的血压问题，建议调整用药"）；③ **分层记忆**——短期记忆（最近 5 轮完整对话）+ 长期记忆（关键信息摘要）+ 外部存储（数据库中的用户偏好）；④ **Token 预算管理**——计算当前 messages 的总 token 数，接近模型上下文窗口时自动触发裁剪或压缩。养老院场景中，一个班次（8 小时）的对话可能有 50+ 轮，需要定期裁剪。推荐策略：保留完整 system prompt + 最近 10 轮 + 更早对话的 AI 摘要。

---

### 题目 7：API 调用中的错误类型有哪些？如何设计健壮的重试策略？

**难度**：⭐⭐  
**类型**：工程实践

**参考答案**：

常见错误类型：① **RateLimitError (429)**：调用频率超限，需要等待后重试；② **APITimeoutError**：请求超时（默认 10 分钟），可能是 prompt 太长或服务繁忙；③ **APIError (5xx)**：服务端错误，短暂等待后重试；④ **APIError (4xx)**：客户端错误（参数错误、认证失败），不重试，修复代码；⑤ **ContextLengthExceeded**：输入超过模型上下文窗口，需要截断消息。重试策略：① **指数退避**——等待时间 = base × 2^attempt（如 5s→10s→20s），避免同时重试加剧限流；② **最大重试次数**——通常 3 次，超过则报错；③ **区分可重试和不可重试**——4xx 错误不重试（是代码问题），5xx 和限流重试；④ **降级策略**——主模型失败时切换到备选模型（如 GPT-4o 失败切换到 Qwen-plus）；⑤ **超时设置**——根据任务复杂度设置合理超时（简单问答 30s，长文本生成 120s）。

---

### 题目 8：如何估算和控制大模型 API 的调用成本？

**难度**：⭐  
**类型**：成本管理

**参考答案**：

成本估算公式：`成本 = (输入 token 数 × 输入单价 + 输出 token 数 × 输出单价) / 1,000,000`。控制成本的方法：① **精简 System Prompt**——系统提示词每轮都会发送，太长会浪费大量输入 token（如 1000 token 的 system prompt 对话 20 轮 = 20,000 输入 token）；② **合理设置 max_tokens**——限制输出长度，防止模型"废话连篇"；③ **选择合适的模型**——简单任务用小模型（GPT-4o-mini 比 GPT-4o 便宜 18 倍）；④ **对话历史裁剪**——定期裁剪旧消息，减少输入 token；⑤ **缓存策略**——相同或相似的请求缓存结果（如常见健康问题的回答）；⑥ **使用 Prompt Caching**——部分平台支持（如 OpenAI 的自动缓存），重复的 system prompt 可以享受折扣。养老院场景中，80% 的请求是简单问答，用 qwen-plus 约 0.001 元/次，月成本可控在百元级别。

---

### 题目 9：`response_format={"type": "json_object"}` 参数的作用是什么？有什么限制？

**难度**：⭐⭐  
**类型**：结构化输出

**参考答案**：

该参数强制模型输出合法的 JSON 格式。作用：① 保证输出可解析——不需要用正则表达式从自由文本中提取 JSON；② 结构化数据提取——从护理记录中提取结构化字段（如长者 ID、血压值、建议措施）；③ 与下游系统集成——JSON 可以直接传给前端或存入数据库。限制：① 必须在 system prompt 中说明 JSON 的期望格式（否则模型输出的 JSON 结构不可控）；② 不是所有模型都支持（需要确认目标模型是否支持此参数）；③ 输出的 JSON 可能包含多余字段或缺少必需字段——需要后端做 schema 校验；④ temperature 应设为 0——确保输出稳定。养老院场景示例：`system_prompt = "从护理记录中提取结构化信息，输出JSON格式：{member_id, bp_value, heart_rate, recommendations}"`。

---

### 题目 10：OpenAI SDK 的同步客户端和异步客户端有什么区别？ASP.NET Core 开发者应该如何选择？

**难度**：⭐  
**类型**：工程实践

**参考答案**：

**同步客户端** `OpenAI`：调用时阻塞当前线程直到收到响应，适合脚本、CLI 工具。**异步客户端** `AsyncOpenAI`：调用时使用 `await` 非阻塞，适合 Web 后端、并发场景。对标 C#：同步像 `HttpClient.Send()`，异步像 `await HttpClient.SendAsync()`。ASP.NET Core 开发者应选择异步客户端——因为：① Web 服务器线程资源宝贵，同步调用会阻塞线程池线程，降低并发能力；② 大模型 API 调用通常需要 2-15 秒，同步阻塞这么长时间是不可接受的；③ 异步客户端可以配合 `async for` 实现流式输出。Python 中使用 `asyncio.run()` 启动异步代码，在 Web 框架（FastAPI）中直接在 `async def` 路由中使用 `await`。

---

## 六、延伸阅读与资源

1. **OpenAI API 文档：platform.openai.com/docs**  
   官方 API 文档，包含所有参数说明和最佳实践。重点阅读 Chat Completions 和 Function Calling 章节。

2. **DashScope（通义千问）文档：help.aliyun.com/zh/dashscope**  
   阿里云的 API 文档，包含 Qwen 系列模型的调用方式和定价。

3. **DeepSeek API 文档：platform.deepseek.com/api-docs**  
   DeepSeek 的 API 文档，包含模型列表、参数说明和兼容模式说明。

4. **OpenAI Cookbook：github.com/openai/openai-cookbook**  
   OpenAI 官方的代码示例集合，包含各种场景的最佳实践。

5. **LiteLLM：github.com/BerriAI/litellm**  
   统一的 LLM API 网关，支持 100+ 模型提供商的无缝切换，适合生产环境。

---

## 七、下一章预告

**第 07 章：Prompt Engineering 提示词工程**

你已经掌握了 API 调用的"管道"，下一章我们将学习如何高效地"喂"给 AI 最好的指令：

- Zero-shot、Few-shot、Chain-of-Thought 三种提示策略
- 角色提示（System Prompt）的设计原则
- 结构化输出提示：让 AI 输出 JSON、Markdown 表格
- 提示词攻防：如何防止 AI 被"越狱"（Jailbreak）
- 养老院场景的 Prompt 模板库

API 是管道，Prompt 是水——管道通了，还要学会怎么"放水"。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| openai SDK | **2.44.0** | PyPI JSON API |
| dashscope SDK | **1.26.2** | PyPI JSON API |
| anthropic SDK | **0.116.0** | PyPI JSON API |
| google-genai SDK | **2.10.0** | PyPI JSON API |
| httpx | **0.28.1** | PyPI JSON API |
| pydantic | **2.13.4** | PyPI JSON API |

**可能过时的内容**：
- API 价格可能随竞争变化（尤其是国产模型价格战持续中）
- 模型名称可能更新（如 qwen-plus 可能有新版本）
- Function Calling 的参数格式可能有细微变化
- 新的 API 功能（如 Structured Outputs、Predicted Outputs）可能已发布

**官方文档链接**：
- OpenAI API：https://platform.openai.com/docs
- DashScope：https://help.aliyun.com/zh/dashscope
- DeepSeek API：https://platform.deepseek.com/api-docs
- OpenAI Python SDK：https://github.com/openai/openai-python
- LiteLLM：https://github.com/BerriAI/litellm
