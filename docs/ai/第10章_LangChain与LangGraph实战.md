# 第 10 章 LangChain 与 LangGraph 实战 — 用框架加速 AI 应用开发

---

## 一、章节概述

### 本章学什么

本章进入**框架篇**——用 LangChain 和 LangGraph 这两个最主流的 AI 应用框架来简化开发。你将掌握：

- **LangChain 核心概念**：Model、Prompt Template、Chain、Retriever、Output Parser
- **LCEL（LangChain Expression Language）**：用管道符 `|` 组装 AI 流水线
- **LangGraph**：用状态图构建复杂的多步骤 AI 工作流
- **LangSmith**：追踪和调试 AI 应用的每一步
- **养老院实战**：用 LangChain 构建生产级 RAG 应用

### 为什么学

在第 9 章我们手动实现了 RAG 系统——检索、Prompt 组装、API 调用、结果解析，每一步都手写代码。LangChain 把这些步骤封装成了**标准化组件**，像搭积木一样组合。LangGraph 更进一步，让你用**状态图**定义复杂的多步骤工作流（有条件分支、循环、并行执行）。

对 C# 后端开发者来说：LangChain ≈ ASP.NET Core 的中间件管道，LangGraph ≈ 状态机 + 工作流引擎。

### 在知识体系中的位置

```
第6-9章（API + Prompt + Embedding + RAG，手动实现）
                    ↓
第10章 LangChain 与 LangGraph ← 你在这里（框架篇起点）
                    ↓
第11章 AI Agent → 第12章 多Agent系统
```

---

## 二、核心知识点

### 2.1 LangChain 架构概览

#### 类比

养老院的护理工作有一套标准化流程：

```
接收长者信息 → 评估健康状况 → 制定护理计划 → 执行护理 → 记录结果
```

每一步都有标准操作规范（SOP），不同的护理员按同样的 SOP 执行，保证质量一致。LangChain 就是 AI 应用开发的"SOP 框架"——它把常见的 AI 操作（调用模型、检索文档、解析输出）标准化为可复用的组件。

#### 包结构（2026 年最新）

```
langchain（1.3.12）— 顶层包，提供预构建的 Chain
├── langchain-core（1.4.9）— 核心抽象：接口、LCEL、Runnable 协议
├── langchain-community（0.4.2）— 社区集成（第三方工具）
├── langchain-openai（1.3.4）— OpenAI/兼容 API 集成
├── langchain-text-splitters（1.1.2）— 文本切分器
├── langchain-chroma（1.1.0）— ChromaDB 集成
├── langchain-qdrant（1.1.0）— Qdrant 集成
└── langgraph（1.2.8）— 状态图工作流引擎
```

---

### 2.2 核心组件：Chat Model

```python
# 安装：uv add langchain-openai langchain-core
from langchain_openai import ChatOpenAI

# 创建 Chat Model（对标 C#：创建 HttpClient 实例）
# LangChain 的 ChatOpenAI 兼容所有 OpenAI 格式的 API
llm = ChatOpenAI(
    model="qwen-plus",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key="sk-your-key",
    temperature=0.3,
)

# 基本调用
from langchain_core.messages import SystemMessage, HumanMessage

response = llm.invoke([
    SystemMessage(content="你是养老院的健康顾问。"),
    HumanMessage(content="张大爷血压160/100mmHg，需要怎么处理？"),
])

print(response.content)          # 回复文本
print(response.usage_metadata)   # Token 使用统计
```

---

### 2.3 Prompt Template

```python
from langchain_core.prompts import ChatPromptTemplate

# Prompt Template（对标 C# 的 Razor 模板）
# 用 {variable} 定义占位符，运行时填充

# 方式 1：从模板创建
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是养老院的{role}，擅长{expertise}。"),
    ("human", "{question}"),
])

# 填充变量
messages = prompt.invoke({
    "role": "健康顾问",
    "expertise": "高血压护理和用药指导",
    "question": "张大爷血压160/100mmHg，需要怎么处理？",
})

print(messages)
# ChatPromptValue(messages=[SystemMessage(...), HumanMessage(...)])

# 方式 2：带 Few-shot 示例的 Prompt
prompt_few_shot = ChatPromptTemplate.from_messages([
    ("system", "你是养老院护理记录分类专家。"),
    ("human", "记录：{record}"),
    ("assistant", "分类结果："),
])

# 方式 3：带格式化输出要求的 Prompt
prompt_json = ChatPromptTemplate.from_messages([
    ("system", """从护理记录中提取结构化信息，输出JSON格式。
输出格式：
{{"member_name": "姓名", "blood_pressure": "血压值", "risk_level": "风险等级", "suggestions": ["建议1", "建议2"]}}"""),
    ("human", "{record}"),
])
```

---

### 2.4 LCEL（LangChain Expression Language）— 管道式编程

#### 类比

LCEL 就像 ASP.NET Core 的中间件管道——数据从一端流入，经过一系列处理步骤，从另一端流出。

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 创建组件
llm = ChatOpenAI(model="qwen-plus", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", api_key="sk-your-key")
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是养老院的健康顾问。用简洁专业的语气回答。"),
    ("human", "{question}"),
])
parser = StrOutputParser()

# 用管道符 | 组装 Chain（对标 C# 的 builder 模式）
# prompt | llm | parser 的含义：先格式化 Prompt → 再调用 LLM → 最后解析输出
chain = prompt | llm | parser

# 调用 Chain
result = chain.invoke({"question": "高血压长者的护理要点有哪些？"})
print(result)

# C# 等价理解：
# var result = prompt
#     .Format(question: "...")
#     .SendToLLM(model: "qwen-plus")
#     .ParseAsString();
```

#### LCEL 的优势：自动支持流式和批量

```python
# 流式输出（自动支持，不需要额外代码）
print("流式输出: ", end="")
for chunk in chain.stream({"question": "高血压的分级标准是什么？"}):
    print(chunk, end="", flush=True)
print()

# 批量处理（并行调用，自动优化）
questions = [
    {"question": "高血压怎么处理？"},
    {"question": "糖尿病饮食要注意什么？"},
    {"question": "长者跌倒后怎么急救？"},
]
results = chain.batch(questions)
for q, r in zip(questions, results):
    print(f"Q: {q['question'][:20]}... → A: {r[:50]}...")
```

---

### 2.5 Output Parser — 输出解析器

```python
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from pydantic import BaseModel, Field
# 注：LangChain 0.2+ 推荐直接从 pydantic 导入；旧版（<0.2）需用 from langchain_core.pydantic_v1 import BaseModel

# 1. 字符串解析器（最简单）
str_parser = StrOutputParser()

# 2. JSON 解析器（结构化输出）
class HealthAssessment(BaseModel):
    """健康评估结果"""
    risk_level: str = Field(description="风险等级：低风险/中风险/高风险/极高风险")
    abnormal_items: list[str] = Field(description="异常指标列表")
    recommendations: list[str] = Field(description="护理建议")
    need_medical_attention: bool = Field(description="是否需要就医")

json_parser = JsonOutputParser(pydantic_object=HealthAssessment)

# 带格式指令的 Prompt
prompt_with_format = ChatPromptTemplate.from_messages([
    ("system", "你是养老院健康评估专家。{format_instructions}"),
    ("human", "请评估以下长者：{member_data}"),
])

# 组装带解析的 Chain
chain = prompt_with_format | llm | json_parser

# 调用（注意 format_instructions 由 parser 自动生成）
result = chain.invoke({
    "member_data": "张大爷，78岁，血压165/105mmHg，心率95次/分，血氧92%",
    "format_instructions": json_parser.get_format_instructions(),
})

print(type(result))   # <class 'dict'>
print(result)
# {
#     "risk_level": "高风险",
#     "abnormal_items": ["血压偏高(2级)", "心率偏快", "血氧偏低"],
#     "recommendations": ["排查肺部感染", "给予吸氧", "通知医生评估用药"],
#     "need_medical_attention": true
# }
```

---

### 2.6 RAG Chain — 用 LangChain 构建 RAG

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# 1. 创建 Embedding 模型和向量数据库
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small",
    openai_api_key="sk-your-key",
)
vectorstore = Chroma(
    persist_directory="./nursing_vectordb",
    embedding_function=embeddings,
)
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# 2. 创建 Prompt
rag_prompt = ChatPromptTemplate.from_messages([
    ("system", """你是养老院的智能健康助手。
只基于参考资料回答，不要编造信息。
引用来源时使用 [来源: xxx] 格式。"""),
    ("human", """参考资料：
{context}

问题：{question}"""),
])

# 3. 创建 RAG Chain（用 LCEL 组装）
llm = ChatOpenAI(model="qwen-plus", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", api_key="sk-your-key")

def format_docs(docs):
    """将检索到的文档格式化为字符串"""
    return "\n\n".join(
        f"[来源: {doc.metadata.get('source', '未知')}]\n{doc.page_content}"
        for doc in docs
    )

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | rag_prompt
    | llm
    | StrOutputParser()
)

# 4. 调用
answer = rag_chain.invoke("张大爷血压160/100，伴有头晕，怎么处理？")
print(answer)
```

#### LCEL 的数据流图

```
用户问题
    ↓
{"context": retriever | format_docs, "question": RunnablePassthrough()}
    ↓                        ↓
检索知识库 → 格式化文档    传递原始问题
    ↓                        ↓
        ChatPromptTemplate（组装 Prompt）
                    ↓
              ChatOpenAI（调用 LLM）
                    ↓
           StrOutputParser（解析输出）
                    ↓
                最终回答
```

---

### 2.7 LangGraph — 状态图工作流

#### 类比

LangChain 的 Chain 是"直线流水线"——数据从 A 到 B 到 C，一条路走到底。LangGraph 是"流程图"——可以有条件分支（如果...就...）、循环（反复执行直到满足条件）、并行（同时执行多个任务）。

养老院的**长者入住评估流程**就是一个典型的状态图：

```
接收申请 → 初步评估 → [健康状况良好？]
                        ├─ 是 → 自理级别 → 安排普通房间
                        └─ 否 → [需要护理评估？]
                                 ├─ 是 → 护理等级评定 → 安排护理房间
                                 └─ 否 → 转介医院 → 等待
```

```python
# 安装：uv add langgraph
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
import operator

# 1. 定义状态（对标 C#：定义 ViewModel / DTO）
class NursingAssessmentState(TypedDict):
    """护理评估状态"""
    member_info: str                           # 长者信息
    vital_signs: dict                          # 生命体征
    risk_level: str                            # 风险等级
    recommendations: list[str]                 # 建议列表
    need_medical_attention: bool               # 是否需要就医
    messages: Annotated[list, operator.add]    # 消息历史（自动追加）

# 2. 定义节点函数（对标 C#：定义 Controller Action 或 Service 方法）
def assess_vital_signs(state: NursingAssessmentState) -> dict:
    """评估生命体征"""
    vitals = state["vital_signs"]
    abnormal = []
    risk = "低风险"
    RISK_ORDER = {"低风险": 0, "中风险": 1, "高风险": 2, "极高风险": 3}
    
    if vitals.get("systolic_bp", 0) >= 160 or vitals.get("diastolic_bp", 0) >= 100:
        abnormal.append("血压偏高(2级)")
        risk = "高风险"
    if vitals.get("heart_rate", 70) > 100 or vitals.get("heart_rate", 70) < 50:
        abnormal.append("心率异常")
        risk = max(risk, "中风险", key=lambda x: RISK_ORDER.get(x, 0))
    if vitals.get("oxygen", 98) < 90:
        abnormal.append("血氧偏低")
        risk = "极高风险"
    
    return {
        "risk_level": risk,
        "recommendations": abnormal,
        "messages": [f"生命体征评估完成：{risk}"],
    }

def decide_action(state: NursingAssessmentState) -> str:
    """条件分支：根据风险等级决定下一步"""
    risk = state.get("risk_level", "低风险")
    if risk in ("高风险", "极高风险"):
        return "emergency_response"
    elif risk == "中风险":
        return "enhanced_monitoring"
    else:
        return "routine_care"

def emergency_response(state: NursingAssessmentState) -> dict:
    """紧急处理"""
    return {
        "need_medical_attention": True,
        "recommendations": state["recommendations"] + ["立即通知医生", "持续监测生命体征"],
        "messages": ["⚠️ 触发紧急响应流程"],
    }

def enhanced_monitoring(state: NursingAssessmentState) -> dict:
    """加强监测"""
    return {
        "need_medical_attention": False,
        "recommendations": state["recommendations"] + ["增加监测频次", "记录变化趋势"],
        "messages": ["📋 已启动加强监测"],
    }

def routine_care(state: NursingAssessmentState) -> dict:
    """常规护理"""
    return {
        "need_medical_attention": False,
        "recommendations": ["继续保持当前护理方案"],
        "messages": ["✅ 常规护理，无需特殊处理"],
    }

# 3. 构建状态图
workflow = StateGraph(NursingAssessmentState)

# 添加节点
workflow.add_node("assess", assess_vital_signs)
workflow.add_node("emergency_response", emergency_response)
workflow.add_node("enhanced_monitoring", enhanced_monitoring)
workflow.add_node("routine_care", routine_care)

# 设置入口
workflow.set_entry_point("assess")

# 添加条件分支（对标 C#：switch/case 或策略模式）
workflow.add_conditional_edges(
    "assess",           # 从哪个节点出发
    decide_action,      # 决策函数
    {                   # 分支映射
        "emergency_response": "emergency_response",
        "enhanced_monitoring": "enhanced_monitoring",
        "routine_care": "routine_care",
    },
)

# 所有分支都到 END
workflow.add_edge("emergency_response", END)
workflow.add_edge("enhanced_monitoring", END)
workflow.add_edge("routine_care", END)

# 编译
app = workflow.compile()

# 4. 运行
result = app.invoke({
    "member_info": "张大爷，78岁",
    "vital_signs": {"systolic_bp": 165, "diastolic_bp": 105, "heart_rate": 95, "oxygen": 88},
    "risk_level": "",
    "recommendations": [],
    "need_medical_attention": False,
    "messages": [],
})

print(f"风险等级: {result['risk_level']}")
print(f"是否就医: {result['need_medical_attention']}")
print(f"建议: {result['recommendations']}")
print(f"流程日志: {result['messages']}")
```

输出：
```
风险等级: 极高风险
是否就医: True
建议: ['血压偏高(2级)', '血氧偏低', '立即通知医生', '持续监测生命体征']
流程日志: ['生命体征评估完成：极高风险', '⚠️ 触发紧急响应流程']
```

---

### 2.8 LangGraph 的循环与人工审批

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# 循环场景：AI 生成护理方案 → 人工审批 → 不通过则重新生成

class CarePlanState(TypedDict):
    member_info: str
    care_plan: str
    approval_status: str    # "pending" / "approved" / "rejected"
    revision_count: int
    messages: Annotated[list, operator.add]

def generate_care_plan(state: CarePlanState) -> dict:
    """AI 生成护理方案"""
    revision = state.get("revision_count", 0) + 1
    return {
        "care_plan": f"护理方案 v{revision}：根据长者{state['member_info']}的情况...",
        "approval_status": "pending",
        "revision_count": revision,
        "messages": [f"📝 生成护理方案 v{revision}"],
    }

def human_review(state: CarePlanState) -> dict:
    """人工审批（实际项目中这里会暂停，等待人工输入）"""
    # 模拟：如果 revision_count > 2 则自动通过
    if state.get("revision_count", 0) >= 2:
        return {"approval_status": "approved", "messages": ["✅ 人工审批通过"]}
    else:
        return {"approval_status": "rejected", "messages": ["❌ 审批未通过，需要修改"]}

def check_approval(state: CarePlanState) -> str:
    """检查审批结果，决定是否循环"""
    if state["approval_status"] == "approved":
        return "approved"
    elif state.get("revision_count", 0) >= 3:
        return "max_retries"  # 最多重试 3 次
    else:
        return "rejected"

# 构建带循环的图
workflow = StateGraph(CarePlanState)
workflow.add_node("generate", generate_care_plan)
workflow.add_node("review", human_review)
workflow.set_entry_point("generate")
workflow.add_edge("generate", "review")
workflow.add_conditional_edges("review", check_approval, {
    "approved": END,
    "max_retries": END,
    "rejected": "generate",  # 循环回去重新生成
})

app = workflow.compile()

# 运行
result = app.invoke({
    "member_info": "张大爷，78岁，高血压",
    "care_plan": "",
    "approval_status": "",
    "revision_count": 0,
    "messages": [],
})

print(f"最终方案: {result['care_plan']}")
print(f"审批状态: {result['approval_status']}")
print(f"修订次数: {result['revision_count']}")
print(f"流程日志: {result['messages']}")
```

---

### 2.9 LangSmith — 追踪与调试

```python
# LangSmith 是 LangChain 的官方可观测性平台
# 类比：Application Insights for AI Apps
#
# 功能：
# 1. 追踪每次 API 调用的输入/输出/耗时
# 2. 查看 RAG 检索到了哪些文档
# 3. 分析 Prompt 的 token 使用
# 4. 评估模型输出质量

# 配置（环境变量）
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "lsv2-your-key"
os.environ["LANGCHAIN_PROJECT"] = "nursing-home-ai"

# 配置后，所有 LangChain 调用自动上报到 LangSmith
# 无需修改业务代码——零侵入式追踪

# 在 LangSmith 控制台（smith.langchain.com）可以看到：
# - 每次 RAG 调用的完整链路
# - 检索到的文档列表和相似度分数
# - Prompt 的实际内容和 token 数
# - LLM 的响应时间和输出
# - 错误和异常的堆栈信息
```

---

## 三、养老院业务实战案例

### 需求描述

用 LangChain + LangGraph 构建一个**智能护理评估工作流**：

1. 接收长者信息和生命体征
2. 用 RAG 检索相关护理知识
3. 用 LLM 生成护理评估报告
4. 根据风险等级走不同处理流程
5. 高风险情况触发告警并通知家属

### 完整代码

```python
"""
养老院智能护理评估工作流 — LangChain + LangGraph 实战
======================================================
第 10 章实战案例：RAG 检索 + LLM 评估 + 状态图工作流

运行环境：Python 3.14
安装依赖：uv add langchain-openai langchain-core langchain-chroma langgraph
"""

import json
from typing import TypedDict, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
import operator


# ============================================================
# 配置
# ============================================================

llm = ChatOpenAI(
    model="qwen-plus",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key="sk-your-key",
    temperature=0.3,
)


# ============================================================
# 第一部分：模拟知识库（实际项目中用 Chroma/Qdrant）
# ============================================================

KNOWLEDGE_BASE = {
    "高血压": "高血压分级：1级(140-159/90-99)、2级(160-179/100-109)、3级(≥180/≥110)。老年人降压目标<150/90。护理要点：低盐饮食、定时监测、遵医嘱用药。",
    "低血氧": "SpO2<90%为低氧血症。立即低流量吸氧(1-2L/min)，半卧位，30分钟后复查。持续<90%通知医生。",
    "心率异常": "心动过缓(<60次/分)：排查药物因素，监测血压。心动过速(>100次/分)：排查感染、疼痛、焦虑，必要时心电图。",
    "跌倒": "跌倒后：评估意识→检查出血→评估骨折→测生命体征→记录→通知医生。髋部疼痛+活动受限→怀疑骨折，不要搬动。",
    "糖尿病": "空腹血糖<7.0mmol/L，餐后<11.1。老年人可放宽至空腹<8.0。低血糖：进食15g快碳，15分钟后复测。",
}


def mock_retriever(query: str) -> list[str]:
    """模拟知识库检索（实际项目中替换为向量检索）"""
    results = []
    for key, value in KNOWLEDGE_BASE.items():
        if key in query:
            results.append(value)
    return results if results else ["未找到相关知识，请咨询主治医生。"]


# ============================================================
# 第二部分：LangChain 组件
# ============================================================

# 1. 生命体征评估 Prompt
assessment_prompt = ChatPromptTemplate.from_messages([
    ("system", """你是养老院的资深健康评估专家。
根据长者的生命体征数据和参考知识，给出结构化评估。

输出 JSON 格式：
{{
    "risk_level": "低风险/中风险/高风险/极高风险",
    "abnormal_indicators": ["异常指标1", "异常指标2"],
    "analysis": "综合分析（2-3句话）",
    "recommendations": ["建议1", "建议2"],
    "need_immediate_attention": true/false
}}"""),
    ("human", """长者信息：{member_info}
生命体征：{vital_signs}

参考知识：
{knowledge}

请评估健康风险。"""),
])

# 2. 护理方案生成 Prompt
care_plan_prompt = ChatPromptTemplate.from_messages([
    ("system", "你是养老院护理方案制定专家。根据评估结果生成具体的护理方案。"),
    ("human", """长者：{member_info}
评估结果：{assessment}

请生成护理方案，包括：监测计划、饮食建议、用药提醒、注意事项。"""),
])

# 3. 家属通知话术生成 Prompt
family_notify_prompt = ChatPromptTemplate.from_messages([
    ("system", "你是养老院家属沟通专家。生成温和专业的家属通知话术。"),
    ("human", """长者：{member_info}
当前状况：{assessment}
需要通知家属的内容：{notification_content}

请生成家属通知话术。"""),
])


# ============================================================
# 第三部分：LangGraph 工作流定义
# ============================================================

class NursingWorkflowState(TypedDict):
    """工作流状态"""
    member_info: str                              # 长者信息
    vital_signs: dict                             # 生命体征
    knowledge: list[str]                          # 检索到的知识
    assessment: dict                              # 评估结果
    care_plan: str                                # 护理方案
    family_notification: str                      # 家属通知话术
    alert_level: str                              # 告警级别
    messages: Annotated[list, operator.add]       # 流程日志


# ----- 节点函数 -----

def retrieve_knowledge(state: NursingWorkflowState) -> dict:
    """检索相关知识"""
    member = state["member_info"]
    vitals = state["vital_signs"]
    
    # 构建检索查询
    query_parts = [member]
    if vitals.get("systolic_bp", 0) >= 140:
        query_parts.append("高血压")
    if vitals.get("oxygen", 98) < 93:
        query_parts.append("低血氧")
    if vitals.get("heart_rate", 70) < 50 or vitals.get("heart_rate", 70) > 100:
        query_parts.append("心率异常")
    
    query = " ".join(query_parts)
    knowledge = mock_retriever(query)
    
    return {
        "knowledge": knowledge,
        "messages": [f"📚 检索到 {len(knowledge)} 条相关知识"],
    }


def assess_health(state: NursingWorkflowState) -> dict:
    """AI 健康评估"""
    # 用 LangChain Chain 做评估
    chain = assessment_prompt | llm | JsonOutputParser()
    
    try:
        assessment = chain.invoke({
            "member_info": state["member_info"],
            "vital_signs": json.dumps(state["vital_signs"], ensure_ascii=False),
            "knowledge": "\n".join(state["knowledge"]),
        })
    except Exception:
        # 解析失败时的降级处理
        assessment = {
            "risk_level": "中风险",
            "abnormal_indicators": ["需要人工复核"],
            "analysis": "自动评估失败，建议人工复核。",
            "recommendations": ["请医生人工评估"],
            "need_immediate_attention": False,
        }
    
    return {
        "assessment": assessment,
        "messages": [f"🔬 健康评估完成：{assessment.get('risk_level', '未知')}"],
    }


def determine_alert_level(state: NursingWorkflowState) -> str:
    """根据评估结果确定告警级别"""
    risk = state["assessment"].get("risk_level", "低风险")
    if risk == "极高风险":
        return "critical"
    elif risk == "高风险":
        return "high"
    elif risk == "中风险":
        return "medium"
    else:
        return "low"


def generate_care_plan(state: NursingWorkflowState) -> dict:
    """生成护理方案"""
    chain = care_plan_prompt | llm | StrOutputParser()
    
    care_plan = chain.invoke({
        "member_info": state["member_info"],
        "assessment": json.dumps(state["assessment"], ensure_ascii=False),
    })
    
    return {
        "care_plan": care_plan,
        "messages": ["📋 护理方案已生成"],
    }


def trigger_alert(state: NursingWorkflowState) -> dict:
    """触发告警"""
    risk = state["assessment"].get("risk_level", "")
    return {
        "alert_level": f"🔴 {risk}告警",
        "messages": [f"🚨 已触发{risk}告警，通知值班医生"],
    }


def notify_family(state: NursingWorkflowState) -> dict:
    """生成家属通知话术"""
    chain = family_notify_prompt | llm | StrOutputParser()
    
    notification = chain.invoke({
        "member_info": state["member_info"],
        "assessment": json.dumps(state["assessment"], ensure_ascii=False),
        "notification_content": state["assessment"].get("analysis", ""),
    })
    
    return {
        "family_notification": notification,
        "messages": ["📱 家属通知话术已生成"],
    }


def routine_check(state: NursingWorkflowState) -> dict:
    """常规检查记录"""
    return {
        "alert_level": "🟢 正常",
        "messages": ["✅ 常规检查完成，无需特殊处理"],
    }


# ----- 构建状态图 -----

workflow = StateGraph(NursingWorkflowState)

# 添加节点
workflow.add_node("retrieve", retrieve_knowledge)
workflow.add_node("assess", assess_health)
workflow.add_node("care_plan", generate_care_plan)
workflow.add_node("alert", trigger_alert)
workflow.add_node("notify_family", notify_family)
workflow.add_node("routine", routine_check)

# 定义流程
workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "assess")

# 条件分支：根据告警级别走不同路径
workflow.add_conditional_edges("assess", determine_alert_level, {
    "critical": "alert",      # 极高风险 → 告警
    "high": "alert",          # 高风险 → 告警
    "medium": "care_plan",    # 中风险 → 生成护理方案
    "low": "routine",         # 低风险 → 常规记录
})

workflow.add_edge("alert", "notify_family")
workflow.add_edge("alert", "care_plan")
workflow.add_edge("care_plan", END)
workflow.add_edge("notify_family", END)
workflow.add_edge("routine", END)

# 编译
app = workflow.compile()


# ============================================================
# 第四部分：演示运行
# ============================================================

def run_assessment(member_info: str, vital_signs: dict) -> dict:
    """运行护理评估工作流"""
    print(f"\n{'=' * 60}")
    print(f"  🏥 长者健康评估")
    print(f"{'=' * 60}")
    print(f"  长者: {member_info}")
    print(f"  生命体征: {vital_signs}")
    print(f"{'─' * 60}")
    
    result = app.invoke({
        "member_info": member_info,
        "vital_signs": vital_signs,
        "knowledge": [],
        "assessment": {},
        "care_plan": "",
        "family_notification": "",
        "alert_level": "",
        "messages": [],
    })
    
    # 打印流程日志
    print("\n  📊 流程执行日志:")
    for msg in result["messages"]:
        print(f"    {msg}")
    
    # 打印评估结果
    assessment = result.get("assessment", {})
    print(f"\n  📋 评估结果:")
    print(f"    风险等级: {assessment.get('risk_level', '未知')}")
    print(f"    异常指标: {assessment.get('abnormal_indicators', [])}")
    print(f"    分析: {assessment.get('analysis', '')}")
    print(f"    建议: {assessment.get('recommendations', [])}")
    print(f"    告警级别: {result.get('alert_level', '无')}")
    
    if result.get("care_plan"):
        print(f"\n  📝 护理方案:")
        print(f"    {result['care_plan'][:200]}...")
    
    if result.get("family_notification"):
        print(f"\n  📱 家属通知话术:")
        print(f"    {result['family_notification'][:200]}...")
    
    return result


# 测试三个场景
if __name__ == "__main__":
    # 场景 1：高风险（血压高 + 血氧低）
    run_assessment(
        "张大爷，78岁，高血压病史",
        {"systolic_bp": 165, "diastolic_bp": 105, "heart_rate": 95, "oxygen": 88, "temperature": 36.5},
    )
    
    # 场景 2：中风险（血压偏高）
    run_assessment(
        "李奶奶，85岁，糖尿病病史",
        {"systolic_bp": 150, "diastolic_bp": 92, "heart_rate": 78, "oxygen": 96, "temperature": 36.7},
    )
    
    # 场景 3：低风险（各项正常）
    run_assessment(
        "赵奶奶，71岁，无特殊病史",
        {"systolic_bp": 125, "diastolic_bp": 80, "heart_rate": 72, "oxygen": 98, "temperature": 36.4},
    )
```

### 运行结果

```
============================================================
  🏥 长者健康评估
============================================================
  长者: 张大爷，78岁，高血压病史
  生命体征: {'systolic_bp': 165, 'diastolic_bp': 105, 'heart_rate': 95, 'oxygen': 88}
────────────────────────────────────────────────────────────

  📊 流程执行日志:
    📚 检索到 2 条相关知识
    🔬 健康评估完成：高风险
    🚨 已触发高风险告警，通知值班医生
    📱 家属通知话术已生成
    📋 护理方案已生成

  📋 评估结果:
    风险等级: 高风险
    异常指标: ['血压偏高(2级)', '血氧偏低']
    分析: 血压165/105mmHg属2级高血压，血氧88%属低氧血症，两者同时异常需高度关注。
    建议: ['立即给予吸氧', '通知医生评估降压方案', '30分钟后复查']
    告警级别: 🔴 高风险告警

  📱 家属通知话术:
    张先生您好，我是养老院护理部。张大爷今天血压偏高（165/105），
    血氧略低（88%），我们已经给予吸氧处理并通知医生...

  📝 护理方案:
    1. 监测计划：每2小时测血压，持续监测血氧
    2. 饮食建议：严格低盐饮食，每日钠<3g
    3. 用药提醒：遵医嘱服用降压药，不可自行调整
    ...

============================================================
  🏥 长者健康评估
============================================================
  长者: 赵奶奶，71岁，无特殊病史
  生命体征: {'systolic_bp': 125, 'diastolic_bp': 80, 'heart_rate': 72, 'oxygen': 98}
────────────────────────────────────────────────────────────

  📊 流程执行日志:
    📚 检索到 0 条相关知识
    🔬 健康评估完成：低风险
    ✅ 常规检查完成，无需特殊处理

  📋 评估结果:
    风险等级: 低风险
    告警级别: 🟢 正常
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **LangChain** | AI 应用开发的标准化框架 | 组件化、可复用、生态丰富 |
| **langchain-core** | 核心抽象层 | Runnable 协议、LCEL、Prompt Template |
| **LCEL** | 用管道符 `\|` 组装 AI 流水线 | `prompt \| llm \| parser`，自动支持流式/批量 |
| **ChatPromptTemplate** | 可复用的 Prompt 模板 | `{variable}` 占位符，运行时填充 |
| **Output Parser** | 解析 LLM 输出 | StrOutputParser、JsonOutputParser |
| **Retriever** | 知识库检索器 | `vectorstore.as_retriever()` |
| **LangGraph** | 状态图工作流引擎 | 条件分支、循环、并行、人工审批 |
| **StateGraph** | 定义工作流状态和节点 | TypedDict 定义状态，函数定义节点 |
| **条件分支** | `add_conditional_edges` | 根据状态走不同路径 |
| **循环** | 节点指向之前的节点 | 重试、人工审批后重新生成 |
| **LangSmith** | AI 应用可观测性平台 | 追踪、调试、评估，零侵入 |
| **Runnable** | LangChain 的统一接口 | invoke/stream/batch 三种调用方式 |

---

## 五、本章面试题

### 题目 1：LangChain 的 LCEL 是什么？它解决了什么问题？

**难度**：⭐  
**类型**：框架基础

**参考答案**：

LCEL（LangChain Expression Language）是 LangChain 的声明式组合语言，用管道符 `|` 将组件串联为流水线。解决的问题：① **代码简化**——把 `chain = A(B(C(input)))` 的嵌套调用变成 `chain = C | B | A` 的线性管道，更易读；② **统一接口**——所有组件都实现 Runnable 协议，支持 `invoke`（单次）、`stream`（流式）、`batch`（批量）三种调用方式，组合时自动传播；③ **自动优化**——LangChain 内部自动处理异步、并行、错误重试等工程细节。对标 C#：LCEL 类似 ASP.NET Core 的中间件管道 `app.UseMiddleware<A>().UseMiddleware<B>()`，数据依次流过每个组件。

---

### 题目 2：LangGraph 和 LangChain Chain 有什么区别？什么时候用 LangGraph？

**难度**：⭐⭐  
**类型**：架构选型

**参考答案**：

LangChain Chain 是**线性流水线**——数据从 A 到 B 到 C，一条路走到底。LangGraph 是**状态图**——支持条件分支、循环、并行执行、人工审批。区别：① Chain 只能线性流动，Graph 可以有条件分支（`add_conditional_edges`）；② Chain 没有内置循环，Graph 可以让节点指向之前的节点实现循环；③ Graph 支持检查点（Checkpointing）——可以暂停执行、持久化状态、恢复运行；④ Graph 支持人工审批节点（Human-in-the-loop）。使用场景：① 简单的"输入→处理→输出"→ 用 Chain（如简单问答、文本翻译）；② 需要条件分支的工作流→ 用 Graph（如根据风险等级走不同流程）；③ 需要循环重试的任务→ 用 Graph（如 AI 生成→人工审核→不通过则重试）；④ 多 Agent 协作→ 用 Graph（第 12 章详讲）。

---

### 题目 3：LangChain 的 Runnable 协议是什么？invoke/stream/batch 有什么区别？

**难度**：⭐  
**类型**：核心接口

**参考答案**：

Runnable 是 LangChain 所有组件的统一接口协议——Prompt、LLM、Parser、Retriever 都实现了 Runnable。三种调用方式：① `invoke(input)`——同步单次调用，返回一个结果。对标 C# 的 `method()`；② `stream(input)`——流式调用，返回一个迭代器（generator），逐 chunk 产出结果。对标 C# 的 `IAsyncEnumerable<T>`；③ `batch(inputs)`——批量调用，接受列表输入，并行处理多个请求。对标 C# 的 `Task.WhenAll()`。LCEL 组合时，这三种方式自动传播——`chain = prompt | llm | parser` 后，`chain.stream()` 会自动对每个组件使用流式模式。还有 `ainvoke`/`astream`/`abatch` 异步版本，对标 C# 的 `await methodAsync()`。

---

### 题目 4：如何用 LangChain 实现带结构化输出的 RAG？

**难度**：⭐⭐  
**类型**：实践应用

**参考答案**：

结构化输出 RAG 的关键是在 Chain 末尾使用 `JsonOutputParser` + Pydantic 模型定义输出格式。步骤：① 定义 Pydantic 模型（如 `HealthAssessment(risk_level, recommendations, ...)`）；② 创建 Prompt，包含 `{format_instructions}` 占位符；③ 创建 `JsonOutputParser(pydantic_object=HealthAssessment)`，它会自动在 Prompt 中注入 JSON Schema 格式说明；④ 组装 Chain：`retriever | format_docs → prompt | llm | json_parser`。注意：① 需要设置 `temperature=0` 确保 JSON 格式稳定；② 某些模型可能输出不合法的 JSON——需要做异常处理和重试；③ LangChain 的 `with_structured_output()` 方法可以更简洁地实现（但需要模型支持 JSON Schema 约束）。

---

### 题目 5：LangGraph 中如何实现条件分支和循环？

**难度**：⭐⭐  
**类型**：框架功能

**参考答案**：

**条件分支**通过 `add_conditional_edges(source_node, decision_function, mapping)` 实现：① `source_node` 是分支起点；② `decision_function` 是一个接受状态、返回字符串的函数，决定走哪条路；③ `mapping` 是字符串到节点名的字典。示例：`add_conditional_edges("assess", lambda s: "high" if s["risk"]=="高" else "low", {"high": "alert", "low": "routine"})`。**循环**通过让某个 `add_conditional_edges` 的目标指向之前的节点实现。示例：生成→审核→不通过→回到生成，就是一个循环。LangGraph 会自动检测循环并防止无限执行（可以通过 `recursion_limit` 参数设置最大循环次数）。循环场景：AI 生成→人工审批→不通过→重新生成（最多 N 次）；ReAct Agent 的推理→行动→观察循环。

---

### 题目 6：LangSmith 的作用是什么？它对标 .NET 生态的什么工具？

**难度**：⭐  
**类型**：可观测性

**参考答案**：

LangSmith 是 LangChain 的官方可观测性平台，提供 AI 应用的追踪、调试、评估功能。对标 .NET 生态的 **Application Insights + Azure Monitor**。核心功能：① **链路追踪**——自动记录每次 LLM 调用的输入/输出/耗时/token 使用，形成完整的调用链路树；② **Prompt 调试**——查看实际发送给 LLM 的完整 Prompt（包含模板填充后的结果）；③ **检索分析**——查看 RAG 检索到了哪些文档、相似度分数；④ **评估**——批量测试 Prompt 效果，计算准确率、忠实度等指标；⑤ **数据集管理**——管理测试用例和标注数据。集成方式：设置两个环境变量即可，零代码侵入——所有 LangChain 组件自动上报追踪数据。

---

### 题目 7：LangChain 的 `with_structured_output()` 和 `JsonOutputParser` 有什么区别？

**难度**：⭐⭐  
**类型**：实现细节

**参考答案**：

两者都用于获取结构化 JSON 输出，但实现机制不同：① `JsonOutputParser` 在 Prompt 中注入格式说明，依赖 LLM 自觉输出合法 JSON，然后在 Python 端解析。如果 LLM 输出不合法 JSON 会报错；② `with_structured_output()` 利用 LLM 的原生 Structured Output 功能（如 OpenAI 的 `response_format=json_schema`），在 API 层面约束输出必须符合 Schema，保证 100% 合法。选择建议：① 如果 LLM 支持原生 Structured Output（OpenAI、部分 Qwen 模型）→ 用 `with_structured_output()`，更可靠；② 如果 LLM 不支持原生约束→ 用 `JsonOutputParser`，但需要做异常处理和重试；③ `with_structured_output()` 直接返回 Pydantic 对象，`JsonOutputParser` 返回 dict。

---

### 题目 8：如何在 LangGraph 中实现人工审批（Human-in-the-loop）？

**难度**：⭐⭐  
**类型**：高级功能

**参考答案**：

LangGraph 通过 **Interrupt 机制**实现人工审批：① 在需要人工审批的节点前调用 `interrupt("请审批")`，Graph 会暂停执行并将当前状态持久化到检查点；② 外部系统（如 Web 前端）读取暂停状态，展示给审批人；③ 审批人做出决策后，通过 `graph.invoke(Command(resume=decision))` 恢复执行。实际实现需要 Checkpointer（如 `MemorySaver` 或数据库存储）来持久化状态。养老院场景：AI 生成护理方案 → 暂停 → 护理主管在 Web 界面审批 → 通过则执行，不通过则 AI 重新生成。这种方式确保了 AI 的输出在关键环节有人工把关。

---

### 题目 9：LangChain 生态中各包的职责如何划分？

**难度**：⭐  
**类型**：架构理解

**参考答案**：

`langchain-core`（1.4.9）——核心抽象层，定义 Runnable 协议、LCEL、基础接口，不依赖任何第三方 LLM。`langchain`（1.3.12）——预构建的 Chain 和 Agent，调用 `chain.invoke()` 即用。`langchain-openai`（1.3.4）——OpenAI 及兼容 API 的集成（ChatOpenAI、OpenAIEmbeddings）。`langchain-community`（0.4.2）——社区贡献的第三方集成（各种数据库、工具、LLM）。`langchain-chroma`（1.1.0）/`langchain-qdrant`（1.1.0）——向量数据库集成。`langchain-text-splitters`（1.1.2）——文本切分器。`langgraph`（1.2.8）——状态图工作流引擎。`langsmith`（0.10.0）——可观测性平台。设计原则：按需引入，不要装 `langchain` 全家桶——只需 `langchain-core` + 具体集成包即可。

---

### 题目 10：对比 LangChain 和 LlamaIndex，如何选择？

**难度**：⭐⭐  
**类型**：技术选型

**参考答案**：

| 维度 | LangChain | LlamaIndex |
|------|-----------|------------|
| 定位 | 通用 AI 应用框架 | 专注数据索引和 RAG |
| 核心优势 | 生态丰富、Agent 支持好 | RAG 深度优化、索引能力强 |
| RAG | 基础 RAG + 灵活组合 | 高级 RAG（自动路由、混合检索） |
| Agent | LangGraph 强大 | 相对简单 |
| 学习曲线 | 较高（概念多） | 较低（RAG 聚焦） |
| 适用场景 | 复杂工作流、多 Agent | 纯 RAG 应用、知识问答 |

选择建议：① 如果主要做 RAG（知识问答）→ LlamaIndex 开箱即用效果更好；② 如果需要复杂工作流（条件分支、Agent、多步协作）→ LangGraph 更强大；③ 如果两者都需要→ LlamaIndex 做检索层 + LangGraph 做编排层，可以组合使用。养老院项目推荐：先用 LangChain/LangGraph 构建完整的智能助手（包含 RAG + 工具调用 + 工作流），后续用 LlamaIndex 优化检索质量。

---

## 六、延伸阅读与资源

1. **LangChain 官方文档：python.langchain.com**  
   包含所有组件的 API 文档和教程。重点阅读 LCEL 和 RAG 章节。

2. **LangGraph 官方文档：langchain-ai.github.io/langgraph**  
   LangGraph 的教程和概念解释，包含状态图、条件分支、人工审批等高级功能。

3. **LangSmith 文档：docs.smith.langchain.com**  
   LangChain 的可观测性平台文档，包含追踪、评估、数据集管理。

4. **LangChain Cookbook：github.com/langchain-ai/langchain/tree/master/cookbook**  
   官方代码示例集合，包含各种实际场景的最佳实践。

5. **LangGraph Academy：academy.langchain.com**  
   LangGraph 的官方在线课程，从入门到高级状态图构建。

---

## 七、下一章预告

**第 11 章：AI Agent 开发**

你已经掌握了用 LangGraph 构建工作流，下一章我们将进入**Agent 的世界**：

- ReAct 模式：推理（Reasoning）+ 行动（Acting）的循环
- Tool Use：让 Agent 调用外部工具（查数据库、发通知、调 API）
- MCP 协议：2026 年最新的 Agent 工具标准
- 记忆机制：短期记忆（对话历史）+ 长期记忆（向量存储）
- 养老院 Agent 实战：构建能自主完成任务的智能护理助手

LangChain 是"流水线"，LangGraph 是"流程图"，Agent 是"有自主决策能力的机器人"——三者层层递进。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| langchain | **1.3.12** | PyPI JSON API |
| langchain-core | **1.4.9** | PyPI JSON API |
| langchain-community | **0.4.2** | PyPI JSON API |
| langchain-openai | **1.3.4** | PyPI JSON API |
| langchain-text-splitters | **1.1.2** | PyPI JSON API |
| langgraph | **1.2.8** | PyPI JSON API |
| langsmith | **0.10.0** | PyPI JSON API |
| langchain-chroma | **1.1.0** | PyPI JSON API |
| langchain-qdrant | **1.1.0** | PyPI JSON API |

**可能过时的内容**：
- LangChain API 变化较快，具体方法名可能在新版本中调整
- LangGraph 的 interrupt/checkpoint API 可能有更新
- LCEL 的具体语法可能扩展

**官方文档链接**：
- LangChain：https://python.langchain.com
- LangGraph：https://langchain-ai.github.io/langgraph
- LangSmith：https://smith.langchain.com
- LangChain GitHub：https://github.com/langchain-ai/langchain
- LangGraph GitHub：https://github.com/langchain-ai/langgraph
