# 第 12 章 多 Agent 系统 — 构建 AI 协作团队

---

## 一、章节概述

### 本章学什么

本章将单个 Agent 扩展为**多个 Agent 协作的团队**。你将掌握：

- **多 Agent 架构模式**：层级式、对等式、混合式
- **通信机制**：消息传递、共享状态、任务委派
- **角色设计**：如何为不同 Agent 分配专长和权限
- **CrewAI 实战**：用角色扮演模式构建多 Agent 团队
- **LangGraph 多 Agent**：用状态图编排多 Agent 工作流
- **养老院实战**：护理评估 + 用药审查 + 家属沟通三 Agent 协同

### 为什么学

单个 Agent 就像一个"全能护理员"——什么都要做，但什么都做不到极致。多 Agent 系统就像**多学科团队**——心内科专家负责心血管评估，药剂师负责用药审查，沟通专员负责家属通知，各司其职，协作完成复杂任务。

对养老院来说：一次完整的长者健康评估涉及多个专业领域，不可能靠一个 Agent 高质量地完成所有工作。

### 在知识体系中的位置

```
第11章 AI Agent 开发（单 Agent）
            ↓
第12章 多 Agent 系统 ← 你在这里（框架篇终章）
            ↓
第13-17章 进阶篇（微调/量化/部署/多模态/对齐）
```

---

## 二、核心知识点

### 2.1 多 Agent 架构模式

#### 类比

养老院的三种管理模式：

```
模式 1：层级式（院长→科室主任→护士长→护理员）
  院长分配任务 → 科室主任细化 → 护士长执行 → 护理员操作
  适合：流程明确、层级分明的工作

模式 2：对等式（多学科会诊）
  心内科、神经内科、药剂科、营养科平等讨论
  每位专家从自己的专业角度提出意见
  适合：需要多专业综合判断的复杂问题

模式 3：混合式（日常运作）
  日常工作层级分明，遇到复杂情况启动多学科会诊
  既有流程效率，又有灵活协作
```

#### 三种架构的代码表示

```python
# ========== 模式 1：层级式（Orchestrator Pattern）==========
# 一个"指挥官" Agent 负责分解任务、分配给专家 Agent、汇总结果
#
# 类比：护理主管接到任务后分配给不同的护理员

orchestrator_pattern = """
用户任务 → Orchestrator Agent（分解任务）
              ├─ 专家 Agent A（执行子任务 1）
              ├─ 专家 Agent B（执行子任务 2）
              └─ 专家 Agent C（执行子任务 3）
              ↓
           Orchestrator（汇总结果）→ 最终输出
"""

# ========== 模式 2：对等式（Collaborative Pattern）==========
# 多个 Agent 平等协作，通过消息传递交换信息
#
# 类比：多学科会诊，每位专家平等发言

collaborative_pattern = """
问题 → Agent A（提出方案）↔ Agent B（评审反馈）
                ↕                    ↕
           Agent C（补充意见）↔ Agent D（综合决策）
                                   ↓
                              最终方案
"""

# ========== 模式 3：流水线式（Pipeline Pattern）==========
# Agent 按顺序处理，前一个的输出是后一个的输入
#
# 类比：护理工作流程——评估→计划→执行→记录

pipeline_pattern = """
输入 → Agent A（评估）→ Agent B（计划）→ Agent C（执行）→ Agent D（记录）→ 输出
"""
```

---

### 2.2 用 LangGraph 构建多 Agent 系统

#### 类比

养老院的**长者综合评估流程**：

```
护理主管（Orchestrator）
  ├─ 分配给健康评估 Agent：分析生命体征
  ├─ 分配给用药审查 Agent：检查用药安全
  ├─ 分配给营养评估 Agent：评估饮食方案
  └─ 汇总各方意见 → 生成综合报告
```

```python
from typing import TypedDict, Annotated, Literal
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
import operator
import json

# 共享 LLM
llm = ChatOpenAI(
    model="qwen-plus",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key="sk-your-key",
    temperature=0.3,
)


# ========== 状态定义 ==========
class MultiAgentState(TypedDict):
    """多 Agent 共享状态"""
    task: str                                    # 原始任务
    member_info: dict                            # 长者信息
    health_assessment: str                       # 健康评估结果
    medication_review: str                       # 用药审查结果
    nutrition_review: str                        # 营养评估结果
    final_report: str                            # 最终综合报告
    current_agent: str                           # 当前活跃的 Agent
    messages: Annotated[list, operator.add]      # 流程日志


# ========== 专家 Agent 函数 ==========

def health_assessor(state: MultiAgentState) -> dict:
    """
    健康评估 Agent。
    专长：分析生命体征、评估健康风险、提出医疗建议。
    
    类比：养老院的心内科医生——专注于生理指标分析。
    """
    response = llm.invoke([
        SystemMessage(content="""你是养老院的健康评估专家。
专注于分析生命体征数据，评估健康风险等级。
输出格式：风险等级 + 异常指标 + 处理建议。"""),
        HumanMessage(content=f"长者信息：{json.dumps(state['member_info'], ensure_ascii=False)}\n\n请做健康评估。"),
    ])
    
    return {
        "health_assessment": response.content,
        "messages": [f"🩺 健康评估 Agent 完成评估"],
    }


def medication_reviewer(state: MultiAgentState) -> dict:
    """
    用药审查 Agent。
    专长：检查药物相互作用、过敏风险、剂量合理性。
    
    类比：养老院的临床药剂师——专注于用药安全。
    """
    response = llm.invoke([
        SystemMessage(content="""你是养老院的临床药学顾问。
专注于审查用药方案的安全性：
1. 药物-药物相互作用
2. 药物-过敏风险
3. 老年人用药注意事项
输出格式：安全等级 + 风险项 + 建议。"""),
        HumanMessage(content=f"长者信息：{json.dumps(state['member_info'], ensure_ascii=False)}\n\n请审查用药方案。"),
    ])
    
    return {
        "medication_review": response.content,
        "messages": [f"💊 用药审查 Agent 完成审查"],
    }


def nutrition_assessor(state: MultiAgentState) -> dict:
    """
    营养评估 Agent。
    专长：评估饮食方案、营养摄入、特殊饮食需求。
    
    类比：养老院的营养师——专注于膳食管理。
    """
    response = llm.invoke([
        SystemMessage(content="""你是养老院的营养师。
专注于评估长者的饮食和营养状况：
1. 当前饮食是否符合疾病管理要求
2. 营养素摄入是否均衡
3. 是否需要特殊饮食调整
输出格式：营养评估 + 饮食建议。"""),
        HumanMessage(content=f"长者信息：{json.dumps(state['member_info'], ensure_ascii=False)}\n\n请做营养评估。"),
    ])
    
    return {
        "nutrition_review": response.content,
        "messages": [f"🥗 营养评估 Agent 完成评估"],
    }


def report_generator(state: MultiAgentState) -> dict:
    """
    综合报告生成 Agent。
    专长：汇总各方意见，生成结构化的综合评估报告。
    
    类比：养老院的护理主管——汇总多学科意见，形成最终方案。
    """
    response = llm.invoke([
        SystemMessage(content="""你是养老院的护理主管。
你的任务是汇总以下专家意见，生成一份结构化的综合评估报告。

报告格式：
## 📊 综合评估报告
### 一、健康状况概述
### 二、风险评估（综合各方意见）
### 三、护理建议（按优先级排列）
### 四、用药建议（标注需医生确认的项目）
### 五、营养建议
### 六、后续关注重点"""),
        HumanMessage(content=f"""长者信息：{json.dumps(state['member_info'], ensure_ascii=False)}

健康评估意见：
{state.get('health_assessment', '未完成')}

用药审查意见：
{state.get('medication_review', '未完成')}

营养评估意见：
{state.get('nutrition_review', '未完成')}

请生成综合评估报告。"""),
    ])
    
    return {
        "final_report": response.content,
        "messages": [f"📝 综合报告已生成"],
    }


# ========== 构建多 Agent 图 ==========

workflow = StateGraph(MultiAgentState)

# 添加节点
workflow.add_node("health_assessor", health_assessor)
workflow.add_node("medication_reviewer", medication_reviewer)
workflow.add_node("nutrition_assessor", nutrition_assessor)
workflow.add_node("report_generator", report_generator)

# 入口：所有评估 Agent 并行启动（LangGraph 会自动并行执行无依赖的节点）
workflow.set_entry_point("health_assessor")

# 评估 Agent 之间有依赖关系时按顺序执行
workflow.add_edge("health_assessor", "medication_reviewer")
workflow.add_edge("medication_reviewer", "nutrition_assessor")
workflow.add_edge("nutrition_assessor", "report_generator")
workflow.add_edge("report_generator", END)

app = workflow.compile()


# ========== 运行 ==========

def run_multi_agent(member_info: dict) -> dict:
    """运行多 Agent 评估"""
    result = app.invoke({
        "task": "综合健康评估",
        "member_info": member_info,
        "health_assessment": "",
        "medication_review": "",
        "nutrition_review": "",
        "final_report": "",
        "current_agent": "",
        "messages": [],
    })
    return result


# 测试
if __name__ == "__main__":
    member = {
        "name": "张大爷", "age": 78, "room": "A201",
        "care_level": "半护理",
        "conditions": ["高血压2级", "2型糖尿病"],
        "medications": ["氨氯地平5mg qd", "二甲双胍500mg bid", "阿司匹林100mg qd"],
        "allergies": ["青霉素"],
        "vital_signs": {"bp": "165/105", "hr": 95, "sao2": 88, "bs": 7.2},
    }
    
    result = run_multi_agent(member)
    
    print("=" * 60)
    print("  多 Agent 综合评估结果")
    print("=" * 60)
    print(f"\n{result['final_report']}")
    print(f"\n📊 流程日志:")
    for msg in result["messages"]:
        print(f"  {msg}")
```

---

### 2.3 CrewAI — 角色扮演式多 Agent

```python
# 安装：uv add crewai（1.15.2）
# CrewAI 的核心思想：定义多个 Agent 角色，每个角色有专长、目标和工具

from crewai import Agent, Task, Crew

# ========== 定义 Agent 角色 ==========

health_expert = Agent(
    role="健康评估专家",
    goal="分析长者生命体征，评估健康风险等级",
    backstory="""你是一位有 15 年经验的老年科医生，
擅长根据生命体征数据快速判断长者的健康状况。""",
    verbose=True,
    # tools=[query_vital_signs, search_knowledge],  # 可绑定工具
)

medication_expert = Agent(
    role="临床药剂师",
    goal="审查用药方案的安全性，识别药物相互作用和过敏风险",
    backstory="""你是一位资深临床药剂师，
精通老年人用药安全，特别关注多重用药的相互作用。""",
    verbose=True,
)

care_plan_expert = Agent(
    role="护理方案制定专家",
    goal="综合各方意见，制定个性化的护理方案",
    backstory="""你是一位护理主管，
擅长将医疗建议转化为可执行的护理计划。""",
    verbose=True,
)


# ========== 定义任务 ==========

health_task = Task(
    description="分析长者 {member_name} 的生命体征数据（血压{bp}，心率{hr}，血氧{sao2}），评估健康风险等级。",
    expected_output="风险等级 + 异常指标列表 + 处理建议",
    agent=health_expert,
)

medication_task = Task(
    description="审查长者 {member_name} 的用药方案（{medications}），检查与既往病史（{conditions}）和过敏史（{allergies}）的冲突。",
    expected_output="用药安全等级 + 风险项 + 调整建议",
    agent=medication_expert,
    context=[health_task],  # 依赖健康评估的结果
)

care_plan_task = Task(
    description="根据健康评估和用药审查结果，为 {member_name} 制定个性化护理方案。",
    expected_output="结构化护理方案：监测计划 + 饮食建议 + 用药提醒 + 注意事项",
    agent=care_plan_expert,
    context=[health_task, medication_task],  # 依赖前两个任务
)


# ========== 组建团队 ==========

crew = Crew(
    agents=[health_expert, medication_expert, care_plan_expert],
    tasks=[health_task, medication_task, care_plan_task],
    verbose=True,
)

# 运行
result = crew.kickoff(inputs={
    "member_name": "张大爷",
    "bp": "165/105mmHg",
    "hr": "95次/分",
    "sao2": "88%",
    "medications": "氨氯地平5mg、二甲双胍500mg、阿司匹林100mg",
    "conditions": "高血压2级、2型糖尿病",
    "allergies": "青霉素",
})

print(f"\n最终护理方案:\n{result}")
```

---

### 2.4 Agent 间通信机制

```python
# 多 Agent 之间的通信方式

# ========== 方式 1：共享状态（State Sharing）==========
# 所有 Agent 读写同一个状态对象
# 类比：护理团队共享同一份长者档案
# 实现：LangGraph 的 TypedDict 状态

# ========== 方式 2：消息传递（Message Passing）==========
# Agent 之间通过消息交换信息
# 类比：护理员之间通过对讲机沟通
# 实现：Agent A 的输出作为 Agent B 的输入

# ========== 方式 3：黑板模式（Blackboard Pattern）==========
# 所有 Agent 往"黑板"上写信息，其他 Agent 可以读取
# 类比：护理站的白板——每个人都可以写和看
# 实现：共享的字典或数据库

class Blackboard:
    """
    黑板：多 Agent 共享的信息空间。
    
    类比：养老院护理站的白板——
    所有护理员都可以在上面记录信息，
    其他护理员可以看到并据此行动。
    """
    
    def __init__(self):
        self.data: dict = {}
        self.history: list = []
    
    def write(self, agent_name: str, key: str, value: any):
        """写入信息"""
        self.data[key] = value
        self.history.append({
            "agent": agent_name,
            "action": "write",
            "key": key,
            "value": str(value)[:100],
        })
    
    def read(self, key: str) -> any:
        """读取信息"""
        return self.data.get(key)
    
    def get_all(self) -> dict:
        """获取所有信息"""
        return self.data.copy()


# 使用示例
bb = Blackboard()

# 健康评估 Agent 写入评估结果
bb.write("健康评估Agent", "risk_level", "高风险")
bb.write("健康评估Agent", "abnormal_indicators", ["血压偏高", "血氧偏低"])

# 用药审查 Agent 读取评估结果，写入审查结论
risk = bb.read("risk_level")
bb.write("用药审查Agent", "medication_risk", "需要调整降压方案")

# 护理方案 Agent 读取所有信息，生成方案
all_info = bb.get_all()
```

---

### 2.5 多 Agent 的协调策略

```python
# ========== 策略 1：顺序执行（Sequential）==========
# Agent A → Agent B → Agent C，一个完成后再执行下一个
# 适合：有明确先后依赖的任务链
# 示例：评估 → 计划 → 执行 → 记录

# ========== 策略 2：并行执行（Parallel）==========
# Agent A、B、C 同时执行，最后汇总
# 适合：独立的子任务，可以同时进行
# 示例：健康评估、用药审查、营养评估同时进行

# ========== 策略 3：投票决策（Voting）==========
# 多个 Agent 对同一问题给出判断，取多数投票
# 适合：需要高可靠性的判断任务
# 示例：3 个 Agent 分别判断风险等级，投票决定最终等级

def voting_decision(agents: list, task: str, llm) -> str:
    """
    投票决策：多个 Agent 对同一问题投票。
    
    类比：养老院的重大决策——不是一个人说了算，
    而是多学科团队投票决定。
    """
    votes = []
    for agent in agents:
        response = llm.invoke([
            SystemMessage(content=f"你是{agent['role']}。{agent['expertise']}"),
            HumanMessage(content=task),
        ])
        votes.append(response.content.strip())
    
    # 多数投票
    from collections import Counter
    vote_counts = Counter(votes)
    winner = vote_counts.most_common(1)[0]
    
    return {
        "decision": winner[0],
        "confidence": f"{winner[1]}/{len(votes)}",
        "all_votes": dict(vote_counts),
    }


# ========== 策略 4：辩论式（Debate）==========
# Agent A 提出方案，Agent B 反驳，Agent C 裁决
# 适合：需要深入分析的复杂决策
# 示例：用药方案的利弊辩论

def debate(agents: dict, topic: str, llm, rounds: int = 2) -> str:
    """
    辩论式协调：正方提出方案，反方质疑，裁判裁决。
    
    类比：养老院的疑难病例讨论——
    不同医生从不同角度辩论，最终由主任医师裁决。
    """
    history = []
    
    # 正方提出方案
    pro_response = llm.invoke([
        SystemMessage(content=f"你是{agents['pro']['role']}。请从正面角度分析并提出方案。"),
        HumanMessage(content=topic),
    ])
    history.append(f"正方（{agents['pro']['role']}）：{pro_response.content}")
    
    for round_num in range(rounds):
        # 反方质疑
        con_response = llm.invoke([
            SystemMessage(content=f"你是{agents['con']['role']}。请质疑以下方案并提出风险。"),
            HumanMessage(content=f"方案：{history[-1]}"),
        ])
        history.append(f"反方（{agents['con']['role']}）：{con_response.content}")
        
        # 正方回应
        pro_reply = llm.invoke([
            SystemMessage(content=f"你是{agents['pro']['role']}。请回应以下质疑。"),
            HumanMessage(content=f"质疑：{history[-1]}"),
        ])
        history.append(f"正方回应：{pro_reply.content}")
    
    # 裁判裁决
    judge_response = llm.invoke([
        SystemMessage(content=f"你是{agents['judge']['role']}。根据以下辩论内容做出最终裁决。"),
        HumanMessage(content=f"辩论记录：\n" + "\n".join(history)),
    ])
    
    return judge_response.content
```

---

## 三、养老院业务实战案例

### 需求描述

构建一个**养老院多学科会诊系统**，由三个专家 Agent 协作完成长者的综合评估：

1. **健康评估 Agent**：分析生命体征，评估健康风险
2. **用药审查 Agent**：检查用药安全，识别药物风险
3. **护理方案 Agent**：综合各方意见，制定护理计划

### 完整代码

```python
"""
养老院多学科会诊系统 — 多 Agent 协作实战
==========================================
第 12 章实战案例：三个专家 Agent 协作完成综合评估

运行环境：Python 3.14
安装依赖：uv add langchain-openai langchain-core langgraph
"""

import json
from typing import TypedDict, Annotated
from langchain_openai import ChatOpenAI
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
# 模拟数据
# ============================================================

MEMBERS_DB = {
    1001: {
        "name": "张大爷", "age": 78, "room": "A201", "care_level": "半护理",
        "conditions": ["高血压2级", "2型糖尿病"],
        "medications": ["氨氯地平5mg qd", "二甲双胍500mg bid", "阿司匹林100mg qd"],
        "allergies": ["青霉素"],
        "vital_signs": {"bp": "165/105", "hr": 95, "sao2": 88, "temp": 36.5, "bs": 7.2},
        "diet": "普通饮食，低盐低糖",
    },
    1002: {
        "name": "李奶奶", "age": 85, "room": "B302", "care_level": "全护理",
        "conditions": ["冠心病", "骨质疏松", "轻度认知障碍"],
        "medications": ["阿司匹林100mg qd", "阿托伐他汀20mg qn", "碳酸钙D3 bid"],
        "allergies": [],
        "vital_signs": {"bp": "128/80", "hr": 76, "sao2": 96, "temp": 36.7, "bs": 5.8},
        "diet": "软食，高钙饮食",
    },
    1003: {
        "name": "王爷爷", "age": 92, "room": "C105", "care_level": "特护",
        "conditions": ["帕金森病", "慢性心衰", "前列腺增生"],
        "medications": ["左旋多巴250mg tid", "呋塞米20mg qd", "螺内酯20mg qd"],
        "allergies": ["磺胺类"],
        "vital_signs": {"bp": "110/68", "hr": 52, "sao2": 93, "temp": 36.8, "bs": 5.5},
        "diet": "软食，糊状食物（吞咽困难）",
    },
}

KNOWLEDGE = {
    "高血压": "高血压分级：1级(140-159/90-99)、2级(160-179/100-109)、3级(≥180/≥110)。2级建议联合用药。",
    "低血氧": "SpO2<90%立即吸氧(1-2L/min)，半卧位，30分钟后复查。",
    "降压药": "CCB(氨氯地平)+ARB(缬沙坦)联合用药适用于2级高血压。注意CCB踝部水肿。",
    "帕金森": "左旋多巴需空腹服用（餐前1h或餐后2h）。不可突然停药。",
    "心衰": "呋塞米+螺内酯是经典利尿方案。注意监测电解质和肾功能。",
}


# ============================================================
# 黑板：多 Agent 共享信息空间
# ============================================================

class Blackboard:
    """黑板：所有 Agent 共享的信息空间"""
    def __init__(self):
        self.data = {}
        self.logs = []
    
    def write(self, agent: str, key: str, value: str):
        self.data[key] = value
        self.logs.append(f"[{agent}] 写入 {key}")
    
    def read(self, key: str) -> str:
        return self.data.get(key, "")
    
    def get_summary(self) -> str:
        return json.dumps(self.data, ensure_ascii=False, indent=2)


# ============================================================
# 多 Agent 工作流定义
# ============================================================

class ConsultationState(TypedDict):
    member_id: int
    member_info: dict
    blackboard: Blackboard
    final_report: str
    messages: Annotated[list, operator.add]


def health_assessor(state: ConsultationState) -> dict:
    """
    健康评估 Agent：分析生命体征，评估健康风险。
    
    专长：心血管评估、呼吸功能评估、代谢评估
    权限：只读长者数据，不能修改
    """
    bb = state["blackboard"]
    member = state["member_info"]
    vitals = member["vital_signs"]
    
    # 搜索相关知识
    relevant_knowledge = []
    for key, value in KNOWLEDGE.items():
        if key in str(member["conditions"]) or key in str(vitals):
            relevant_knowledge.append(value)
    
    response = llm.invoke([
        SystemMessage(content="""你是养老院的健康评估专家（老年科医生）。

## 专长
- 心血管疾病评估
- 呼吸功能评估
- 代谢性疾病评估
- 多病共存的综合风险判断

## 输出格式（严格 JSON）
{
    "risk_level": "低风险/中风险/高风险/极高风险",
    "abnormal_indicators": ["异常指标1", "异常指标2"],
    "cardiovascular_risk": "心血管风险评估",
    "respiratory_risk": "呼吸风险评估",
    "metabolic_risk": "代谢风险评估",
    "recommendations": ["建议1", "建议2"],
    "urgency": "常规/紧急/危急"
}"""),
        HumanMessage(content=f"""长者信息：
姓名：{member['name']}，{member['age']}岁
既往病史：{', '.join(member['conditions'])}
生命体征：血压{vitals['bp']}mmHg，心率{vitals['hr']}次/分，血氧{vitals['sao2']}%，体温{vitals['temp']}℃，血糖{vitals['bs']}mmol/L

参考知识：
{chr(10).join(relevant_knowledge)}

请做全面的健康评估。"""),
    ])
    
    # 写入黑板
    bb.write("健康评估Agent", "health_assessment", response.content)
    
    return {
        "blackboard": bb,
        "messages": [f"🩺 健康评估 Agent 完成评估"],
    }


def medication_reviewer(state: ConsultationState) -> dict:
    """
    用药审查 Agent：检查用药安全。
    
    专长：药物相互作用、过敏风险、老年用药安全
    权限：只读用药数据，只能建议不能修改
    """
    bb = state["blackboard"]
    member = state["member_info"]
    health_assessment = bb.read("health_assessment")
    
    response = llm.invoke([
        SystemMessage(content="""你是养老院的临床药剂师。

## 专长
- 药物-药物相互作用（DDI）
- 药物-疾病禁忌
- 药物-过敏风险
- 老年人多重用药管理

## 输出格式（严格 JSON）
{
    "safety_level": "安全/需关注/危险",
    "interactions": [{"drugs": "药物A+药物B", "severity": "轻/中/重", "description": "描述"}],
    "allergy_risk": "过敏风险评估",
    "dose_concerns": ["剂量问题"],
    "recommendations": ["用药调整建议"],
    "need_pharmacist_consult": true/false
}"""),
        HumanMessage(content=f"""长者信息：
姓名：{member['name']}，{member['age']}岁
既往病史：{', '.join(member['conditions'])}
当前用药：{', '.join(member['medications'])}
过敏史：{', '.join(member['allergies']) if member['allergies'] else '无'}

健康评估结果：
{health_assessment}

请审查用药安全性。"""),
    ])
    
    bb.write("用药审查Agent", "medication_review", response.content)
    
    return {
        "blackboard": bb,
        "messages": [f"💊 用药审查 Agent 完成审查"],
    }


def care_plan_generator(state: ConsultationState) -> dict:
    """
    护理方案 Agent：综合各方意见，制定护理计划。
    
    专长：护理计划制定、护理措施排序、家属沟通
    权限：可以创建护理记录（需人工确认）
    """
    bb = state["blackboard"]
    member = state["member_info"]
    
    response = llm.invoke([
        SystemMessage(content="""你是养老院的护理主管。

## 职责
汇总健康评估和用药审查意见，制定可执行的护理方案。

## 输出格式（Markdown）
### 📊 综合评估摘要
[1-2句话概括]

### ⚠️ 风险等级：[等级]

### 💊 用药建议
[需要医生确认的标注 ⚕️]

### 📋 护理计划
| 时间 | 护理措施 | 负责人 | 备注 |
|------|----------|--------|------|

### 🍽️ 饮食建议
[具体饮食调整]

### 📞 家属沟通要点
[需要告知家属的内容]

### 📅 后续随访
[随访计划]"""),
        HumanMessage(content=f"""长者信息：
姓名：{member['name']}，{member['age']}岁，{member['care_level']}
房间：{member['room']}
既往病史：{', '.join(member['conditions'])}

健康评估意见：
{bb.read('health_assessment')}

用药审查意见：
{bb.read('medication_review')}

请制定综合护理方案。"""),
    ])
    
    bb.write("护理方案Agent", "care_plan", response.content)
    
    return {
        "blackboard": bb,
        "final_report": response.content,
        "messages": [f"📋 护理方案 Agent 完成方案制定"],
    }


# ============================================================
# 构建工作流
# ============================================================

workflow = StateGraph(ConsultationState)
workflow.add_node("health_assessor", health_assessor)
workflow.add_node("medication_reviewer", medication_reviewer)
workflow.add_node("care_plan_generator", care_plan_generator)

workflow.set_entry_point("health_assessor")
workflow.add_edge("health_assessor", "medication_reviewer")
workflow.add_edge("medication_reviewer", "care_plan_generator")
workflow.add_edge("care_plan_generator", END)

app = workflow.compile()


# ============================================================
# 演示运行
# ============================================================

def run_consultation(member_id: int):
    """运行多学科会诊"""
    member = MEMBERS_DB.get(member_id)
    if not member:
        print(f"未找到长者 {member_id}")
        return
    
    print("=" * 60)
    print(f"  🏥 多学科会诊：{member['name']}")
    print("=" * 60)
    print(f"  年龄：{member['age']}岁 | 房间：{member['room']} | 护理等级：{member['care_level']}")
    print(f"  诊断：{', '.join(member['conditions'])}")
    print(f"  用药：{', '.join(member['medications'])}")
    print(f"  过敏：{', '.join(member['allergies']) if member['allergies'] else '无'}")
    print(f"  生命体征：血压{member['vital_signs']['bp']} | 心率{member['vital_signs']['hr']} | "
          f"血氧{member['vital_signs']['sao2']}% | 血糖{member['vital_signs']['bs']}")
    print("─" * 60)
    
    result = app.invoke({
        "member_id": member_id,
        "member_info": member,
        "blackboard": Blackboard(),
        "final_report": "",
        "messages": [],
    })
    
    # 打印流程日志
    print("\n📊 会诊流程:")
    for msg in result["messages"]:
        print(f"  {msg}")
    
    # 打印最终报告
    print(f"\n{'=' * 60}")
    print(f"  📝 综合会诊报告")
    print(f"{'=' * 60}")
    print(result["final_report"])
    
    return result


if __name__ == "__main__":
    # 会诊 1：高风险长者
    run_consultation(1001)
    
    # 会诊 2：稳定长者
    # run_consultation(1002)
    
    # 会诊 3：特护长者
    # run_consultation(1003)
```

### 运行结果

```
============================================================
  🏥 多学科会诊：张大爷
============================================================
  年龄：78岁 | 房间：A201 | 护理等级：半护理
  诊断：高血压2级，2型糖尿病
  用药：氨氯地平5mg qd，二甲双胍500mg bid，阿司匹林100mg qd
  过敏：青霉素
  生命体征：血压165/105 | 心率95 | 血氧88% | 血糖7.2
────────────────────────────────────────────────────────────

📊 会诊流程:
  🩺 健康评估 Agent 完成评估
  💊 用药审查 Agent 完成审查
  📋 护理方案 Agent 完成方案制定

============================================================
  📝 综合会诊报告
============================================================

### 📊 综合评估摘要
张大爷，78岁，高血压2级合并糖尿病，当前血压165/105mmHg伴血氧88%，
属高风险状态，需立即干预。

### ⚠️ 风险等级：高风险

### 💊 用药建议
1. 当前单药（氨氯地平5mg）控制不佳，建议加用ARB类（缬沙坦）⚕️
2. 阿司匹林与氨氯地平联用需关注出血倾向
3. 二甲双胍在肾功能正常情况下可继续使用
4. ⚕️ 以上用药调整需主治医生确认

### 📋 护理计划
| 时间 | 护理措施 | 负责人 | 备注 |
|------|----------|--------|------|
| 立即 | 低流量吸氧1-2L/min | 值班护士 | 血氧<90%紧急处理 |
| 立即 | 通知值班医生 | 护理主管 | 紧急通知 |
| 每2h | 监测血压+血氧 | 责任护士 | 记录变化趋势 |
| 每日 | 低盐低糖饮食管理 | 营养师 | 钠<5g/日 |
| 每日 | 服药监督 | 责任护士 | 确认按时服药 |

### 🍽️ 饮食建议
严格低盐饮食（每日钠<5g），控制碳水化合物摄入，少食多餐，
避免高GI食物，增加膳食纤维。

### 📞 家属沟通要点
张大爷血压近期持续升高，已出现血氧偏低。建议家属来院面谈用药调整方案。

### 📅 后续随访
- 30分钟后复查血氧和血压
- 如血氧回升至93%以上，继续当前方案
- 如血压持续>160/100，启动联合降压方案
- 3天后复查评估效果
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **多 Agent** | 多个专长 Agent 协作完成复杂任务 | 分工明确，各司其职 |
| **层级式** | Orchestrator 分配任务给专家 Agent | 适合流程明确的任务 |
| **对等式** | 多个 Agent 平等协作讨论 | 适合需要综合判断的任务 |
| **流水线式** | Agent 按顺序处理 | 前一个的输出是后一个的输入 |
| **黑板模式** | 所有 Agent 共享信息空间 | 读写同一个数据结构 |
| **投票决策** | 多个 Agent 投票取多数 | 提升判断的可靠性 |
| **辩论式** | 正方/反方/裁判三方辩论 | 深入分析复杂决策 |
| **CrewAI** | 角色扮演式多 Agent 框架 | 定义角色+任务+Crew |
| **LangGraph 多 Agent** | 用状态图编排多 Agent | 条件分支+并行+人工审批 |
| **Agent 专长** | 每个 Agent 有明确的领域和权限 | 减少幻觉，提升专业性 |
| **任务依赖** | Agent 之间的执行顺序 | context 参数指定依赖关系 |

---

## 五、本章面试题

### 题目 1：多 Agent 系统相比单 Agent 有什么优势和劣势？

**难度**：⭐⭐  
**类型**：架构对比

**参考答案**：

**优势**：① **专业分工**——每个 Agent 专注于一个领域（健康评估、用药审查），比单个"全能"Agent 更专业、幻觉更少；② **可维护性**——修改某个 Agent 的 Prompt 不影响其他 Agent；③ **可扩展性**——新增一个"心理评估 Agent"只需添加一个节点，不需要重构整个系统；④ **可靠性**——多个 Agent 交叉验证，减少单一 Agent 的判断失误。**劣势**：① **延迟增加**——多个 Agent 串行执行，总延迟 = 各 Agent 延迟之和；② **成本增加**——每个 Agent 都需要调用 LLM，Token 消耗成倍增加；③ **协调复杂**——Agent 之间的信息传递、依赖管理、错误处理更复杂；④ **一致性**——多个 Agent 可能给出矛盾的建议，需要协调机制。选择建议：简单任务用单 Agent，复杂任务（涉及多个专业领域）用多 Agent。

---

### 题目 2：层级式、对等式、流水线式三种多 Agent 架构分别适合什么场景？

**难度**：⭐⭐  
**类型**：架构选型

**参考答案**：

① **层级式（Orchestrator）**——有一个"指挥官"Agent 负责分解任务、分配给专家、汇总结果。适合：任务可以明确拆分为独立子任务的场景。如：用户说"帮我做一次全面体检分析"→ Orchestrator 分配给心血管、呼吸、代谢三个专家。② **对等式（Collaborative）**——多个 Agent 平等讨论，通过消息传递交换意见。适合：需要多专业综合判断的场景。如：疑难病例讨论、用药方案辩论。③ **流水线式（Pipeline）**——Agent 按顺序执行，前一个的输出是后一个的输入。适合：有明确步骤的工作流程。如：数据收集→分析→方案生成→审核→执行。养老院场景中，日常评估用流水线式（高效），疑难病例用对等式（深入），综合体检用层级式（全面）。

---

### 题目 3：如何设计 Agent 之间的通信机制？

**难度**：⭐⭐  
**类型**：架构设计

**参考答案**：

三种通信机制：① **共享状态（State Sharing）**——所有 Agent 读写同一个状态对象（如 LangGraph 的 TypedDict 状态）。优点：简单直接，不需要额外的消息传递逻辑。缺点：Agent 之间耦合度高，需要协调写入冲突。适合：LangGraph 场景。② **消息传递（Message Passing）**——Agent A 的输出作为 Agent B 的输入。优点：解耦，每个 Agent 独立。缺点：信息传递需要设计消息格式。适合：流水线场景。③ **黑板模式（Blackboard）**——所有 Agent 往"黑板"上写信息，其他 Agent 可以读取。优点：灵活，Agent 可以按需读取任何信息。缺点：需要管理黑板的一致性。适合：对等式协作场景。养老院推荐：用 LangGraph 的共享状态 + Blackboard 模式组合——状态管理执行流程，Blackboard 存储中间结果。

---

### 题目 4：如何处理多个 Agent 给出矛盾建议的情况？

**难度**：⭐⭐  
**类型**：协调机制

**参考答案**：

矛盾处理策略：① **优先级规则**——预定义 Agent 的权威级别。如"用药建议以药剂师 Agent 为准，护理建议以护理主管 Agent 为准"；② **投票机制**——多个 Agent 对同一问题投票，取多数。适合分类/判断任务（如风险等级评估）；③ **仲裁 Agent**——设置一个"裁判"Agent，综合各方意见后做出最终裁决。类似护理主管汇总多学科意见；④ **人工兜底**——当 Agent 之间的分歧超过阈值时，暂停执行，请求人工介入。LangGraph 的 interrupt 机制可以实现。养老院场景中，健康评估和用药审查可能给出不同的风险等级——此时由护理方案 Agent（或人工）做最终裁决。

---

### 题目 5：CrewAI 的 Agent-Task-Crew 模型是什么？

**难度**：⭐  
**类型**：框架理解

**参考答案**：

CrewAI 的核心抽象：① **Agent**——定义角色（role）、目标（goal）、背景故事（backstory）、工具（tools）。类比：给每位团队成员写"岗位说明书"；② **Task**——定义任务描述（description）、期望输出（expected_output）、负责的 Agent、依赖的前置任务（context）。类比：给每个任务写"工作单"；③ **Crew**——将 Agent 和 Task 组合为一个团队，定义执行策略（顺序/并行）。类比：组建项目团队并制定工作计划。执行流程：Crew 按 Task 的依赖关系调度 Agent 执行任务，前一个 Task 的输出自动传递给依赖它的下一个 Task。CrewAI 的优势是**概念直观**——用角色和任务的方式思考，比直接操作状态图更符合人类思维。

---

### 题目 6：如何控制多 Agent 系统的成本？

**难度**：⭐⭐  
**类型**：成本优化

**参考答案**：

多 Agent 系统的成本 = Agent 数量 × 每个 Agent 的 Token 消耗。优化策略：① **按需激活**——不是所有任务都需要所有 Agent。简单问题只激活 1 个 Agent，复杂问题才启动多 Agent 协作；② **分层模型**——简单 Agent 用小模型（qwen-turbo），复杂 Agent 用大模型（qwen-plus）；③ **减少冗余信息**——Agent 之间传递的信息要精简，不要把完整的长者档案在每个 Agent 之间传递；④ **缓存**——相同长者的相似评估可以缓存，避免重复计算；⑤ **并行执行**——独立的 Agent 并行执行，减少总延迟（虽然不减少 Token，但减少用户等待时间）；⑥ **设置 Token 上限**——每个 Agent 的 max_tokens 设置合理上限。养老院场景中，80% 的评估可以由单个 Agent 完成，只有 20% 的复杂案例需要多 Agent 会诊。

---

### 题目 7：如何确保多 Agent 系统的一致性和可追溯性？

**难度**：⭐⭐  
**类型**：质量保证

**参考答案**：

① **共享状态**——所有 Agent 读写同一个状态对象，确保信息一致；② **Blackboard 日志**——记录每个 Agent 的所有读写操作，形成完整的审计日志；③ **LangSmith 追踪**——用 LangSmith 记录每个 Agent 的输入/输出/耗时，形成完整的调用链路；④ **检查点（Checkpoint）**——用 LangGraph 的 Checkpointer 保存每一步的状态快照，支持回放和重放；⑤ **版本管理**——记录每个 Agent 的 Prompt 版本，确保可复现；⑥ **人工审核**——关键决策（如用药调整）在执行前需要人工确认。养老院场景中，每次会诊的所有 Agent 交互记录都应该保存至少 3 年，用于质量追溯和医疗纠纷举证。

---

### 题目 8：多 Agent 系统如何处理某个 Agent 失败的情况？

**难度**：⭐⭐  
**类型**：容错设计

**参考答案**：

① **重试机制**——Agent 调用失败时自动重试（指数退避），最多 3 次；② **降级策略**——某个 Agent 失败时，用默认值或简化逻辑替代。如用药审查 Agent 失败时，返回"请人工审查用药方案"；③ **超时控制**——设置每个 Agent 的最大执行时间（如 30 秒），超时则跳过并记录；④ **部分结果**——即使某个 Agent 失败，其他 Agent 的结果仍然有效，可以生成"部分评估报告"并在报告中标注"XX 评估未完成"；⑤ **人工兜底**——当关键 Agent（如健康评估）失败时，触发人工介入。LangGraph 中可以用 try-except 包裹节点函数，失败时返回降级结果而不是抛出异常。

---

### 题目 9：对比 LangGraph 和 CrewAI 实现多 Agent 的方式。

**难度**：⭐⭐  
**类型**：技术选型

**参考答案**：

| 维度 | LangGraph | CrewAI |
|------|-----------|--------|
| 抽象层级 | 低层级（状态图） | 高层级（角色+任务） |
| 灵活性 | 极高（任意拓扑） | 中等（预定义模式） |
| 条件分支 | ✅ 原生支持 | 有限 |
| 并行执行 | ✅ 自动并行无依赖节点 | ✅ 支持 |
| 人工审批 | ✅ interrupt 机制 | 不支持 |
| 状态持久化 | ✅ Checkpointer | 不支持 |
| 学习曲线 | 较高 | 较低 |
| 适用场景 | 复杂工作流、需要精细控制 | 快速搭建多 Agent 原型 |

选择建议：① 快速验证多 Agent 思路 → CrewAI（几行代码搭建）；② 生产环境、需要精细控制 → LangGraph（支持条件分支、人工审批、状态持久化）；③ 可以组合使用——用 CrewAI 定义 Agent 角色，用 LangGraph 编排执行流程。

---

### 题目 10：为养老院设计一个多 Agent 系统的完整架构。

**难度**：⭐⭐⭐  
**类型**：系统设计

**参考答案**：

```
┌─────────────────────────────────────────────────┐
│           养老院多 Agent 智能系统                  │
│                                                   │
│  ┌─────────── Orchestrator Agent ───────────┐    │
│  │  接收任务 → 分解 → 分配 → 汇总 → 输出     │    │
│  └─────┬────────┬────────┬────────┬─────────┘    │
│        ↓        ↓        ↓        ↓              │
│  ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────────┐    │
│  │健康评估  │ │用药   │ │营养   │ │家属沟通   │    │
│  │Agent    │ │审查   │ │评估   │ │Agent    │    │
│  │(老年科) │ │Agent  │ │Agent  │ │(沟通专家)│    │
│  │         │ │(药剂师)│ │(营养师)│ │         │    │
│  └─────────┘ └──────┘ └──────┘ └──────────┘    │
│        ↓        ↓        ↓        ↓              │
│  ┌─────────────────────────────────────────┐    │
│  │           Blackboard（共享信息）           │    │
│  │  评估结果 | 审查结论 | 护理方案 | 通知记录  │    │
│  └─────────────────────────────────────────┘    │
│                       ↓                          │
│  ┌─────────────────────────────────────────┐    │
│  │           工具层（MCP Server）             │    │
│  │  查询长者 | 查体征 | 搜知识库 | 创记录     │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

Agent 角色设计：① **Orchestrator**——接收护理员指令，判断需要哪些专家，分配任务，汇总结果；② **健康评估 Agent**——老年科医生角色，分析生命体征，评估风险；③ **用药审查 Agent**——药剂师角色，检查用药安全；④ **营养评估 Agent**——营养师角色，评估饮食方案；⑤ **家属沟通 Agent**——沟通专家角色，生成通知话术。安全规则：查询操作直接执行，写入操作需人工确认，用药建议标注"请咨询医生"。

---

## 六、延伸阅读与资源

1. **CrewAI 文档：docs.crewai.com**  
   CrewAI 的官方文档，包含 Agent-Task-Crew 模型的详细说明和示例。

2. **LangGraph Multi-Agent 教程：langchain-ai.github.io/langgraph**  
   LangGraph 官方的多 Agent 教程，包含子图、Supervisor、Swarm 等模式。

3. **AutoGen 文档：microsoft.github.io/autogen**  
   微软的多 Agent 对话框架，支持灵活的 Agent 间通信。

4. **《Multi-Agent Systems》综述论文**  
   多 Agent 系统的学术综述，涵盖协调机制、通信协议、冲突解决。

5. **OpenAI Swarm：github.com/openai/swarm**  
   OpenAI 的轻量级多 Agent 框架（实验性），适合快速原型。

---

## 七、下一章预告

**第 13 章：模型微调**

你已经掌握了用框架构建 AI 应用（应用篇 + 框架篇），下一章我们进入**进阶篇**——让模型更适合你的场景：

- LoRA / QLoRA：用极低的成本微调大模型
- 数据集准备：如何为养老院场景准备微调数据
- PEFT / Unsloth：高效的微调工具
- 养老院实战：微调一个专门用于护理评估的模型

前面所有章节都是"用现成的模型"，从第 13 章开始，你将学会"定制自己的模型"。

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 版本 | 维护状态 | 来源 |
|------|------|---------|------|
| CrewAI | **1.15.2** | ✅ 活跃维护，频繁更新 | PyPI JSON API |
| AutoGen | **0.7.5** | ⚠️ 重构中（微软正从 0.2 迁移到 AG2 框架） | PyPI JSON API |
| OpenAI Swarm | **0.0.2** | ⚠️ 实验性项目，不再积极维护（已被 OpenAI Agents SDK 取代） | PyPI JSON API |
| LangGraph | **1.2.8** | ✅ 活跃维护，LangChain 核心项目 | 第 10 章已验证 |
| langchain-core | **1.4.9** | ✅ 活跃维护 | 第 10 章已验证 |
| OpenAI Agents SDK | **0.18.0** | ✅ 活跃维护，OpenAI 官方 Agent 框架 | 第 11 章已验证 |
| PydanticAI | **2.7.0** | ✅ 活跃维护，社区增长快 | 第 11 章已验证 |

**可能过时的内容**：
- CrewAI API 可能在新版本中变化
- AutoGen 的架构在持续演进中
- 新的多 Agent 协调模式可能已出现

**官方文档链接**：
- CrewAI：https://docs.crewai.com
- LangGraph Multi-Agent：https://langchain-ai.github.io/langgraph
- AutoGen：https://microsoft.github.io/autogen
- OpenAI Swarm：https://github.com/openai/swarm
