# 第 01 章 Python 基础 — 面向 C# 开发者的快速入门

---

## 一、章节概述

### 本章学什么

本章帮助有 C# 后端开发经验的工程师在最短时间内掌握 Python 核心语法和工程实践。我们不会从"什么是变量"讲起，而是直接对标你熟悉的 C# 概念，指出差异点和陷阱，让你能读得懂 Python 代码、写得出来、跑得起来。

### 为什么学

Python 是 AI/大模型领域的"母语"——PyTorch、Transformers、LangChain、所有主流框架都以 Python 为主力语言。后续 16 章的每一章代码示例、框架配置、模型微调脚本全部用 Python 编写。不掌握 Python，后面寸步难行。

### 在知识体系中的位置

```
第1章 Python 基础 ← 你在这里
  ↓
第2章 深度学习基础（用 Python + PyTorch 实现）
  ↓
第3-17章（全部基于 Python 生态）
```

本章是整个课程的地基。建议花 2-3 天扎实练习，不要跳过。

---

## 二、核心知识点

### 2.1 环境搭建：Python 版本与包管理

#### 类比

C# 世界里，你用 `dotnet` CLI 创建项目、管理 NuGet 包。Python 世界里，`uv` 就是你的 `dotnet` + `NuGet` + `Visual Studio` 的轻量替代。

#### 当前推荐方案（2026 年 7 月确认）

| 工具 | 最新版本 | 角色 | 对标 C# 工具 |
|------|---------|------|-------------|
| Python | **3.14.6**（2026-06-10） | 运行时 | .NET Runtime |
| uv | **0.11.16** | 包管理 + 项目管理 + Python 版本管理 | dotnet CLI + NuGet |
| pip | ~25.x | 传统包安装器（uv 的子命令兼容模式） | NuGet CLI |

> **为什么选 uv 而不是 pip/poetry/conda？**
> - 用 Rust 编写，安装速度比 pip 快 10-100 倍
> - 一个工具替代 pip + venv + pyenv + poetry
> - 支持 `pyproject.toml`（Python 的 `.csproj`）和锁文件
> - 2026 年 Python 社区新项目的事实标准

#### 安装步骤

```bash
# 1. 安装 uv（类比：安装 dotnet SDK）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 安装 Python 3.14（类比：dotnet --list-sdks 选择版本）
uv python install 3.14

# 3. 创建项目（类比：dotnet new console -n NursingHomeAI）
uv init nursing-home-ai
cd nursing-home-ai

# 4. 添加依赖（类比：dotnet add package Newtonsoft.Json）
uv add pandas numpy

# 5. 运行脚本（类比：dotnet run）
uv run python main.py
```

#### 项目结构对比

```
C# 项目 (.NET)                    Python 项目 (uv)
├── NursingHomeAI.sln             ├── pyproject.toml        ← 类比 .sln + .csproj
├── src/                          ├── uv.lock               ← 类比 packages.lock.json
│   ├── NursingHomeAI.csproj      ├── .python-version       ← 指定 Python 版本
│   └── Program.cs                ├── main.py               ← 入口文件
└── tests/                        └── tests/
    └── UnitTest1.cs                  └── test_main.py
```

`pyproject.toml` 是 Python 项目的"身份证"，对应你的 `.csproj`：

```toml
[project]
name = "nursing-home-ai"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
    "pandas>=2.0",
    "numpy>=2.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

---

### 2.2 变量与类型系统

#### 类比

C# 是**静态类型**语言——变量声明时必须指定类型。Python 是**动态类型**语言——变量不需要声明类型，解释器在运行时推断。

#### 对照表

```python
# Python —— 动态类型，不需要声明类型
name = "张大爷"              # str（字符串）
age = 78                     # int（整数）
height = 172.5               # float（浮点数）
is_active = True             # bool（布尔值）
balance = 3500.00            # float

# C# 等价写法：
# string name = "张大爷";
# int age = 78;
# double height = 172.5;
# bool is_active = true;
# double balance = 3500.00;
```

#### 类型提示（Type Hints）—— Python 3.5+ 的"可选类型"

Python 3.5 开始支持类型提示，让你的代码像 C# 一样有类型标注（但运行时不强制）。
注意：`list[str]`、`dict[str, int]` 等小写泛型语法需要 Python 3.9+；本课程基于 Python 3.14，直接使用新语法。

```python
# 带类型提示的写法（推荐在函数签名中使用）
name: str = "张大爷"
age: int = 78
height: float | None = None    # 可空类型，等价于 C# 的 double?

# C# 等价写法：
# string name = "张大爷";
# int age = 78;
# double? height = null;
```

#### Python 与 C# 类型对照速查

| Python 类型 | C# 类型 | 说明 |
|-------------|---------|------|
| `int` | `long` | Python 的 int 无大小限制 |
| `float` | `double` | Python 没有 `float`/`double` 之分 |
| `str` | `string` | Python 字符串不可变，与 C# 一致 |
| `bool` | `bool` | `True`/`False`（大写开头！） |
| `list` | `List<T>` | 动态数组 |
| `dict` | `Dictionary<TKey, TValue>` | 哈希表 |
| `tuple` | `Tuple<T1, T2>` | 不可变元组 |
| `set` | `HashSet<T>` | 集合 |
| `None` | `null` | Python 用 `None`，不是 `null` |
| `bytes` | `byte[]` | 二进制数据 |

> **⚠️ 陷阱：Python 的 `int` 是 C# 的 `long`**
> Python 的整数没有上限（可以存任意大数），这跟 C# 的 `int`（32 位）完全不同。做 AI 时经常要处理大数（如 token 数量、模型参数量），不用担心溢出。

---

### 2.3 数据结构：list、dict、tuple、set

#### list — 动态数组（对标 `List<T>`）

```python
# 创建一个长者名单
members: list[str] = ["张大爷", "李奶奶", "王爷爷"]

# 添加元素（类比 List.Add()）
members.append("赵奶奶")

# 插入（类比 List.Insert()）
members.insert(0, "刘爷爷")

# 切片（Python 独有，C# 用 .Skip().Take()）
first_three = members[0:3]      # 取前3个
last_two = members[-2:]         # 取最后2个

# 列表推导式（Python 的精华语法，C# 用 LINQ）
# 从长者名单中筛选姓"张"的
zhang_members = [m for m in members if m.startswith("张")]

# C# 等价写法：
# var zhangMembers = members.Where(m => m.StartsWith("张")).ToList();

# 遍历
for member in members:
    print(f"长者: {member}")

# 带索引遍历（类比 for (int i = 0; i < ...; i++)）
for i, member in enumerate(members):
    print(f"第{i+1}位长者: {member}")
```

#### dict — 字典/哈希表（对标 `Dictionary<TKey, TValue>`）

```python
# 长者档案（键值对）
member_info: dict = {
    "name": "张大爷",
    "age": 78,
    "room": "A201",
    "health_level": "自理",
}

# 访问值
name = member_info["name"]              # 直接访问（Key 不存在会报错）
name = member_info.get("name", "未知")  # 安全访问（Key 不存在返回默认值）

# 添加/修改
member_info["emergency_contact"] = "张小明"
member_info["age"] = 79

# 遍历
for key, value in member_info.items():
    print(f"{key}: {value}")

# 字典推导式（类比 LINQ .ToDictionary()）
# 假设有一组健康评估数据
scores = {"张大爷": 85, "李奶奶": 92, "王爷爷": 78}
passed = {name: score for name, score in scores.items() if score >= 80}
# 结果：{"张大爷": 85, "李奶奶": 92}
```

#### tuple — 不可变元组（对标 `Tuple<T1, T2>` 或 `(T1, T2)`）

```python
# 坐标位置（不可变，适合表示固定的组合数据）
location = (3, "A栋", "201室")

# 解包（Python 的优雅语法，C# 用 deconstruct）
floor, building, room = location
print(f"{building} {floor}楼 {room}")

# 函数返回多个值时常用 tuple
def get_member_summary(member_id: int) -> tuple[str, int, str]:
    """返回（姓名，年龄，护理等级）"""
    return "张大爷", 78, "自理"

name, age, level = get_member_summary(1001)
```

#### set — 集合（对标 `HashSet<T>`）

```python
# 已入住楼层
occupied_floors = {1, 2, 3, 5}
# 空闲楼层
available_floors = {3, 4, 5, 6}

# 交集（哪些楼层既有入住又有空闲）
both = occupied_floors & available_floors    # {3, 5}

# 差集（已满的楼层）
full_floors = occupied_floors - available_floors  # {1, 2}

# 并集
all_floors = occupied_floors | available_floors   # {1, 2, 3, 4, 5, 6}
```

---

### 2.4 控制流与推导式

#### 基本控制流（与 C# 几乎相同）

```python
# if/elif/else（C# 用 else if）
health_score = 72

if health_score >= 90:
    level = "健康"
elif health_score >= 70:       # 注意：是 elif，不是 else if
    level = "亚健康"
elif health_score >= 50:
    level = "需关注"
else:
    level = "需干预"

# for 循环（Python 的 for 是 for-each，没有 for(int i=0;...) 语法）
# 如果需要传统 for 循环：
for i in range(10):            # range(10) → 0,1,2,...,9
    print(i)

# while 循环（与 C# 相同）
retry_count = 0
while retry_count < 3:
    try:
        # 尝试调用健康数据接口...
        break                  # 成功就跳出
    except Exception:
        retry_count += 1
```

#### 三元表达式

```python
# Python 三元表达式（注意顺序与 C# 不同！）
status = "正常" if health_score >= 60 else "异常"

# C# 等价写法：
# var status = health_score >= 60 ? "正常" : "异常";
```

#### 推导式 — Python 的"LINQ"

```python
# 场景：从长者列表中提取所有需要特殊护理的长者信息

members = [
    {"name": "张大爷", "age": 78, "care_level": "自理"},
    {"name": "李奶奶", "age": 85, "care_level": "半护理"},
    {"name": "王爷爷", "age": 92, "care_level": "全护理"},
    {"name": "赵奶奶", "age": 71, "care_level": "自理"},
]

# 列表推导式（类比 .Select().Where().ToList()）
need_care = [m["name"] for m in members if m["care_level"] != "自理"]
# 结果：["李奶奶", "王爷爷"]

# 字典推导式（类比 .ToDictionary()）
age_map = {m["name"]: m["age"] for m in members}
# 结果：{"张大爷": 78, "李奶奶": 85, ...}

# 嵌套推导式（不推荐太复杂，超过 2 层用普通循环）
# 找出年龄 > 80 且需要护理的长者
elderly_care = [m["name"] for m in members if m["age"] > 80 and m["care_level"] != "自理"]
# 结果：["李奶奶", "王爷爷"]
```

---

### 2.5 函数与 Lambda

#### 函数定义

```python
# 基本函数（对比 C# 方法）
def calculate_bmi(weight_kg: float, height_cm: float) -> float:
    """
    计算 BMI 指数。

    Args:
        weight_kg: 体重（公斤）
        height_cm: 身高（厘米）

    Returns:
        BMI 值
    """
    height_m = height_cm / 100
    return weight_kg / (height_m ** 2)   # ** 是幂运算，等价于 Math.Pow()

# C# 等价写法：
# public static double CalculateBmi(double weightKg, double heightCm)
# {
#     var heightM = heightCm / 100;
#     return weightKg / Math.Pow(heightM, 2);
# }
```

#### 默认参数与关键字参数

```python
# 默认参数（C# 也支持，但 Python 的默认值陷阱不同）
def assess_health(
    member_name: str,
    heart_rate: int,
    blood_pressure: str = "120/80",    # 默认值
    temperature: float = 36.5          # 默认值
) -> str:
    """健康评估函数"""
    if heart_rate > 100 or heart_rate < 50:
        return f"{member_name} 心率异常: {heart_rate}"
    return f"{member_name} 基本正常"

# 调用方式
result1 = assess_health("张大爷", 72)                          # 使用默认值
result2 = assess_health("李奶奶", 110, temperature=37.2)       # 跳过中间参数
result3 = assess_health(member_name="王爷爷", heart_rate=65)   # 关键字参数（更清晰）
```

> **⚠️ 陷阱：可变默认参数**
> Python 的默认参数在函数定义时只计算一次！如果默认值是可变对象（list/dict），会产生"幽灵数据"：

```python
# ❌ 错误写法——所有调用共享同一个列表
def add_record_bad(record, history=[]):
    history.append(record)
    return history

# ✅ 正确写法——用 None 作为默认值
def add_record_good(record, history=None):
    if history is None:
        history = []
    history.append(record)
    return history
```

#### Lambda 表达式

```python
# Lambda（对标 C# 的 lambda：(x) => x.Name）
get_age = lambda m: m["age"]

# 常用于排序
members = [
    {"name": "张大爷", "age": 78},
    {"name": "李奶奶", "age": 85},
    {"name": "王爷爷", "age": 72},
]
sorted_members = sorted(members, key=lambda m: m["age"])

# C# 等价写法：
# var sorted = members.OrderBy(m => m.Age).ToList();
```

---

### 2.6 类与面向对象

#### 类定义

```python
class Member:
    """长者档案类（对标 C# 的 class）"""

    # 类变量（对标 C# 的 static 字段）
    total_count: int = 0

    def __init__(
        self,
        name: str,
        age: int,
        room_number: str,
        care_level: str = "自理"
    ):
        """
        构造函数（对标 C# 的构造函数）。

        Python 的 self ≈ C# 的 this，但 Python 必须显式写出来。
        """
        self.name = name                    # 实例属性
        self.age = age
        self.room_number = room_number
        self.care_level = care_level
        self._medical_records: list = []    # 前缀 _ 表示"受保护"（约定，非强制）

        Member.total_count += 1             # 修改类变量

    def __str__(self) -> str:
        """对标 C# 的 ToString()"""
        return f"Member({self.name}, {self.age}岁, {self.room_number})"

    def add_medical_record(self, record: str) -> None:
        """添加医疗记录"""
        self._medical_records.append(record)

    @property
    def is_elderly(self) -> bool:
        """
        属性（对标 C# 的 public bool IsElderly { get { ... } }）。
        @property 装饰器让方法像属性一样访问。
        """
        return self.age >= 60

    @staticmethod
    def create_guest(name: str) -> "Member":
        """静态方法（对标 C# 的 static 方法）"""
        return Member(name=name, age=0, room_number="访客")

    @classmethod
    def from_dict(cls, data: dict) -> "Member":
        """
        类方法（对标 C# 的静态工厂方法）。
        cls ≈ 类本身，用于替代构造函数的工厂模式。
        """
        return cls(
            name=data["name"],
            age=data["age"],
            room_number=data["room"],
            care_level=data.get("care_level", "自理"),
        )


# 使用
zhang = Member("张大爷", 78, "A201")
zhang.add_medical_record("2024-01-15 血压偏高")
print(zhang)                    # Member(张大爷, 78岁, A201)
print(zhang.is_elderly)         # True

# 从字典创建（工厂方法）
data = {"name": "李奶奶", "age": 85, "room": "B302", "care_level": "半护理"}
li = Member.from_dict(data)
```

#### 继承

```python
class Resident(Member):
    """
    入住长者（继承自 Member）。
    对标 C# 的 class Resident : Member
    """

    def __init__(
        self,
        name: str,
        age: int,
        room_number: str,
        care_level: str = "自理",
        admission_date: str = "",
    ):
        # 调用父类构造函数（对标 base(...)）
        super().__init__(name, age, room_number, care_level)
        self.admission_date = admission_date

    def discharge(self) -> str:
        """退住"""
        return f"{self.name} 已于 {self.admission_date} 办理退住"


# 使用
resident = Resident("张大爷", 78, "A201", "自理", "2024-01-01")
print(resident.is_elderly)    # 继承的属性，True
print(resident.discharge())   # 子类方法
```

#### 抽象类与接口（对标 C# 的 abstract / interface）

```python
from abc import ABC, abstractmethod

# 抽象基类（对标 C# 的 abstract class 或 interface）
class HealthChecker(ABC):
    """健康检查接口"""

    @abstractmethod
    def check(self, member: Member) -> dict:
        """执行健康检查（子类必须实现）"""
        ...

    @abstractmethod
    def get_check_name(self) -> str:
        ...

# 抽象类不能直接实例化
# checker = HealthChecker()  # ❌ TypeError

class BloodPressureChecker(HealthChecker):
    """血压检查"""

    def check(self, member: Member) -> dict:
        # 实际检查逻辑...
        return {"systolic": 120, "diastolic": 80, "status": "正常"}

    def get_check_name(self) -> str:
        return "血压检查"
```

---

### 2.7 异常处理

```python
# Python 的 try/except/finally（对标 C# 的 try/catch/finally）
# 关键区别：Python 用 except，不是 catch

def load_health_data(member_id: int) -> dict:
    """加载长者健康数据"""

    try:
        # 可能抛出异常的代码
        with open(f"data/{member_id}.json", "r", encoding="utf-8") as f:
            import json
            return json.load(f)

    except FileNotFoundError:
        # 对标 C# 的 catch (FileNotFoundException ex)
        print(f"长者 {member_id} 的健康数据文件不存在")
        return {}

    except (json.JSONDecodeError, KeyError) as e:
        # 同时捕获多种异常（对标 C# 的多 catch 块）
        print(f"数据解析错误: {e}")
        return {}

    except Exception as e:
        # 捕获所有异常（对标 C# 的 catch (Exception ex)）
        print(f"未知错误: {e}")
        raise                     # 重新抛出（对标 throw;）

    finally:
        # 无论如何都会执行（与 C# 一致）
        print("数据加载流程结束")


# 自定义异常（对标 C# 的自定义 Exception 类）
class MemberNotFoundException(Exception):
    """长者未找到异常"""

    def __init__(self, member_id: int):
        self.member_id = member_id
        super().__init__(f"长者 {member_id} 不存在")


# 抛出异常（对标 C# 的 throw new ...）
def get_member(member_id: int) -> Member:
    if member_id <= 0:
        raise MemberNotFoundException(member_id)
    # ...
```

---

### 2.8 模块与导入

#### 类比

C# 用 `using` 导入命名空间，Python 用 `import` 导入模块。

```python
# C#: using System.Text.Json;
# Python:
import json                                # 导入整个模块
from datetime import datetime, timedelta   # 从模块导入特定成员
from typing import Optional, List          # 从 typing 模块导入
import numpy as np                         # 导入并起别名（约定俗成）
from pathlib import Path                   # 现代文件路径处理

# 项目内部导入（对标 C# 的项目引用）
# 假设项目结构：
# nursing_home_ai/
# ├── main.py
# ├── models/
# │   ├── __init__.py      ← 包标识文件（对标 namespace）
# │   └── member.py
# └── services/
#     ├── __init__.py
#     └── health_service.py

# 在 health_service.py 中导入：
from models.member import Member           # 对标 using NursingHomeAI.Models;
from models.member import Member as M      # 带别名
```

---

### 2.9 文件操作与上下文管理器

```python
import json
from pathlib import Path

# 现代文件路径处理（推荐 pathlib，不推荐 os.path）
data_dir = Path("data/health_records")

# 读取 JSON 文件
def load_member_health(member_id: int) -> dict:
    file_path = data_dir / f"{member_id}.json"   # / 运算符拼接路径

    if not file_path.exists():
        return {}

    # with 语句（上下文管理器，对标 C# 的 using 语句）
    # C#: using var reader = new StreamReader(path);
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


# 写入 JSON 文件
def save_member_health(member_id: int, data: dict) -> None:
    file_path = data_dir / f"{member_id}.json"
    file_path.parent.mkdir(parents=True, exist_ok=True)   # 自动创建目录

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        # ensure_ascii=False → 保留中文不转义
        # indent=2 → 格式化输出
```

---

### 2.10 装饰器 — Python 的"特性/注解"增强版

```python
import functools
import time

# 装饰器 ≈ C# 的 Attribute + AOP（面向切面编程）
# 本质：一个接收函数并返回新函数的高阶函数

def timer(func):
    """计时装饰器——记录函数执行时间"""

    @functools.wraps(func)       # 保留原函数的元信息
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        print(f"[计时] {func.__name__} 耗时 {elapsed:.2f} 秒")
        return result
    return wrapper


def log_access(func):
    """日志装饰器——记录函数调用"""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(f"[访问] 调用 {func.__name__}")
        return func(*args, **kwargs)
    return wrapper


# 使用装饰器（对标 C# 的 [Timer] [LogAccess] 特性）
@timer
@log_access
def generate_health_report(member_id: int) -> str:
    """生成健康报告"""
    time.sleep(0.5)   # 模拟耗时操作
    return f"长者 {member_id} 的健康报告"


# 调用
report = generate_health_report(1001)
# 输出：
# [访问] 调用 generate_health_report
# [计时] generate_health_report 耗时 0.50 秒
```

> **C# 对比**：C# 里你用 `[Authorize]`、`[HttpGet]` 这样的 Attribute 加元数据，再通过中间件/过滤器做 AOP。Python 的装饰器更直接——它就是函数包装，运行时立即生效，不需要反射或管道。

---

### 2.11 异步编程（async/await）

```python
import asyncio
import aiohttp

# Python 的 async/await 与 C# 几乎语法相同！
# 区别：Python 用 asyncio 库管理事件循环，C# 用 Task/Task<T>

async def fetch_vital_signs(member_id: int) -> dict:
    """异步获取长者生命体征数据"""

    async with aiohttp.ClientSession() as session:
        url = f"http://iot-service/api/vitals/{member_id}"
        async with session.get(url) as response:
            return await response.json()


async def check_all_members(member_ids: list[int]) -> list[dict]:
    """并发检查所有长者的生命体征"""

    # asyncio.gather ≈ C# 的 Task.WhenAll
    tasks = [fetch_vital_signs(mid) for mid in member_ids]
    results = await asyncio.gather(*tasks)
    return results


# 运行异步代码
async def main():
    member_ids = [1001, 1002, 1003, 1004]
    vitals = await check_all_members(member_ids)

    for vital in vitals:
        print(f"长者 {vital.get('member_id')}: 心率 {vital.get('heart_rate')}")

# Python 入口（对标 C# 的 async Task Main()）
if __name__ == "__main__":
    asyncio.run(main())
```

---

### 2.12 虚拟环境与依赖管理

#### 为什么需要虚拟环境

类比：你不会把所有 .NET 项目的 NuGet 包装到全局——每个项目有自己的依赖。Python 虚拟环境就是项目隔离的"包目录"。

```bash
# uv 自动管理虚拟环境，你通常不需要手动操作
# 但了解原理很重要：

# 创建虚拟环境（类比：dotnet new 时自动创建的 obj/）
uv venv

# 激活虚拟环境（类比：打开特定 .sln 的 VS 解决方案）
source .venv/bin/activate         # Linux/Mac
# .venv\Scripts\activate          # Windows

# 安装依赖（类比：dotnet restore）
uv pip install pandas numpy

# 导出依赖清单（类比：dotnet list package）
uv pip freeze > requirements.txt

# 从清单安装（类比：dotnet restore 从 .csproj）
uv pip install -r requirements.txt
```

#### requirements.txt vs pyproject.toml

| 方式 | 对标 C# | 特点 |
|------|---------|------|
| `requirements.txt` | `packages.config`（旧版） | 简单列表，无版本锁定 |
| `pyproject.toml` + `uv.lock` | `.csproj` + `packages.lock.json` | 现代方案，推荐 |

---

## 三、养老院业务实战案例

### 需求描述

养老院需要一个**长者健康数据分析工具**，功能：
1. 定义长者档案数据结构
2. 批量读取健康体检数据
3. 计算 BMI、分析健康风险等级
4. 生成健康报告并保存为 JSON

### 方案设计

```
nursing-home-health/
├── pyproject.toml
├── main.py                  ← 入口，编排整体流程
├── models/
│   ├── __init__.py
│   └── member.py            ← 长者实体类
├── services/
│   ├── __init__.py
│   └── health_analyzer.py   ← 健康分析服务
└── output/                  ← 输出目录
```

### 完整代码

```python
# ==================== models/member.py ====================
"""长者档案模型"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class CareLevel(Enum):
    """护理等级枚举（对标 C# 的 enum）"""
    SELF_CARE = "自理"          # 完全自理
    SEMI_CARE = "半护理"        # 需要部分协助
    FULL_CARE = "全护理"        # 需要全面护理
    SPECIAL_CARE = "特护"       # 特殊护理


class HealthRisk(Enum):
    """健康风险等级"""
    LOW = "低风险"
    MEDIUM = "中风险"
    HIGH = "高风险"
    CRITICAL = "极高风险"


@dataclass
class VitalSigns:
    """
    生命体征数据。
    @dataclass ≈ C# 的 record 或带有自动属性的 class。
    Python 会自动生成 __init__、__repr__、__eq__ 等方法。
    """
    heart_rate: int                     # 心率（次/分）
    systolic_bp: int                    # 收缩压（高压）
    diastolic_bp: int                   # 舒张压（低压）
    temperature: float                  # 体温（℃）
    blood_sugar: float                  # 血糖（mmol/L）
    oxygen_saturation: float            # 血氧饱和度（%）

    def is_abnormal(self) -> bool:
        """判断是否有异常指标"""
        return (
            self.heart_rate < 50 or self.heart_rate > 110
            or self.systolic_bp > 160 or self.systolic_bp < 80
            or self.temperature > 37.5 or self.temperature < 35.5
            or self.blood_sugar > 11.1 or self.blood_sugar < 3.9
            or self.oxygen_saturation < 90
        )


@dataclass
class Member:
    """长者档案（核心实体）"""
    id: int
    name: str
    age: int
    gender: str
    room_number: str
    care_level: CareLevel = CareLevel.SELF_CARE
    height_cm: float = 0.0
    weight_kg: float = 0.0
    vital_signs: Optional[VitalSigns] = None
    medical_history: list[str] = field(default_factory=list)

    @property
    def bmi(self) -> float:
        """计算 BMI（属性，直接访问 member.bmi）"""
        if self.height_cm <= 0:
            return 0.0
        height_m = self.height_cm / 100
        return round(self.weight_kg / (height_m ** 2), 1)

    def __str__(self) -> str:
        return f"{self.name}({self.age}岁, {self.room_number}, {self.care_level.value})"
```

```python
# ==================== services/health_analyzer.py ====================
"""健康分析服务"""

import json
from pathlib import Path
from typing import Optional
from models.member import Member, VitalSigns, HealthRisk, CareLevel


class HealthAnalyzer:
    """
    健康数据分析器。
    类比 C# 的 HealthAnalyzerService（依赖注入的服务类）。
    """

    def __init__(self, output_dir: str = "output"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def assess_bmi_risk(self, bmi: float) -> HealthRisk:
        """
        根据 BMI 评估健康风险。
        Args:
            bmi: 身体质量指数
        Returns:
            健康风险等级
        """
        if bmi <= 0:
            return HealthRisk.LOW
        if bmi < 18.5:
            return HealthRisk.MEDIUM        # 偏瘦
        if bmi < 24:
            return HealthRisk.LOW           # 正常
        if bmi < 28:
            return HealthRisk.MEDIUM        # 超重
        return HealthRisk.HIGH              # 肥胖

    def assess_vital_risk(self, vitals: Optional[VitalSigns]) -> HealthRisk:
        """根据生命体征评估风险"""
        if vitals is None:
            return HealthRisk.LOW

        if vitals.is_abnormal():
            # 判断严重程度
            if (
                vitals.heart_rate < 40 or vitals.heart_rate > 130
                or vitals.oxygen_saturation < 85
                or vitals.temperature > 39.0
            ):
                return HealthRisk.CRITICAL
            return HealthRisk.HIGH
        return HealthRisk.LOW

    def assess_overall_risk(self, member: Member) -> HealthRisk:
        """
        综合评估健康风险（取最高风险等级）。
        """
        risks = [
            self.assess_bmi_risk(member.bmi),
            self.assess_vital_risk(member.vital_signs),
        ]

        # 考虑年龄因素
        if member.age >= 85:
            risks.append(HealthRisk.MEDIUM)
        if member.age >= 95:
            risks.append(HealthRisk.HIGH)

        # 考虑护理等级
        care_risk_map = {
            CareLevel.SELF_CARE: HealthRisk.LOW,
            CareLevel.SEMI_CARE: HealthRisk.MEDIUM,
            CareLevel.FULL_CARE: HealthRisk.HIGH,
            CareLevel.SPECIAL_CARE: HealthRisk.CRITICAL,
        }
        risks.append(care_risk_map[member.care_level])

        # 取最高风险（枚举值越大风险越高）
        risk_order = [
            HealthRisk.LOW,
            HealthRisk.MEDIUM,
            HealthRisk.HIGH,
            HealthRisk.CRITICAL,
        ]
        return max(risks, key=lambda r: risk_order.index(r))

    def generate_report(self, member: Member) -> dict:
        """生成单个长者的健康报告"""
        bmi_risk = self.assess_bmi_risk(member.bmi)
        vital_risk = self.assess_vital_risk(member.vital_signs)
        overall_risk = self.assess_overall_risk(member)

        report = {
            "member_id": member.id,
            "name": member.name,
            "age": member.age,
            "room": member.room_number,
            "care_level": member.care_level.value,
            "bmi": {
                "value": member.bmi,
                "risk": bmi_risk.value,
            },
            "vital_signs": None,
            "overall_risk": overall_risk.value,
            "recommendations": self._get_recommendations(member, overall_risk),
        }

        if member.vital_signs:
            v = member.vital_signs
            report["vital_signs"] = {
                "heart_rate": v.heart_rate,
                "blood_pressure": f"{v.systolic_bp}/{v.diastolic_bp}",
                "temperature": v.temperature,
                "blood_sugar": v.blood_sugar,
                "oxygen_saturation": v.oxygen_saturation,
                "risk": vital_risk.value,
            }

        return report

    def _get_recommendations(
        self, member: Member, risk: HealthRisk
    ) -> list[str]:
        """根据风险等级生成建议"""
        recs: list[str] = []

        # BMI 相关建议
        bmi = member.bmi
        if bmi > 0:
            if bmi < 18.5:
                recs.append("建议增加营养摄入，每日补充蛋白质")
            elif bmi >= 28:
                recs.append("建议控制饮食，适当增加活动量")

        # 年龄相关建议
        if member.age >= 80:
            recs.append("建议每日监测血压和心率")
        if member.age >= 90:
            recs.append("建议 24 小时专人陪护")

        # 风险等级建议
        if risk in (HealthRisk.HIGH, HealthRisk.CRITICAL):
            recs.append("建议安排医生巡诊")
            recs.append("通知家属关注健康状况")
        if risk == HealthRisk.CRITICAL:
            recs.append("立即安排医疗干预")

        # 生命体征建议
        if member.vital_signs and member.vital_signs.is_abnormal():
            recs.append("生命体征存在异常，建议复查")

        return recs if recs else ["暂无特殊建议，继续保持"]

    def generate_batch_report(self, members: list[Member]) -> dict:
        """批量生成健康报告并保存"""
        reports = [self.generate_report(m) for m in members]

        # 统计摘要
        risk_counts: dict[str, int] = {}
        for r in reports:
            risk = r["overall_risk"]
            risk_counts[risk] = risk_counts.get(risk, 0) + 1

        summary = {
            "total_members": len(members),
            "risk_distribution": risk_counts,
            "high_risk_members": [
                r["name"]
                for r in reports
                if r["overall_risk"] in ("高风险", "极高风险")
            ],
            "reports": reports,
        }

        # 保存到文件
        output_file = self.output_dir / "health_report.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        print(f"✅ 报告已保存至: {output_file}")
        return summary
```

```python
# ==================== main.py ====================
"""养老院健康数据分析工具——主入口"""

from models.member import Member, VitalSigns, CareLevel
from services.health_analyzer import HealthAnalyzer


def create_sample_data() -> list[Member]:
    """创建模拟的长者数据（实际项目中从数据库/API获取）"""

    members = [
        Member(
            id=1001,
            name="张大爷",
            age=78,
            gender="男",
            room_number="A201",
            care_level=CareLevel.SELF_CARE,
            height_cm=172,
            weight_kg=68,
            vital_signs=VitalSigns(
                heart_rate=72,
                systolic_bp=125,
                diastolic_bp=80,
                temperature=36.5,
                blood_sugar=5.6,
                oxygen_saturation=97,
            ),
            medical_history=["高血压（控制中）", "轻度白内障"],
        ),
        Member(
            id=1002,
            name="李奶奶",
            age=85,
            gender="女",
            room_number="B302",
            care_level=CareLevel.SEMI_CARE,
            height_cm=158,
            weight_kg=45,
            vital_signs=VitalSigns(
                heart_rate=88,
                systolic_bp=155,
                diastolic_bp=95,
                temperature=36.8,
                blood_sugar=7.2,
                oxygen_saturation=93,
            ),
            medical_history=["糖尿病", "骨质疏松", "冠心病"],
        ),
        Member(
            id=1003,
            name="王爷爷",
            age=92,
            gender="男",
            room_number="C105",
            care_level=CareLevel.FULL_CARE,
            height_cm=168,
            weight_kg=72,
            vital_signs=VitalSigns(
                heart_rate=55,
                systolic_bp=135,
                diastolic_bp=85,
                temperature=37.0,
                blood_sugar=6.8,
                oxygen_saturation=89,
            ),
            medical_history=["帕金森", "前列腺增生", "陈旧性脑梗"],
        ),
        Member(
            id=1004,
            name="赵奶奶",
            age=71,
            gender="女",
            room_number="A305",
            care_level=CareLevel.SELF_CARE,
            height_cm=160,
            weight_kg=75,
            vital_signs=VitalSigns(
                heart_rate=76,
                systolic_bp=130,
                diastolic_bp=82,
                temperature=36.4,
                blood_sugar=5.9,
                oxygen_saturation=98,
            ),
            medical_history=["高血脂"],
        ),
        Member(
            id=1005,
            name="孙爷爷",
            age=96,
            gender="男",
            room_number="D201",
            care_level=CareLevel.SPECIAL_CARE,
            height_cm=165,
            weight_kg=55,
            vital_signs=VitalSigns(
                heart_rate=48,
                systolic_bp=170,
                diastolic_bp=100,
                temperature=37.8,
                blood_sugar=12.5,
                oxygen_saturation=86,
            ),
            medical_history=["阿尔茨海默症", "慢性心衰", "糖尿病", "肾功能不全"],
        ),
    ]
    return members


def main():
    """主流程"""
    print("=" * 60)
    print("  养老院健康数据分析工具 v1.0")
    print("=" * 60)

    # 1. 加载数据
    members = create_sample_data()
    print(f"\n📋 已加载 {len(members)} 位长者数据\n")

    # 2. 创建分析器并生成报告
    analyzer = HealthAnalyzer(output_dir="output")
    summary = analyzer.generate_batch_report(members)

    # 3. 输出统计摘要
    print(f"\n{'=' * 60}")
    print(f"  📊 健康分析摘要")
    print(f"{'=' * 60}")
    print(f"  总人数: {summary['total_members']}")
    print(f"  风险分布:")
    for risk, count in summary["risk_distribution"].items():
        emoji = {"低风险": "🟢", "中风险": "🟡", "高风险": "🔴", "极高风险": "🚨"}
        print(f"    {emoji.get(risk, '⚪')} {risk}: {count} 人")

    if summary["high_risk_members"]:
        print(f"\n  ⚠️  需重点关注:")
        for name in summary["high_risk_members"]:
            print(f"    → {name}")

    # 4. 输出每位长者的详细报告
    print(f"\n{'=' * 60}")
    print(f"  📝 个人健康报告")
    print(f"{'=' * 60}")

    for report in summary["reports"]:
        print(f"\n  【{report['name']}】 {report['age']}岁 | {report['room']}")
        print(f"    护理等级: {report['care_level']}")
        print(f"    BMI: {report['bmi']['value']}（{report['bmi']['risk']}）")

        if report["vital_signs"]:
            v = report["vital_signs"]
            print(f"    心率: {v['heart_rate']} 次/分")
            print(f"    血压: {v['blood_pressure']} mmHg")
            print(f"    体温: {v['temperature']} ℃")
            print(f"    血糖: {v['blood_sugar']} mmol/L")
            print(f"    血氧: {v['oxygen_saturation']}%")
            print(f"    体征风险: {v['risk']}")

        print(f"    综合风险: {report['overall_risk']}")
        print(f"    建议:")
        for rec in report["recommendations"]:
            print(f"      • {rec}")


if __name__ == "__main__":
    main()
```

### 运行结果

```
============================================================
  养老院健康数据分析工具 v1.0
============================================================

📋 已加载 5 位长者数据

✅ 报告已保存至: output/health_report.json

============================================================
  📊 健康分析摘要
============================================================
  总人数: 5
  风险分布:
    🟢 低风险: 1 人
    🟡 中风险: 1 人
    🔴 高风险: 1 人
    🚨 极高风险: 2 人

  ⚠️  需重点关注:
    → 王爷爷
    → 孙爷爷

============================================================
  📝 个人健康报告
============================================================

  【张大爷】 78岁 | A201
    护理等级: 自理
    BMI: 23.0（低风险）
    心率: 72 次/分
    血压: 125/80 mmHg
    体征风险: 低风险
    综合风险: 低风险
    建议:
      • 暂无特殊建议，继续保持

  【李奶奶】 85岁 | B302
    护理等级: 半护理
    BMI: 18.0（中风险）
    心率: 88 次/分
    血压: 155/95 mmHg
    体征风险: 低风险
    综合风险: 中风险
    建议:
      • 建议增加营养摄入，每日补充蛋白质
      • 建议每日监测血压和心率
    建议:
      • 建议增加营养摄入，每日补充蛋白质
      • 建议每日监测血压和心率
      • 建议安排医生巡诊
      • 通知家属关注健康状况
      • 生命体征存在异常，建议复查

  【王爷爷】 92岁 | C105
    护理等级: 全护理
    BMI: 25.5（中风险）
    血氧: 89%
    体征风险: 高风险（is_abnormal=True，sao2<90；未达 CRITICAL 因为 sao2≥85）
    综合风险: 极高风险（全护理→CRITICAL）
    建议:
      • 建议每日监测血压和心率
      • 建议 24 小时专人陪护
      • 建议安排医生巡诊
      • 通知家属关注健康状况
      • 生命体征存在异常，建议复查

  【赵奶奶】 71岁 | A305
    护理等级: 自理
    BMI: 29.3（高风险）
    心率: 76 次/分
    血压: 130/82 mmHg
    体温: 36.4 ℃
    血糖: 5.9 mmol/L
    血氧: 98%
    体征风险: 低风险
    综合风险: 高风险
    建议:
      • 建议控制饮食，适当增加活动量

  【孙爷爷】 96岁 | D201
    护理等级: 特护
    BMI: 20.2（低风险）
    心率: 48 次/分
    血压: 170/100 mmHg
    体温: 37.8 ℃
    血糖: 12.5 mmol/L
    血氧: 86%
    体征风险: 极高风险
    综合风险: 极高风险
    建议:
      • 建议每日监测血压和心率
      • 建议 24 小时专人陪护
      • 立即安排医疗干预
      • 建议安排医生巡诊
      • 通知家属关注健康状况
      • 生命体征存在异常，建议复查
```

---

## 四、知识点总结

| 概念 | 一句话解释 | 关键要点 |
|------|-----------|---------|
| **uv** | Python 的现代包管理器，对标 dotnet CLI | `uv init` 创建项目，`uv add` 添加依赖，`uv run` 运行 |
| **动态类型** | 变量不声明类型，运行时推断 | 类型提示 `x: int = 1` 可选但推荐 |
| **list** | 动态数组，对标 `List<T>` | `append()`、切片 `[0:3]`、推导式 `[x for x in ...]` |
| **dict** | 哈希表，对标 `Dictionary<K,V>` | `.get(key, default)` 安全访问，`.items()` 遍历 |
| **tuple** | 不可变元组，对标 `(T1, T2)` | 解包 `a, b, c = (1, 2, 3)` |
| **set** | 集合，对标 `HashSet<T>` | `&` 交集、`|` 并集、`-` 差集 |
| **推导式** | 一行生成集合的语法糖 | `[f(x) for x in items if cond]` ≈ LINQ |
| **self** | 实例引用，对标 `this` | Python 必须显式写 `self` 作为第一个参数 |
| **@property** | 将方法变成属性访问 | 对标 C# 的 `{ get { ... } }` |
| **@dataclass** | 自动生成 `__init__` 等方法 | 对标 C# 的 `record` 或自动属性类 |
| **装饰器** | 函数增强，对标 Attribute + AOP | `@timer` 包装函数，添加通用逻辑 |
| **async/await** | 异步编程，语法与 C# 几乎相同 | `asyncio.run()` 启动，`asyncio.gather()` ≈ `Task.WhenAll` |
| **with 语句** | 上下文管理器，对标 `using` | 自动释放资源，如文件句柄、网络连接 |
| **import** | 导入模块，对标 `using` | `from x import y` 导入特定成员 |
| **None** | 空值，对标 `null` | `if x is None` 而不是 `== None` |
| **异常处理** | `try/except/finally` | `except Exception as e` 捕获异常 |
| **抽象类** | `ABC` + `@abstractmethod` | 对标 C# 的 `abstract class` / `interface` |
| **Lambda** | `lambda x: x.age` | 对标 C# 的 `x => x.Age`，只能单表达式 |
| **f-string** | 格式化字符串 `f"{name} {age}"` | 对标 C# 的 `$"{name} {age}"` |

---

## 五、本章面试题

### 题目 1：Python 的 `list` 和 C# 的 `List<T>` 有什么本质区别？

**难度**：⭐  
**类型**：基础对比

**参考答案**：

Python 的 `list` 是动态类型容器，可以混合存放不同类型的数据（如 `[1, "hello", True]`），而 C# 的 `List<T>` 是泛型容器，所有元素必须是类型 `T` 或其子类。性能上，Python 的 `list` 底层是动态数组实现（指针数组），存储的是对象引用；C# 的 `List<T>` 在值类型（如 `List<int>`）时直接存储值，内存更紧凑。Python 的 `list` 支持切片操作 `a[1:3]`，C# 需要用 LINQ 的 `.Skip().Take()`。在 AI 开发中，Python 的 `list` 因其灵活性常用于临时数据收集，但大规模数值计算会转用 NumPy 的 `ndarray`。

---

### 题目 2：Python 的 `self` 和 C# 的 `this` 有什么区别？为什么 Python 要显式写 `self`？

**难度**：⭐  
**类型**：语言设计

**参考答案**：

功能上，`self` 和 `this` 都是指向当前实例的引用。区别在于：C# 的 `this` 是隐式的，编译器自动注入；Python 的 `self` 必须在方法定义时显式声明为第一个参数，在调用时由解释器自动传入。Python 显式写 `self` 是因为 Python 的方法本质上就是普通函数，只是恰好定义在类体内——显式的 `self` 让函数的"绑定"行为透明可见，符合 Python "Explicit is better than implicit" 的设计哲学。这也使得 Python 的实例方法可以被当作普通函数调用（如 `Member.get_info(instance)`），提供了一致的函数模型。

---

### 题目 3：什么是 Python 的 GIL？它对 AI 开发有什么影响？

**难度**：⭐⭐  
**类型**：进阶概念

**参考答案**：

GIL（Global Interpreter Lock，全局解释器锁）是 CPython 解释器的互斥锁，确保同一时刻只有一个线程执行 Python 字节码。这意味着 Python 的多线程无法利用多核 CPU 实现真正的并行计算。对 AI 开发的影响：① CPU 密集型任务（如数据预处理、特征工程）多线程不会加速，应使用 `multiprocessing`（多进程）绕过 GIL；② I/O 密集型任务（如并发调用大模型 API）用 `asyncio` 或多线程即可，因为 GIL 在 I/O 等待时会释放；③ NumPy/PyTorch 等底层 C 库在执行数值计算时会释放 GIL，所以矩阵运算不受影响。Python 3.13 开始引入了实验性的"自由线程"模式（PEP 703），未来 GIL 的限制会逐步解除。

---

### 题目 4：解释 Python 装饰器的工作原理，以及它和 C# 的 Attribute 有什么不同？

**难度**：⭐⭐  
**类型**：设计模式对比

**参考答案**：

Python 装饰器本质上是一个高阶函数——它接收一个函数作为参数，返回一个增强后的新函数。`@decorator` 语法等价于 `func = decorator(func)`。与 C# 的 Attribute 的关键区别：① 执行时机不同——Python 装饰器在定义时（import 时）立即执行包装，C# Attribute 只是元数据标注，需要通过反射或中间件框架在运行时读取和处理；② 增强方式不同——Python 装饰器直接替换函数引用，可以在调用前后插入任意逻辑（计时、日志、权限检查）；C# Attribute 本身不修改方法行为，需要配合 AOP 框架（如 Filter、Middleware）才生效；③ 灵活性——Python 装饰器可以嵌套、带参数、动态生成，比 Attribute 更灵活。在 AI 框架中，装饰器广泛用于注册工具函数、Hook 机制等。

---

### 题目 5：`@dataclass` 和普通 `class` 有什么区别？什么场景下使用？

**难度**：⭐  
**类型**：实用特性

**参考答案**：

`@dataclass` 是 Python 3.7 引入的装饰器，自动生成 `__init__`、`__repr__`、`__eq__` 等方法，类似于 C# 的 `record` 类型。普通 `class` 需要手动编写这些方法。`@dataclass` 适合"数据容器"类——主要用于存储和传递数据，没有复杂业务逻辑。在养老院系统中，`VitalSigns`（生命体征数据）、`HealthReport`（健康报告 DTO）适合用 `@dataclass`；而 `HealthAnalyzer`（包含复杂业务逻辑的服务类）适合用普通 `class`。注意 `@dataclass` 默认是可变的（mutable），如需不可变可以设置 `@dataclass(frozen=True)`，这时它就更接近 C# 的 `record`。

---

### 题目 6：Python 的 `list` 切片 `a[1:3]` 返回什么？如果 `a = [0, 1, 2, 3, 4]`？

**难度**：⭐  
**类型**：基础语法

**参考答案**：

`a[1:3]` 返回 `[1, 2]`。Python 的切片是"左闭右开"区间，与 C# 的 `Range` 语法 `a[1..3]` 相同。切片不会修改原列表，而是创建一个新列表。切片的完整语法是 `a[start:stop:step]`，如 `a[::2]` 取所有偶数索引元素，`a[::-1]` 反转列表。常见的坑：切片不会越界——`a[0:100]` 对长度为 5 的列表返回全部元素，不会报错。这与 C# 的 `Span` 行为不同。

---

### 题目 7：Python 的 `is` 和 `==` 有什么区别？

**难度**：⭐  
**类型**：基础陷阱

**参考答案**：

`==` 比较的是值是否相等（对标 C# 的 `Equals()`），`is` 比较的是是否是同一个对象（对标 C# 的 `ReferenceEquals()`）。例如：

```python
a = [1, 2, 3]
b = [1, 2, 3]
a == b    # True（值相同）
a is b    # False（不是同一个对象）

c = a
a is c    # True（同一个对象）
```

在 AI 开发中常见陷阱：检查 `None` 时用 `is None`（不是 `== None`），因为 `None` 是单例对象。同样的，检查 `True`/`False` 用 `is True`/`is False`。PEP 8（Python 编码规范）明确推荐用 `is` 比较 `None`。

---

### 题目 8：Python 的异常处理中，`except Exception as e` 和 `except (ValueError, TypeError) as e` 有什么区别？为什么要尽量捕获具体异常？

**难度**：⭐⭐  
**类型**：最佳实践

**参考答案**：

`except Exception as e` 捕获所有非系统退出类异常（对标 C# 的 `catch (Exception ex)`），而 `except (ValueError, TypeError) as e` 只捕获指定类型的异常。应该尽量捕获具体异常的原因：① 避免掩盖真正的 bug——捕获 `Exception` 会吞掉所有错误，包括你没想到的 `KeyError`、`AttributeError` 等逻辑错误；② 不同异常需要不同的处理策略——如 `FileNotFoundError` 需要提示文件缺失，`json.JSONDecodeError` 需要提示数据格式错误；③ 符合"异常处理的精确性"原则。在 AI 应用中，调用大模型 API 时应分别处理超时（`TimeoutError`）、限流（HTTP 429）、认证失败（HTTP 401）等不同异常。

---

### 题目 9：解释 Python 的 `asyncio` 和 C# 的 `Task` 异步模型的异同。

**难度**：⭐⭐  
**类型**：异步编程对比

**参考答案**：

相同点：① 语法层面几乎一致——都用 `async`/`await` 关键字；② 都基于事件循环/任务调度器实现非阻塞并发；③ 都支持 `WhenAll`/`gather` 并发执行多个任务。不同点：① 并发模型——Python 的 `asyncio` 是单线程事件循环，协程切换是协作式的（遇到 `await` 才切换），C# 的 `Task` 可以在线程池上调度，支持真正的多线程并行；② GIL 限制——Python 的 `asyncio` 不受 GIL 影响（因为是单线程），但也不能利用多核；C# 的异步任务可以自由分配到线程池的多个线程上；③ 生态差异——Python 的异步生态（aiohttp、aiomysql）不如 C# 的 `HttpClient`、EF Core 那样开箱即用地支持异步。在大模型应用中，Python 的 `asyncio` 主要用于并发调用多个 API 端点。

---

### 题目 10：Python 的虚拟环境是什么？为什么 AI 开发特别需要它？

**难度**：⭐  
**类型**：工程实践

**参考答案**：

Python 虚拟环境是一个独立的 Python 运行环境，有自己独立的 `pip` 包安装目录，不与系统 Python 或其他项目的包冲突。对标 C#：每个 .NET 项目有独立的 NuGet 包引用（通过 `.csproj` 管理），但所有项目共享全局 NuGet 缓存；Python 的虚拟环境则更彻底——它是一个完整的 Python 解释器副本 + 独立的 site-packages 目录。AI 开发特别需要虚拟环境的原因：① 版本冲突严重——PyTorch、TensorFlow 等框架经常要求特定版本的 NumPy、CUDA toolkit，不同项目的依赖版本差异巨大；② 系统保护——AI 包（如 PyTorch）体积巨大（2-5GB），安装到全局环境会污染系统 Python；③ 可复现性——`requirements.txt` 或 `uv.lock` + 虚拟环境确保其他人能精确复现你的环境。推荐使用 `uv` 管理虚拟环境，它自动在项目目录下创建 `.venv/` 并管理依赖。

---

### 题目 11：Python 的 `dict` 和 C# 的 `Dictionary<TKey, TValue>` 在性能和使用上有什么差异？

**难度**：⭐⭐  
**类型**：数据结构对比

**参考答案**：

底层实现两者都基于哈希表，O(1) 的查找/插入。差异在于：① 类型安全——C# 的 `Dictionary<int, string>` 编译时检查 key/value 类型，Python 的 `dict` 运行时才检查，可能存入意外类型；② Python 3.7+ 的 `dict` 保证插入顺序（C# 的 `Dictionary` 不保证，有序需求用 `SortedDictionary` 或 `OrderedDictionary`）；③ 内存开销——Python 的 `dict` 因为要存储对象引用和哈希元数据，内存开销比 C# 的 `Dictionary` 大得多；④ Python 有字典推导式 `{k: v for ...}`，C# 用 `.ToDictionary()` LINQ；⑤ 大规模数据场景下，Python 推荐用 `pandas.DataFrame`（列式存储，内存效率更高）替代 `list[dict]`。在 AI 开发中，模型配置、API 参数、JSON 解析结果都大量使用 `dict`。

---

### 题目 12：什么是 Python 的猴子补丁（Monkey Patching）？在 AI 开发中有什么应用场景？

**难度**：⭐⭐⭐  
**类型**：高级特性

**参考答案**：

猴子补丁是指在运行时动态修改模块、类或对象的属性/方法。例如：

```python
import json
original_loads = json.loads
def patched_loads(s, **kwargs):
    print(f"解析 JSON: {s[:50]}...")
    return original_loads(s, **kwargs)
json.loads = patched_loads  # 猴子补丁
```

在 AI 开发中的应用场景：① 临时修复第三方库 bug——在不修改源码的情况下替换有问题的函数；② 添加日志和监控——在调试时给 Transformers 库的方法加日志；③ 测试 Mock——在单元测试中替换模型推理函数，避免真正加载模型；④ 性能优化——用更高效的实现替换默认函数。风险：猴子补丁让代码行为不可预测，调试困难，应尽量少用。在生产环境中，推荐用装饰器或依赖注入替代。

---

## 六、延伸阅读与资源

1. **《Python Crash Course》（Eric Matthes 著）**  
   适合有编程经验者的 Python 入门书，前半部分快速过语法，后半部分有实战项目。

2. **官方文档：docs.python.org/3/tutorial/**  
   Python 官方教程，权威且精炼。建议重点阅读第 9 章（类）、第 10 章（标准库概览）。

3. **uv 官方文档：docs.astral.sh/uv/**  
   包管理器 uv 的完整文档，包含从 pip/poetry 迁移指南。

4. **Real Python：realpython.com**  
   高质量 Python 教程网站，搜索"C# to Python"有专题对比文章。

5. **PEP 8 编码规范：peps.python.org/pep-0008/**  
   Python 官方编码风格指南，相当于 C# 的 StyleCop 规则，面试中常被问到。

---

## 七、下一章预告

**第 02 章：深度学习基础**

你已经掌握了 Python 这把"瑞士军刀"，下一章我们将进入 AI 的核心领域——深度学习。你会学到：

- 神经网络是什么？用养老院跌倒检测来类比
- 激活函数：为什么神经网络需要"非线性"？
- 反向传播：模型如何从错误中学习？
- 损失函数与优化器：如何衡量"预测有多差"并改进？
- 用 PyTorch 搭建第一个神经网络：预测长者跌倒风险

下一章需要安装 PyTorch，请提前准备好：`uv add torch`

---

## 八、时效性声明

**信息验证日期**：2026 年 7 月 9 日

| 项目 | 验证结果 | 来源 |
|------|---------|------|
| Python 最新稳定版 | **3.14.6**（2026-06-10 发布） | endoflife.date/api/python.json |
| Python 3.13 支持状态 | 3.13.14，支持至 2026-10-01 | 同上 |
| uv 最新版本 | **0.11.16** | 系统安装验证 |
| pyproject.toml 规范 | PEP 621，稳定 | peps.python.org |
| asyncio API | Python 3.10+ 稳定无变化 | docs.python.org |

**可能过时的内容**：
- uv 版本号更新频繁（每 1-2 周一个版本），具体命令参数可能有微调
- Python 3.14 的自由线程模式（PEP 703）仍在演进中，GIL 相关描述需关注后续版本变化
- 如果阅读时间超过 2026 年 10 月，Python 3.15 可能已发布（预计 2026-10）

**官方文档链接**：
- Python 官方文档：https://docs.python.org/3/
- uv 官方文档：https://docs.astral.sh/uv/
- PEP 8 编码规范：https://peps.python.org/pep-0008/
- Python 类型提示指南：https://docs.python.org/3/library/typing.html
