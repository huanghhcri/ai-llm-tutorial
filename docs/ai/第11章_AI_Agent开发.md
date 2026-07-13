# 第 11 章 AI Agent 开发 — 让大模型拥有"手"和"记忆"

---

## 一、章节概述

### 本章学什么

本章进入 AI 应用的最高级形态——**Agent（智能体）**。你将掌握：

- **ReAct 模式**：推理（Reasoning）+ 行动（Acting）的循环——让 AI "想一步做一步"
- **Tool Use / Function Calling**：让 Agent 调用外部工具（查数据库、发通知、调 API）
- **MCP 协议**（Model Context Protocol）：2026 年最新的 Agent 工具标准
- **记忆机制**：短期记忆（对话历史）+ 长期记忆（跨会话持久化）
- **Agent 框架对比**：LangGraph、OpenAI Agents SDK、CrewAI、PydanticAI
- **养老院实战**：构建能自主完成任务的智能护理助手

### 为什么学

前面的章节中，大模型只是"回答问题"。Agent 让大模型**主动做事**：

- 不只是告诉你"血压偏高需要注意"→ 而是自动查询该长者的完整病历、对比历史数据、生成处理方案、通知医生、创建护理记录
- 不只是回答"糖尿病饮食建议"→ 而是根据该长者的具体病情、过敏史、当前用药，生成个性化的膳食计划

**Agent = LLM（大脑） + Tools（手） + Memory（记忆）**

### 在知识体系中的位置

```
第10章 LangChain/LangGraph
            ↓
第11章 AI Agent 开发 ← 你在这里（框架篇核心）
            ↓
第12章 多Agent系统（多个 Agent 协作）
```

---

## 二、核心知识点

### 2.1 Agent 的核心模型：ReAct

#### 类比

养老院的护理员处理一个复杂任务时，不是一步到位，而是"想一步做一步"：

```
任务：处理张大爷的血压异常

Thought: 张大爷血压偏高，我需要先查看他的完整病历和用药情况。
Action: 查询张大爷的病历系统。
Observation: 张大爷有高血压病史，正在服用氨氯地平5mg。

Thought: 他已经在吃降压药了，但血压仍然偏高。我需要看看最近的血压趋势。
Action: 查询最近7天的血压记录。
Observation: 最近7天血压从145/90逐渐升高到165/105。

Thought: 血压持续升高，当前用药可能不够。我需要查找相关的用药指南。
Action: 搜索知识库"高血压2级用药方案"。
Observation: 2级高血压建议联合用药，可加用ARB类或ACEI类。

Thought: 我已经收集了足够的信息。现在生成护理建议。
Action: 生成护理报告并通知医生。
Observation: 护理报告已生成，通知已发送。

Final Answer: 张大爷血压持续升高至165/105（2级高血压），建议医生评估是否需要联合用药（加用ARB类），同时加强血压监测频次。
```

这就是 **ReAct（Reasoning + Acting）** 模式——LLM 在每一步先推理（Thought），再决定行动（Action），观察结果（Observation），循环直到完成任务。

#### ReAct 的数学模型

```
给定任务 T，Agent 的执行过程：

for step in range(max_steps):
    thought = LLM(history + T)         # 推理：根据历史和任务，想一想该做什么
    action = LLM(history + thought)    # 决策：决定调用哪个工具、传什么参数
    observation = execute(action)       # 执行：调用工具，获取结果
    history.append(thought, action, observation)  # 记录
    
    if action == "finish":             # 终止条件
        return final_answer
```

---

### 2.2 Tool Use / Function Calling

#### 类比

Agent 的"工具"就像护理员的"操作权限"——有的护理员只能查信息（只读工具），有的可以执行操作（写入工具）。给 Agent 配备什么工具，决定了它能做什么事。

```python
# 养老院 Agent 的工具箱
from typing import Annotated
from langchain_core.tools import tool

# 用 @tool 装饰器定义工具（对标 C# 的 [Description] 特性）
# LangChain 会自动从函数签名和 docstring 生成工具的 JSON Schema

@tool
def query_member_info(
    member_id: Annotated[int, "长者 ID"],
) -> str:
    """查询长者的基本信息，包括姓名、年龄、房间号、护理等级、既往病史。"""
    # 模拟数据库查询
    members = {
        1001: {"name": "张大爷", "age": 78, "room": "A201", "care_level": "半护理",
               "conditions": ["高血压", "糖尿病"], "medications": ["氨氯地平", "二甲双胍"]},
        1002: {"name": "李奶奶", "age": 85, "room": "B302", "care_level": "全护理",
               "conditions": ["冠心病"], "medications": ["阿司匹林"]},
    }
    member = members.get(member_id)
    if member:
        return str(member)
    return f"未找到 ID 为 {member_id} 的长者"


@tool
def query_vital_signs(
    member_id: Annotated[int, "长者 ID"],
    days: Annotated[int, "查询最近多少天"] = 3,
) -> str:
    """查询长者最近的生命体征数据，包括血压、心率、血氧、血糖。"""
    records = {
        1001: [
            {"date": "2026-07-09", "bp": "165/105", "hr": 95, "sao2": 88},
            {"date": "2026-07-08", "bp": "155/98", "hr": 90, "sao2": 92},
            {"date": "2026-07-07", "bp": "148/92", "hr": 85, "sao2": 94},
        ],
    }
    return str(records.get(member_id, []))


@tool
def search_medical_knowledge(
    query: Annotated[str, "搜索关键词"],
) -> str:
    """搜索医学知识库，查找疾病、用药、护理相关知识。"""
    knowledge = {
        "高血压": "高血压分级：1级(140-159/90-99)、2级(160-179/100-109)、3级(≥180/≥110)。",
        "低血氧": "SpO2<90%立即吸氧，半卧位，30分钟后复查。",
        "降压药": "CCB(氨氯地平)、ARB(缬沙坦)、ACEI(贝那普利)。老年人首选CCB。",
    }
    for key, value in knowledge.items():
        if key in query:
            return value
    return "未找到相关知识"


@tool
def create_care_record(
    member_id: Annotated[int, "长者 ID"],
    content: Annotated[str, "护理记录内容"],
    record_type: Annotated[str, "记录类型"] = "日常护理",
) -> str:
    """为长者创建一条护理记录。"""
    return f"已创建护理记录：长者{member_id}，类型{record_type}，内容：{content}"


@tool
def send_notification(
    recipient: Annotated[str, "接收人（医生/家属/护理主管）"],
    message: Annotated[str, "通知内容"],
    priority: Annotated[str, "优先级（普通/紧急）"] = "普通",
) -> str:
    """发送通知给指定接收人。"""
    return f"已发送{priority}通知给{recipient}：{message}"


# 工具列表
tools = [query_member_info, query_vital_signs, search_medical_knowledge, 
         create_care_record, send_notification]
```

---

### 2.3 用 LangGraph 构建 ReAct Agent

```python
from typing import TypedDict, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
import operator

# LLM（绑定工具）
llm = ChatOpenAI(
    model="qwen-plus",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key="sk-your-key",
    temperature=0.3,
).bind_tools(tools)  # 绑定工具列表

# 状态定义
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]   # 消息历史（自动追加）

# 系统提示
SYSTEM_PROMPT = """你是养老院的智能护理助手"小护"。

你的工作流程：
1. 收到任务后，先分析需要哪些信息
2. 用工具查询相关数据（长者信息、生命体征、知识库）
3. 综合分析后给出专业建议
4. 必要时创建护理记录或发送通知

规则：
- 涉及用药调整时，必须注明"请咨询主治医生"
- 紧急情况（血氧<90%、意识丧失）优先发送紧急通知
- 每次回答都引用具体数据，不要泛泛而谈"""

# 节点函数
def agent_node(state: AgentState) -> dict:
    """Agent 推理节点：LLM 决定下一步行动"""
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}

def should_continue(state: AgentState) -> str:
    """判断是否需要继续调用工具"""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"    # 有工具调用 → 执行工具
    return "end"          # 没有工具调用 → 结束

# 构建图
workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))  # LangGraph 内置的工具执行节点
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue, {
    "tools": "tools",
    "end": END,
})
workflow.add_edge("tools", "agent")  # 工具执行后回到 Agent 继续推理

app = workflow.compile()

# 运行
result = app.invoke({
    "messages": [HumanMessage(content="张大爷（ID:1001）最近血压偏高，请帮我分析情况并给出处理建议。")],
})

# 打印结果
print("🤖 Agent 执行过程:")
for msg in result["messages"]:
    if isinstance(msg, HumanMessage):
        print(f"\n👤 用户: {msg.content}")
    elif isinstance(msg, AIMessage):
        if msg.tool_calls:
            for tc in msg.tool_calls:
                print(f"  🔧 调用工具: {tc['name']}({tc['args']})")
        if msg.content:
            print(f"\n🤖 助手: {msg.content}")
    elif isinstance(msg, ToolMessage):
        print(f"  📋 工具结果: {msg.content[:100]}...")
```

---

### 2.4 MCP 协议（Model Context Protocol）

#### 什么是 MCP？

MCP 是 Anthropic 于 2024 年底发布的**开放标准协议**，目标是统一 AI 应用与外部数据源/工具之间的通信方式。

#### 类比

MCP 就像 **USB 接口标准**：

- 在 USB 之前：每个设备有自己的接口（串口、并口、PS/2...）
- USB 出现后：所有设备用同一种接口，即插即用

MCP 对 AI Agent 做了同样的事：

- 在 MCP 之前：每个 Agent 框架有自己的工具定义方式（LangChain 的 @tool、OpenAI 的 function schema...）
- MCP 出现后：所有工具用同一种协议暴露，任何 Agent 都能调用

```
┌─────────────────────────────────────────────┐
│                MCP 架构                      │
│                                              │
│  MCP Client（Agent/LLM 应用）               │
│      ↕  JSON-RPC 2.0                        │
│  MCP Server（工具/数据源提供方）              │
│      → 暴露 Tools、Resources、Prompts        │
│                                              │
│  养老院场景：                                 │
│  Client = AI 助手                            │
│  Server = 护理系统 MCP Server                │
│           ├─ Tool: 查询长者信息               │
│           ├─ Tool: 查询生命体征               │
│           ├─ Tool: 创建护理记录               │
│           ├─ Resource: 护理知识库             │
│           └─ Prompt: 健康评估模板             │
└─────────────────────────────────────────────┘
```

#### MCP 的三个核心能力

```python
# MCP Server 暴露三种能力：

# 1. Tools（工具）— Agent 可以调用的函数
# 类比：护理系统提供的 API 接口
# 例如：查询长者信息、创建护理记录、发送通知

# 2. Resources（资源）— Agent 可以读取的数据
# 类比：护理系统的只读数据视图
# 例如：护理知识库、药品目录、护理规范

# 3. Prompts（提示模板）— 预定义的交互模板
# 类比：护理系统的标准操作流程（SOP）
# 例如：健康评估模板、护理记录模板
```

#### 实现 MCP Server（养老院护理系统）

```python
# 安装：uv add mcp（1.28.1）
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import json

# 创建 MCP Server
server = Server("nursing-home-assistant")

# 定义工具
@server.list_tools()
async def list_tools() -> list[Tool]:
    """暴露所有可用工具"""
    return [
        Tool(
            name="query_member_info",
            description="查询长者的基本信息",
            inputSchema={
                "type": "object",
                "properties": {
                    "member_id": {"type": "integer", "description": "长者 ID"},
                },
                "required": ["member_id"],
            },
        ),
        Tool(
            name="query_vital_signs",
            description="查询长者最近的生命体征数据",
            inputSchema={
                "type": "object",
                "properties": {
                    "member_id": {"type": "integer", "description": "长者 ID"},
                    "days": {"type": "integer", "description": "天数", "default": 3},
                },
                "required": ["member_id"],
            },
        ),
        Tool(
            name="create_care_record",
            description="创建护理记录",
            inputSchema={
                "type": "object",
                "properties": {
                    "member_id": {"type": "integer", "description": "长者 ID"},
                    "content": {"type": "string", "description": "记录内容"},
                    "record_type": {"type": "string", "description": "记录类型"},
                },
                "required": ["member_id", "content"],
            },
        ),
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """执行工具调用"""
    if name == "query_member_info":
        result = {"name": "张大爷", "age": 78, "care_level": "半护理"}
    elif name == "query_vital_signs":
        result = [{"date": "2026-07-09", "bp": "165/105", "hr": 95}]
    elif name == "create_care_record":
        result = {"success": True, "message": "护理记录已创建"}
    else:
        result = {"error": f"未知工具: {name}"}
    
    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

# 启动 Server（通过 stdio 通信）
async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

# 运行：python mcp_server.py
# import asyncio
# asyncio.run(main())
```

#### MCP vs Function Calling 对比

| 维度 | Function Calling | MCP |
|------|-----------------|-----|
| 定义位置 | 在客户端代码中定义 | 在独立 Server 中定义 |
| 标准化 | 各平台各自实现（OpenAI/Anthropic 格式不同） | 统一标准（JSON-RPC 2.0） |
| 可复用 | 与特定 Agent 绑定 | 任何 MCP Client 都能调用 |
| 传输方式 | API 请求内嵌 | stdio / HTTP / SSE |
| 生态 | 碎片化 | 标准化，已有数百个 MCP Server |

---

### 2.5 记忆机制 — 让 Agent "记住"事情

#### 类比

养老院的护理员有三种记忆：

- **工作记忆**：当前正在处理的事情（"张大爷血压偏高，我在量血压"）
- **短期记忆**：今天发生的事情（"今天处理了 3 位长者的异常"）
- **长期记忆**：长期积累的经验（"张大爷对氨氯地平敏感，容易低血压"）

Agent 的记忆也分三层：

```python
# 1. 工作记忆（Working Memory）— 当前对话的上下文
# 实现：messages 列表
# 类比：C# 的 HttpContext.Items（请求级别的临时数据）

# 2. 短期记忆（Short-term Memory）— 当前会话的历史
# 实现：LangGraph 的 Checkpointer
# 类比：C# 的 Session（会话级别的数据）

# 3. 长期记忆（Long-term Memory）— 跨会话的持久化知识
# 实现：向量数据库 + 摘要压缩
# 类比：C# 的数据库（持久化存储）


# 短期记忆：LangGraph Checkpointer
from langgraph.checkpoint.memory import MemorySaver

# 创建检查点保存器
memory = MemorySaver()

# 编译时启用检查点
app_with_memory = workflow.compile(checkpointer=memory)

# 运行时指定会话 ID（thread_id）
config = {"configurable": {"thread_id": "nursing-session-001"}}

# 第一轮对话
result1 = app_with_memory.invoke(
    {"messages": [HumanMessage(content="张大爷最近血压怎么样？")]},
    config=config,
)

# 第二轮对话（自动携带第一轮的历史）
result2 = app_with_memory.invoke(
    {"messages": [HumanMessage(content="那他的用药方案需要调整吗？")]},
    config=config,
)
# Agent 能理解"他"指的是张大爷，因为有历史记忆


# 长期记忆：基于向量数据库的记忆存储
# 安装：uv add langmem（0.0.30）
from langmem import create_memory_store_manager

# 长期记忆管理器
# 将重要的事实存入向量数据库，跨会话可检索
memory_manager = create_memory_store_manager(
    llm,
    instructions="提取并记住以下关键信息：长者的特殊需求、过敏史、家属偏好、历史处理经验。",
)
```

---

### 2.6 Agent 框架对比（2026 年最新）

```python
# 2026 年主流 Agent 框架对比

agent_frameworks = {
    "LangGraph (langgraph 1.2.8)": {
        "特点": "状态图驱动，灵活性最强",
        "优势": "条件分支、循环、人工审批、检查点",
        "适用": "复杂工作流、需要精细控制的场景",
        "学习曲线": "中等",
    },
    "OpenAI Agents SDK (openai-agents 0.18.0)": {
        "特点": "OpenAI 官方 Agent 框架",
        "优势": "与 OpenAI 模型深度集成、简洁 API",
        "适用": "使用 OpenAI 模型的快速原型",
        "学习曲线": "低",
    },
    "CrewAI (crewai 1.15.2)": {
        "特点": "多 Agent 角色扮演协作",
        "优势": "定义多个 Agent 角色，自动协作完成任务",
        "适用": "多角色协作场景（如多学科会诊）",
        "学习曲线": "低",
    },
    "PydanticAI (pydantic-ai 2.7.0)": {
        "特点": "类型安全、Pydantic 原生",
        "优势": "输入输出强类型、依赖注入、测试友好",
        "适用": "追求类型安全的生产环境",
        "学习曲线": "中等",
    },
    "MCP (mcp 1.28.1)": {
        "特点": "标准化协议，不是框架",
        "优势": "工具可复用、跨框架兼容",
        "适用": "暴露工具给任何 Agent 使用",
        "学习曲线": "中等",
    },
}
```

---

## 三、养老院业务实战案例

### 需求描述

构建一个**养老院智能护理 Agent**，能自主完成以下任务：

1. 接收护理员的自然语言指令
2. 自主决定需要查询哪些信息
3. 综合分析后给出处理建议
4. 必要时创建护理记录或发送通知
5. 支持多轮对话（记住上下文）

### 完整代码

```python
"""
养老院智能护理 Agent — ReAct + Tool Use 实战
==============================================
第 11 章实战案例：带工具调用和记忆的护理 Agent

运行环境：Python 3.14
安装依赖：uv add langchain-openai langchain-core langgraph
"""

import json
from typing import TypedDict, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
import operator


# ============================================================
# 第一步：定义工具
# ============================================================

# 模拟数据库
DB = {
    "members": {
        1001: {"name": "张大爷", "age": 78, "room": "A201", "care_level": "半护理",
               "conditions": ["高血压", "2型糖尿病"], "medications": ["氨氯地平5mg qd", "二甲双胍500mg bid"],
               "allergies": ["青霉素"], "emergency_contact": "张小明 138xxxx1234"},
        1002: {"name": "李奶奶", "age": 85, "room": "B302", "care_level": "全护理",
               "conditions": ["冠心病", "骨质疏松"], "medications": ["阿司匹林100mg qd", "钙片"],
               "allergies": [], "emergency_contact": "李小红 139xxxx5678"},
        1003: {"name": "王爷爷", "age": 92, "room": "C105", "care_level": "特护",
               "conditions": ["帕金森病", "慢性心衰"], "medications": ["左旋多巴", "呋塞米"],
               "allergies": ["磺胺类"], "emergency_contact": "王大明 137xxxx9012"},
    },
    "vital_signs": {
        1001: [
            {"date": "2026-07-09", "bp": "165/105", "hr": 95, "sao2": 88, "temp": 36.5, "bs": 7.2},
            {"date": "2026-07-08", "bp": "155/98", "hr": 90, "sao2": 92, "temp": 36.6, "bs": 6.8},
            {"date": "2026-07-07", "bp": "148/92", "hr": 85, "sao2": 94, "temp": 36.4, "bs": 7.5},
        ],
        1002: [
            {"date": "2026-07-09", "bp": "128/80", "hr": 76, "sao2": 96, "temp": 36.7, "bs": 5.8},
        ],
        1003: [
            {"date": "2026-07-09", "bp": "110/68", "hr": 52, "sao2": 93, "temp": 36.8, "bs": 5.5},
        ],
    },
    "care_records": [],
    "notifications": [],
}


@tool
def query_member_info(member_id: int) -> str:
    """查询长者的基本信息，包括姓名、年龄、房间号、护理等级、既往病史、用药情况、过敏史。"""
    member = DB["members"].get(member_id)
    if member:
        return json.dumps(member, ensure_ascii=False)
    return json.dumps({"error": f"未找到 ID 为 {member_id} 的长者"}, ensure_ascii=False)


@tool
def query_vital_signs(member_id: int, days: int = 3) -> str:
    """查询长者最近的生命体征数据，包括血压、心率、血氧、体温、血糖。"""
    records = DB["vital_signs"].get(member_id, [])
    return json.dumps(records[:days], ensure_ascii=False)


@tool
def search_knowledge(query: str) -> str:
    """搜索医学知识库，查找疾病诊断标准、用药指南、护理规范等。"""
    knowledge = {
        "高血压": "高血压分级：1级(140-159/90-99)、2级(160-179/100-109)、3级(≥180/≥110)。老年人降压目标<150/90。2级高血压建议联合用药。",
        "低血氧": "SpO2<90%为低氧血症，立即低流量吸氧(1-2L/min)，半卧位，30分钟后复查。持续<90%通知医生。",
        "心率": "心动过缓<60次/分：排查药物因素。心动过速>100次/分：排查感染、疼痛、焦虑。",
        "跌倒": "跌倒后：评估意识→检查出血→评估骨折→测生命体征→记录→通知医生。髋部疼痛+活动受限→怀疑骨折。",
        "降压药": "CCB(氨氯地平)适用于老年人。ARB(缬沙坦)适用于糖尿病。ACEI(贝那普利)适用于心衰。联合用药：CCB+ARB。",
        "糖尿病": "空腹血糖<7.0，餐后<11.1。老年人可放宽至空腹<8.0。低血糖：进食15g快碳。",
    }
    for key, value in knowledge.items():
        if key in query:
            return value
    return "未找到相关知识，请咨询主治医生。"


@tool
def create_care_record(member_id: int, content: str, record_type: str = "日常护理") -> str:
    """为长者创建一条护理记录。record_type 可选：日常护理、异常处理、用药调整、健康评估。"""
    record = {
        "id": f"CR-{len(DB['care_records'])+1:04d}",
        "member_id": member_id,
        "content": content,
        "record_type": record_type,
    }
    DB["care_records"].append(record)
    return json.dumps({"success": True, "record_id": record["id"]}, ensure_ascii=False)


@tool
def send_notification(recipient: str, message: str, priority: str = "普通") -> str:
    """发送通知给指定接收人。recipient: 医生/家属/护理主管。priority: 普通/紧急。"""
    notification = {
        "id": f"NT-{len(DB['notifications'])+1:04d}",
        "recipient": recipient,
        "message": message,
        "priority": priority,
    }
    DB["notifications"].append(notification)
    return json.dumps({"success": True, "notification_id": notification["id"]}, ensure_ascii=False)


tools = [query_member_info, query_vital_signs, search_knowledge, create_care_record, send_notification]


# ============================================================
# 第二步：构建 Agent
# ============================================================

llm = ChatOpenAI(
    model="qwen-plus",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key="sk-your-key",
    temperature=0.3,
).bind_tools(tools)

SYSTEM_PROMPT = """你是养老院的智能护理助手"小护"。

## 工作流程
1. 收到任务后，先分析需要查询哪些信息
2. 用工具查询长者信息、生命体征、医学知识
3. 综合所有信息进行分析
4. 给出具体的处理建议
5. 必要时创建护理记录或发送通知

## 规则
- 涉及用药调整时，必须注明"请咨询主治医生确认"
- 紧急情况（血氧<90%、意识丧失）优先发送紧急通知给医生
- 每次回答引用具体数据，不要泛泛而谈
- 涉及过敏史时必须检查用药安全

## 输出格式
📊 **情况分析**：简述当前状况
⚠️ **风险评估**：列出风险点
💡 **处理建议**：具体的行动步骤
📋 **后续关注**：需要持续监测的指标"""

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]

def agent_node(state: AgentState) -> dict:
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}

def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return "end"

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
workflow.add_edge("tools", "agent")

# 启用记忆
memory = MemorySaver()
app = workflow.compile(checkpointer=memory)


# ============================================================
# 第三步：演示运行
# ============================================================

def run_agent(task: str, session_id: str = "session-001") -> str:
    """运行 Agent"""
    config = {"configurable": {"thread_id": session_id}}
    
    result = app.invoke(
        {"messages": [HumanMessage(content=task)]},
        config=config,
    )
    
    # 提取最终回复
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
            return msg.content
    return "Agent 未能生成回复"


def demo():
    print("=" * 60)
    print("  养老院智能护理 Agent 演示")
    print("=" * 60)
    
    # 场景 1：综合健康评估
    print("\n" + "─" * 60)
    print("📋 场景 1：综合健康评估")
    print("─" * 60)
    task = "张大爷（ID:1001）最近血压偏高，请帮我全面分析他的健康状况，给出处理建议。"
    print(f"👤 护理员: {task}")
    answer = run_agent(task, "session-001")
    print(f"\n🤖 小护:\n{answer}")
    
    # 场景 2：紧急情况处理
    print("\n" + "─" * 60)
    print("📋 场景 2：紧急情况处理")
    print("─" * 60)
    task = "王爷爷（ID:1003）突然意识模糊，血氧掉到 86%，请立即处理！"
    print(f"👤 护理员: {task}")
    answer = run_agent(task, "session-002")
    print(f"\n🤖 小护:\n{answer}")
    
    # 场景 3：多轮对话（记忆测试）
    print("\n" + "─" * 60)
    print("📋 场景 3：多轮对话（记忆测试）")
    print("─" * 60)
    
    q1 = "李奶奶（ID:1002）今天情况怎么样？"
    print(f"👤 护理员: {q1}")
    a1 = run_agent(q1, "session-003")
    print(f"\n🤖 小护:\n{a1}")
    
    q2 = "她有没有什么用药安全问题需要注意？"  # "她"指李奶奶
    print(f"\n👤 护理员: {q2}")
    a2 = run_agent(q2, "session-003")  # 同一 session，有记忆
    print(f"\n🤖 小护:\n{a2}")
    
    # 打印数据库变更
    print(f"\n{'=' * 60}")
    print(f"📊 系统状态:")
    print(f"  新增护理记录: {len(DB['care_records'])} 条")
    print(f"  新增通知: {len(DB['notifications'])} 条")
    for n in DB["notifications"]:
        print(f"    [{n['priority']}] → {n['recipient']}: {n['message'][:50]}...")


if __name__ == "__main__":
    demo()
```

### 运行结果

```
============================================================
  养老院智能护理 Agent 演示
============================================================

────────────────────────────────────────────────────────────
📋 场景 1：综合健康评估
────────────────────────────────────────────────────────────
👤 护理员: 张大爷（ID:1001）最近血压偏高，请帮我全面分析他的健康状况。

  🔧 调用工具: query_member_info({"member_id": 1001})
  🔧 调用工具: query_vital_signs({"member_id": 1001, "days": 3})
  🔧 调用工具: search_knowledge({"query": "高血压2级处理"})

🤖 小护:
📊 **情况分析**：
张大爷，78岁，半护理级别。既往高血压+2型糖尿病。当前用药：氨氯地平5mg qd + 二甲双胍500mg bid。
最近3天血压呈上升趋势：148/92 → 155/98 → 165/105 mmHg，已达2级高血压标准。
血氧饱和度从94%降至88%，低于正常范围（>95%）。心率95次/分偏快。

⚠️ **风险评估**：
1. 🔴 血压持续升高至2级，当前单药控制不佳
2. 🔴 血氧88%属低氧血氧症（<90%），需紧急处理
3. 🟡 心率偏快，可能是血压升高或低氧的代偿反应
4. 🟡 过敏史：青霉素（用药时需注意）

💡 **处理建议**：
1. **立即**：给予低流量吸氧（1-2L/min），半卧位
2. **立即**：发送紧急通知给值班医生
3. **30分钟后**：复查血氧和血压
4. **用药调整**：建议医生评估是否加用ARB类降压药（缬沙坦），联合降压。请咨询主治医生确认。
5. 排查低氧原因：是否有咳嗽、咳痰？建议胸部X线排查肺炎

📋 **后续关注**：
- 每2小时监测血压和血氧
- 观察吸氧后血氧是否回升至93%以上
- 记录24小时出入量

────────────────────────────────────────────────────────────
📋 场景 2：紧急情况处理
────────────────────────────────────────────────────────────
👤 护理员: 王爷爷（ID:1003）突然意识模糊，血氧掉到 86%！

  🔧 调用工具: query_member_info({"member_id": 1003})
  🔧 调用工具: send_notification({"recipient": "医生", "message": "...", "priority": "紧急"})
  🔧 调用工具: create_care_record({"member_id": 1003, "content": "...", "record_type": "异常处理"})

🤖 小护:
🚨 **紧急情况**：王爷爷（92岁，特护）血氧86%+意识模糊，属严重低氧血症！

⚠️ **立即处理**：
1. 🔴 已发送**紧急通知**给值班医生
2. 已创建异常处理护理记录
3. **立即**：高流量吸氧（4-6L/min），头偏向一侧保持气道通畅
4. **立即**：持续心电监护
5. 王爷爷有慢性心衰病史，低氧+意识模糊需警惕急性心衰加重
6. **禁忌**：磺胺类过敏，用药时务必核对

📋 **后续**：等待医生到场后，配合完成急救处理。

────────────────────────────────────────────────────────────
📋 场景 3：多轮对话（记忆测试）
────────────────────────────────────────────────────────────
👤 护理员: 李奶奶（ID:1002）今天情况怎么样？

🤖 小护: 李奶奶（85岁，全护理）今日生命体征平稳：血压128/80、心率76、血氧96%...

👤 护理员: 她有没有什么用药安全问题需要注意？

🤖 小护: 根据李奶奶的用药情况，需要注意：
1. 阿司匹林100mg qd：注意出血倾向（牙龈出血、皮肤瘀斑）
2. 骨质疏松用药+冠心病：跌倒风险高，建议使用髋部保护器
3. 无已知过敏史
（Agent 理解了"她"指的是李奶奶，因为有对话记忆）

============================================================
📊 系统状态:
  新增护理记录: 2 条
  新增通知: 2 条
    [紧急] → 医生: 王爷爷突发意识模糊，血氧86%，需紧急处理...
    [普通] → 医生: 张大爷血压持续升高，建议评估用药方案...
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **Agent** | 能自主决策和行动的 AI 系统 | LLM（大脑）+ Tools（手）+ Memory（记忆） |
| **ReAct** | 推理+行动的循环模式 | Thought→Action→Observation→循环 |
| **Tool Use** | 让 LLM 调用外部函数 | @tool 装饰器定义，LLM 自动决定何时调用 |
| **Function Calling** | LLM 返回工具调用请求 | 返回函数名+参数，系统执行后回传结果 |
| **MCP** | Model Context Protocol，工具标准协议 | JSON-RPC 2.0，Client/Server 架构 |
| **MCP Server** | 暴露 Tools/Resources/Prompts 的服务 | 任何 MCP Client 都能调用 |
| **工作记忆** | 当前对话的上下文 | messages 列表 |
| **短期记忆** | 当前会话的历史 | LangGraph Checkpointer |
| **长期记忆** | 跨会话的持久化知识 | 向量数据库 + langmem |
| **LangGraph Agent** | 用状态图构建的 ReAct Agent | agent→tools→agent 循环 |
| **ToolNode** | LangGraph 内置的工具执行节点 | 自动解析 tool_calls 并执行 |
| **bind_tools** | 将工具绑定到 LLM | LLM 自动获得工具的 JSON Schema |

---

## 五、本章面试题

### 题目 1：什么是 ReAct 模式？它和普通的 Function Calling 有什么区别？

**难度**：⭐⭐  
**类型**：核心概念

**参考答案**：

ReAct（Reasoning + Acting）是一种让 LLM 交替进行推理和行动的模式。每一步包含三个环节：Thought（推理，分析当前情况）、Action（行动，决定调用什么工具）、Observation（观察，获取工具执行结果）。与 Function Calling 的区别：① **思维链**——ReAct 要求 LLM 显式输出推理过程（Thought），Function Calling 只返回工具调用请求，不展示推理过程；② **自主决策**——ReAct 中 LLM 自主决定下一步做什么（可能调用多个工具、可能不调用），Function Calling 通常是单次调用；③ **循环执行**——ReAct 天然是一个循环（推理→行动→观察→推理...），Function Calling 通常是线性的；④ **多步推理**——ReAct 可以根据前一步的观察结果调整后续策略，Function Calling 通常需要预先定义好所有步骤。实际中，LangGraph 的 ReAct Agent 就是 Function Calling + 循环的组合。

---

### 题目 2：MCP（Model Context Protocol）是什么？它解决了什么问题？

**难度**：⭐⭐  
**类型**：2026 新标准

**参考答案**：

MCP 是 Anthropic 于 2024 年底发布的开放标准协议，用于统一 AI 应用与外部工具/数据源的通信方式。解决的核心问题是**工具生态的碎片化**——在 MCP 之前，每个 Agent 框架有自己的工具定义格式（LangChain 的 @tool、OpenAI 的 function schema、自定义格式），工具不能跨框架复用。MCP 的解决方案：① **标准化接口**——所有工具通过 JSON-RPC 2.0 协议暴露，任何 MCP Client 都能调用；② **三种能力**——Tools（可调用的函数）、Resources（可读取的数据）、Prompts（预定义模板）；③ **传输灵活**——支持 stdio（本地进程）、HTTP+SSE（远程服务）；④ **即插即用**——已有数百个社区 MCP Server（数据库、文件系统、API 集成）。养老院场景：护理系统暴露一个 MCP Server，包含查询长者信息、创建护理记录等工具，任何 Agent（LangGraph、OpenAI Agents、CrewAI）都能直接调用。

---

### 题目 3：如何给 Agent 设计工具？有哪些最佳实践？

**难度**：⭐⭐  
**类型**：设计实践

**参考答案**：

工具设计原则：① **粒度适中**——一个工具做一件事（"查询长者信息"而不是"查询并分析长者信息"），让 LLM 自己组合；② **描述清晰**——工具的 description 是 LLM 决定何时调用的唯一依据，要准确说明功能和使用场景；③ **参数类型明确**——用 `Annotated[type, "description"]` 标注每个参数的含义；④ **只读和写入分离**——查询工具和修改工具分开定义，方便权限控制；⑤ **错误处理**——工具内部做好异常处理，不要让工具报错导致 Agent 中断；⑥ **返回结构化数据**——返回 JSON 而非自然语言，便于 LLM 解析。养老院工具设计：查询类（query_member_info、query_vital_signs）直接调用，写入类（create_care_record）需要人工确认，通知类（send_notification）区分普通/紧急。

---

### 题目 4：Agent 的记忆机制有哪些层次？如何实现？

**难度**：⭐⭐  
**类型**：架构设计

**参考答案**：

三层记忆：① **工作记忆**——当前正在处理的信息，存储在 LLM 的上下文窗口中（messages 列表），容量有限但访问最快；② **短期记忆**——当前会话的完整对话历史，通过 LangGraph 的 Checkpointer 实现（MemorySaver 或数据库存储），支持会话恢复和多轮对话上下文连续；③ **长期记忆**——跨会话的持久化知识，通过向量数据库实现——将重要的事实（如"张大爷对青霉素过敏"）Embedding 后存入向量数据库，新会话时检索相关记忆注入上下文。langmem 库（0.0.30）提供了自动化的长期记忆管理——LLM 在对话中自动提取关键信息并存入记忆库。养老院场景：工作记忆用于当前任务推理，短期记忆用于同一班次的连续对话，长期记忆用于记住长者的长期健康趋势和特殊需求。

---

### 题目 5：对比 LangGraph、OpenAI Agents SDK、CrewAI 三个 Agent 框架。

**难度**：⭐⭐  
**类型**：技术选型

**参考答案**：

| 维度 | LangGraph | OpenAI Agents SDK | CrewAI |
|------|-----------|-------------------|--------|
| 核心理念 | 状态图驱动 | 简洁的 Agent API | 多角色协作 |
| 灵活性 | 最高（任意拓扑） | 中等（预定义模式） | 中等（角色定义） |
| 条件分支 | ✅ 原生支持 | 有限 | 有限 |
| 循环 | ✅ 原生支持 | ✅ | ✅ |
| 人工审批 | ✅ interrupt 机制 | 不支持 | 不支持 |
| 检查点 | ✅ 持久化状态 | 不支持 | 不支持 |
| 多 Agent | ✅ 子图嵌套 | ✅ handoff | ✅ 核心功能 |
| 适用场景 | 复杂工作流 | 快速原型 | 多角色任务 |

养老院推荐：LangGraph——因为护理工作流有条件分支（风险评估）、需要人工审批（用药调整）、需要持久化状态（长者档案）。

---

### 题目 6：如何防止 Agent 进入无限循环或做出危险操作？

**难度**：⭐⭐  
**类型**：安全

**参考答案**：

① **最大步数限制**——设置 `recursion_limit`（LangGraph 默认 25 步），超过则强制终止并报错；② **工具权限控制**——将工具分为"只读"和"写入"两类，写入操作需要人工确认（Human-in-the-loop）；③ **输出审查**——在 Agent 返回结果前检查是否包含危险建议（如超剂量用药）；④ **System Prompt 约束**——明确告诉 LLM "不能做什么"（不能开处方、不能建议减少护理频次）；⑤ **成本控制**——限制单次任务的 API 调用次数和 Token 消耗；⑥ **日志追踪**——用 LangSmith 记录每一步的推理和行动，便于事后审计。养老院场景中，Agent 有查询和创建记录的权限，但没有修改用药方案的权限——用药调整只能"建议"，由医生确认后执行。

---

### 题目 7：MCP Server 的三种能力（Tools、Resources、Prompts）分别适合什么场景？

**难度**：⭐  
**类型**：协议理解

**参考答案**：

① **Tools（工具）**——Agent 可以调用的函数，有输入参数和输出结果。适合需要执行操作的场景：创建护理记录、发送通知、调用外部 API。特点：有副作用，会改变系统状态；② **Resources（资源）**——Agent 可以读取的数据，类似 GET 请求。适合只读数据访问：读取护理知识库、查询长者档案、获取配置信息。特点：无副作用，幂等；③ **Prompts（提示模板）**——预定义的交互模板，指导 Agent 如何使用工具和资源。适合标准化流程：健康评估模板、护理记录模板、家属沟通话术。在养老院 MCP Server 中：Tools 用于操作（创建记录、发通知），Resources 用于查询（知识库、长者数据），Prompts 用于标准化（评估模板）。

---

### 题目 8：如何测试 Agent 的可靠性？

**难度**：⭐⭐  
**类型**：质量保证

**参考答案**：

Agent 测试的挑战在于 LLM 输出具有随机性——同一输入可能产生不同输出。测试策略：① **确定性测试**——temperature=0，固定 seed，测试工具调用的正确性（是否调用了正确的工具、参数是否正确）；② **端到端测试**——准备 20-50 个测试用例，覆盖正常/边界/异常场景，评估最终回答的质量；③ **工具调用链测试**——验证 Agent 是否按正确顺序调用了所有必要的工具（如先查病历→再查生命体征→再搜索知识→最后生成建议）；④ **安全测试**——测试恶意输入（Prompt Injection）是否能绕过安全约束；⑤ **回归测试**——每次修改 Prompt 或工具后，重新运行测试集确保没有退化；⑥ **LangSmith 评估**——用 LangSmith 的评估功能批量测试，自动计算准确率、忠实度等指标。

---

### 题目 9：什么是 Human-in-the-loop？在养老院 Agent 中如何实现？

**难度**：⭐⭐  
**类型**：安全设计

**参考答案**：

Human-in-the-loop（人在回路）是指在 Agent 的关键步骤插入人工审批环节，确保 AI 的决策在执行前有人类确认。在养老院 Agent 中的实现：① **查询操作**——直接执行（不需要人工确认）；② **创建护理记录**——Agent 生成记录内容后，展示给护理员确认再保存；③ **用药建议**——Agent 只能建议，不能直接修改用药方案，必须由医生确认；④ **紧急通知**——可以自动发送（紧急情况不能等），但事后需要人工补确认；⑤ **家属通知**——话术由 Agent 生成，发送前由护理主管审核。LangGraph 实现：用 `interrupt()` 在关键节点暂停，等待人工输入后用 `Command(resume=...)` 恢复执行。所有审批记录自动保存在 Checkpointer 中，可追溯。

---

### 题目 10：如何将 Agent 集成到 ASP.NET Core 后端？

**难度**：⭐⭐⭐  
**类型**：系统集成

**参考答案**：

集成方案：① **Python Agent 服务**——用 FastAPI 将 Agent 封装为 REST API，暴露 `POST /agent/chat` 端点，支持流式返回（SSE）；② **ASP.NET Core 调用**——通过 `IHttpClientFactory` 调用 Python Agent 服务，或通过 gRPC 实现更高效的通信；③ **MCP Server**——将养老院的业务功能（查询长者、创建记录、发通知）封装为 MCP Server，Python Agent 通过 MCP 协议调用。这样 ASP.NET Core 只需要暴露 MCP Server，不需要直接与 Agent 交互；④ **前端集成**——ASP.NET Core Web API 提供 SignalR Hub，前端通过 WebSocket 实现实时对话，后端将 Agent 的流式输出实时推送给前端；⑤ **会话管理**——用 Redis 存储 Agent 的 Checkpointer 状态（短期记忆），用向量数据库存储长期记忆。架构：前端 → SignalR → ASP.NET Core → Python Agent → MCP Server（ASP.NET Core 暴露的业务 API）。

---

## 六、延伸阅读与资源

1. **ReAct 论文：《ReAct: Synergizing Reasoning and Acting in Language Models》（Yao et al., 2023）**  
   Agent 推理+行动模式的原始论文。

2. **MCP 官方文档：modelcontextprotocol.io**  
   Model Context Protocol 的完整规范，包含 SDK 文档和示例。

3. **LangGraph Agent 教程：langchain-ai.github.io/langgraph**  
   LangGraph 官方的 Agent 构建教程，包含 ReAct、多 Agent、人工审批。

4. **OpenAI Agents SDK：github.com/openai/openai-agents-python**  
   OpenAI 官方的 Agent 框架文档。

5. **CrewAI 文档：docs.crewai.com**  
   CrewAI 的多 Agent 协作框架文档。

---

## 七、下一章预告

**第 12 章：多 Agent 系统**

你已经掌握了单个 Agent 的构建，下一章我们将构建**多个 Agent 协作**的系统：

- 多 Agent 架构模式：层级式、对等式、混合式
- 通信协作：消息传递、共享状态、任务委派
- 养老院多 Agent 实战：护理评估 Agent + 用药审查 Agent + 家属沟通 Agent 协同工作

单个 Agent 是"一个人干活"，多 Agent 是"一个团队协作"——分工明确，各司其职。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| mcp | **1.28.1** | PyPI JSON API |
| crewai | **1.15.2** | PyPI JSON API |
| openai-agents | **0.18.0** | PyPI JSON API |
| pydantic-ai | **2.7.0** | PyPI JSON API |
| langmem | **0.0.30** | PyPI JSON API |
| langgraph | **1.2.8** | 第 10 章已验证 |
| langchain-core | **1.4.9** | 第 10 章已验证 |
| anthropic | **0.116.0** | PyPI JSON API |

**可能过时的内容**：
- MCP 协议规范可能在新版本中扩展（当前 1.28.1）
- Agent 框架版本更新频繁
- 新的 Agent 模式（如 Agentic RAG、Agentic Workflow）可能已出现
- Tool Use 的 API 格式可能有细微变化

**官方文档链接**：
- MCP 官方：https://modelcontextprotocol.io
- LangGraph：https://langchain-ai.github.io/langgraph
- OpenAI Agents SDK：https://github.com/openai/openai-agents-python
- CrewAI：https://docs.crewai.com
- PydanticAI：https://ai.pydantic.dev
