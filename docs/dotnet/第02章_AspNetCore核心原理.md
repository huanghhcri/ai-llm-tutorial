# 第 02 章：ASP.NET Core 核心原理

## 学习目标

完成本章学习后，你将能够：

1. **理解依赖注入三种生命周期**（Singleton / Scoped / Transient）的区别，并能为养老院系统中的服务正确选择生命周期
2. **解释 Captive Dependency 陷阱**的成因，能画出 Scoped 服务被 Singleton 持有时的内存示意图
3. **描述 ASP.NET Core 请求管道的完整流程**，从 Kestrel 接收到 HTTP 响应返回的每一步
4. **编写自定义中间件**，实现请求耗时统计、异常拦截等常见功能
5. **区分五种 Filter 的执行顺序**，并能手绘完整的 Filter 管道流程图
6. **正确配置 CORS 跨域策略**，理解预检请求机制，避免生产环境安全风险
7. **对比 Kestrel 与 IIS 的差异**，理解反向代理部署架构的设计原因
8. **回答 12 道以上 ASP.NET Core 核心原理面试题**，涵盖概念题、场景题和代码题

## 前置知识

- 已完成第 01 章学习，了解 C# 运行时原理（GC、async/await 状态机、线程安全）
- 熟悉 C# 基础语法（类、接口、委托、泛型）
- 有基本的 ASP.NET Core Controller 编写经验
- 了解 HTTP 协议基础（GET/POST 请求、状态码）

---

## 为什么需要学这个？

假设你正在开发养老院管理系统的后端服务。某天，线上突然报了一个诡异的 Bug：**长者健康数据偶尔会串到其他长者的记录里**。排查了半天，发现是某个同事把 DbContext 注册成了 Singleton，所有请求共享同一个 DbContext 实例，导致并发时数据污染。

再比如，前端同事调用你的接口时，浏览器疯狂报 CORS 错误，明明 localhost:3000 和 localhost:5000 都是本地，为什么跨域了？你写了 `[EnableCors]` 却不生效，因为中间件配置顺序不对。

又或者，面试官问你：「Filter 的五种类型执行顺序是什么？如果 ActionFilter 和 ExceptionFilter 同时抛出异常，哪个会捕获？」你愣住了。

这些问题的根源都在于**不理解 ASP.NET Core 的核心原理**。本章将从依赖注入、中间件管道、Filter 过滤器、CORS 跨域到 Kestrel 服务器，逐一拆解这些核心机制。掌握了它们，你不仅能写出更健壮的代码，还能在面试中游刃有余。

---

## 1. 章节内容

### 1.1 依赖注入原理（面试必问）

#### 生活类比：养老院的「物资调度中心」

想象养老院有一个**物资调度中心**。护理员需要轮椅时，不需要自己去买轮椅、找供应商、谈价格——他们只需要向调度中心提出需求，调度中心负责采购、分配、回收。

- **Singleton（单例）**：调度中心只有**一辆救护车**，所有人共享，用完归还。适合全局唯一的资源。
- **Scoped（作用域）**：每位**入住长者**有一个专属护理档案，该长者入住期间有效，退房后销毁。每个 HTTP 请求就是一个「入住期间」。
- **Transient（瞬时）**：护理员每次需要**一次性手套**时，都领取一双新的，用完即丢。适合无状态、轻量级的服务。

#### 什么是依赖注入

**不用 DI 的写法**（手动 new，耦合严重）：

```csharp
namespace NursingHome.Services
{
    // 问题：ServiceA 直接依赖 ServiceB 的具体实现
    // 如果要替换实现（比如测试时用 Mock），必须改代码
    public class ElderService
    {
        // 直接 new 具体类，无法替换，无法测试
        private readonly NursingHomeDbContext _context = new NursingHomeDbContext();

        public void AddElder(string name)
        {
            // 直接操作具体实例
            _context.Elders.Add(new Elder { Name = name });
            _context.SaveChanges();
        }
    }
}
```

**用 DI 的写法**（面向接口编程，松耦合）：

```csharp
namespace NursingHome.Services
{
    // 定义接口——契约
    public interface IElderService
    {
        void AddElder(string name);
        System.Collections.Generic.List<Elder> GetAllElders();
    }

    // 具体实现
    public class ElderService : IElderService
    {
        private readonly NursingHomeDbContext _context; // 通过构造函数注入

        // 构造函数注入：框架自动注入 DbContext
        public ElderService(NursingHomeDbContext context)
        {
            _context = context;
        }

        public void AddElder(string name)
        {
            _context.Elders.Add(new Elder { Name = name });
            _context.SaveChanges();
        }

        public System.Collections.Generic.List<Elder> GetAllElders()
        {
            return _context.Elders.ToList();
        }
    }
}
```

#### Singleton / Scoped / Transient 三种生命周期详解

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用程序生命周期                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Singleton：应用程序启动时创建，全局唯一实例，直到应用关闭    │  │
│  │  [Instance-1] ◄──── 所有请求共享同一个实例 ────►           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────── 请求A ─────────────┐                            │
│  │  Scoped：每个请求一个新实例       │                            │
│  │  [Scoped-Instance-A]            │                            │
│  │  请求结束时销毁                   │                            │
│  └─────────────────────────────────┘                            │
│  ┌───────────── 请求B ─────────────┐                            │
│  │  Scoped：新请求创建新实例         │                            │
│  │  [Scoped-Instance-B]            │                            │
│  │  与请求A的实例互不影响            │                            │
│  └─────────────────────────────────┘                            │
│                                                                 │
│  ┌───────────── 任意请求 ──────────┐                            │
│  │  Transient：每次注入都创建新实例   │                            │
│  │  [Transient-1] [Transient-2]... │                            │
│  │  同一个请求内多次注入也是不同实例   │                            │
│  └─────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

```csharp
namespace NursingHome.Services
{
    /// <summary>
    /// 长者档案服务——Singleton
    /// 适合场景：全局缓存、配置管理、不依赖 Scoped 资源的服务
    /// </summary>
    public class ElderCacheService
    {
        // 缓存长者总数，全局共享
        private int _elderCount;

        public int GetCachedCount() => _elderCount;

        public void RefreshCache(int count)
        {
            _elderCount = count;
        }
    }

    /// <summary>
    /// 入住评估服务——Scoped
    /// 适合场景：依赖 DbContext 的业务服务（DbContext 本身是 Scoped）
    /// </summary>
    public class AssessmentService
    {
        private readonly NursingHomeDbContext _context;

        public AssessmentService(NursingHomeDbContext context)
        {
            _context = context;
        }

        public void CreateAssessment(int elderId, string result)
        {
            // 在同一请求内，DbContext 是同一个实例
            // 保证了同一请求内的数据库操作共享同一个事务
            _context.Assessments.Add(new Assessment
            {
                ElderId = elderId,     // 长者ID
                Result = result,       // 评估结果
                CreatedAt = System.DateTime.Now // 创建时间
            });
            _context.SaveChanges();
        }
    }

    /// <summary>
    /// 短信发送服务——Transient
    /// 适合场景：无状态、轻量级、每次调用可能需要不同参数的服务
    /// </summary>
    public class SmsService
    {
        public bool Send(string phone, string message)
        {
            // 模拟发送短信
            System.Console.WriteLine($"发送短信到 {phone}：{message}");
            return true;
        }
    }
}
```

#### Scoped 注入到 Singleton 的陷阱（Captive Dependency）

这是**经典面试题**。当 Scoped 服务被 Singleton 服务依赖时，会发生什么？

```csharp
namespace NursingHome.Services
{
    /// <summary>
    /// 错误示例：Singleton 服务依赖了 Scoped 的 DbContext
    /// 这会导致 DbContext 被"捕获"在 Singleton 中，永远不释放
    /// </summary>
    public class WrongElderReportService // Singleton
    {
        private readonly NursingHomeDbContext _context;

        // 构造函数注入——框架在应用启动时调用一次
        // 此时创建了一个 DbContext 实例，这个实例永远不被销毁
        public WrongElderReportService(NursingHomeDbContext context)
        {
            _context = context; // DbContext 被"囚禁"在 Singleton 中
        }

        public int GetElderCount()
        {
            // 问题：_context 是应用启动时创建的
            // 1. 数据可能过期（连接了旧的数据库连接）
            // 2. 并发请求共享同一个 DbContext，导致数据污染
            // 3. DbContext 内部的 ChangeTracker 状态混乱
            return _context.Elders.Count();
        }
    }
}
```

**内存图示**：

```
┌──────────────────────────────────────────────────────┐
│ 应用启动                                              │
│                                                      │
│  Singleton: WrongElderReportService                  │
│      └── 持有 DbContext 实例（本应是 Scoped）          │
│          ├── 连接字符串 = "Server=..."                │
│          ├── ChangeTracker = {}                      │
│          └── 生命周期 = 应用关闭时才释放 ❌            │
│                                                      │
│  请求1进入 ──► 使用同一个 DbContext 实例              │
│  请求2进入 ──► 使用同一个 DbContext 实例  ← 并发冲突! │
│  请求3进入 ──► 使用同一个 DbContext 实例  ← 数据污染! │
└──────────────────────────────────────────────────────┘
```

**正确做法**：

```csharp
namespace NursingHome.Services
{
    /// <summary>
    /// 正确示例：通过 IServiceScopeFactory 创建作用域
    /// </summary>
    public class CorrectElderReportService // Singleton
    {
        private readonly IServiceScopeFactory _scopeFactory;

        // 注入工厂，而不是直接注入 DbContext
        public CorrectElderReportService(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        public int GetElderCount()
        {
            // 每次调用时创建一个新的 Scope
            using (var scope = _scopeFactory.CreateScope())
            {
                // 在新 Scope 中获取 DbContext（Scoped 生命周期）
                var context = scope.ServiceProvider
                    .GetRequiredService<NursingHomeDbContext>();
                return context.Elders.Count();
            }
            // scope 释放时，DbContext 也被正确释放
        }
    }
}
```

#### Autofac vs ASP.NET Core 默认 DI 容器的区别

| 特性 | ASP.NET Core 默认容器 | Autofac |
|------|----------------------|---------|
| 属性注入 | ❌ 不支持 | ✅ 支持 |
| 批量注册 | ❌ 需手动逐个注册 | ✅ 支持程序集扫描 |
| 拦截器（AOP） | ❌ 不支持 | ✅ 支持 |
| 生命周期事件 | 基础支持 | ✅ 丰富的生命周期回调 |
| 注册方式 | `services.AddScoped<T>()` | `builder.RegisterType<T>()` |
| 学习成本 | 低 | 中等 |
| 性能 | 较高（内置优化） | 略低（功能更丰富） |

**Autofac 批量注册示例**（养老院系统）：

```csharp
// 在 Program.cs 或 Module 中配置
// 安装 NuGet 包：Autofac + Autofac.Extensions.DependencyInjection

using Autofac;

namespace NursingHome
{
    public class NursingHomeModule : Module
    {
        protected override void Load(ContainerBuilder builder)
        {
            // 批量注册：自动扫描程序集中所有以 Service 结尾的类
            builder.RegisterAssemblyTypes(typeof(NursingHomeModule).Assembly)
                .Where(t => t.Name.EndsWith("Service")) // 匹配所有 *Service 类
                .AsImplementedInterfaces()               // 注册为其实现的接口
                .InstancePerLifetimeScope();              // 等价于 Scoped

            // 属性注入示例：某些老旧代码可能需要属性注入
            builder.RegisterType<NursingHomeDbContext>()
                .InstancePerLifetimeScope()
                .PropertiesAutowired(); // 启用属性注入
        }
    }
}
```

#### 代码示例：养老院服务注册

```csharp
// Startup.cs —— 注册养老院系统的各种服务
namespace NursingHome
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            // ========================================
            // 1. 数据库上下文 —— Scoped（每个请求一个实例）
            // ========================================
            services.AddDbContext<NursingHomeDbContext>(options =>
                options.UseMySql(
                    "Server=localhost;Database=NursingHome;Uid=root;Pwd=your_password;",
                    ServerVersion.AutoDetect("Server=localhost;Database=NursingHome;Uid=root;Pwd=your_password;")
                ));

            // ========================================
            // 2. 业务服务 —— Scoped（依赖 DbContext）
            // ========================================
            services.AddScoped<IElderService, ElderService>();           // 长者服务
            services.AddScoped<IRoomService, RoomService>();             // 房间服务
            services.AddScoped<IAssessmentService, AssessmentService>(); // 评估服务

            // ========================================
            // 3. 缓存服务 —— Singleton（全局唯一，无状态依赖）
            // ========================================
            services.AddSingleton<ICacheService, RedisCacheService>();   // 缓存服务
            services.AddSingleton<IConfigService, ConfigService>();       // 配置服务

            // ========================================
            // 4. 工具类 —— Transient（轻量无状态）
            // ========================================
            services.AddTransient<ISmsService, SmsService>();             // 短信服务
            services.AddTransient<IEmailService, EmailService>();         // 邮件服务
            services.AddTransient<IPdfGenerator, PdfGenerator>();         // PDF生成

            services.AddControllers();
        }
    }
}
```

---

### 1.2 中间件管道（核心原理）

#### 生活类比：养老院的「访客登记流程」

想象一个访客来养老院探望老人，必须经过以下流程：

```
门卫（检查身份证）
    ↓
前台（登记来访信息、领取访客证）
    ↓
楼层管理员（确认探望对象、引导路线）
    ↓
房间门口（核实房间号、敲门）
    ↓
进入房间（与老人见面）—— 这就是"终端"，请求到达目的地
```

中间件管道就是这个流程的程序化版本：每个中间件像一个「关卡」，决定是**放行到下一个关卡**、**自己处理后返回**、还是**分流到其他通道**。

#### 请求从 Kestrel 接收到响应返回的完整流程

```
┌─────────┐    HTTP请求    ┌──────────┐
│ 浏览器   │ ───────────► │ Kestrel  │  ← ASP.NET Core 内置的 Web 服务器
└─────────┘               └────┬─────┘
                               │
                    ┌──────────▼──────────┐
                    │  中间件管道开始       │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ 1.异常处理中间件│  │  ← 最外层，捕获所有异常
                    │  │   (UseExceptionHandler)  │
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  ┌────────────────┐  │
                    │  │ 2.HSTS中间件    │  │  ← 强制 HTTPS
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  ┌────────────────┐  │
                    │  │ 3.静态文件中间件│  │  ← 如果是静态文件，直接返回
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  ┌────────────────┐  │
                    │  │ 4.CORS中间件    │  │  ← 处理跨域
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  ┌────────────────┐  │
                    │  │ 5.认证中间件    │  │  ← 身份验证
                    │  │   (UseAuthentication)  │
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  ┌────────────────┐  │
                    │  │ 6.授权中间件    │  │  ← 权限检查
                    │  │   (UseAuthorization)   │
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  ┌────────────────┐  │
                    │  │ 7.终结点中间件  │  │  ← 路由到 Controller
                    │  │   (UseEndpoints)       │
                    │  └───────┬────────┘  │
                    │          ▼            │
                    │  中间件管道结束       │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Controller 处理    │
                    │   → Filter 管道      │
                    │   → 返回 Response    │
                    └──────────┬───────────┘
                               │
                         ┌─────▼─────┐
                         │  响应返回  │
                         │  给客户端  │
                         └───────────┘
```

#### Use / Map / Run 三者区别

```csharp
namespace NursingHome
{
    public class Startup
    {
        public void Configure(IApplicationBuilder app)
        {
            // ========================================
            // Use：传递管道，可以继续执行后续中间件
            // 类比：前台登记后，放行到下一个关卡
            // ========================================
            app.Use(async (context, next) =>
            {
                System.Console.WriteLine("[Use] 请求进入 - 记录日志");
                await next(); // 调用下一个中间件
                System.Console.WriteLine("[Use] 响应返回 - 记录耗时");
            });

            // ========================================
            // Map：根据路径分支，进入不同的处理管道
            // 类比：访客根据探望目的走不同的通道
            // ========================================
            app.Map("/api/admin", adminApp =>
            {
                // 当请求路径以 /api/admin 开头时，进入这个分支
                adminApp.Run(async context =>
                {
                    await context.Response.WriteAsync("管理员专用通道");
                });
            });

            app.Map("/api/elder", elderApp =>
            {
                // 当请求路径以 /api/elder 开头时，进入这个分支
                elderApp.Run(async context =>
                {
                    await context.Response.WriteAsync("长者服务通道");
                });
            });

            // ========================================
            // Run：终止管道，不再传递
            // 类比：终端关卡，处理后直接返回
            // ========================================
            app.Run(async context =>
            {
                // 这是管道的终点，所有未匹配的请求都会到这里
                await context.Response.WriteAsync("养老院系统 - 默认响应");
            });
        }
    }
}
```

**三者的本质区别**：

| 方法 | 是否传递 | 作用 | 类比 |
|------|---------|------|------|
| `Use` | ✅ 调用 `next()` 后继续 | 日志、鉴权等前置/后置处理 | 前台登记后放行 |
| `Map` | 分支到子管道 | 路径分流 | 不同目的走不同通道 |
| `Run` | ❌ 终止管道 | 终端处理 | 最后一个关卡 |

#### 自定义中间件：请求耗时统计

```csharp
namespace NursingHome.Middleware
{
    /// <summary>
    /// 请求耗时统计中间件
    /// 记录每个请求的处理时间，用于性能监控
    /// </summary>
    public class ElapsedTimeMiddleware
    {
        private readonly RequestDelegate _next; // 下一个中间件

        // 构造函数注入下一个中间件
        public ElapsedTimeMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        // 每个请求都会调用此方法
        public async Task InvokeAsync(HttpContext context)
        {
            // 1. 请求进入时：记录开始时间
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var startTime = System.DateTime.Now;

            // 2. 调用下一个中间件（继续管道）
            try
            {
                await _next(context);
            }
            finally
            {
                // 3. 响应返回时：计算耗时
                stopwatch.Stop();
                var elapsed = stopwatch.ElapsedMilliseconds;

                // 4. 将耗时添加到响应头（先检查响应是否已开始发送）
                if (!context.Response.HasStarted)
                {
                    context.Response.Headers["X-Elapsed-Time"] = $"{elapsed}ms";
                }

                // 5. 输出日志
                System.Console.WriteLine(
                    $"[养老院系统] {context.Request.Method} " +
                    $"{context.Request.Path} " +
                    $"状态码:{context.StatusCode} " +
                    $"耗时:{elapsed}ms");
            }
        }
    }

    /// <summary>
    /// 中间件扩展方法（约定写法）
    /// </summary>
    public static class ElapsedTimeMiddlewareExtensions
    {
        public static IApplicationBuilder UseElapsedTime(
            this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<ElapsedTimeMiddleware>();
        }
    }
}
```

#### 中间件 vs Filter 的区别（面试常问）

| 对比维度 | 中间件（Middleware） | 过滤器（Filter） |
|---------|---------------------|-----------------|
| **作用范围** | 整个应用（全局） | 仅限 MVC/WebAPI 管道 |
| **执行时机** | 在路由之前 | 在路由之后 |
| **是否知道目标** | 不知道请求会到哪个 Controller | 知道具体的 Controller/Action |
| **典型用途** | 日志、CORS、认证、静态文件 | 参数验证、操作日志、异常处理 |
| **注册方式** | `app.Use...()` 在 Startup.Configure | `[Attribute]` 或全局注册 |
| **类比** | 门卫、前台（不知道访客找谁） | 楼层管理员（知道具体找哪个房间） |

**关键理解**：中间件是外层的「通用关卡」，Filter 是内层的「业务关卡」。请求先经过中间件管道，匹配到路由后，再进入 Filter 管道。

#### 完整的 Startup.cs 中间件配置顺序

```csharp
namespace NursingHome
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllers();
            // 注册其他服务...
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // ========================================
            // 第1步：异常处理（最外层，捕获所有后续中间件的异常）
            // ========================================
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage(); // 开发环境：显示详细错误页
            }
            else
            {
                app.UseExceptionHandler("/Error"); // 生产环境：跳转到错误页
            }

            // ========================================
            // 第2步：HSTS（强制 HTTPS）
            // ========================================
            app.UseHsts();

            // ========================================
            // 第3步：自定义中间件 - 耗时统计
            // ========================================
            app.UseElapsedTime();

            // ========================================
            // 第4步：静态文件（CSS/JS/图片，直接返回不进管道）
            // ========================================
            app.UseStaticFiles();

            // ========================================
            // 第5步：路由（解析路径，但不执行终结点）
            // ========================================
            app.UseRouting();

            // ========================================
            // 第6步：CORS（必须在 UseRouting 之后，UseAuthorization 之前）
            // ========================================
            app.UseCors("NursingHomePolicy");

            // ========================================
            // 第7步：认证（识别用户身份）
            // ========================================
            app.UseAuthentication();

            // ========================================
            // 第8步：授权（检查用户权限）
            // ========================================
            app.UseAuthorization();

            // ========================================
            // 第9步：终结点（路由到 Controller）
            // ========================================
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
            });
        }
    }
}
```

---

### 1.3 Filter 过滤器（面试常问，重点）

#### 生活类比：长者入住的「审批流程」

一位长者要入住养老院，需要经过以下流程：

```
1. 资质审查（AuthorizationFilter）
   → 检查是否有医保、家属签字、是否有名额
   → 不通过直接拒绝

2. 入住评估（ResourceFilter）
   → 评估长者身体状况、护理需求
   → 决定分配什么级别的房间

3. 分配房间（ActionFilter → OnActionExecuting）
   → 根据评估结果，找到合适的房间
   → 准备入住手续

4. 正式入住（Action 执行）
   → 长者搬入房间，开始生活

5. 记录档案（ActionFilter → OnActionExecuted）
   → 入住完成后，记录档案
   → 更新床位信息

6. 异常处理（ExceptionFilter）
   → 如果入住过程中出现异常（如健康突发状况）
   → 紧急处理，不会影响其他长者

7. 回访反馈（ResultFilter）
   → 入住后的满意度调查
   → 格式化入住报告
```

#### 五种 Filter 详解及执行顺序

##### 执行顺序流程图

```
                          HTTP 请求进入
                               │
              ┌────────────────▼────────────────┐
              │       AuthorizationFilter        │
              │    OnAuthorization               │
              │    (权限验证：有token吗？有权限吗？)│
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         ResourceFilter           │
              │    OnResourceExecuting           │
              │    (资源准备：检查缓存、准备资源)   │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         ActionFilter             │
              │    OnActionExecuting             │
              │    (参数验证、日志记录)            │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │      Action 方法执行              │
              │    Controller.XXX()              │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         ActionFilter             │
              │    OnActionExecuted              │
              │    (操作日志、性能统计)            │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │        ExceptionFilter           │
              │    OnException                   │
              │    (如果上面任何步骤抛异常，在这里捕获)│
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         ResultFilter             │
              │    OnResultExecuting             │
              │    (结果格式化、包装响应)          │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         ResultFilter             │
              │    OnResultExecuted              │
              │    (响应写入后的清理工作)          │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         ResourceFilter           │
              │    OnResourceExecuted            │
              │    (资源释放、缓存更新)           │
              └────────────────┬────────────────┘
                               │
                          HTTP 响应返回

注意：ExceptionFilter 虽然画在中间，但它能捕获从
OnResourceExecuting 到 OnResultExecuting 之间的任何异常。
**重要：ExceptionFilter 仅在存在未处理异常时才会触发**，
如果所有代码正常执行没有抛出异常，ExceptionFilter 的 OnException 不会被调用。
```

**记忆口诀**：**A-R-A-E-R**（Auth → Resource → Action → Exception → Result）

##### 详细代码示例

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System;
using System.Diagnostics;

namespace NursingHome.Filters
{
    // ========================================
    // 1. AuthorizationFilter —— 权限验证（最先执行）
    // ========================================
    /// <summary>
    /// 养老院操作权限验证过滤器
    /// 检查用户是否有权限执行当前操作
    /// </summary>
    public class NursingHomeAuthFilter : IAuthorizationFilter
    {
        public void OnAuthorization(AuthorizationFilterContext context)
        {
            // 检查请求头中是否有 Token
            var token = context.HttpContext.Request.Headers["Authorization"]
                .ToString();

            if (string.IsNullOrEmpty(token))
            {
                // 没有 Token，直接返回 401，后续 Filter 不再执行
                context.Result = new UnauthorizedObjectResult(new
                {
                    Code = 401,
                    Message = "未提供认证令牌，无法访问养老院系统"
                });
                return;
            }

            // 模拟验证 Token
            if (!token.StartsWith("Bearer "))
            {
                context.Result = new UnauthorizedObjectResult(new
                {
                    Code = 401,
                    Message = "令牌格式错误"
                });
                return;
            }

            // 验证通过，继续执行后续 Filter
            Debug.WriteLine("[AuthFilter] 权限验证通过");
        }
    }

    // ========================================
    // 2. ResourceFilter —— 资源缓存（在 ActionFilter 之前）
    // ========================================
    /// <summary>
    /// 养老院数据缓存过滤器
    /// 在请求到达 Action 之前检查缓存
    /// </summary>
    public class ElderCacheFilter : IResourceFilter
    {
        // 请求进入时：检查缓存
        public void OnResourceExecuting(ResourceExecutingContext context)
        {
            var cacheKey = context.HttpContext.Request.Path.ToString();

            // 模拟：如果缓存中已有数据，直接返回
            if (cacheKey.Contains("/api/elder/list"))
            {
                Debug.WriteLine("[ResourceFilter] 请求进入 - 检查缓存");
                // 实际项目中这里会查询 Redis 缓存
                // 如果命中缓存，设置 context.Result 直接返回，跳过 Action
            }
        }

        // 响应返回后：更新缓存
        public void OnResourceExecuted(ResourceExecutedContext context)
        {
            Debug.WriteLine("[ResourceFilter] 响应返回 - 更新缓存");
            // 实际项目中这里会将结果写入 Redis 缓存
        }
    }

    // ========================================
    // 3. ActionFilter —— 操作过滤器（最常用）
    // ========================================
    /// <summary>
    /// 养老院操作日志过滤器
    /// 记录谁在什么时间调用了什么接口
    /// </summary>
    public class OperationLogFilter : IActionFilter
    {
        private readonly Stopwatch _stopwatch;

        public OperationLogFilter()
        {
            _stopwatch = new Stopwatch();
        }

        // Action 执行前
        public void OnActionExecuting(ActionExecutingContext context)
        {
            _stopwatch.Start();

            var controllerName = context.Controller.GetType().Name;
            var actionName = context.ActionDescriptor.DisplayName;
            var userName = context.HttpContext.User.Identity?.Name ?? "未知用户";
            var requestTime = DateTime.Now;

            // 将信息存入 HttpContext.Items，供后续使用
            context.HttpContext.Items["StartTime"] = requestTime;
            context.HttpContext.Items["UserName"] = userName;

            Debug.WriteLine(
                $"[ActionFilter-进入] 用户:{userName} " +
                $"调用:{controllerName}.{actionName} " +
                $"时间:{requestTime:yyyy-MM-dd HH:mm:ss}");
        }

        // Action 执行后
        public void OnActionExecuted(ActionExecutedContext context)
        {
            _stopwatch.Stop();
            var elapsed = _stopwatch.ElapsedMilliseconds;

            var userName = context.HttpContext.Items["UserName"]?.ToString();
            var startTime = (DateTime?)context.HttpContext.Items["StartTime"];

            // 记录操作日志
            var logMessage =
                $"[ActionFilter-离开] 用户:{userName} " +
                $"耗时:{elapsed}ms " +
                $"异常:{(context.Exception != null ? context.Exception.Message : "无")}";

            Debug.WriteLine(logMessage);

            // 实际项目中，这里会将操作日志写入数据库
            // _dbContext.OperationLogs.Add(new OperationLog { ... });
        }
    }

    // ========================================
    // 4. ExceptionFilter —— 异常过滤器
    // ========================================
    /// <summary>
    /// 养老院全局异常处理过滤器
    /// 捕获 Action 中未处理的异常
    /// </summary>
    public class NursingHomeExceptionFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext context)
        {
            // 记录异常信息
            var controllerName = context.Controller.GetType().Name;
            var actionName = context.ActionDescriptor.DisplayName;

            Debug.WriteLine(
                $"[ExceptionFilter] 捕获异常: " +
                $"控制器={controllerName}, " +
                $"方法={actionName}, " +
                $"异常={context.Exception.Message}");

            // 设置响应结果（阻止异常继续传播）
            context.Result = new ObjectResult(new
            {
                Code = 500,
                Message = "养老院系统内部错误，请稍后重试",
                Detail = context.Exception.Message // 生产环境应隐藏详细信息
            });

            // 标记异常已处理
            context.ExceptionHandled = true;
        }
    }

    // ========================================
    // 5. ResultFilter —— 结果过滤器
    // ========================================
    /// <summary>
    /// 养老院统一响应格式过滤器
    /// 将所有响应包装为统一格式
    /// </summary>
    public class UnifiedResponseFilter : IResultFilter
    {
        // 结果执行前：可以修改响应内容
        public void OnResultExecuting(ResultExecutingContext context)
        {
            // 如果是 ObjectResult，包装为统一格式
            if (context.Result is ObjectResult objectResult)
            {
                var originalValue = objectResult.Value;

                // 包装为统一响应格式
                objectResult.Value = new
                {
                    Code = 200,
                    Message = "操作成功",
                    Data = originalValue,
                    Timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                };

                Debug.WriteLine("[ResultFilter-进入] 响应格式化完成");
            }
        }

        // 结果执行后：清理工作
        public void OnResultExecuted(ResultExecutedContext context)
        {
            Debug.WriteLine("[ResultFilter-离开] 响应已发送到客户端");
        }
    }
}
```

#### 全局 vs Controller vs Action 级别注册

```csharp
namespace NursingHome
{
    // ========================================
    // 1. 全局注册（所有请求都会经过）
    // ========================================
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            // 先将需要依赖注入的 Filter 注册到 DI 容器
            services.AddScoped<OperationLogFilter>();
            services.AddScoped<NursingHomeExceptionFilter>();

            services.AddControllers(options =>
            {
                // 全局注册 Filter
                options.Filters.Add<NursingHomeAuthFilter>();          // 全局认证（无依赖注入）
                options.Filters.AddService<OperationLogFilter>();      // 全局操作日志（需 DI）
                options.Filters.AddService<NursingHomeExceptionFilter>(); // 全局异常处理（需 DI）
                options.Filters.Add<UnifiedResponseFilter>();          // 全局响应格式化（无依赖注入）
            });
        }
    }

    // ========================================
    // 2. Controller 级别（该 Controller 下所有 Action 都会经过）
    // ========================================
    [ServiceFilter(typeof(ElderCacheFilter))] // 注：需要先在 DI 中注册
    [ApiController]
    [Route("api/[controller]")]
    public class ElderController : ControllerBase
    {
        // 该 Controller 下所有接口都会经过 ElderCacheFilter

        [HttpGet("{id}")]
        public IActionResult GetElder(int id)
        {
            return Ok(new { Id = id, Name = "张爷爷" });
        }
    }

    // ========================================
    // 3. Action 级别（仅该 Action 会经过）
    // ========================================
    [ApiController]
    [Route("api/[controller]")]
    public class RoomController : ControllerBase
    {
        // 仅此接口会经过 OperationLogFilter
        [ServiceFilter(typeof(OperationLogFilter))]
        [HttpPost("assign")]
        public IActionResult AssignRoom(int elderId, int roomId)
        {
            return Ok(new { ElderId = elderId, RoomId = roomId });
        }
    }
}
```

#### ABP 内置 Filter

ABP 框架在 ASP.NET Core Filter 基础上，内置了多个企业级 Filter：

| ABP 内置 Filter | 类型 | 作用 |
|-----------------|------|------|
| **审计日志 Filter** | ActionFilter | 自动记录每次接口调用的用户、时间、参数、返回值、耗时 |
| **工作单元 Filter（UoW）** | ActionFilter | 自动开启数据库事务，Action 成功后自动提交，异常时自动回滚 |
| **验证 Filter** | ActionFilter | 自动验证 DTO 的 `DataAnnotations` 和 `FluentValidation` 规则 |
| **授权 Filter** | AuthorizationFilter | 集成 ABP 权限系统，自动检查 `[Authorize]` 和权限策略 |

**ABP 工作单元 Filter 的工作原理**：

```csharp
// ABP 自动为每个 API 请求开启工作单元
// 你不需要手动管理事务

namespace NursingHome.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ElderController : ControllerBase
    {
        private readonly IRepository<Elder> _elderRepo;
        private readonly IRepository<Room> _roomRepo;

        public ElderController(
            IRepository<Elder> elderRepo,
            IRepository<Room> roomRepo)
        {
            _elderRepo = elderRepo;
            _roomRepo = roomRepo;
        }

        /// <summary>
        /// 为长者分配房间
        /// ABP 的工作单元 Filter 会自动包裹事务
        /// 如果中途抛异常，两个操作都会回滚
        /// </summary>
        [HttpPost("assign-room")]
        public async Task<IActionResult> AssignRoom(int elderId, int roomId)
        {
            // 操作1：更新长者的房间信息
            var elder = await _elderRepo.GetAsync(elderId);
            elder.RoomId = roomId;
            await _elderRepo.UpdateAsync(elder);

            // 操作2：更新房间的入住状态
            var room = await _roomRepo.GetAsync(roomId);
            room.IsOccupied = true;
            await _roomRepo.UpdateAsync(room);

            // ABP 工作单元 Filter 会在这里自动提交事务
            return Ok("分配成功");
        }
    }
}
```

---

### 1.4 CORS 跨域（面试常问）

#### 生活类比：养老院不同分院之间的「访客通行证」

养老院在北京和上海各有一个分院。北京分院的老人想让上海分院的家属来探望，但上海分院有自己的门禁系统。要让上海的访客进入北京分院，必须先办理**通行证（CORS 策略）**。

#### 同源策略原理

浏览器的安全策略要求，**协议、域名、端口**三者必须完全一致才允许跨域访问：

```
请求方：http://nursinghome-frontend.com:3000
目标方：http://nursinghome-api.com:5000

协议：http  vs http   ✅ 相同
域名：nursinghome-frontend.com vs nursinghome-api.com ❌ 不同
端口：3000 vs 5000    ❌ 不同

结论：不同源，浏览器会阻止请求（CORS 错误）
```

#### 为什么前后端分离必须配置 CORS

前后端分离架构中：
- 前端运行在 `http://localhost:3000`（Vue/React 开发服务器）
- 后端运行在 `http://localhost:5000`（ASP.NET Core）

端口不同 = 不同源，浏览器会阻止前端调用后端 API。

#### 预检请求 OPTIONS

**简单请求**（GET/POST/HEAD，且 Content-Type 为 text/plain 等）直接发送。

**非简单请求**（自定义 Header、PUT/DELETE、application/json 等）会先发送一个 OPTIONS 预检请求：

```
浏览器                                    服务器
  │                                         │
  │  OPTIONS /api/elder  (预检请求)          │
  │  Origin: http://localhost:3000          │
  │  Access-Control-Request-Method: PUT     │
  │ ───────────────────────────────────────►│
  │                                         │
  │  204 No Content                         │
  │  Access-Control-Allow-Origin: *         │
  │  Access-Control-Allow-Methods: PUT      │
  │◄───────────────────────────────────────│
  │                                         │
  │  PUT /api/elder/1  (实际请求)           │
  │ ───────────────────────────────────────►│
  │                                         │
  │  200 OK                                 │
  │◄───────────────────────────────────────│
```

#### 正确配置方式

```csharp
namespace NursingHome
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            // ========================================
            // CORS 配置
            // ========================================
            services.AddCors(options =>
            {
                // 方式1：开发环境 - 允许所有来源（⚠️ 生产环境禁用！）
                options.AddPolicy("DevPolicy", builder =>
                {
                    builder.AllowAnyOrigin()   // 允许任何来源
                        .AllowAnyMethod()      // 允许任何 HTTP 方法
                        .AllowAnyHeader();     // 允许任何请求头
                });

                // 方式2：生产环境 - 指定允许的来源（推荐）
                options.AddPolicy("NursingHomePolicy", builder =>
                {
                    builder.WithOrigins(
                            "https://nursinghome-frontend.com",  // 生产前端
                            "https://admin.nursinghome.com",     // 管理后台
                            "http://localhost:3000"               // 本地开发
                        )
                        .AllowAnyMethod()
                        .AllowAnyHeader()
                        .AllowCredentials(); // 允许携带 Cookie（注意：不能与 AllowAnyOrigin 同时使用）
                });

                // 方式3：按环境动态配置
                options.AddPolicy("DynamicPolicy", builder =>
                {
                    builder.SetIsOriginAllowed(origin =>
                        {
                            // 动态判断：只允许特定域名
                            return origin.EndsWith(".nursinghome.com");
                        })
                        .AllowAnyMethod()
                        .AllowAnyHeader();
                });
            });

            services.AddControllers();
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // ⚠️ CORS 中间件必须在 UseRouting 之后，UseAuthorization 之前
            app.UseRouting();

            // 使用对应的 CORS 策略
            app.UseCors("NursingHomePolicy");

            app.UseAuthentication();
            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
            });
        }
    }
}
```

**AllowAnyOrigin 的风险**：

```csharp
// ❌ 危险配置 — ASP.NET Core 框架直接抛异常，无法同时使用
builder.AllowAnyOrigin().AllowCredentials();
// 运行时会抛出 InvalidOperationException:
// "The CORS protocol does not allow specifying a wildcard (any) origin
//  and credentials at the same time."
// 这是框架层面的硬性限制，不是警告而是运行时错误

// ✅ 安全配置
builder.WithOrigins("https://nursinghome-frontend.com")
    .AllowCredentials();
```

---

### 1.5 Kestrel vs IIS 区别

#### Kestrel 是什么

Kestrel 是 ASP.NET Core 内置的跨平台 Web 服务器。在 .NET 5.0 中，Kestrel 默认使用**托管 Socket** 实现高性能异步 I/O（早期版本基于 libuv，.NET 5 已弃用 libuv 默认配置）。

```
┌─────────────────────────────────────────────────────────┐
│                    Kestrel 特性                          │
├─────────────────────────────────────────────────────────┤
│ ✅ 跨平台：Windows / Linux / macOS                       │
│ ✅ 高性能：基于托管 Socket，异步非阻塞 I/O                      │
│ ✅ 内置：无需额外安装，随 ASP.NET Core 一起发布            │
│ ✅ 支持 HTTP/1.1, HTTP/2, HTTPS                          │
│ ❌ 不适合直接暴露到公网（缺乏完整的安全防护）              │
└─────────────────────────────────────────────────────────┘
```

#### 为什么推荐反向代理 + Kestrel 的组合

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   客户端      │    │  Nginx/IIS   │    │   Kestrel    │
│   (浏览器)    │───►│  反向代理     │───►│   应用服务器   │
│              │    │              │    │              │
│  公网访问     │    │  负载均衡     │    │  运行 .NET   │
│              │    │  SSL 终止     │    │  应用程序     │
│              │    │  静态文件     │    │              │
│              │    │  请求过滤     │    │              │
└──────────────┘    └──────────────┘    └──────────────┘

反向代理负责：
1. SSL 终止（HTTPS → HTTP）
2. 负载均衡（多个 Kestrel 实例）
3. 静态文件服务（Nginx 比 Kestrel 更高效）
4. 请求过滤（防 DDoS、IP 黑名单）
5. 请求缓冲（Kestrel 处理慢时，代理先缓存请求）
```

**生产部署架构图（养老院系统）**：

```
                    ┌─────────────────────┐
                    │      互联网          │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Nginx 反向代理     │
                    │   - SSL 终止         │
                    │   - 负载均衡         │
                    │   - 静态文件         │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Kestrel 实例 1     │  ← 养老院 API 服务
                    │   http://localhost:5001
                    └─────────────────────┘
                    ┌─────────────────────┐
                    │   Kestrel 实例 2     │  ← 养老院 API 服务
                    │   http://localhost:5002
                    └─────────────────────┘
                    ┌─────────────────────┐
                    │   Kestrel 实例 3     │  ← 养老院 API 服务
                    │   http://localhost:5003
                    └─────────────────────┘
```

**Nginx 配置示例**：

```nginx
# /etc/nginx/conf.d/nursinghome.conf

upstream nursinghome_api {
    server localhost:5001;
    server localhost:5002;
    server localhost:5003;
}

server {
    listen 443 ssl;
    server_name api.nursinghome.com;

    ssl_certificate     /etc/ssl/certs/nursinghome.crt;
    ssl_certificate_key /etc/ssl/private/nursinghome.key;

    # 静态文件由 Nginx 直接处理
    location /wwwroot/ {
        root /var/www/nursinghome;
    }

    # API 请求转发给 Kestrel
    location /api/ {
        proxy_pass http://nursinghome_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 2. 实战案例：养老院系统完整中间件管道 + Filter + CORS 配置

本案例整合本章所学知识，为养老院管理系统搭建完整的请求处理管道。

```csharp
// ========================================
// 实体定义
// ========================================
namespace NursingHome.Models
{
    /// <summary>
    /// 长者实体
    /// </summary>
    public class Elder
    {
        public int Id { get; set; }                    // 主键ID
        public string Name { get; set; }               // 姓名
        public int Age { get; set; }                   // 年龄
        public string Gender { get; set; }             // 性别
        public string Phone { get; set; }              // 联系电话
        public int? RoomId { get; set; }               // 房间ID（可为空，表示未分配）
        public DateTime CheckInDate { get; set; }      // 入住日期
        public DateTime? CheckOutDate { get; set; }    // 退房日期（可为空）
        public string HealthStatus { get; set; }       // 健康状态
    }

    /// <summary>
    /// 操作日志实体
    /// </summary>
    public class OperationLog
    {
        public long Id { get; set; }                   // 主键ID
        public string UserName { get; set; }           // 操作用户
        public string ControllerName { get; set; }     // 控制器名称
        public string ActionName { get; set; }         // 方法名称
        public string HttpMethod { get; set; }         // HTTP方法
        public string RequestPath { get; set; }        // 请求路径
        public string RequestBody { get; set; }        // 请求参数
        public int StatusCode { get; set; }            // 响应状态码
        public long ElapsedMs { get; set; }            // 耗时（毫秒）
        public string IpAddress { get; set; }          // 客户端IP
        public DateTime CreatedAt { get; set; }        // 创建时间
        public string ExceptionMessage { get; set; }   // 异常信息
    }
}

// ========================================
// 自定义 Filter：操作日志记录
// ========================================
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System.Diagnostics;

namespace NursingHome.Filters
{
    /// <summary>
    /// 操作日志记录 Filter
    /// 记录谁在什么时间调用了什么接口，以及接口的执行结果
    /// </summary>
    public class OperationLogFilter : IActionFilter
    {
        private readonly Stopwatch _stopwatch;
        private readonly NursingHomeDbContext _context;

        // 通过构造函数注入 DbContext（Filter 需要先在 DI 中注册）
        public OperationLogFilter(NursingHomeDbContext context)
        {
            _context = context;
            _stopwatch = new Stopwatch();
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            // 请求进入 Action 之前
            _stopwatch.Start();

            // 记录请求信息到 HttpContext，供 OnActionExecuted 使用
            context.HttpContext.Items["OperationStartTime"] = DateTime.Now;
            context.HttpContext.Items["OperationUserName"] =
                context.HttpContext.User.Identity?.Name ?? "匿名用户";
        }

        public void OnActionExecuted(ActionExecutedContext context)
        {
            // Action 执行完毕后
            _stopwatch.Stop();

            // 构建操作日志
            var log = new OperationLog
            {
                UserName = context.HttpContext.Items["OperationUserName"]?.ToString(),
                ControllerName = context.Controller.GetType().Name,
                ActionName = context.ActionDescriptor.DisplayName,
                HttpMethod = context.HttpContext.Request.Method,
                RequestPath = context.HttpContext.Request.Path.ToString(),
                StatusCode = context.HttpContext.Response.StatusCode,
                ElapsedMs = _stopwatch.ElapsedMilliseconds,
                IpAddress = context.HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.Now,
                ExceptionMessage = context.Exception?.Message
            };

            // 异步写入数据库（不影响响应速度）
            // ⚠️ 生产环境建议改为异步写入（如 BackgroundTask 或消息队列），
            // 避免同步 SaveChanges 阻塞请求线程
            _context.OperationLogs.Add(log);
            _context.SaveChanges();
        }
    }

    /// <summary>
    /// 统一异常处理 Filter
    /// </summary>
    public class GlobalExceptionFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext context)
        {
            // 记录异常日志
            var controllerName = context.Controller.GetType().Name;
            var actionName = context.ActionDescriptor.DisplayName;

            // 输出到调试窗口（生产环境应使用日志框架如 Serilog/NLog）
            Debug.WriteLine(
                $"[全局异常] {controllerName}.{actionName}: {context.Exception.Message}");

            // 返回统一格式的错误响应
            context.Result = new ObjectResult(new
            {
                Code = 500,
                Message = "养老院系统内部错误",
                Detail = context.Exception.InnerException?.Message
                    ?? context.Exception.Message
            });
            context.ExceptionHandled = true;
        }
    }
}

// ========================================
// 自定义中间件：请求耗时统计
// ========================================
namespace NursingHome.Middleware
{
    /// <summary>
    /// 请求耗时统计中间件
    /// </summary>
    public class ElapsedTimeMiddleware
    {
        private readonly RequestDelegate _next;

        public ElapsedTimeMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var stopwatch = Stopwatch.StartNew();

            // 调用下一个中间件
            await _next(context);

            stopwatch.Stop();

            // 将耗时写入响应头
            var elapsed = stopwatch.ElapsedMilliseconds;
            // 检查响应是否已开始发送，避免在响应已提交后修改 Header 导致异常
            if (!context.Response.HasStarted)
            {
                context.Response.Headers["X-Response-Time"] = $"{elapsed}ms";
            }

            // 超过 500ms 的请求记录警告
            if (elapsed > 500)
            {
                Debug.WriteLine(
                    $"[性能警告] {context.Request.Method} {context.Request.Path} " +
                    $"耗时 {elapsed}ms，超过 500ms 阈值");
            }
        }
    }

    public static class MiddlewareExtensions
    {
        public static IApplicationBuilder UseElapsedTime(
            this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<ElapsedTimeMiddleware>();
        }
    }
}

// ========================================
// Controller
// ========================================
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Cors;

namespace NursingHome.Controllers
{
    /// <summary>
    /// 长者管理控制器
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("NursingHomePolicy")] // 应用 CORS 策略
    public class ElderController : ControllerBase
    {
        private readonly IElderService _elderService;

        // 通过构造函数注入服务（依赖注入）
        public ElderController(IElderService elderService)
        {
            _elderService = elderService;
        }

        /// <summary>
        /// 获取所有长者列表
        /// </summary>
        [HttpGet]
        public IActionResult GetAllElders()
        {
            var elders = _elderService.GetAllElders();
            return Ok(elders);
        }

        /// <summary>
        /// 根据ID获取长者信息
        /// </summary>
        [HttpGet("{id}")]
        public IActionResult GetElder(int id)
        {
            var elder = _elderService.GetElderById(id);
            if (elder == null)
            {
                return NotFound(new { Message = $"未找到ID为{id}的长者" });
            }
            return Ok(elder);
        }

        /// <summary>
        /// 新增长者
        /// </summary>
        [HttpPost]
        public IActionResult AddElder(Elder elder)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            _elderService.AddElder(elder);
            return CreatedAtAction(nameof(GetElder), new { id = elder.Id }, elder);
        }
    }
}

// ========================================
// 完整的 Startup.cs（整合所有知识点）
// ========================================
namespace NursingHome
{
    public class Startup
    {
        private readonly IConfiguration _configuration;

        public Startup(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public void ConfigureServices(IServiceCollection services)
        {
            // ---- 数据库（MySQL + Pomelo 驱动）----
            services.AddDbContext<NursingHomeDbContext>(options =>
                options.UseMySql(
                    _configuration.GetConnectionString("Default"),
                    ServerVersion.AutoDetect(_configuration.GetConnectionString("Default"))
                ));

            // ---- 业务服务（Scoped：每个请求一个实例） ----
            services.AddScoped<IElderService, ElderService>();
            services.AddScoped<IRoomService, RoomService>();

            // ---- 全局 Filter ----
            services.AddScoped<OperationLogFilter>();       // 注册到 DI
            services.AddScoped<GlobalExceptionFilter>();    // 注册到 DI
            services.AddControllers(options =>
            {
                options.Filters.AddService<OperationLogFilter>();    // 操作日志（需 DI）
                options.Filters.AddService<GlobalExceptionFilter>(); // 全局异常（需 DI）
            });

            // ---- CORS ----
            services.AddCors(options =>
            {
                options.AddPolicy("NursingHomePolicy", builder =>
                {
                    builder.WithOrigins("http://localhost:3000",    // 前端开发服务器
                                        "https://nursinghome.com") // 生产域名
                        .AllowAnyMethod()
                        .AllowAnyHeader()
                        .AllowCredentials();
                });
            });
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // 1. 异常处理（最外层）
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
            }

            // 2. 耗时统计中间件
            app.UseElapsedTime();

            // 3. 静态文件
            app.UseStaticFiles();

            // 4. 路由
            app.UseRouting();

            // 5. CORS（路由之后，认证之前）
            app.UseCors("NursingHomePolicy");

            // 6. 认证
            app.UseAuthentication();

            // 7. 授权
            app.UseAuthorization();

            // 8. 终结点
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
            });
        }
    }
}
```

**运行效果说明**：

1. 前端从 `http://localhost:3000` 发起请求，CORS 中间件验证 Origin 是否允许
2. 耗时中间件开始计时
3. 请求路由到 `ElderController`
4. `OperationLogFilter.OnActionExecuting` 记录请求开始时间
5. `ElderController.GetAllElders()` 执行
6. `OperationLogFilter.OnActionExecuted` 记录操作日志到数据库
7. 耗时中间件结束计时，添加 `X-Response-Time` 响应头
8. 如果抛出异常，`GlobalExceptionFilter` 捕获并返回统一错误格式

---

## 3. 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | `services.AddSingleton<IElderService, ElderService>()` 其中 `ElderService` 依赖 `DbContext` | `services.AddScoped<IElderService, ElderService>()` | Singleton 会捕获 Scoped 的 DbContext，导致数据污染和内存泄漏 |
| 2 | `app.UseCors()` 放在 `app.UseRouting()` 之前 | `app.UseCors()` 放在 `app.UseRouting()` 和 `app.UseEndpoints()` 之间 | CORS 中间件需要路由信息才能工作，放在路由之前会不生效 |
| 3 | `app.UseAuthentication()` 放在 `app.UseAuthorization()` 之后 | `app.UseAuthentication()` 必须在 `app.UseAuthorization()` 之前 | 必须先识别身份，再检查权限，顺序反了会导致授权失败 |
| 4 | `AllowAnyOrigin().AllowCredentials()` 生产环境使用 | `WithOrigins("https://your-domain.com").AllowCredentials()` | AllowAnyOrigin + AllowCredentials 会导致任意网站可携带用户凭证访问你的 API |
| 5 | 在 Singleton 服务中直接 `new DbContext()` | 通过 `IServiceScopeFactory` 创建 Scope 后获取 | 手动创建的 DbContext 不受 DI 容器管理，生命周期混乱 |
| 6 | Filter 中直接 `new DbContext()` 进行数据库操作 | 通过构造函数注入 `NursingHomeDbContext`，并在 DI 中注册 Filter | Filter 中手动创建的 DbContext 不在请求的作用域内，无法享受事务管理 |
| 7 | 中间件配置顺序随意放置 | 异常处理 → 静态文件 → 路由 → CORS → 认证 → 授权 → 终结点 | 顺序错误会导致功能失效，如认证在 CORS 之前可能导致预检请求被拒绝 |
| 8 | `services.AddTransient<IElderService, ElderService>()` 频繁创建有状态的服务 | 有状态且依赖 DbContext 的服务使用 Scoped | Transient 每次注入都创建新实例，如果服务持有 DbContext，会导致每个方法调用使用不同的 DbContext |
| 9 | 在 ActionFilter 中使用 `await` 操作但忘记处理异常 | 在 OnActionExecuted 中检查 `context.Exception` 并妥善处理 | Filter 中的异常会影响整个请求管道 |
| 10 | CORS 只配置 `AllowAnyOrigin` 不配置 `AllowAnyMethod` | 同时配置 Origin、Method、Header | 只允许来源但不允许方法，PUT/DELETE 请求仍然会被拒绝 |

---

## 4. 本章小结

本章深入讲解了 ASP.NET Core 的五大核心原理：**依赖注入**是应用的骨架，决定了服务如何创建和共享；**中间件管道**是请求的高速公路，每个请求都必须经过一系列关卡；**Filter 过滤器**是 MVC 层面的精细控制，五种 Filter 按照 A-R-A-E-R 的顺序依次执行；**CORS 跨域**是前后端分离的通行证，必须正确配置才能让前端顺利调用 API；**Kestrel 服务器**是应用的运行容器，生产环境需要搭配 Nginx 反向代理使用。这些知识点不仅是日常开发的基础，更是 .NET 面试的高频考点。

| 知识点 | 核心概念 | 面试关键词 |
|-------|---------|-----------|
| 依赖注入 | Singleton/Scoped/Transient 三种生命周期 | Captive Dependency、构造函数注入 |
| 中间件管道 | Use/Map/Run 三种配置方式 | 请求管道、中间件顺序 |
| Filter 过滤器 | Auth→Resource→Action→Exception→Result | 五种 Filter、执行顺序、全局注册 |
| CORS 跨域 | 同源策略、预检请求 OPTIONS | AllowAnyOrigin 风险、中间件顺序 |
| Kestrel | 内置跨平台 Web 服务器 | 反向代理、Nginx + Kestrel |

---

## 5. 面试题

### 面试题 1（初级 / 概念题）
**题目**：请解释 ASP.NET Core 中 Singleton、Scoped、Transient 三种生命周期的区别。

**参考答案**：这三种生命周期决定了服务实例的创建和销毁时机。**Singleton（单例）**在应用启动时创建一次，所有请求共享同一个实例，直到应用关闭才销毁，适合全局缓存、配置管理等场景。**Scoped（作用域）**每个 HTTP 请求创建一个新实例，同一请求内共享同一个实例，请求结束时销毁，这是 DbContext 的默认生命周期，保证了同一请求内的数据库操作共享同一个 ChangeTracker。**Transient（瞬时）**每次注入都创建一个新实例，即使在同一请求内，不同位置注入的也是不同实例，适合无状态、轻量级的服务如短信发送、邮件服务。选择原则：无状态轻量服务用 Transient，依赖 DbContext 的用 Scoped，全局唯一的用 Singleton。

---

### 面试题 2（中级 / 场景题）
**题目**：什么是 Captive Dependency？在养老院系统中，如果把一个依赖 DbContext 的服务注册为 Singleton，会导致什么问题？

**参考答案**：Captive Dependency（被俘获的依赖）是指长生命周期的服务依赖了短生命周期的服务。例如，`ElderReportService` 注册为 Singleton，但它依赖的 `NursingHomeDbContext` 是 Scoped。当 Singleton 服务在应用启动时被创建，它持有的 DbContext 实例会一直存活到应用关闭。这会导致三个严重问题：第一，所有请求共享同一个 DbContext 的 ChangeTracker，并发请求会导致数据污染（比如两个请求同时修改长者信息，ChangeTracker 状态混乱）。第二，DbContext 内部持有的数据库连接不会被释放，导致连接池耗尽。第三，查询到的数据可能是很久之前的缓存，不是最新数据。解决方案是注入 `IServiceScopeFactory`，在每次使用时创建新的 Scope，从中获取 DbContext 实例。

---

### 面试题 3（高级 / 设计题）
**题目**：请画出 ASP.NET Core Filter 的五种类型及其执行顺序，并解释为什么 ActionFilter 的 OnActionExecuted 在 ExceptionFilter 之前执行。

**参考答案**：Filter 执行顺序为 AuthorizationFilter → ResourceFilter（OnResourceExecuting）→ ActionFilter（OnActionExecuting）→ Action 方法执行 → ActionFilter（OnActionExecuted）→ ExceptionFilter → ResultFilter（OnResultExecuting/OnResultExecuted）→ ResourceFilter（OnResourceExecuted）。ActionFilter 的 OnActionExecuted 在 ExceptionFilter 之前执行，是因为 OnActionExecuted 是在 Action 方法返回后、但在异常被传播到 ExceptionFilter 之前同步调用的。在 OnActionExecuted 中，可以通过 `context.Exception` 检查 Action 是否抛出了异常，甚至可以设置 `context.Exception = null` 来"吞掉"异常。如果异常没有在 ActionFilter 中处理，才会传递到 ExceptionFilter。这种设计给了 ActionFilter 机会在更靠近异常发生的地方处理异常，比如记录操作日志时同时记录异常信息。

---

### 面试题 4（中级 / 概念题）
**题目**：中间件（Middleware）和 Filter 有什么区别？各自适合什么场景？

**参考答案**：中间件和 Filter 是 ASP.NET Core 中两个不同层面的请求处理机制。**中间件**工作在整个应用的请求管道中，在路由匹配之前执行，不知道请求会路由到哪个 Controller/Action，适合处理全局性的逻辑如日志、CORS、认证、静态文件等。**Filter**工作在 MVC/WebAPI 管道内部，在路由匹配之后执行，可以获取到具体的 Controller、Action、参数等信息，适合处理与具体业务相关的逻辑如参数验证、操作日志、异常处理、结果格式化等。一个形象的比喻：中间件是门卫和前台（不知道访客找谁），Filter 是楼层管理员（知道具体找哪个房间）。在实际项目中，两者经常配合使用，比如中间件处理认证和 CORS，Filter 处理操作日志和异常处理。

---

### 面试题 5（初级 / 代码题）
**题目**：请写出一个自定义中间件的完整代码，实现记录每个请求的耗时。

**参考答案**：自定义中间件需要遵循三个约定：构造函数接收 `RequestDelegate next`、实现 `InvokeAsync(HttpContext context)` 方法、调用 `await next(context)` 传递管道。具体实现：在 InvokeAsync 中，先用 `Stopwatch.StartNew()` 记录开始时间，然后调用 `await _next(context)` 执行后续中间件，最后 `stopwatch.Stop()` 停止计时，检查 `context.Response.HasStarted` 后再将耗时写入响应头 `context.Response.Headers["X-Elapsed-Time"] = $"{elapsed}ms"`。还需要提供一个扩展方法 `UseElapsedTime(this IApplicationBuilder builder)` 用于在 Startup 中注册。这种中间件放在管道的靠前位置，可以统计整个请求的总耗时，包括所有后续中间件和 Filter 的处理时间。

---

### 面试题 6（高级 / 场景题）
**题目**：在养老院系统中，前端调用 PUT `/api/elder/1` 接口时出现 CORS 错误，但 GET 请求正常。请分析可能的原因。

**参考答案**：GET 请求是简单请求，浏览器直接发送；而 PUT 请求是非简单请求，浏览器会先发送 OPTIONS 预检请求。可能的原因有：第一，CORS 中间件配置顺序错误，放在了 `UseRouting()` 之前，导致中间件无法获取路由信息来处理预检请求。第二，CORS 策略没有配置 `AllowAnyMethod()` 或 `WithMethods("PUT")`，导致 PUT 方法不被允许。第三，后端有全局异常处理中间件拦截了 OPTIONS 请求，返回了 405 状态码。第四，前端请求携带了自定义 Header（如 `X-Custom-Header`），但 CORS 策略没有配置 `AllowAnyHeader()` 或 `WithHeaders("X-Custom-Header")`。排查步骤：检查浏览器 Network 面板是否有 OPTIONS 请求及其响应状态码，检查后端 Startup.cs 中 CORS 中间件的注册顺序，检查 CORS 策略的 Method 和 Header 配置。

---

### 面试题 7（中级 / 概念题）
**题目**：`app.Use()`、`app.Map()`、`app.Run()` 三者有什么区别？

**参考答案**：这三种方法用于在 Startup.Configure 中配置中间件管道。**Use**是中间件的通用注册方式，它接收一个 `context` 和 `next` 委托，可以执行前置逻辑后调用 `await next()` 将请求传递给下一个中间件，也可以不调用 next 来终止管道，适合日志记录、认证检查等需要前后置处理的场景。**Map**根据请求路径进行分支，将匹配特定路径前缀的请求分流到子管道中处理，类似路由的分流功能，比如 `/api/admin` 走管理员通道，`/api/elder` 走长者服务通道。**Run**是管道的终结点，它只接收 `context` 参数，不接收 `next`，意味着它不会调用后续中间件，请求到此为止。一个管道中可以有多个 Use，但 Run 通常只有一个且放在最后。

---

### 面试题 8（高级 / 设计题）
**题目**：如何在 Singleton 服务中安全地使用 Scoped 服务？请给出代码示例。

**参考答案**：不能直接通过构造函数注入 Scoped 服务到 Singleton 中（会造成 Captive Dependency），正确做法是注入 `IServiceScopeFactory` 工厂，在需要使用时动态创建 Scope。代码示例：`ElderBackgroundService` 是 Singleton 服务（比如后台定时任务），它需要查询数据库。构造函数注入 `IServiceScopeFactory _scopeFactory`，在 `DoWork()` 方法中使用 `using (var scope = _scopeFactory.CreateScope())` 创建新 Scope，然后通过 `scope.ServiceProvider.GetRequiredService<NursingHomeDbContext>()` 获取 DbContext 实例。这样每次调用都会创建一个新的 Scope 和新的 DbContext，保证了数据隔离和资源释放。注意：创建的 Scope 在 using 块结束时自动释放，DbContext 也随之释放。

---

### 面试题 9（初级 / 概念题）
**题目**：什么是 CORS？为什么前后端分离项目必须配置 CORS？

**参考答案**：CORS（Cross-Origin Resource Sharing，跨域资源共享）是一种浏览器安全机制。浏览器的同源策略要求，只有当请求的协议、域名、端口三者完全相同时，才允许 JavaScript 访问响应数据。前后端分离项目中，前端通常运行在 `localhost:3000`（Vue/React 开发服务器），后端运行在 `localhost:5000`（ASP.NET Core），虽然都在本地，但端口不同，浏览器认为这是跨域请求并阻止。配置 CORS 就是在后端响应中添加特定的 HTTP 头（如 `Access-Control-Allow-Origin`），告诉浏览器「我允许这个来源的请求」。需要注意的是，CORS 是浏览器的安全限制，Postman 等工具不受此限制。

---

### 面试题 10（中级 / 代码题）
**题目**：请实现一个 ActionFilter，记录养老院系统中每次接口调用的操作日志（包括调用者、时间、接口名、耗时）。

**参考答案**：创建一个实现 `IActionFilter` 接口的类 `OperationLogFilter`。在构造函数中注入 `NursingHomeDbContext`。`OnActionExecuting` 方法中启动 Stopwatch 计时，将开始时间和用户名存入 `context.HttpContext.Items`。`OnActionExecuted` 方法中停止计时，从 Items 中取出开始时间和用户名，获取 Controller 名称和 Action 名称，构建 `OperationLog` 实体并保存到数据库。注册方式：通过 `services.AddScoped<OperationLogFilter>()` 先注册到 DI 容器，然后在 `options.Filters.AddService<OperationLogFilter>()` 中全局注册（使用 `AddService` 而非 `Add`，以便通过 DI 解析构造函数依赖），或在 Controller/Action 上使用 `[ServiceFilter(typeof(OperationLogFilter))]` 局部注册。

---

### 面试题 11（高级 / 场景题）
**题目**：在生产环境中，Nginx + Kestrel 的部署架构有什么优势？为什么不直接用 Kestrel 对外服务？

**参考答案**：Kestrel 虽然是高性能的 Web 服务器，但不适合直接暴露到公网。Nginx + Kestrel 架构的优势在于：第一，**SSL 终止**：Nginx 负责处理 HTTPS 加密解密，Kestrel 只处理 HTTP，减轻应用服务器负担。第二，**负载均衡**：Nginx 可以将请求分发到多个 Kestrel 实例，实现水平扩展。第三，**静态文件**：Nginx 处理静态文件（CSS/JS/图片）的性能远优于 Kestrel。第四，**安全防护**：Nginx 可以做请求过滤、IP 黑名单、速率限制、防 DDoS 等。第五，**请求缓冲**：当 Kestrel 处理较慢时，Nginx 会缓冲客户端请求，避免慢客户端占用 Kestrel 连接。第六，**健康检查**：Nginx 可以定期检查 Kestrel 实例的健康状态，自动剔除异常实例。

---

### 面试题 12（中级 / 概念题）
**题目**：ABP 框架中的工作单元（Unit of Work）Filter 是如何工作的？它解决了什么问题？

**参考答案**：ABP 的工作单元 Filter 是一个 ActionFilter（底层通过动态代理拦截器实现），在请求进入时自动开启数据库事务，在 Action 成功执行后自动提交事务，在异常发生时自动回滚。它解决了三个问题：第一，**事务一致性**：在没有 UoW 时，开发者需要手动写 `using (var transaction = await _context.Database.BeginTransactionAsync())` 来管理事务，容易遗漏。UoW Filter 自动管理，保证同一请求内的所有数据库操作要么全部成功，要么全部回滚。第二，**代码简洁**：开发者只需要关注业务逻辑，不需要关心事务管理。第三，**嵌套支持**：ABP 的 UoW 支持嵌套，内层 UoW 共享外层的事务，只有最外层 UoW 提交时才真正提交到数据库。在养老院系统中，分配房间需要同时更新长者信息和房间状态，UoW 保证这两个操作的原子性。

---

### 面试题 13（高级 / 设计题）
**题目**：请设计一个养老院系统的全局异常处理方案，要求整合中间件和 Filter 两种方式。

**参考答案**：全局异常处理需要分两层：**中间件层**（最外层）和**Filter 层**（内层）。中间件层使用 `app.UseExceptionHandler()` 捕获中间件管道中的异常（如认证中间件、CORS 中间件抛出的异常），返回通用错误页面或 JSON。Filter 层使用 `IExceptionFilter` 捕获 Controller/Action 中的异常，可以返回更详细的业务错误信息。两者分工：中间件处理「管道级」异常（如数据库连接失败、认证服务不可用），Filter 处理「业务级」异常（如参数验证失败、业务规则冲突）。在 Filter 中，可以通过 `context.Exception` 获取异常信息，设置 `context.ExceptionHandled = true` 标记异常已处理，然后返回统一格式的错误响应 `{ Code: 500, Message: "xxx", Detail: "xxx" }`。对于不同类型的异常（如 `BusinessException`、`NotFoundException`），可以映射为不同的 HTTP 状态码。

---

### 面试题 14（初级 / 概念题）
**题目**：`[EnableCors]` 和 `[DisableCors]` 特性分别在什么场景下使用？

**参考答案**：当在全局配置了 CORS 策略后，所有 Controller 都会应用该策略。如果某个特定的 Controller 或 Action 需要使用不同的 CORS 策略，可以在该 Controller/Action 上使用 `[EnableCors("AnotherPolicy")]` 指定另一个策略名称。如果某个 Controller 或 Action 不需要 CORS（比如内部健康检查接口、Webhook 回调接口），可以使用 `[DisableCors]` 禁用 CORS。典型场景：养老院系统的健康检查接口 `/health` 只供运维工具调用，不需要跨域访问，可以加上 `[DisableCors]`；而管理后台 API 需要更宽松的 CORS 策略，可以单独指定 `[EnableCors("AdminPolicy")]`。

---

## 6. 下一章预告

第 03 章将深入讲解 **配置体系与 appsettings.json 编写**，包括：

- appsettings.json 完整结构规范（ConnectionStrings、Redis、RabbitMQ、业务配置各放哪里？）
- 多环境配置（Development / Production 的加载优先级和覆盖规则）
- Options 模式详解（IOptions vs IOptionsSnapshot vs IOptionsMonitor 三者区别）
- 环境变量覆盖配置（Docker 部署时的配置替换）
- 实战：养老院系统完整的 appsettings.json 编写 + YlsOptions 配置类设计

掌握了本章的依赖注入和中间件机制后，你将能更好地理解配置体系在 ASP.NET Core 中的工作方式。

---

## 时效性声明

- **目标框架**：.NET 5.0（C# 9）
- **语言版本限制**：仅使用 C# 9 特性，不使用 `record`、`init-only`、`primary constructor`、`raw string literal`、`file-scoped namespace` 等高版本特性
- **代码兼容性**：所有代码在 .NET 5.0 环境下可直接编译运行
- **升级注意事项**：
  - .NET 6.0+ 引入了 Minimal API，可以不使用 Controller 直接定义端点
  - .NET 6.0+ 支持 `file-scoped namespace`，可以简化代码
  - .NET 7.0+ 支持 `record` 类型，DTO 可以更简洁地定义
  - .NET 8.0 引入了 `primary constructor`，进一步简化类的构造函数
  - 如果你使用 .NET 6.0+，Startup.cs 可以合并到 Program.cs 中
- **ABP 版本**：本章涉及的 ABP 内置 Filter 基于 ABP v4.4.0（开源版），更高版本可能有 API 变化
- **最后更新**：2026 年 7 月

---

## 修订记录

| 日期 | 修订内容 |
|------|---------|
| 2026-07-10 | 修正「下一章预告」：第 03 章为「配置体系与 appsettings.json 编写」 |
| 2026-07-10 | 修正「前置知识」：第 01 章讲的是 C# 运行时原理，非环境搭建 |
| 2026-07-10 | Kestrel 描述修正：.NET 5 使用托管 Socket，不再基于 libuv |
| 2026-07-10 | CORS 修正：`AllowAnyOrigin().AllowCredentials()` 框架直接抛 InvalidOperationException |
| 2026-07-10 | ABP UoW Filter 类型修正：ActionFilter（非 ResourceFilter），版本改为 v4.4.0 |
| 2026-07-10 | 数据库示例统一改为 MySQL + Pomelo（UseMySql 替代 UseSqlServer） |
| 2026-07-10 | 删除 Controller 上的 `[FromBody]` 特性 |
| 2026-07-10 | Filter 执行顺序图补充：ExceptionFilter 仅在有未处理异常时触发 |
| 2026-07-10 | OperationLogFilter 中 SaveChanges 加生产环境异步写入建议 |
| 2026-07-10 | Response.Headers.Add 改为 HasStarted 检查后赋值，避免响应已提交后异常 |
| 2026-07-10 | 面试题12 UoW Filter 修正：ActionFilter（底层通过动态代理拦截器实现） |
| 2026-07-10 | 全局 Filter 注册改为 AddScoped + AddService 模式（两处代码 + 面试题10） |
| 2026-07-10 | ElapsedTimeMiddleware 及面试题5 答案统一加 HasStarted 检查 |
