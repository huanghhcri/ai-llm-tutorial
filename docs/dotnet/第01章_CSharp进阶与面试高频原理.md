# 第 01 章：C# 进阶与面试高频原理

> **适用版本**：.NET 5.0 / C# 9  
> **业务领域**：养老院管理系统  
> **预计阅读**：60-90 分钟 | **预计练习**：2-3 小时

---

## 学习目标

完成本章后，你将能够：

1. **解释 GC 分代回收原理**，并能向面试官清晰描述 Gen0/Gen1/Gen2 的工作机制与触发条件
2. **区分值类型与引用类型**的内存分配差异，正确选择 struct 与 class
3. **理解 async/await 编译后的状态机结构**，掌握 ConfigureAwait 的使用场景
4. **运用多种线程安全机制**（lock、SemaphoreSlim、Interlocked）解决并发问题
5. **正确实现 IDisposable 模式**，理解 Finalize 与 Dispose 的本质区别
6. **使用委托与事件**实现松耦合的业务通知系统
7. **掌握泛型约束与协变逆变**，理解 out/in 关键字的含义
8. **了解反射的性能影响**与优化策略

---

## 前置知识

- C# 基础语法（变量、循环、条件判断）
- 面向对象基础（类、继承、接口、多态）
- 能独立使用 async/await 编写异步方法（即使不理解原理）
- 了解 .NET 基本项目结构（csproj、Program.cs）
- 知道 GC 存在但说不清具体机制

---

## 为什么需要学这个？

想象你正在参与一个**养老院管理系统**的开发。系统上线后，用户反馈：

- **长者入住登记**时偶尔会卡顿 2-3 秒——排查后发现是 GC 暂停导致
- **床位分配模块**在高峰期出现重复分配——原来是多线程并发没有做好同步
- **健康检查报告**生成模块内存持续增长——原因是大量字符串拼接和未释放的数据库连接
- **体征监测告警**通知丢失——事件订阅管理不当引发的委托泄漏

这些问题的根源，都指向 C# 的**运行时机制**。如果你只会用 `async/await` 但不理解背后的**状态机**，如果你知道 GC 存在但说不清**分代回收**，如果你用过 `lock` 但不知道 **Monitor 的本质**——那么在面试中，你将无法展现出 3 年经验应有的深度。

本章将带你从「会用」进阶到「理解原理」，每一个知识点都结合养老院业务场景，让你既能通过面试，也能在实际项目中写出更健壮的代码。

---

## 1. 章节内容

### 1.1 GC 垃圾回收机制

#### 生活类比：养老院定期清理废弃物资

养老院每天都会产生大量废弃物资——用完的医疗耗材、过期的药品、损坏的家具。如果不定期清理，仓库很快就会堆满，新的物资无处存放。

垃圾回收器（GC）就是 .NET 世界里的「物资清理员」。它会定期检查内存中哪些对象已经不再被使用（没人引用），然后释放这些内存空间。

#### 为什么需要分代回收？

垃圾回收器发现了一个规律：**大多数对象都是「短命」的**。就像养老院里的医疗耗材——棉签、纱布用完就扔，只有少数物品（医疗设备、家具）会长期使用。

基于这个「代龄假说」（Generational Hypothesis），GC 将对象分为三代：

| 代 | 含义 | 类比 | 特点 |
|---|---|---|---|
| Gen0 | 新创建的对象 | 刚领出的棉签、纱布 | 收集频率最高，存活率最低 |
| Gen1 | Gen0 回收后存活的对象 | 用了一段时间但还未丢弃的物品 | 中等频率收集，作为缓冲区 |
| Gen2 | Gen1 回收后仍存活的对象 | 长期使用的医疗设备 | 收集频率最低，收集代价最高 |

**关键点**：
- **Gen0** 的容量最小（通常几百 KB），但收集速度最快，因为绝大多数对象在 Gen0 就会被回收
- **Gen1** 是缓冲区，防止刚创建不久的对象被误判为长期对象
- **Gen2** 收集代价最高，因为它需要遍历更多的存活对象，可能触发「全堆回收」（Full GC）

#### GC 触发条件

GC 并不是「定时运行」的，而是在以下条件下触发：

1. **Gen0 代满**：新对象分配导致 Gen0 超过阈值（最常见）
2. **代码显式调用**：`GC.Collect()`（不推荐）
3. **系统内存不足**：OS 向 .NET 进程发出内存压力信号
4. **Gen1 代满**：间接触发 Gen2 收集

#### GC.Collect() 为什么不建议手动调用？

手动调用 `GC.Collect()` 就像让物资管理员放下手头工作，立刻去清点全院物资——这会：

1. **强制触发一次完全 GC**，导致所有线程暂停（STW, Stop-The-World）
2. **打乱 GC 自适应算法**，GC 会根据实际内存压力动态调整回收策略，手动调用会破坏这个平衡
3. **可能将 Gen0 对象提前提升到 Gen1/Gen2**，反而导致更大的回收压力

```csharp
// 错误示范：在养老院管理系统中手动触发 GC
public class BadExample
{
    public void OnElderCheckIn()
    {
        // 处理长者入住逻辑...
        // ...

        // 错误！入住完成后立刻强制 GC
        GC.Collect(); // 这会导致 STW 暂停，其他请求全部卡住
    }
}
```

> **记住**：GC.Collect() 几乎永远不该出现在生产代码中。唯一的例外是在单元测试中验证 Dispose 逻辑。

#### Finalize vs Dispose 区别

| 特性 | Finalize（终结器） | Dispose |
|---|---|---|
| 调用方式 | GC 自动调用，时机不确定 | 代码显式调用，时机确定 |
| 实现方式 | `~ClassName()` 语法 | `IDisposable.Dispose()` 方法 |
| 执行线程 | GC 的终结器线程 | 调用者的线程 |
| 性能影响 | 对象至少存活两轮 GC 才能回收 | 无额外 GC 延迟 |
| 资源释放 | 非托管资源（兜底机制） | 托管 + 非托管资源 |

**核心区别**：Finalize 是**不确定性释放**（你不知道它何时执行），Dispose 是**确定性释放**（你明确知道何时释放资源）。

#### 代码示例：养老院物资管理类实现 IDisposable

```csharp
using System;
using System.IO;

namespace NursingHomeManagement.Resources
{
    /// <summary>
    /// 养老院物资管理系统 - 管理医疗物资的领用记录文件
    /// 实现标准 Dispose 模式
    /// </summary>
    public class MedicalSupplyRecordManager : IDisposable
    {
        // 文件流 - 非托管资源
        private FileStream _recordStream;

        // 记录管理器是否已被释放
        private bool _disposed = false;

        // 记录物资名称
        public string SupplyName { get; private set; }

        public MedicalSupplyRecordManager(string supplyName, string recordFilePath)
        {
            SupplyName = supplyName;
            // 打开物资领用记录文件（非托管资源）
            _recordStream = new FileStream(
                recordFilePath,
                FileMode.Append,
                FileAccess.Write);
        }

        /// <summary>
        /// 写入一条物资领用记录
        /// </summary>
        public void WriteRecord(string elderName, int quantity)
        {
            // 检查对象是否已被释放
            if (_disposed)
            {
                throw new ObjectDisposedException(
                    nameof(MedicalSupplyRecordManager),
                    "物资记录管理器已被释放，无法写入");
            }

            string record = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} " +
                            $"长者:{elderName} 领用:{SupplyName} 数量:{quantity}\n";
            byte[] data = System.Text.Encoding.UTF8.GetBytes(record);
            _recordStream.Write(data, 0, data.Length);
            _recordStream.Flush();
        }

        /// <summary>
        /// 公开的 Dispose 方法 - 确定性释放
        /// 由调用者（或 using 语句）显式调用
        /// </summary>
        public void Dispose()
        {
            Dispose(true);
            // 通知 GC：我已经手动清理了，不需要再调用 Finalize
            GC.SuppressFinalize(this);
        }

        /// <summary>
        /// 核心释放逻辑
        /// disposing = true：从 Dispose() 调用，可以释放托管资源
        /// disposing = false：从 Finalize 调用，只能释放非托管资源
        /// </summary>
        protected virtual void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                if (disposing)
                {
                    // 释放托管资源
                    if (_recordStream != null)
                    {
                        _recordStream.Dispose();
                        _recordStream = null;
                    }
                }

                // 释放非托管资源（本例中没有额外的非托管资源）
                _disposed = true;
            }
        }

        /// <summary>
        /// 终结器（析构函数）- 非确定性释放
        /// 仅作为安全网，防止调用者忘记调用 Dispose
        /// 注意：有终结器的对象至少需要两轮 GC 才能回收
        /// </summary>
        ~MedicalSupplyRecordManager()
        {
            Dispose(false);
        }
    }
}
```

**运行结果说明**：
- 使用 `using` 语句时，对象离开作用域后立即调用 `Dispose()`，文件流被及时关闭
- 如果忘记 `using`，终结器会在 GC 时兜底释放，但时机不确定且有性能开销
- `GC.SuppressFinalize(this)` 跳过终结器队列，让对象按正常分代回收（而非等待 Finalize 队列处理），减少 GC 压力

---

### 1.2 值类型 vs 引用类型

#### 生活类比：「房间号标签」vs「入住登记表」

想象养老院里的两种信息载体：

- **房间号标签**（值类型）：贴在每间房门上，标签上直接写着「101」「202」。你把标签抄写给别人，得到的是标签内容的**副本**，改了副本不影响原件
- **入住登记表**（引用类型）：院办公室有一本登记表，每个长者的信息都记录在上面。你给别人的不是登记表本身，而是一个**指向登记表的索引号**。通过索引号找到的登记表是同一份

#### 栈 vs 堆内存分配

```
┌─────────────────────────────────────────────────┐
│                    栈 (Stack)                      │
│  ┌─────────────────────────────────────────┐     │
│  │ int roomNumber = 101; // 值类型，直接存值  │     │
│  │ [101]                                      │     │
│  ├─────────────────────────────────────────┤     │
│  │ Member member = new Member();             │     │
│  │ [0x1234] → 引用地址（指向堆）             │     │
│  └─────────────────────────────────────────┘     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                    堆 (Heap)                       │
│  ┌─────────────────────────────────────────┐     │
│  │ 0x1234: Member 对象                       │     │
│  │   Name: "张大爷"                           │     │
│  │   Age: 78                                  │     │
│  │   RoomNumber: 101                          │     │
│  └─────────────────────────────────────────┘     │
└─────────────────────────────────────────────────┘
```

**值类型**（struct、enum、int、double、bool 等）直接存储数据，分配在**栈**上（作为类的字段时跟随对象分配在堆上）。

**引用类型**（class、string、array、delegate 等）存储的是引用地址，对象本身在**堆**上，变量中只保存一个指向堆的地址。

#### struct vs class 选择标准

| 场景 | 选择 struct | 选择 class |
|---|---|---|
| 数据大小 | 小（通常 < 16 字节） | 大小不限 |
| 语义 | 值语义（复制就是值的拷贝） | 引用语义（复制引用） |
| 是否需要继承 | 不能继承（可实现接口） | 需要继承 |
| 生命周期 | 短暂，用完即弃 | 可长期存在 |
| 典型场景 | 坐标、金额、ID | 实体对象、服务、组件 |

#### 装箱拆箱的性能陷阱

装箱（Boxing）：将值类型包装为引用类型（栈→堆），分配内存 + 复制数据  
拆箱（Unboxing）：从引用类型中提取值类型（堆→栈），类型检查 + 复制数据

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;

namespace NursingHomeManagement.ValueTypes
{
    /// <summary>
    /// 长者年龄统计 - 展示装箱拆箱的性能差异
    /// </summary>
    public class BoxingDemo
    {
        /// <summary>
        /// 演示装箱拆箱的性能影响
        /// </summary>
        public static void Run()
        {
            int count = 100000;

            // ========== 方式一：使用 ArrayList（会发生装箱） ==========
            // ArrayList 只接受 object，int 会被装箱
            var arrayList = new ArrayList();
            var sw1 = Stopwatch.StartNew();

            for (int i = 0; i < count; i++)
            {
                arrayList.Add(i); // 装箱：int → object（在堆上分配内存）
            }

            long sum1 = 0;
            for (int i = 0; i < count; i++)
            {
                sum1 += (int)arrayList[i]; // 拆箱：object → int
            }
            sw1.Stop();

            // ========== 方式二：使用 List<int>（无装箱） ==========
            // 泛型集合直接存储 int，无需装箱
            var genericList = new List<int>();
            var sw2 = Stopwatch.StartNew();

            for (int i = 0; i < count; i++)
            {
                genericList.Add(i); // 无装箱：直接存储 int
            }

            long sum2 = 0;
            for (int i = 0; i < count; i++)
            {
                sum2 += genericList[i]; // 无拆箱：直接读取 int
            }
            sw2.Stop();

            Console.WriteLine($"ArrayList（装箱拆箱）: {sw1.ElapsedMilliseconds}ms");
            Console.WriteLine($"List<int>（无装箱）:  {sw2.ElapsedMilliseconds}ms");
            Console.WriteLine($"性能差异: ArrayList 慢约 {sw1.ElapsedMilliseconds / Math.Max(sw2.ElapsedMilliseconds, 1)} 倍");
        }
    }

    /// <summary>
    /// 养老院地址 - 使用 struct（值类型）
    /// 地址是小数据，复制时应该产生独立副本
    /// </summary>
    public struct Address
    {
        // 省份
        public string Province { get; set; }
        // 城市
        public string City { get; set; }
        // 详细地址
        public string Detail { get; set; }

        public override string ToString()
        {
            return $"{Province} {City} {Detail}";
        }
    }

    /// <summary>
    /// 养老院入住长者 - 使用 class（引用类型）
    /// 长者是复杂实体，需要引用语义
    /// </summary>
    public class Elder
    {
        // 长者姓名
        public string Name { get; set; }
        // 年龄
        public int Age { get; set; }
        // 家庭地址（值类型作为类的字段，跟随对象分配在堆上）
        public Address HomeAddress { get; set; }
    }

    /// <summary>
    /// 展示值类型与引用类型的行为差异
    /// </summary>
    public class ValueTypeVsRefTypeDemo
    {
        public static void Run()
        {
            Console.WriteLine("===== 值类型（struct）行为演示 =====");

            var addr1 = new Address
            {
                Province = "北京市",
                City = "朝阳区",
                Detail = "望京街道1号"
            };
            var addr2 = addr1; // 值复制：addr2 是 addr1 的副本
            addr2.City = "海淀区"; // 修改副本不影响原件

            Console.WriteLine($"addr1: {addr1}"); // 北京市 朝阳区 望京街道1号
            Console.WriteLine($"addr2: {addr2}"); // 北京市 海淀区 望京街道1号
            Console.WriteLine("结论：值类型赋值产生独立副本，互不影响");

            Console.WriteLine();
            Console.WriteLine("===== 引用类型（class）行为演示 =====");

            var elder1 = new Elder
            {
                Name = "张大爷",
                Age = 78,
                HomeAddress = addr1
            };
            var elder2 = elder1; // 引用复制：elder2 和 elder1 指向同一对象
            elder2.Name = "张爷爷"; // 修改的是同一个对象

            Console.WriteLine($"elder1.Name: {elder1.Name}"); // 张爷爷
            Console.WriteLine($"elder2.Name: {elder2.Name}"); // 张爷爷
            Console.WriteLine("结论：引用类型赋值复制的是引用，两者指向同一对象");
        }
    }
}
```

**运行结果说明**：
- `ArrayList` 操作比 `List<int>` 慢 **5-10 倍**，因为每次 `Add` 都要装箱，每次读取都要拆箱
- 值类型（struct）赋值后修改副本，原件不变——因为是**值复制**
- 引用类型（class）赋值后修改副本，原件也变了——因为是**引用复制**

---

### 1.3 async/await 状态机原理

#### 生活类比：护理员等待长者体检结果的调度方式

假设养老院要给 3 位长者做体检：

**同步方式**（笨办法）：护理员小张陪张大爷去抽血，站在旁边等结果出来（30分钟），然后陪李大妈去拍片，再等结果（20分钟），最后陪王大爷做心电图（15分钟）。总耗时 **65 分钟**。

**异步方式**（聪明办法）：小张安排张大爷去抽血后，不必傻等——先去安排李大妈拍片，再安排王大爷做心电图。当某位长者的检查结果出来时，检验科打电话通知小张，小张再回去处理。总耗时约 **30 分钟**（取决于最长的那个检查）。

**await 就像那个电话通知**——它告诉系统「这个操作需要等待，先去做别的事，完成了再通知我继续」。

#### 编译器如何将 async 方法转换为状态机

当你写下这段代码：

```csharp
public async Task<string> CheckHealthAsync(string elderName)
{
    Console.WriteLine("开始体检");
    string bloodResult = await DrawBloodAsync(elderName); // 等待点1
    Console.WriteLine("抽血完成，开始拍片");
    string xrayResult = await TakeXrayAsync(elderName); // 等待点2
    return $"体检报告: 抽血={bloodResult}, 拍片={xrayResult}";
}
```

编译器会将其转换为一个**状态机类**，大致结构如下：

```csharp
// 编译器生成的状态机（简化版，便于理解）
internal struct CheckHealthAsyncStateMachine : IAsyncStateMachine
{
    // 状态编号：-1=初始, 0=等待抽血, 1=等待拍片, 2=完成
    public int State;
    public AsyncTaskMethodBuilder<string> Builder;

    // 方法的局部变量被提升为字段
    public string ElderName;
    public string BloodResult;
    public string XrayResult;
    private TaskAwaiter<string> _awaitter;

    public void MoveNext()
    {
        try
        {
            switch (State)
            {
                case -1: // 初始状态
                    Console.WriteLine("开始体检");
                    _awaitter = DrawBloodAsync(ElderName).GetAwaiter();
                    if (!_awaitter.IsCompleted)
                    {
                        State = 0; // 记录状态
                        Builder.AwaitUnsafeOnCompleted(ref _awaitter, ref this);
                        return; // 挂起，让出线程
                    }
                    goto case 0;

                case 0: // 抽血完成
                    BloodResult = _awaitter.GetResult();
                    Console.WriteLine("抽血完成，开始拍片");
                    _awaitter = TakeXrayAsync(ElderName).GetAwaiter();
                    if (!_awaitter.IsCompleted)
                    {
                        State = 1;
                        Builder.AwaitUnsafeOnCompleted(ref _awaitter, ref this);
                        return;
                    }
                    goto case 1;

                case 1: // 拍片完成
                    XrayResult = _awaitter.GetResult();
                    State = 2;
                    Builder.SetResult($"体检报告: 抽血={BloodResult}, 拍片={XrayResult}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Builder.SetException(ex);
        }
    }

    public void SetStateMachine(IAsyncStateMachine stateMachine)
    {
        Builder.SetStateMachine(stateMachine);
    }
}
```

**关键理解**：
1. 每个 `await` 点将方法拆分为不同的「状态」
2. 方法执行到 `await` 时，如果任务未完成，**当前线程被释放**去处理其他工作
3. 当 await 的任务完成时，**通过 SynchronizationContext 或 ThreadPool 回调**恢复执行
4. 局部变量被**提升为状态机的字段**，所以跨 await 后仍能访问

#### SynchronizationContext 的作用

`SynchronizationContext` 是「线程调度器」，决定了 await 之后的代码在哪个线程上执行：

| 环境 | SynchronizationContext | await 后恢复到 |
|---|---|---|
| WinForms / WPF | 自定义 UI SynchronizationContext | UI 线程 |
| ASP.NET Core | **null**（无 SynchronizationContext） | ThreadPool 线程 |
| 控制台应用 | null | ThreadPool 线程 |

> **重要**：ASP.NET Core 没有 SynchronizationContext，所以 await 后不会恢复到原来的线程——这正是它高性能的原因之一。

#### ConfigureAwait(false) 什么时候用

```csharp
// 库代码中：使用 ConfigureAwait(false)
// 原因：库代码不需要回到原始上下文，避免不必要的上下文捕获开销
public async Task<string> GetDataAsync()
{
    var data = await FetchFromDatabaseAsync().ConfigureAwait(false);
    // 后续代码不保证在原始线程上执行
    return ProcessData(data);
}

// 应用代码中：ConfigureAwait(false) 可用可不用
// 原因：ASP.NET Core 没有 SynchronizationContext，不会发生上下文死锁
// 但加上 ConfigureAwait(false) 可以减少一次上下文切换开销（微优化）
public async Task<IActionResult> GetElderAsync(int id)
{
    var elder = await _elderService.GetByIdAsync(id); // ASP.NET Core 中加不加都行
    return Ok(elder);
}
```

#### Task vs Thread vs ThreadPool 区别

| 特性 | Thread | ThreadPool | Task |
|---|---|---|---|
| 抽象级别 | 低级 | 中级 | 高级 |
| 创建开销 | 大（每个约 1MB 栈空间） | 复用线程，开销小 | 基于 ThreadPool，开销最小 |
| 返回值 | 无 | 无 | Task\<T\> 可返回值 |
| 组合能力 | 无 | 无 | 支持 WhenAll/WhenAny/ContinueWith |
| 取消支持 | 手动实现 | 手动实现 | 内置 CancellationToken |
| 适用场景 | 需要长期占用线程 | 短时 CPU 密集型操作 | I/O 密集型 + CPU 密集型 |

**一句话总结**：**优先用 Task**，只有在需要精确控制线程行为时才用 Thread。

#### 代码示例：养老院批量健康检查的异步并发

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace NursingHomeManagement.HealthCheck
{
    /// <summary>
    /// 健康检查服务 - 演示 async/await 的实际应用
    /// </summary>
    public class HealthCheckService
    {
        /// <summary>
        /// 模拟单个长者的体检流程（异步，耗时 2-3 秒）
        /// </summary>
        private async Task<HealthReport> CheckSingleElderAsync(string elderName)
        {
            Console.WriteLine($"[开始] {elderName} 的体检");

            // 模拟多项检查（每项独立，可以并发）
            var bloodTask = SimulateBloodTestAsync(elderName);
            var xrayTask = SimulateXrayAsync(elderName);
            var heartTask = SimulateECGAsync(elderName);

            // 等待所有检查完成（并发执行，而非串行）
            await Task.WhenAll(bloodTask, xrayTask, heartTask);

            var report = new HealthReport
            {
                ElderName = elderName,
                BloodResult = await bloodTask,   // Task 已完成，await 立即返回结果
                XrayResult = await xrayTask,     // 避免 .Result（同步阻塞 + 异常包装为 AggregateException）
                ECGResult = await heartTask,
                CheckTime = DateTime.Now
            };

            Console.WriteLine($"[完成] {elderName} 的体检");
            return report;
        }

        /// <summary>
        /// 模拟抽血检查
        /// </summary>
        private async Task<string> SimulateBloodTestAsync(string elderName)
        {
            await Task.Delay(1000); // 模拟耗时 1 秒
            return "血常规正常";
        }

        /// <summary>
        /// 模拟 X 光检查
        /// </summary>
        private async Task<string> SimulateXrayAsync(string elderName)
        {
            await Task.Delay(1500); // 模拟耗时 1.5 秒
            return "胸片无异常";
        }

        /// <summary>
        /// 模拟心电图检查
        /// </summary>
        private async Task<string> SimulateECGAsync(string elderName)
        {
            await Task.Delay(800); // 模拟耗时 0.8 秒
            return "心电图正常";
        }

        /// <summary>
        /// 批量健康检查 - 演示并发控制
        /// </summary>
        public async Task<List<HealthReport>> BatchCheckAsync(List<string> elderNames)
        {
            var tasks = new List<Task<HealthReport>>();

            // 为每位长者创建一个检查任务（并发执行）
            foreach (var name in elderNames)
            {
                tasks.Add(CheckSingleElderAsync(name));
            }

            // 等待所有长者的体检全部完成
            HealthReport[] results = await Task.WhenAll(tasks);
            return new List<HealthReport>(results);
        }
    }

    /// <summary>
    /// 健康检查报告
    /// </summary>
    public class HealthReport
    {
        // 长者姓名
        public string ElderName { get; set; }
        // 血检结果
        public string BloodResult { get; set; }
        // X光结果
        public string XrayResult { get; set; }
        // 心电图结果
        public string ECGResult { get; set; }
        // 检查时间
        public DateTime CheckTime { get; set; }
    }
}
```

**运行结果说明**：
- 3 位长者**同时**开始体检，而非排队串行
- 每位长者的 3 项检查也是**并发**进行的（血检 1s + X光 1.5s + 心电图 0.8s，总耗时约 1.5s 而非 3.3s）
- `Task.WhenAll` 等待所有任务完成，总耗时取决于最慢的那个
- 对比：串行 3 人 × 3.3s = 约 10s，并发 3 人同时做 ≈ 3s（提升 3 倍以上）

---

### 1.4 线程安全

#### 生活类比：多个护工同时更新同一长者的护理记录

养老院有 3 个护工（线程）同时在护理记录本上写东西：
- 护工 A 写「体温 36.5°C」
- 护工 B 写「血压 120/80」
- 护工 C 写「血糖 5.6mmol/L」

如果没有任何协调机制，三个人可能同时翻到同一页、互相覆盖对方的记录，最终只剩最后一人写的内容。这就是**线程安全**问题。

#### lock 原理（Monitor 本质）

`lock` 是 C# 的语法糖，编译后会转换为 `Monitor.Enter` / `Monitor.Exit`：

```csharp
// 你写的代码
lock (_lockObject)
{
    // 临界区代码
    sharedCounter++;
}

// 编译器实际生成的代码
Monitor.Enter(_lockObject);
try
{
    sharedCounter++;
}
finally
{
    Monitor.Exit(_lockObject);
}
```

> **注意**：在 .NET 4.0+ 中，编译器使用的是 `Monitor.Enter(ref lockTaken)` 的更安全版本，即使 `Enter` 抛出异常也不会导致锁无法释放。

#### SemaphoreSlim 信号量

`SemaphoreSlim` 限制**同时访问某个资源的线程数量**——就像养老院的电梯，最多同时容纳 5 人。

#### ReaderWriterLockSlim 读写锁

读写锁区分「读操作」和「写操作」：
- **读操作**：可以多个线程同时进行（共享锁）
- **写操作**：只能一个线程独占（排他锁）
- 适用场景：缓存、配置中心等「读多写少」的场景

#### Interlocked 原子操作

`Interlocked` 类提供 CPU 级别的原子操作，无需加锁即可保证线程安全：

```csharp
// 原子自增 - 无需 lock，性能最优
Interlocked.Increment(ref _count);

// 原子比较并交换 - CAS 操作
Interlocked.CompareExchange(ref _value, newValue, comparand);
```

#### 代码示例：养老院床位分配的线程安全实现

```csharp
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace NursingHomeManagement.BedAllocation
{
    /// <summary>
    /// 养老院床位管理器 - 演示多种线程安全机制
    /// </summary>
    public class BedManager
    {
        // 总床位数
        private readonly int _totalBeds;

        // 当前已分配床位数（使用 Interlocked 保证原子操作）
        private int _allocatedBeds = 0;

        // 床位分配锁（保护分配逻辑的复杂操作）
        private readonly object _allocateLock = new object();

        // 长者信息缓存（使用读写锁保护，因为读多写少）
        private readonly Dictionary<int, string> _bedToElderMap
            = new Dictionary<int, string>();
        private readonly ReaderWriterLockSlim _cacheLock
            = new ReaderWriterLockSlim();

        // 线程安全的床位队列（ConcurrentQueue 自带线程安全）
        private readonly ConcurrentQueue<int> _availableBeds
            = new ConcurrentQueue<int>();

        // 并发信号量（限制同时办理入住的人数，模拟服务窗口）
        private readonly SemaphoreSlim _checkInSemaphore
            = new SemaphoreSlim(3, 3); // 最多 3 个窗口同时办理

        public BedManager(int totalBeds)
        {
            _totalBeds = totalBeds;
            // 初始化可用床位
            for (int i = 1; i <= totalBeds; i++)
            {
                _availableBeds.Enqueue(i);
            }
        }

        /// <summary>
        /// 获取已分配床位数（使用 Interlocked 原子读取）
        /// </summary>
        public int AllocatedBeds => Interlocked.CompareExchange(ref _allocatedBeds, 0, 0);

        /// <summary>
        /// 分配床位 - 使用 lock 保护复合操作
        /// </summary>
        public BedAllocationResult AllocateBed(string elderName)
        {
            // 限制并发：最多 3 个窗口同时办理
            _checkInSemaphore.Wait();
            try
            {
                // 使用 lock 保护复合操作
                lock (_allocateLock)
                {
                    // 检查是否还有空床位
                    if (_allocatedBeds >= _totalBeds)
                    {
                        return new BedAllocationResult
                        {
                            Success = false,
                            Message = $"抱歉，{elderName}，目前 {_totalBeds} 张床位已满"
                        };
                    }

                    // 从队列中取出一个可用床位
                    if (_availableBeds.TryDequeue(out int bedNumber))
                    {
                        // 原子操作：增加已分配计数
                        Interlocked.Increment(ref _allocatedBeds);

                        // 使用写锁保护缓存更新
                        _cacheLock.EnterWriteLock();
                        try
                        {
                            _bedToElderMap[bedNumber] = elderName;
                        }
                        finally
                        {
                            _cacheLock.ExitWriteLock();
                        }

                        return new BedAllocationResult
                        {
                            Success = true,
                            BedNumber = bedNumber,
                            Message = $"{elderName} 成功入住 {bedNumber} 号床"
                        };
                    }

                    return new BedAllocationResult
                    {
                        Success = false,
                        Message = $"{elderName} 分配失败，队列异常"
                    };
                }
            }
            finally
            {
                _checkInSemaphore.Release();
            }
        }

        /// <summary>
        /// 查询床位信息 - 使用读锁（允许多线程并发读取）
        /// </summary>
        public string GetElderByBed(int bedNumber)
        {
            _cacheLock.EnterReadLock();
            try
            {
                if (_bedToElderMap.TryGetValue(bedNumber, out string elderName))
                {
                    return elderName;
                }
                return "空床位";
            }
            finally
            {
                _cacheLock.ExitReadLock();
            }
        }

        /// <summary>
        /// 退床 - 释放床位
        /// </summary>
        public void ReleaseBed(int bedNumber)
        {
            lock (_allocateLock)
            {
                _cacheLock.EnterWriteLock();
                try
                {
                    if (_bedToElderMap.Remove(bedNumber))
                    {
                        Interlocked.Decrement(ref _allocatedBeds);
                        _availableBeds.Enqueue(bedNumber);
                    }
                }
                finally
                {
                    _cacheLock.ExitWriteLock();
                }
            }
        }
    }

    /// <summary>
    /// 床位分配结果
    /// </summary>
    public class BedAllocationResult
    {
        // 是否成功
        public bool Success { get; set; }
        // 分配的床位号
        public int BedNumber { get; set; }
        // 结果消息
        public string Message { get; set; }
    }

    /// <summary>
    /// 并发测试示例
    /// </summary>
    public class BedManagerDemo
    {
        public static async Task RunAsync()
        {
            var manager = new BedManager(10); // 10 张床位
            var tasks = new List<Task<BedAllocationResult>>();

            // 模拟 15 人同时申请入住（超过床位数）
            for (int i = 1; i <= 15; i++)
            {
                string name = $"长者{i}号";
                tasks.Add(Task.Run(() => manager.AllocateBed(name)));
            }

            // 等待所有分配完成
            BedAllocationResult[] results = await Task.WhenAll(tasks);

            // 输出结果
            foreach (var result in results)
            {
                Console.WriteLine(result.Message);
            }

            Console.WriteLine($"\n已分配: {manager.AllocatedBeds}/{10}");
        }
    }
}
```

**运行结果说明**：
- 15 人同时申请，只有 10 人能成功入住，后 5 人收到「床位已满」
- `SemaphoreSlim(3,3)` 确保最多 3 个线程同时进入分配逻辑，模拟 3 个服务窗口
- `ReaderWriterLockSlim` 允许多线程同时读取床位信息，写入时才独占
- `Interlocked.Increment` 保证计数器在并发环境下不会出错

---

### 1.5 委托与事件

#### 生活类比：委托是「通知单」，事件是「订阅公告栏」

- **委托**：你写了一张通知单，上面写着「请去给 101 房张大爷量血压」。你可以把这张单子交给任何护工（任何满足签名的方法），他就会去执行
- **事件**：养老院大厅有一个公告栏，上面写着「如需紧急护理请拨打此电话」。长者或家属可以**订阅**（+=）这个公告栏的通知，也可以**取消订阅**（-=），但只有管理员才能**发布通知**（Invoke）

#### 委托本质

委托在编译后是一个**类**，继承自 `System.MulticastDelegate`，包含：
- `Invoke()`：同步调用委托链中所有方法
- `BeginInvoke()` / `EndInvoke()`：异步调用（.NET Core 中已移除）
- `_target`：方法所属的对象实例
- `_methodPtr`：指向方法的指针

#### event 关键字的作用

`event` 关键字限制了委托的行为：
- **类内部**：可以触发（Invoke）、订阅（+=）、取消订阅（-=）
- **类外部**：只能订阅和取消，**不能触发**

#### 代码示例：长者体征异常事件通知系统

```csharp
using System;
using System.Collections.Generic;

namespace NursingHomeManagement.Monitoring
{
    /// <summary>
    /// 体征异常事件参数
    /// </summary>
    public class VitalSignAlertEventArgs : EventArgs
    {
        // 长者姓名
        public string ElderName { get; set; }
        // 体征类型（血压/体温/心率/血糖）
        public string VitalType { get; set; }
        // 测量值
        public double Value { get; set; }
        // 正常范围
        public string NormalRange { get; set; }
        // 告警级别
        public AlertLevel Level { get; set; }
        // 发生时间
        public DateTime OccurredAt { get; set; }
    }

    /// <summary>
    /// 告警级别枚举
    /// </summary>
    public enum AlertLevel
    {
        Warning = 0,    // 警告
        Critical = 1,   // 严重
        Emergency = 2   // 紧急
    }

    /// <summary>
    /// 体征监测仪 - 事件发布者
    /// 当检测到异常体征时触发告警事件
    /// </summary>
    public class VitalSignMonitor
    {
        // 定义告警事件（使用 event 关键字，外部只能 += 或 -=）
        // 内置委托 EventHandler<TEventArgs> 是 .NET 推荐的事件模式
        public event EventHandler<VitalSignAlertEventArgs> OnVitalSignAlert;

        // 也展示 Action 委托的用法
        // Action<T> 是无返回值的泛型委托
        private Action<string, double> _onMeasurementRecorded;

        /// <summary>
        /// 订阅测量记录回调
        /// </summary>
        public void SubscribeMeasurement(Action<string, double> callback)
        {
            _onMeasurementRecorded += callback;
        }

        /// <summary>
        /// 模拟测量血压
        /// </summary>
        public void MeasureBloodPressure(string elderName, int systolic, int diastolic)
        {
            // 记录测量
            _onMeasurementRecorded?.Invoke($"{elderName}血压", systolic);

            // 检查收缩压是否异常（正常值：90-140）
            if (systolic > 140)
            {
                RaiseAlert(elderName, "收缩压", systolic,
                    "90-140 mmHg", systolic > 180 ? AlertLevel.Emergency : AlertLevel.Critical);
            }
            else if (systolic > 130)
            {
                RaiseAlert(elderName, "收缩压", systolic,
                    "90-140 mmHg", AlertLevel.Warning);
            }
        }

        /// <summary>
        /// 触发告警事件
        /// </summary>
        private void RaiseAlert(string elderName, string vitalType,
            double value, string normalRange, AlertLevel level)
        {
            var args = new VitalSignAlertEventArgs
            {
                ElderName = elderName,
                VitalType = vitalType,
                Value = value,
                NormalRange = normalRange,
                Level = level,
                OccurredAt = DateTime.Now
            };

            // 触发事件（如果有订阅者）
            // 使用 ?. 安全调用，防止没有订阅者时 NullReferenceException
            OnVitalSignAlert?.Invoke(this, args);
        }
    }

    /// <summary>
    /// 护士站 - 事件订阅者（接收告警通知）
    /// </summary>
    public class NurseStation
    {
        // 护士站名称
        public string StationName { get; }

        public NurseStation(string stationName)
        {
            StationName = stationName;
        }

        /// <summary>
        /// 处理体征告警（事件回调方法）
        /// </summary>
        public void HandleAlert(object sender, VitalSignAlertEventArgs e)
        {
            string levelText = e.Level switch
            {
                AlertLevel.Warning => "⚠️ 警告",
                AlertLevel.Critical => "🔴 严重",
                AlertLevel.Emergency => "🚨 紧急",
                _ => "未知"
            };

            Console.WriteLine(
                $"[{StationName}] {levelText} | {e.ElderName} " +
                $"{e.VitalType}={e.Value}（正常范围: {e.NormalRange}）" +
                $" 时间: {e.OccurredAt:HH:mm:ss}");
        }
    }

    /// <summary>
    /// 家属通知服务 - 另一个事件订阅者
    /// 使用 Predicate 委托判断是否需要通知家属
    /// </summary>
    public class FamilyNotificationService
    {
        // Predicate<T> 是返回 bool 的委托，常用于条件判断
        private readonly Predicate<AlertLevel> _shouldNotify;

        public FamilyNotificationService()
        {
            // 只有严重及以上级别才通知家属
            _shouldNotify = level => level >= AlertLevel.Critical;
        }

        public void HandleAlert(object sender, VitalSignAlertEventArgs e)
        {
            // 使用 Predicate 判断是否需要通知
            if (_shouldNotify(e.Level))
            {
                Console.WriteLine(
                    $"[家属通知] 正在通知 {e.ElderName} 的家属：" +
                    $"{e.VitalType}异常，值为{e.Value}");
            }
        }
    }

    /// <summary>
    /// 演示委托与事件的使用
    /// </summary>
    public class VitalSignDemo
    {
        public static void Run()
        {
            // 创建事件发布者
            var monitor = new VitalSignMonitor();

            // 创建事件订阅者
            var nurseStation = new NurseStation("一楼护士站");
            var familyService = new FamilyNotificationService();

            // 订阅事件（+= 操作）
            monitor.OnVitalSignAlert += nurseStation.HandleAlert;
            monitor.OnVitalSignAlert += familyService.HandleAlert;

            // 订阅测量记录（Action 委托）
            monitor.SubscribeMeasurement((desc, value) =>
            {
                Console.WriteLine($"[记录] {desc}: {value}");
            });

            Console.WriteLine("===== 模拟体征监测 =====\n");

            // 正常血压 - 不触发告警
            monitor.MeasureBloodPressure("张大爷", 125, 80);

            // 轻度偏高 - 触发警告
            monitor.MeasureBloodPressure("李大妈", 135, 85);

            // 严重偏高 - 触发严重告警 + 通知家属
            monitor.MeasureBloodPressure("王大爷", 165, 95);

            // 极度危险 - 触发紧急告警 + 通知家属
            monitor.MeasureBloodPressure("赵奶奶", 195, 110);

            // 取消订阅（-= 操作）
            Console.WriteLine("\n--- 护士站取消订阅 ---\n");
            monitor.OnVitalSignAlert -= nurseStation.HandleAlert;

            // 此次只有家属通知服务会收到告警
            monitor.MeasureBloodPressure("孙爷爷", 150, 90);
        }
    }
}
```

**运行结果说明**：
- `event` 关键字保证了外部代码只能 `+=` 或 `-=`，不能直接调用 `OnVitalSignAlert.Invoke()`
- 一个事件可以有**多个订阅者**（多播委托），按订阅顺序依次执行
- 取消订阅后，该订阅者不再收到通知
- `Predicate<AlertLevel>` 用于判断是否需要通知家属，体现了 Func/Action/Predicate 的实际用途

---

### 1.6 IDisposable 与 using 模式

#### 为什么要 Dispose？

.NET 的 GC 只管理**托管资源**（内存），但程序中还有大量**非托管资源**：

| 资源类型 | 示例 | 不释放的后果 |
|---|---|---|
| 数据库连接 | MySqlConnection（Pomelo 驱动） | 连接池耗尽，新连接无法创建 |
| 文件句柄 | FileStream | 文件被锁定，无法删除或写入 |
| 网络连接 | HttpClient | Socket 耗尽，无法建立新连接 |
| GDI 句柄 | Bitmap/Graphics | 界面渲染异常 |

#### using 语句编译后展开为 try-finally

```csharp
// 你写的代码
using (var connection = new MySqlConnection(connectionString))
{
    connection.Open();
    // 使用连接...
}
// 离开 using 块时自动调用 Dispose()

// 编译器实际生成的代码
MySqlConnection connection = null;
try
{
    connection = new MySqlConnection(connectionString);
    connection.Open();
    // 使用连接...
}
finally
{
    if (connection != null)
    {
        connection.Dispose();
    }
}
```

#### 代码示例：养老院数据库连接管理器

```csharp
using System;
using System.Data;
using MySqlConnector;

namespace NursingHomeManagement.Data
{
    /// <summary>
    /// 养老院数据库连接管理器
    /// 演示 IDisposable 模式在数据访问层的应用
    /// </summary>
    public class NursingHomeDbConnection : IDisposable
    {
        private MySqlConnection _connection;
        private bool _disposed = false;

        // 连接字符串
        public string ConnectionString { get; }

        // 是否已连接
        public bool IsConnected =>
            _connection?.State == ConnectionState.Open;

        public NursingHomeDbConnection(string connectionString)
        {
            ConnectionString = connectionString;
            _connection = new MySqlConnection(connectionString);
        }

        /// <summary>
        /// 打开连接
        /// </summary>
        public void Open()
        {
            ThrowIfDisposed();
            if (!IsConnected)
            {
                _connection.Open();
            }
        }

        /// <summary>
        /// 执行查询并返回影响行数
        /// </summary>
        public int ExecuteNonQuery(string sql)
        {
            ThrowIfDisposed();
            if (!IsConnected)
            {
                throw new InvalidOperationException("请先调用 Open() 打开连接");
            }

            // 使用 using 确保 SqlCommand 被正确释放
            using (var cmd = new SqlCommand(sql, _connection))
            {
                return cmd.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// 检查是否已释放，已释放则抛出异常
        /// </summary>
        private void ThrowIfDisposed()
        {
            if (_disposed)
            {
                throw new ObjectDisposedException(
                    nameof(NursingHomeDbConnection));
            }
        }

        /// <summary>
        /// 实现 IDisposable 接口
        /// </summary>
        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        /// <summary>
        /// 核心释放逻辑
        /// </summary>
        protected virtual void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                if (disposing)
                {
                    // 释放托管资源
                    if (_connection != null)
                    {
                        if (IsConnected)
                        {
                            _connection.Close();
                        }
                        _connection.Dispose();
                        _connection = null;
                    }
                }
                _disposed = true;
            }
        }

        ~NursingHomeDbConnection()
        {
            Dispose(false);
        }
    }

    /// <summary>
    /// 使用示例
    /// </summary>
    public class DbConnectionDemo
    {
        public static void Run()
        {
            string connStr = "Server=.;Database=NursingHome;Trusted_Connection=True;";

            // 推荐写法：using 语句自动释放
            using (var db = new NursingHomeDbConnection(connStr))
            {
                db.Open();
                db.ExecuteNonQuery(
                    "INSERT INTO Elders (Name, Age) VALUES ('张大爷', 78)");
            }
            // 离开 using 块后，连接被自动关闭并释放

            // C# 8.0+ using 声明（更简洁）
            // 注意：这里用的是 C# 8 的 using 声明，不是 using 语句
            // 在 C# 9 中仍然可用
            {
                using var db2 = new NursingHomeDbConnection(connStr);
                db2.Open();
                db2.ExecuteNonQuery(
                    "INSERT INTO Elders (Name, Age) VALUES ('李大妈', 82)");
                // 方法结束时自动释放
            }
        }
    }
}
```

---

### 1.7 string 不可变性与 StringBuilder

#### string 的不可变性原理

C# 中的 `string` 是**不可变引用类型**（immutable）。每次对字符串的「修改」操作（拼接、替换、截取）都会**创建一个新的字符串对象**，原来的字符串不变。

```csharp
string s1 = "养老院";
string s2 = s1; // s1 和 s2 指向同一个字符串对象
s1 += "管理系统"; // 创建了新的字符串对象，s1 指向新对象
// s2 仍然指向 "养老院"
```

**字符串驻留池**（String Intern Pool）：相同的字符串字面量在内存中只保存一份。

#### 代码对比：拼接 10000 条长者姓名

```csharp
using System;
using System.Diagnostics;
using System.Text;

namespace NursingHomeManagement.StringDemo
{
    public class StringConcatDemo
    {
        public static void Run()
        {
            int count = 10000;
            var names = new string[count];
            for (int i = 0; i < count; i++)
            {
                names[i] = $"长者{i}号";
            }

            // ========== 方式一：string 拼接（性能极差） ==========
            var sw1 = Stopwatch.StartNew();
            string result1 = "";
            for (int i = 0; i < count; i++)
            {
                // 每次拼接都创建新的字符串对象
                // 产生 10000 个临时对象 + 大量内存拷贝
                result1 += names[i] + ",";
            }
            sw1.Stop();
            Console.WriteLine($"string 拼接: {sw1.ElapsedMilliseconds}ms");

            // ========== 方式二：StringBuilder（推荐） ==========
            var sw2 = Stopwatch.StartNew();
            // 预分配足够容量，避免内部扩容
            var sb = new StringBuilder(count * 10);
            for (int i = 0; i < count; i++)
            {
                // 在内部缓冲区追加，不创建新对象
                sb.Append(names[i]);
                sb.Append(',');
            }
            string result2 = sb.ToString();
            sw2.Stop();
            Console.WriteLine($"StringBuilder: {sw2.ElapsedMilliseconds}ms");

            Console.WriteLine(
                $"性能差异: string 拼接慢约 " +
                $"{sw1.ElapsedMilliseconds / Math.Max(sw2.ElapsedMilliseconds, 1)} 倍");

            // 内存差异说明
            Console.WriteLine("\n===== 内存分配分析 =====");
            Console.WriteLine("string 拼接：产生约 10000 个临时字符串对象，大量 GC 压力");
            Console.WriteLine("StringBuilder：只在最终 ToString() 时产生一个最终字符串");
        }
    }
}
```

**运行结果说明**：
- `string` 拼接耗时可能是 `StringBuilder` 的 **100-1000 倍**
- 原因：每次 `+=` 都创建新对象并复制旧内容，时间复杂度为 O(n²)
- `StringBuilder` 内部维护可变缓冲区，时间复杂度为 O(n)
- **经验法则**：拼接 3 次以上就用 `StringBuilder`

---

### 1.8 泛型约束与协变逆变

#### 泛型约束

泛型约束限定了类型参数必须满足的条件：

```csharp
// 约束 T 必须是引用类型
public class Repository<T> where T : class { }

// 约束 T 必须是值类型
public class ValueWrapper<T> where T : struct { }

// 约束 T 必须有无参构造函数
public class Factory<T> where T : new() { }

// 多个约束组合
public class BaseService<T> where T : class, IEntity, new() { }
```

#### 协变（out）与逆变（in）

- **协变（out）**：子类型可以替代父类型，用于**输出**位置（返回值）
- **逆变（in）**：父类型可以替代子类型，用于**输入**位置（参数）

```csharp
// 协变示例
IEnumerable<string> strings = new List<string>();
IEnumerable<object> objects = strings; // OK：string 是 object 的子类型
// 因为 IEnumerable<out T> 中 T 只用于输出位置（GetEnumerator 返回 T）

// 逆变示例
Action<object> objectAction = obj => Console.WriteLine(obj);
Action<string> stringAction = objectAction; // OK
// 因为 Action<in T> 中 T 只用于输入位置（方法参数）
```

#### 代码示例：养老院通用分页结果类

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace NursingHomeManagement.Common
{
    /// <summary>
    /// 实体基础接口
    /// </summary>
    public interface IEntity
    {
        // 主键ID
        Guid Id { get; set; }
    }

    /// <summary>
    /// 通用分页结果 - 使用泛型约束
    /// where T : class, IEntity 表示 T 必须是引用类型且实现 IEntity 接口
    /// </summary>
    public class PagedResult<T> where T : class, IEntity
    {
        // 数据列表
        public List<T> Items { get; set; }
        // 总记录数
        public int TotalCount { get; set; }
        // 当前页码
        public int PageIndex { get; set; }
        // 每页大小
        public int PageSize { get; set; }
        // 总页数
        public int TotalPages =>
            (int)Math.Ceiling((double)TotalCount / PageSize);
        // 是否有下一页
        public bool HasNext => PageIndex < TotalPages;
        // 是否有上一页
        public bool HasPrevious => PageIndex > 1;
    }

    /// <summary>
    /// 长者实体
    /// </summary>
    public class Elder : IEntity
    {
        // 主键ID
        public Guid Id { get; set; }
        // 姓名
        public string Name { get; set; }
        // 年龄
        public int Age { get; set; }
        // 床位号
        public int BedNumber { get; set; }
    }

    /// <summary>
    /// 护理计划实体
    /// </summary>
    public class CarePlan : IEntity
    {
        // 主键ID
        public Guid Id { get; set; }
        // 关联长者ID
        public Guid ElderId { get; set; }
        // 计划内容
        public string PlanContent { get; set; }
        // 计划开始日期
        public DateTime StartDate { get; set; }
    }

    // ========== 协变（out）演示 ==========

    /// <summary>
    /// 只读仓储接口 - 协变示例
    /// out 关键字表示 T 只用于输出（返回值），不用于输入（参数）
    /// 这使得 IElderRepository 可以赋值给 IReadOnlyRepository<IEntity>
    /// </summary>
    public interface IReadOnlyRepository<out T> where T : class, IEntity
    {
        // T 只出现在返回值位置（out 协变）
        T GetById(Guid id);
        IEnumerable<T> GetAll();
    }

    /// <summary>
    /// 长者只读仓储
    /// </summary>
    public class ElderReadOnlyRepository : IReadOnlyRepository<Elder>
    {
        public Elder GetById(Guid id)
        {
            // 模拟从数据库查询
            return new Elder { Id = id, Name = "张大爷", Age = 78 };
        }

        public IEnumerable<Elder> GetAll()
        {
            return new List<Elder>
            {
                new Elder { Id = Guid.NewGuid(), Name = "张大爷", Age = 78 },
                new Elder { Id = Guid.NewGuid(), Name = "李大妈", Age = 82 }
            };
        }
    }

    // ========== 逆变（in）演示 ==========

    /// <summary>
    /// 实体比较器接口 - 逆变示例
    /// in 关键字表示 T 只用于输入（参数），不用于输出（返回值）
    /// 这使得 IEntityComparer<IEntity> 可以赋值给 IEntityComparer<Elder>
    /// </summary>
    public interface IEntityComparer<in T> where T : class, IEntity
    {
        // T 只出现在参数位置（in 逆变）
        bool Equals(T x, T y);
    }

    /// <summary>
    /// 通用实体比较器（按 ID 比较）
    /// </summary>
    public class EntityIdComparer : IEntityComparer<IEntity>
    {
        public bool Equals(IEntity x, IEntity y)
        {
            if (x == null && y == null) return true;
            if (x == null || y == null) return false;
            return x.Id == y.Id;
        }
    }

    /// <summary>
    /// 泛型与协变逆变演示
    /// </summary>
    public class GenericDemo
    {
        public static void Run()
        {
            // 泛型约束演示
            var elderResult = new PagedResult<Elder>
            {
                Items = new List<Elder>
                {
                    new Elder { Id = Guid.NewGuid(), Name = "张大爷", Age = 78 },
                    new Elder { Id = Guid.NewGuid(), Name = "李大妈", Age = 82 }
                },
                TotalCount = 50,
                PageIndex = 1,
                PageSize = 10
            };
            Console.WriteLine($"总页数: {elderResult.TotalPages}"); // 5
            Console.WriteLine($"是否有下一页: {elderResult.HasNext}"); // True

            // 协变演示
            IReadOnlyRepository<Elder> elderRepo = new ElderReadOnlyRepository();
            IReadOnlyRepository<IEntity> entityRepo = elderRepo; // 协变：Elder → IEntity
            IEntity entity = entityRepo.GetById(Guid.NewGuid());
            Console.WriteLine($"协变查询结果: {entity.GetType().Name}");

            // 逆变演示
            IEntityComparer<IEntity> entityComparer = new EntityIdComparer();
            IEntityComparer<Elder> elderComparer = entityComparer; // 逆变：IEntity → Elder
            var e1 = new Elder { Id = Guid.Parse("00000000-0000-0000-0000-000000000001") };
            var e2 = new Elder { Id = Guid.Parse("00000000-0000-0000-0000-000000000001") };
            Console.WriteLine($"逆变比较结果: {elderComparer.Equals(e1, e2)}"); // True
        }
    }
}
```

---

### 1.9 反射基础与性能影响

#### 反射是什么

反射（Reflection）是在**运行时**动态获取类型信息、创建对象、调用方法的能力。就像用 X 光透视一个类的内部结构。

#### 常见用法

```csharp
// 1. 获取类型信息
Type type = typeof(Elder);
Console.WriteLine(type.Name); // Elder
Console.WriteLine(type.FullName); // NursingHomeManagement.Elder

// 2. 获取属性信息
PropertyInfo[] properties = type.GetProperties();
foreach (var prop in properties)
{
    Console.WriteLine($"{prop.Name}: {prop.PropertyType.Name}");
}

// 3. 动态创建对象
object instance = Activator.CreateInstance(type);

// 4. 动态设置属性值
PropertyInfo nameProp = type.GetProperty("Name");
nameProp.SetValue(instance, "张大爷");

// 5. 动态调用方法
MethodInfo method = type.GetMethod("ToString");
string result = (string)method.Invoke(instance, null);
```

#### 性能影响与优化

反射比直接调用**慢 10-100 倍**，原因：
1. 需要进行类型安全检查
2. 需要通过元数据查找方法/属性
3. 无法被 JIT 内联优化

**优化策略**：
1. **缓存 Type 和 PropertyInfo**：避免重复查找
2. **使用 Delegate.CreateDelegate**：将反射调用编译为委托
3. **使用 Expression Trees**：编译时生成高效的调用代码

```csharp
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Linq.Expressions;
using System.Reflection;

namespace NursingHomeManagement.Reflection
{
    /// <summary>
    /// 长者实体（用于反射演示）
    /// </summary>
    public class Elder
    {
        // 姓名
        public string Name { get; set; }
        // 年龄
        public int Age { get; set; }
        // 床位号
        public int BedNumber { get; set; }

        public override string ToString()
        {
            return $"{Name}, {Age}岁, {BedNumber}号床";
        }
    }

    /// <summary>
    /// 反射性能优化演示
    /// 展示不同方式创建对象和设置属性的性能差异
    /// </summary>
    public class ReflectionDemo
    {
        // 类型缓存（避免重复获取 Type）
        private static readonly Type _elderType = typeof(Elder);

        // 属性缓存（避免重复获取 PropertyInfo）
        private static readonly PropertyInfo _nameProperty =
            _elderType.GetProperty("Name");
        private static readonly PropertyInfo _ageProperty =
            _elderType.GetProperty("Age");

        // 委托缓存（Expression Tree 编译后的高效委托）
        private static readonly Func<Elder> _createElderFunc =
            CreateFactory<Elder>();

        /// <summary>
        /// 使用 Expression Tree 创建对象工厂
        /// 编译后性能接近 new 操作
        /// </summary>
        private static Func<T> CreateFactory<T>() where T : class, new()
        {
            // 表达式树：new T()
            var body = Expression.New(typeof(T));
            var lambda = Expression.Lambda<Func<T>>(body);
            return lambda.Compile();
        }

        public static void Run()
        {
            int iterations = 100000;
            var sw = new Stopwatch();

            // ========== 方式一：直接 new（基准） ==========
            sw.Start();
            for (int i = 0; i < iterations; i++)
            {
                var elder = new Elder
                {
                    Name = "张大爷",
                    Age = 78
                };
            }
            sw.Stop();
            Console.WriteLine($"直接 new:        {sw.ElapsedMilliseconds}ms");
            sw.Reset();

            // ========== 方式二：纯反射（最慢） ==========
            // 每次循环都重新获取 PropertyInfo（模拟未缓存场景）
            sw.Start();
            for (int i = 0; i < iterations; i++)
            {
                var elder = (Elder)Activator.CreateInstance(_elderType);
                // 每次都通过 GetProperty 查找属性（开销大）
                _elderType.GetProperty("Name").SetValue(elder, "张大爷");
                _elderType.GetProperty("Age").SetValue(elder, 78);
            }
            sw.Stop();
            Console.WriteLine($"纯反射:          {sw.ElapsedMilliseconds}ms");
            sw.Reset();

            // ========== 方式三：缓存反射（中等） ==========
            // 使用类级别缓存的 PropertyInfo（避免重复查找）
            sw.Start();
            for (int i = 0; i < iterations; i++)
            {
                var elder = (Elder)Activator.CreateInstance(_elderType);
                _nameProperty.SetValue(elder, "张大爷");  // 用缓存的 PropertyInfo
                _ageProperty.SetValue(elder, 78);
            }
            sw.Stop();
            Console.WriteLine($"缓存反射:        {sw.ElapsedMilliseconds}ms");
            sw.Reset();

            // ========== 方式四：Expression Tree（快） ==========
            sw.Start();
            for (int i = 0; i < iterations; i++)
            {
                var elder = _createElderFunc();
                _nameProperty.SetValue(elder, "张大爷");
                _ageProperty.SetValue(elder, 78);
            }
            sw.Stop();
            Console.WriteLine($"Expression Tree: {sw.ElapsedMilliseconds}ms");

            Console.WriteLine("\n结论：Expression Tree 的性能接近直接 new，远优于纯反射");
        }
    }

    /// <summary>
    /// ABP 框架中反射的应用场景说明
    /// </summary>
    public class AbpReflectionUsage
    {
        /*
         * ABP 框架大量使用反射实现以下功能：
         *
         * 1. 依赖注入（IoC 容器）
         *    - 扫描程序集中的类型，自动注册服务
         *    - 构造函数注入时，通过反射获取构造函数参数类型
         *
         * 2. 自动仓储（Repository）
         *    - 根据实体类型自动生成对应的仓储实现
         *    - 泛型仓储 DefaultRepository<TEntity, TKey> 内部使用反射
         *
         * 3. 审计日志
         *    - 通过反射获取方法参数和返回值
         *    - 记录方法调用的详细信息
         *
         * 4. 数据验证
         *    - 扫描 DTO 属性上的验证特性（如 [Required]）
         *    - 运行时通过反射获取特性并执行验证
         *
         * 5. 对象映射（AutoMapper 集成）
         *    - 通过反射匹配源对象和目标对象的同名属性
         *    - 动态赋值
         *
         * 优化建议：
         * - ABP 内部已做了大量反射缓存，一般不需要手动优化
         * - 在高性能场景下，可考虑使用 Emit 或 Expression Tree 替代纯反射
         * - 避免在循环中重复获取 Type/PropertyInfo
         */
    }
}
```

**运行结果说明**：
- 纯反射比直接 new 慢 **10-50 倍**（视运行环境而定）
- 缓存 PropertyInfo 后有所改善，但仍然慢
- Expression Tree 编译后性能接近直接 new，是 ABP 等框架的优化手段

---

## 2. 实战案例：养老院长者入住管理系统

本案例整合了本章多个知识点：GC 机制、值类型/引用类型、异步操作、线程安全、委托事件、IDisposable、泛型。

```csharp
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace NursingHomeManagement.CheckIn
{
    // ========== 值类型示例 ==========

    /// <summary>
    /// 长者住址 - 值类型（小数据，值语义）
    /// </summary>
    public struct Address
    {
        // 省份
        public string Province { get; set; }
        // 城市
        public string City { get; set; }
        // 详细地址
        public string Detail { get; set; }

        public override string ToString()
        {
            return $"{Province} {City} {Detail}";
        }
    }

    // ========== 引用类型示例 ==========

    /// <summary>
    /// 长者信息 - 引用类型
    /// </summary>
    public class ElderInfo
    {
        // 主键ID
        public Guid Id { get; set; }
        // 姓名
        public string Name { get; set; }
        // 年龄
        public int Age { get; set; }
        // 家庭住址
        public Address HomeAddress { get; set; }
        // 入住时间
        public DateTime CheckInTime { get; set; }
        // 分配的床位号
        public int BedNumber { get; set; }
    }

    /// <summary>
    /// 入住结果
    /// </summary>
    public class CheckInResult
    {
        // 是否成功
        public bool Success { get; set; }
        // 结果消息
        public string Message { get; set; }
        // 长者信息（入住成功时有值）
        public ElderInfo Elder { get; set; }
    }

    // ========== 事件定义 ==========

    /// <summary>
    /// 入住完成事件参数
    /// </summary>
    public class CheckInCompletedEventArgs : EventArgs
    {
        // 长者信息
        public ElderInfo Elder { get; set; }
        // 入住时间
        public DateTime CompletedAt { get; set; }
    }

    /// <summary>
    /// 入住服务 - 整合多种 C# 特性的实战示例
    /// </summary>
    public class ElderCheckInService : IDisposable
    {
        // 总床位数
        private readonly int _totalBeds;

        // 已分配计数（Interlocked 原子操作）
        private int _allocatedCount = 0;

        // 可用床位队列（线程安全集合）
        private readonly ConcurrentQueue<int> _availableBeds;

        // 入住记录缓存（并发字典）
        private readonly ConcurrentDictionary<int, ElderInfo> _bedElderMap;

        // 入住锁（保护复杂的分配逻辑）
        private readonly object _checkInLock = new object();

        // 并发限制信号量（模拟服务窗口数量）
        private readonly SemaphoreSlim _serviceWindow;

        // 入住完成事件（委托与事件）
        public event EventHandler<CheckInCompletedEventArgs> OnCheckInCompleted;

        // 是否已释放
        private bool _disposed = false;

        public ElderCheckInService(int totalBeds, int serviceWindows = 3)
        {
            _totalBeds = totalBeds;
            _availableBeds = new ConcurrentQueue<int>();
            _bedElderMap = new ConcurrentDictionary<int, ElderInfo>();
            _serviceWindow = new SemaphoreSlim(serviceWindows, serviceWindows);

            // 初始化可用床位
            for (int i = 1; i <= totalBeds; i++)
            {
                _availableBeds.Enqueue(i);
            }
        }

        /// <summary>
        /// 已分配床位数
        /// </summary>
        public int AllocatedCount =>
            Interlocked.CompareExchange(ref _allocatedCount, 0, 0);

        /// <summary>
        /// 订阅入住完成事件
        /// </summary>
        public void SubscribeCheckInCompleted(
            EventHandler<CheckInCompletedEventArgs> handler)
        {
            OnCheckInCompleted += handler;
        }

        /// <summary>
        /// 异步办理入住（模拟异步I/O操作）
        /// </summary>
        public async Task<CheckInResult> CheckInAsync(
            string name, int age, Address homeAddress)
        {
            // 限制并发（信号量）
            await _serviceWindow.WaitAsync();
            try
            {
                // 模拟异步操作（如查询数据库、验证身份等）
                await Task.Delay(100);

                // 使用 lock 保护分配逻辑
                lock (_checkInLock)
                {
                    if (!_availableBeds.TryDequeue(out int bedNumber))
                    {
                        return new CheckInResult
                        {
                            Success = false,
                            Message = $"抱歉，{name}，目前床位已满（共{_totalBeds}张）"
                        };
                    }

                    // 创建长者信息
                    var elder = new ElderInfo
                    {
                        Id = Guid.NewGuid(),
                        Name = name,
                        Age = age,
                        HomeAddress = homeAddress,
                        CheckInTime = DateTime.Now,
                        BedNumber = bedNumber
                    };

                    // 原子操作：增加已分配计数
                    Interlocked.Increment(ref _allocatedCount);

                    // 存入并发字典
                    _bedElderMap[bedNumber] = elder;

                    // 触发入住完成事件
                    OnCheckInCompleted?.Invoke(this,
                        new CheckInCompletedEventArgs
                        {
                            Elder = elder,
                            CompletedAt = DateTime.Now
                        });

                    return new CheckInResult
                    {
                        Success = true,
                        Message = $"{name} 成功入住 {bedNumber} 号床",
                        Elder = elder
                    };
                }
            }
            finally
            {
                _serviceWindow.Release();
            }
        }

        /// <summary>
        /// 查询床位信息（使用 ConcurrentDictionary 的线程安全读取）
        /// </summary>
        public ElderInfo GetElderByBed(int bedNumber)
        {
            _bedElderMap.TryGetValue(bedNumber, out var elder);
            return elder;
        }

        /// <summary>
        /// 批量入住（演示 Task.WhenAll）
        /// </summary>
        public async Task<List<CheckInResult>> BatchCheckInAsync(
            List<(string Name, int Age, Address Address)> elders)
        {
            // 使用 StringBuilder 拼接日志
            var logBuilder = new System.Text.StringBuilder();
            logBuilder.AppendLine($"开始批量入住，共 {elders.Count} 人");

            var tasks = new List<Task<CheckInResult>>();
            foreach (var (name, age, address) in elders)
            {
                tasks.Add(CheckInAsync(name, age, address));
            }

            var results = await Task.WhenAll(tasks);

            // 统计结果
            int successCount = 0;
            foreach (var result in results)
            {
                if (result.Success) successCount++;
                logBuilder.AppendLine(result.Message);
            }

            logBuilder.AppendLine(
                $"批量入住完成：成功 {successCount} 人，" +
                $"失败 {elders.Count - successCount} 人");
            logBuilder.AppendLine(
                $"当前床位使用：{AllocatedCount}/{_totalBeds}");

            Console.WriteLine(logBuilder.ToString());

            return new List<CheckInResult>(results);
        }

        /// <summary>
        /// 实现 IDisposable
        /// </summary>
        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                if (disposing)
                {
                    _serviceWindow?.Dispose();
                }
                _disposed = true;
            }
        }

        ~ElderCheckInService()
        {
            Dispose(false);
        }
    }

    /// <summary>
    /// 通知服务（事件订阅者）
    /// </summary>
    public class CheckInNotificationService
    {
        // 使用 Func 委托生成通知消息
        private readonly Func<ElderInfo, string> _messageGenerator;

        public CheckInNotificationService()
        {
            // Func<T, TResult> - 有返回值的委托
            _messageGenerator = elder =>
                $"[通知] {elder.Name}(年龄:{elder.Age}) " +
                $"已入住 {elder.BedNumber} 号床，" +
                $"家庭地址: {elder.HomeAddress}";
        }

        public void HandleCheckInCompleted(
            object sender, CheckInCompletedEventArgs e)
        {
            string message = _messageGenerator(e.Elder);
            Console.WriteLine(message);
        }
    }

    /// <summary>
    /// 实战演示入口
    /// </summary>
    public class CheckInDemo
    {
        public static async Task RunAsync()
        {
            Console.WriteLine("===== 养老院入住管理系统 =====\n");

            // 使用 using 确保服务被正确释放
            using (var service = new ElderCheckInService(totalBeds: 5, serviceWindows: 3))
            {
                // 订阅入住完成事件
                var notification = new CheckInNotificationService();
                service.SubscribeCheckInCompleted(notification.HandleCheckInCompleted);

                // 准备入住数据（演示值类型 Address）
                var elders = new List<(string Name, int Age, Address Address)>
                {
                    ("张大爷", 78, new Address
                        { Province = "北京市", City = "朝阳区", Detail = "望京街道1号" }),
                    ("李大妈", 82, new Address
                        { Province = "北京市", City = "海淀区", Detail = "中关村大街10号" }),
                    ("王大爷", 75, new Address
                        { Province = "河北省", City = "石家庄", Detail = "长安街88号" }),
                    ("赵奶奶", 80, new Address
                        { Province = "北京市", City = "西城区", Detail = "金融街20号" }),
                    ("孙爷爷", 85, new Address
                        { Province = "北京市", City = "东城区", Detail = "王府井大街5号" }),
                    // 第 6 个人将入住失败（只有 5 张床位）
                    ("周奶奶", 77, new Address
                        { Province = "天津市", City = "南开区", Detail = "鼓楼大街3号" }),
                };

                // 批量入住
                var results = await service.BatchCheckInAsync(elders);

                // 查询床位信息
                Console.WriteLine("\n===== 床位查询 =====");
                for (int i = 1; i <= 5; i++)
                {
                    var elder = service.GetElderByBed(i);
                    if (elder != null)
                    {
                        Console.WriteLine(
                            $"{i}号床: {elder.Name}, {elder.Age}岁, " +
                            $"来自{elder.HomeAddress}");
                    }
                }
            }
            // 离开 using 块后，ElderCheckInService.Dispose() 被自动调用

            Console.WriteLine("\n[系统] 服务已安全释放，所有资源已清理");
        }
    }
}
```

**运行结果说明**：
- 6 人申请入住，5 人成功，1 人因床位满而失败
- 每次入住成功后自动触发事件通知
- `SemaphoreSlim` 限制最多 3 个并发服务窗口
- `ConcurrentDictionary` 保证多线程安全地读写床位信息
- `using` 语句确保服务退出时释放信号量资源
- `StringBuilder` 用于拼接批量入住的日志

---

## 3. 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---|---|---|
| 1 | `GC.Collect();` 在生产代码中调用 | 让 GC 自动管理，信任其自适应算法 | 手动调用触发 STW 暂停，打乱 GC 自适应策略，可能导致更大的内存压力 |
| 2 | `ArrayList list = new ArrayList(); list.Add(42);` | `List<int> list = new List<int>(); list.Add(42);` | ArrayList 存储值类型会装箱拆箱，性能差且失去类型安全 |
| 3 | `string s = ""; for(...) { s += item; }` | `var sb = new StringBuilder(); for(...) { sb.Append(item); }` | string 拼接每次创建新对象，O(n²)时间复杂度；StringBuilder 是 O(n) |
| 4 | `async void DoWork() { ... }` | `async Task DoWork() { ... }` | async void 方法无法被 await，异常无法被上层捕获，会导致进程崩溃 |
| 5 | `lock(this)` 或 `lock(typeof(MyClass))` | `private readonly object _lock = new object(); lock(_lock)` | lock(this) 外部代码也可以 lock 同一对象，导致死锁；lock 类型对象更危险 |
| 6 | 实现了 IDisposable 但不用 using | `using (var resource = new XxxResource()) { }` | 不使用 using 可能忘记调用 Dispose，导致资源泄漏（连接池耗尽、文件锁定） |
| 7 | `new Thread(() => {...}).Start();` 做 I/O 操作 | `await DoWorkAsync();` | Thread 创建开销大（1MB 栈空间），I/O 操作应使用 async/await 释放线程 |
| 8 | 在 async 方法中使用 `.Result` 或 `.Wait()` | 使用 `await` 异步等待 | .Result 会阻塞当前线程，在 UI 线程或 ASP.NET 中可能导致死锁 |
| 9 | 没有泛型约束就使用泛型类型调用方法 | 添加 `where T : class` 或 `where T : IEntity` | 编译器无法确认 T 有特定成员，且可能在值类型上误用引用类型操作 |
| 10 | 在循环中反复通过反射获取 Type/PropertyInfo | 在类级别缓存 Type 和 PropertyInfo | 反射查找元数据开销大，循环中重复调用严重影响性能 |

---

## 4. 本章小结

本章深入讲解了 C# 的核心运行时机制，从垃圾回收的分代算法到异步编程的状态机原理，从线程安全的多种同步原语到委托事件的松耦合模式。这些知识不仅是面试的高频考点，更是写出高质量企业级代码的基础。理解这些原理，你将从「会用 C#」进阶为「理解 C#」，能够诊断生产环境中的性能问题、资源泄漏和并发 Bug。

| 知识点 | 核心概念 | 面试关键词 |
|---|---|---|
| GC 垃圾回收 | 分代回收 Gen0/Gen1/Gen2、STW、Finalize vs Dispose | 分代假说、终结器队列、确定性释放 |
| 值类型 vs 引用类型 | 栈 vs 堆、struct vs class、装箱拆箱 | 值语义、引用语义、内存布局 |
| async/await | 状态机、SynchronizationContext、ConfigureAwait | 编译器转换、上下文捕获、Task vs Thread |
| 线程安全 | lock/Monitor、SemaphoreSlim、ReaderWriterLockSlim、Interlocked | 临界区、原子操作、CAS |
| 委托与事件 | 多播委托、event 关键字、Action/Func/Predicate | 委托链、事件发布订阅 |
| IDisposable | Dispose 模式、using 编译展开、GC.SuppressFinalize | 非托管资源、确定性释放 |
| string 不可变性 | 字符串驻留池、StringBuilder | 不可变对象、内存分配 |
| 泛型与协变逆变 | 泛型约束、out 协变、in 逆变 | 类型安全、里氏替换原则 |
| 反射 | Type/PropertyInfo、Activator、性能优化 | 运行时类型信息、元数据 |

---

## 5. 面试题

### 面试题 1
**难度**：初级 | **类型**：概念题

**题目**：请解释 .NET 中 GC 的分代回收机制，为什么分为 Gen0、Gen1、Gen2 三代？

**参考答案**：
GC 分代回收基于「代龄假说」——大多数对象都是短命的。Gen0 存放新创建的对象，容量最小但回收频率最高，绝大多数对象在此代就被回收。Gen1 是缓冲区，存放从 Gen0 回收后存活的对象，防止刚创建的对象被误判为长期对象。Gen2 存放从 Gen1 回收后仍存活的长生命周期对象，回收代价最高因为需要遍历更多存活对象。分代的核心优势是：小对象频繁回收（Gen0 代价低），大对象少回收（减少全堆扫描），整体上提高了 GC 效率。如果不分代，每次 GC 都要扫描整个堆，性能会非常差。

---

### 面试题 2
**难度**：中级 | **类型**：概念题

**题目**：Finalize 和 Dispose 有什么区别？为什么建议实现 IDisposable 而不是只依赖 Finalize？

**参考答案**：
Finalize 是终结器（`~ClassName()`），由 GC 在回收对象时自动调用，但时机不确定，对象至少需要两轮 GC 才能被回收（第一轮放入终结器队列，第二轮才真正回收）。Dispose 是 `IDisposable` 接口的方法，由开发者显式调用，时机确定。只依赖 Finalize 的问题：1）资源释放时机不确定，可能导致连接池耗尽或文件锁定；2）有终结器的对象存活两轮 GC，增加内存压力；3）终结器线程是单线程，大量终结器会成为瓶颈。正确的做法是实现标准 Dispose 模式：`Dispose(bool disposing)` + `GC.SuppressFinalize(this)`，确保资源及时释放，同时避免终结器开销。

---

### 面试题 3
**难度**：中级 | **类型**：场景题

**题目**：你发现一个 ASP.NET Core 接口响应时间偶尔会飙到 5 秒以上，监控显示 GC 暂停时间较长，可能是什么原因？如何排查？

**参考答案**：
可能原因：1）大量临时大对象分配（LOH > 85KB），触发 Gen2 GC；2）代码中手动调用了 `GC.Collect()`；3）存在大量短生命周期对象持有长生命周期对象的引用，导致 Gen1/Gen2 对象无法回收。排查步骤：1）使用 `dotnet-counters` 监控 GC 指标（Gen0/1/2 次数、暂停时间）；2）使用 `dotnet-dump` 抓取内存快照，用 `gcroot` 分析对象引用链；3）检查代码中是否有 `GC.Collect()` 调用；4）使用 `ArrayPool` 或对象池减少大对象分配；5）检查是否有事件订阅未取消导致的内存泄漏。

---

### 面试题 4
**难度**：初级 | **类型**：概念题

**题目**：值类型和引用类型在内存分配上有什么区别？struct 和 class 应该怎么选择？

**参考答案**：
值类型（struct、enum、基本类型）直接存储数据，通常分配在栈上，赋值时进行值复制（深拷贝），修改副本不影响原件。引用类型（class、string、array）存储的是堆上对象的引用地址，赋值时复制引用（浅拷贝），两个变量指向同一对象。选择标准：struct 适合小型不可变数据（< 16 字节），如坐标、金额、ID，且不需要继承；class 适合复杂实体、需要继承、需要引用语义的场景。注意：struct 作为类的字段时跟随对象分配在堆上；struct 不能有无参构造函数（C# 10 之前）；struct 装箱后变为引用类型。

---

### 面试题 5
**难度**：高级 | **类型**：代码题

**题目**：请解释 async/await 编译后的状态机结构，并说明为什么在库代码中要使用 `ConfigureAwait(false)`。

**参考答案**：
编译器将 `async` 方法转换为一个状态机结构体（`IAsyncStateMachine`），包含：状态编号（State）、方法局部变量提升的字段、`AsyncTaskMethodBuilder`。每个 `await` 点将方法拆分为不同状态，执行到 `await` 时如果任务未完成，当前线程被释放。任务完成后通过 `SynchronizationContext` 或 `ThreadPool` 回调恢复执行。`ConfigureAwait(false)` 的作用是告诉编译器「不需要回到原始同步上下文」，在库代码中必须使用的原因是：1）库代码不需要访问 UI 控件或 HTTP 上下文；2）避免不必要的上下文捕获和切换开销；3）避免死锁风险（在 ASP.NET 旧版框架中尤其重要）。ASP.NET Core 没有 SynchronizationContext，所以这个影响较小，但作为库代码的最佳实践仍然推荐使用。

---

### 面试题 6
**难度**：中级 | **类型**：场景题

**题目**：多个线程同时读写一个 Dictionary，会出现什么问题？有哪些线程安全的替代方案？

**参考答案**：
`Dictionary<TKey, TValue>` 不是线程安全的，多线程并发读写可能导致：1）数据损坏（内部数组扩容时并发读取可能读到脏数据）；2）无限循环（哈希冲突链表被并发修改）；3）`KeyNotFoundException`（并发写入导致索引不一致）。替代方案：1）`ConcurrentDictionary`——最常用的线程安全字典，支持并发读写；2）`lock` + 普通 Dictionary——简单但性能较低（完全串行化）；3）`ReaderWriterLockSlim` + 普通 Dictionary——读多写少场景，允许多线程并发读取；4）不可变字典 `ImmutableDictionary`——每次修改返回新实例，适合低写入场景。选择取决于读写比例和性能要求。

---

### 面试题 7
**难度**：中级 | **类型**：概念题

**题目**：lock 的本质是什么？`lock(this)` 有什么问题？

**参考答案**：
`lock` 是 C# 语法糖，编译后展开为 `Monitor.Enter` + `try/finally` + `Monitor.Exit`。Monitor 是基于对象头的同步原语，通过操作对象的同步块索引实现线程互斥。`lock(this)` 的问题：1）任何外部代码都可以 `lock` 同一个对象实例，导致意外的锁竞争甚至死锁；2）如果类是 public 的，多个不相关的模块可能共用同一把锁；3）`this` 可能被公开引用，增加了死锁风险。正确做法是声明一个 `private readonly object _lock = new object();` 作为专用锁对象，确保锁的作用域最小化。另外要注意 `lock(typeof(MyClass))` 更危险，因为 `typeof` 返回的 Type 对象在整个 AppDomain 中只有一个实例。

---

### 面试题 8
**难度**：高级 | **类型**：设计题

**题目**：在高并发场景下，如何设计一个线程安全的库存扣减系统？（类似养老院床位分配）

**参考答案**：
设计要点：1）使用 `Interlocked.CompareExchange` 实现无锁 CAS 操作，适用于简单计数器场景；2）对于复合操作（如检查库存+扣减+记录日志），使用 `lock` 保护临界区；3）使用 `SemaphoreSlim` 限制并发数，防止数据库连接池耗尽；4）使用 `ConcurrentQueue` 管理可用资源（如床位编号队列）；5）使用乐观并发控制（版本号/时间戳），在数据库层面防止超卖。具体实现：先用 `Interlocked` 做快速预检，再用 `lock` 做精确扣减，结合数据库事务保证一致性。避免直接用 `lock(this)` 或锁对象对外暴露。对于极高并发，考虑 Redis 分布式锁或数据库行级锁。

---

### 面试题 9
**难度**：初级 | **类型**：概念题

**题目**：什么是装箱和拆箱？为什么要避免不必要的装箱拆箱？

**参考答案**：
装箱是将值类型转换为引用类型的过程：在堆上分配内存，将栈上的值复制过去，返回引用地址。拆箱是反向操作：从堆上的对象中提取值类型数据，进行类型检查后复制到栈上。需要避免的原因：1）性能开销——装箱涉及内存分配和数据复制，拆箱涉及类型检查；2）GC 压力——装箱产生的临时对象增加 GC 负担；3）类型安全——拆箱时类型不匹配会抛出 InvalidCastException。避免方式：使用泛型集合（`List<int>` 代替 `ArrayList`）、泛型方法、`Nullable<T>` 处理可空值类型。在高性能场景下，装箱拆箱的累积影响可能非常显著。

---

### 面试题 10
**难度**：高级 | **类型**：代码题

**题目**：请实现一个标准的 Dispose 模式，并解释每个部分的作用。

**参考答案**：
标准 Dispose 模式包含以下部分：1）`IDisposable.Dispose()` 方法——公开入口，调用 `Dispose(true)` 并调用 `GC.SuppressFinalize(this)` 阻止终结器执行；2）`Dispose(bool disposing)` 核心方法——当 `disposing=true` 时表示从 Dispose 调用，可释放托管和非托管资源，当 `disposing=false` 时表示从终结器调用，只能释放非托管资源（因为托管对象可能已被 GC 回收）；3）终结器 `~ClassName()`——安全网，调用 `Dispose(false)`，防止忘记调用 Dispose；4）`_disposed` 标志——防止重复释放；5）`protected virtual`——允许子类重写释放逻辑。关键点：`GC.SuppressFinalize` 让对象跳过终结器队列，避免两轮 GC 才能回收的开销。

---

### 面试题 11
**难度**：中级 | **类型**：概念题

**题目**：协变（out）和逆变（in）是什么？请举例说明它们的使用场景。

**参考答案**：
协变（out）允许将泛型类型的子类型赋值给父类型变量，用于只读场景（返回值）。例如 `IEnumerable<string>` 可以赋值给 `IEnumerable<object>`，因为 string 是 object 的子类型，且 IEnumerable 只产出（out）T 类型的数据。逆变（in）允许将泛型类型的父类型赋值给子类型变量，用于只写场景（参数）。例如 `Action<object>` 可以赋值给 `Action<string>`，因为 Action 只消费（in）T 类型的数据，能处理 object 的方法自然能处理 string。使用场景：协变用于接口的只读操作（`IEnumerable<out T>`、`IReadOnlyList<out T>`），逆变用于接口的只写操作（`IComparer<in T>`、`Action<in T>`）。关键字：`out` 只能用在返回值位置，`in` 只能用在参数位置。

---

### 面试题 12
**难度**：高级 | **类型**：场景题

**题目**：ASP.NET Core 应用中大量使用反射进行依赖注入和服务注册，这会影响性能吗？如何优化？

**参考答案**：
反射确实有性能开销（比直接调用慢 10-100 倍），但在 ASP.NET Core 的 DI 容器中影响有限，原因：1）反射主要发生在启动时的服务注册阶段，不在请求热路径上；2）框架内部已做了大量缓存（缓存 Type、PropertyInfo、构造函数信息）；3）ASP.NET Core 的 DI 容器使用编译表达式树（Expression Tree）优化了对象创建。优化策略：1）避免在循环或高频调用中使用反射获取类型信息；2）使用 `ActivatorUtilities.CreateInstance` 代替 `Activator.CreateInstance`；3）对于热路径，使用 `Delegate.CreateDelegate` 或 Expression Tree 将反射调用编译为强类型委托；4）考虑使用源代码生成器（Source Generator，C# 9+）在编译时生成 DI 代码，完全消除运行时反射开销。ABP 框架使用 Castle DynamicProxy 和缓存策略来最小化反射影响。

---

### 面试题 13
**难度**：中级 | **类型**：概念题

**题目**：Task、Thread、ThreadPool 有什么区别？在什么场景下选择哪个？

**参考答案**：
Thread 是操作系统级线程，每个 Thread 约占 1MB 栈空间，创建销毁开销大，适合需要长期运行或需要精确控制线程属性（优先级、ApartmentState）的场景。ThreadPool 是线程池，复用已创建的线程，避免频繁创建销毁的开销，适合短时 CPU 密集型操作，但不保证执行顺序。Task 是最高级的抽象，底层默认使用 ThreadPool，支持返回值（`Task<T>`）、组合（`WhenAll/WhenAny`）、取消（`CancellationToken`）、异常传播。**选择原则**：优先使用 Task；I/O 密集型操作使用 async/await；CPU 密集型操作使用 `Task.Run`；只有需要精确控制线程行为时才直接使用 Thread。在 ASP.NET Core 中几乎不需要直接操作 Thread。

---

### 面试题 14
**难度**：初级 | **类型**：概念题

**题目**：string 为什么是不可变的？这有什么好处？

**参考答案**：
string 的不可变性是指一旦创建，其内容不能被修改。任何「修改」操作（拼接、替换）都会创建新的字符串对象。设计为不可变的原因和好处：1）**线程安全**——不可变对象天然线程安全，无需加锁即可在多线程间共享；2）**哈希值稳定**——string 可以安全地作为 Dictionary 的 key，因为哈希值不会改变；3）**字符串驻留池**——相同内容的字符串字面量可以共享同一个对象，节省内存；4）**安全性**——在文件路径、数据库连接串等场景中，不可变性防止意外修改。坏处是频繁拼接时性能差（每次创建新对象），此时应使用 `StringBuilder`。

---

## 6. 下一章预告

> **第 02 章：ASP.NET Core 核心原理**
>
> 本章我们学习了 C# 语言的运行时机制，下一章我们将进入框架层面：
> - 依赖注入原理（Singleton/Scoped/Transient 生命周期区别、Captive Dependency 陷阱）
> - 中间件管道（请求从进入到响应的完整流程、自定义中间件编写）
> - Filter 过滤器（五种 Filter 执行顺序 — 面试常问）
> - CORS 跨域配置与 Kestrel 服务器

---

## 时效性声明

| 项目 | 说明 |
|---|---|
| 目标框架 | .NET 5.0（LTS 版本已于 2022 年 5 月结束支持） |
| C# 版本 | C# 9.0（不使用 C# 10+ 特性） |
| 不使用的特性 | record、init-only setter、primary constructor、raw string literal、file-scoped namespace |
| 升级建议 | 如果使用 .NET 6+，可考虑使用 record 简化 DTO、file-scoped namespace 减少缩进 |
| GC 机制 | 本章内容适用于 .NET Framework 4.x 和 .NET 5/6/7/8+，核心原理不变 |
| async/await | 状态机原理在所有版本中一致，但 .NET 6+ 引入了 ValueTask 优化 |
| 线程安全 | 本章介绍的同步原语在所有 .NET 版本中通用 |
| 面试参考 | 本章面试题适用于 2024-2026 年的 C#/.NET 中高级面试 |

> ⚠️ **特别提醒**：本文档中的代码严格遵守 C# 9 语法规范。如果你在更高版本的 C# 中看到可以简化的写法（如 `record` 替代 `class`、`file-scoped namespace` 替代花括号），请理解这是有意为之，以便课程在 .NET 5.0 环境下编译通过。

---

## 修订记录

| 日期 | 修订内容 |
|------|---------|
| 2026-07-10 | 修正「下一章预告」：第 02 章为「ASP.NET Core 核心原理」 |
| 2026-07-10 | 修复错字：「圇面」→「场景」 |
| 2026-07-10 | 数据库示例统一改为 MySQL/Pomelo（MySqlConnection 替代 SqlConnection） |
| 2026-07-10 | 修正 ConfigureAwait 表述：ASP.NET Core 应用代码可用可不用（无 SynchronizationContext） |
| 2026-07-10 | 修正 ReflectionDemo：方式二改为未缓存反射（每次 GetProperty），方式三改为缓存反射 |
| 2026-07-10 | 性能倍数补充「视运行环境而定」说明 |
| 2026-07-10 | BedManager 消息改为直接插值 `$"目前 {_totalBeds} 张床位已满"` |
| 2026-07-10 | GC.SuppressFinalize 描述修正：跳过终结器队列，按正常分代回收 |
| 2026-07-10 | Task.WhenAll 后改用 `await` 取值，避免 `.Result` 同步阻塞 |
