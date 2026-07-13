# 第 19 章：微服务架构与 API 网关

> **版本信息**：.NET 5.0 / ABP 4.4.0 / C# 9 / Ocelot 16.0 / Polly 7.2  
> **业务场景**：智慧养老院管理系统  
> **预计阅读**：45 分钟 | **预计代码量**：约 800 行

---

## 学习目标

完成本章学习后，你将能够：

1. 理解单体架构与微服务架构的区别，掌握拆分决策方法
2. 使用 Ocelot 配置 API 网关的路由转发、负载均衡与聚合路由
3. 掌握四种限流算法的原理、区别与适用场景
4. 使用 Polly 实现熔断、重试、超时、降级策略
5. 了解 ABP HttpApi.Client 动态代理调用方式
6. 通过 CorrelationId 实现分布式调用链追踪
7. 理解服务注册与发现的核心概念
8. 将养老院系统拆分为长者服务、财务服务和网关三个独立项目

---

## 前置知识

- 已完成第 10 章学习（认证与授权：JWT Token、OAuth2）
- 已完成第 12 章学习（Redis 缓存与分布式锁：缓存策略、分布式锁原理）
- 已完成第 18 章学习（SignalR 实时通信：Hub、分组推送）
- 了解 Ocelot 网关基本配置（路由转发概念）

---

## 为什么需要学这个？

想象养老院规模从 50 位长者扩展到 500 位，单体应用的代码量从 5 万行膨胀到 50 万行。每次修改财务模块都要重新部署整个系统，一个护理服务的内存泄漏导致整个养老院管理系统崩溃——这就是单体架构在规模化后的典型痛点。

微服务不是银弹，但理解它能让你在架构决策时做出更明智的选择。即使最终选择不拆分，你也能说清楚「为什么不该拆」，这在面试中同样重要。

---

## 19.1 单体架构 vs 微服务架构

### 19.1.1 生活类比

**单体架构**就像养老院的一栋综合楼：一楼接待、二楼餐饮、三楼医疗、四楼住宿。所有功能集中在一栋楼里，优点是上下楼方便、沟通高效；缺点是三楼装修时整栋楼都得停工，而且一栋楼装不下所有功能时就得换更大的楼。

**微服务架构**就像把养老院拆成多栋独立小楼：长者服务楼、财务服务楼、护理服务楼、餐饮服务楼，每栋楼独立运营、独立维护。一栋楼装修不影响其他楼，一栋楼装不下就单独扩建那一栋。

### 19.1.2 什么时候该拆？什么时候不该拆？

| 决策维度 | 不该拆（保持单体） | 该拆（转向微服务） |
|---------|------------------|------------------|
| 团队规模 | 1-5 人的小团队 | 多个团队独立开发 |
| 业务复杂度 | 功能单一、变化少 | 多业务线、各自迭代 |
| 部署频率 | 每月一次足够 | 需要每天多次部署 |
| 可用性要求 | 偶尔停机可接受 | 需要各模块独立可用 |
| 数据规模 | 单库可承载 | 各业务数据量差异大 |

**核心原则：不要为了微服务而微服务。** 如果养老院只有 30 位长者、2 个开发人员，用单体架构完全足够。

### 19.1.3 拆分原则——按业务边界拆分

将养老院管理系统按业务边界拆分为三个独立服务：

```
养老院管理系统
├── 网关服务 (Gateway)          — 统一入口、路由转发、限流
├── 长者服务 (ElderService)     — 长者档案、入住退住、健康档案
└── 财务服务 (FinanceService)   — 费用缴纳、账单管理、财务报表
```

每个服务拥有独立的数据库、独立的部署单元、独立的团队负责。

---

## 19.2 Ocelot 网关配置

Ocelot 是 .NET 生态中最流行的 API 网关库，它像养老院的前台接待——所有访客先到前台，前台根据访客需求把他们引导到对应的楼栋。

### 19.2.1 路由转发

路由转发的核心是将上游请求路径映射到下游服务路径：

```json
{
  "Routes": [
    {
      "UpstreamPathTemplate": "/api/elder/{everything}",
      "UpstreamHttpMethod": [ "GET", "POST", "PUT", "DELETE" ],
      "DownstreamPathTemplate": "/api/elder/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "elder-service", "Port": 5001 }
      ]
    },
    {
      "UpstreamPathTemplate": "/api/finance/{everything}",
      "UpstreamHttpMethod": [ "GET", "POST", "PUT", "DELETE" ],
      "DownstreamPathTemplate": "/api/finance/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "finance-service", "Port": 5002 }
      ]
    }
  ]
}
```

外部请求 `GET /api/elder/123` 经过网关后被转发到 `http://elder-service:5001/api/elder/123`。

### 19.2.2 负载均衡

当养老院有多个分院（多个服务实例）时，网关需要决定把请求分给哪个分院：

```json
{
  "Routes": [
    {
      "UpstreamPathTemplate": "/api/elder/{everything}",
      "DownstreamPathTemplate": "/api/elder/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "elder-service-1", "Port": 5001 },
        { "Host": "elder-service-2", "Port": 5001 }
      ],
      "LoadBalancerOptions": {
        "Type": "LeastConnection"
      }
    }
  ]
}
```

**Round Robin（轮询）**：轮流分配，像前台按顺序安排访客去各分院。  
**LeastConnection（最少连接）**：优先分配给当前空闲的实例，像前台把访客导向人少的分院。

### 19.2.3 聚合路由

有时前端需要同时获取长者信息和财务信息，聚合路由可以把多个下游服务的响应合并返回：

```json
{
  "Aggregates": [
    {
      "RouteKeys": [ "elder-detail", "finance-summary" ],
      "UpstreamPathTemplate": "/api/elder/{id}/dashboard",
      "Aggregator": "ElderDashboardAggregator"
    }
  ]
}
```

聚合路由让前端只需一次请求就能拿到所有需要的数据，减少网络往返。

### 19.2.4 在 ABP 中集成 Ocelot

```csharp
// GatewayHostModule.cs
using Volo.Abp.Modularity;
using Microsoft.Extensions.DependencyInjection;

namespace Elderly.Gateway
{
    [DependsOn()]
    public class GatewayHostModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            var configuration = context.Services.GetConfiguration();
            context.Services.AddOcelot(configuration);
        }
    }
}
```

```csharp
// Startup.cs
namespace Elderly.Gateway
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddApplication<GatewayHostModule>();
        }

        public void Configure(IApplicationBuilder app)
        {
            // Ocelot 中间件注册需同步等待；禁止使用 async void
            app.UseOcelot().GetAwaiter().GetResult();
        }
    }
}
```

---

## 19.3 限流算法（面试重点）

养老院前台每天只接待 50 位访客，超出的需要在外面等候——这就是限流的核心思想。网关作为统一入口，必须限制每个客户端的请求速率，防止某个客户端占用过多资源导致其他服务不可用。

### 19.3.1 固定窗口限流

设定一个固定时间窗口（如每分钟），窗口内允许的最大请求数为 100。

```
时间轴: |----第1分钟----|----第2分钟----|
请求数: |    100/100    |    100/100    |
```

**优点**：实现简单，只需一个计数器和时间戳。  
**缺点（窗口边界突刺）**：如果第 1 分钟的最后 1 秒来了 100 个请求，第 2 分钟的第 1 秒又来了 100 个请求，那么在 2 秒内实际处理了 200 个请求，远超预期的每秒约 1.67 个请求的限制。

Ocelot 内置的限流就是固定窗口算法：

```json
{
  "Routes": [
    {
      "UpstreamPathTemplate": "/api/elder/{everything}",
      "DownstreamPathTemplate": "/api/elder/{everything}",
      "RateLimitOptions": {
        "EnableRateLimiting": true,
        "Period": "1m",
        "PeriodTimespan": "00:01:00",
        "Limit": 100
      }
    }
  ]
}
```

### 19.3.2 滑动窗口限流

将时间窗口划分为多个小格子，每次滑动一小格，统计最近一小段时间内的请求数：

```
滑动窗口（3 个小格，每格 20 秒）:
[格1: 30次] [格2: 25次] [格3: 20次] → 总计 75 < 100，允许
```

每次窗口向前滑动一格，丢弃最早一格的数据。比固定窗口更平滑，但实现复杂度略高。

### 19.3.3 漏桶算法

请求像水一样流入桶中，桶底以恒定速率流出（处理请求）。桶满时新请求被丢弃。

```
        请求流入（可突发）
        ↓↓↓↓↓↓↓↓↓↓
    ┌─────────────────┐
    │   漏桶（缓冲区）    │  ← 桶满则丢弃
    └────────┬────────┘
             ↓ （恒定速率流出）
        服务处理请求
```

**优点**：输出速率恒定，削峰填谷效果好。  
**缺点**：即使系统空闲，突发请求也只能排队等待，无法利用空闲资源。

### 19.3.4 令牌桶算法

系统以恒定速率往桶里放令牌，每个请求需要消耗一个令牌。桶满时令牌不再放入。突发流量时可以消耗桶中积攒的令牌。

```
    令牌以恒定速率放入
        ↓↓↓↓↓↓
    ┌─────────────────┐
    │  令牌桶（最多10个） │  ← 桶满则不再放入
    └────────┬────────┘
             ↓ 每个请求取一个令牌
        消耗令牌 → 处理请求
        无令牌 → 拒绝请求
```

**优点**：允许一定的突发流量（桶中积攒的令牌），生产环境最常用。  
**缺点**：参数调优需要根据实际业务场景调整。

**C# 实现令牌桶示例**：

```csharp
namespace Elderly.Gateway.RateLimit
{
    public class TokenBucketRateLimiter
    {
        private readonly int _bucketSize;
        private readonly int _refillRate;    // 每秒补充的令牌数
        private double _currentTokens;
        private DateTime _lastRefillTime;
        private readonly object _lock = new();

        public TokenBucketRateLimiter(int bucketSize, int refillRate)
        {
            _bucketSize = bucketSize;
            _refillRate = refillRate;
            _currentTokens = bucketSize;
            _lastRefillTime = DateTime.UtcNow;
        }

        public bool TryAcquire()
        {
            lock (_lock)
            {
                RefillTokens();
                if (_currentTokens >= 1)
                {
                    _currentTokens -= 1;
                    return true;
                }
                return false;
            }
        }

        private void RefillTokens()
        {
            var now = DateTime.UtcNow;
            var elapsed = (now - _lastRefillTime).TotalSeconds;
            var tokensToAdd = elapsed * _refillRate;
            _currentTokens = Math.Min(_bucketSize, _currentTokens + tokensToAdd);
            _lastRefillTime = now;
        }
    }
}
```

### 19.3.5 限流算法对比

| 特性 | 固定窗口 | 滑动窗口 | 漏桶 | 令牌桶 |
|------|---------|---------|------|-------|
| 突发处理 | 边界突刺严重 | 较平滑 | 不允许突发 | 允许突发 |
| 平滑度 | 差 | 好 | 最好 | 较好 |
| 实现复杂度 | 最简单 | 中等 | 简单 | 中等 |
| 内存占用 | 最小 | 较大 | 小 | 小 |
| 适用场景 | 简单限流 | 对平滑度要求高 | 严格控速 | 生产最常用 |

---

## 19.4 Polly 熔断、重试与超时策略

Polly 是 .NET 生态中最强大的弹性策略库。想象养老院的应急方案：当某个区域发生紧急情况时（比如三楼电路故障），不会让所有人继续往三楼跑，而是立即停止引导（熔断），等检修完成后先派几个人上去试试（半开状态），确认安全后再全面恢复。

### 19.4.1 熔断器三种状态

```
    Closed（正常）
    │  失败次数达到阈值
    ▼
    Open（熔断）
    │  超时时间到达
    ▼
    HalfOpen（半开）
    ├── 试探成功 → 回到 Closed
    └── 试探失败 → 回到 Open
```

- **Closed**：所有请求正常通过，但记录失败次数
- **Open**：所有请求立即失败（快速失败），不再调用下游服务
- **HalfOpen**：允许少量请求通过以试探下游服务是否恢复

### 19.4.2 在 ABP 中使用 Polly

```csharp
// 通过 NuGet 安装：Microsoft.Extensions.Http.Polly

namespace Elderly.HttpApi.Client
{
    public class HttpClientConfigurer
    {
        public static void Configure(HttpClient client)
        {
            client.BaseAddress = new Uri("http://finance-service:5002");
            client.Timeout = TimeSpan.FromSeconds(10);
        }
    }
}
```

### 19.4.3 重试策略

```csharp
using Polly;
using Polly.Extensions.Http;
using System.Net;

namespace Elderly.HttpApi.Client
{
    public static class PollyPolicies
    {
        // 重试策略：失败后重试 3 次，每次等待时间递增
        public static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy()
        {
            return HttpPolicyExtensions
                .HandleTransientHttpError()        // 处理 5xx 和 HttpRequestException
                .WaitAndRetryAsync(
                    retryCount: 3,
                    sleepDurationProvider: attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                    onRetry: (outcome, timespan, retryAttempt, context) =>
                    {
                        // 记录重试日志：养老院财务服务调用失败，第 {retryAttempt} 次重试
                        Console.WriteLine(
                            $"[养老院网关] 调用失败，{timespan.TotalSeconds}秒后进行第{retryAttempt}次重试");
                    });
        }
    }
}
```

### 19.4.4 熔断策略

```csharp
namespace Elderly.HttpApi.Client
{
    public static class CircuitBreakerPolicies
    {
        // 熔断策略：连续 5 次失败后熔断，30 秒后尝试恢复
        public static IAsyncPolicy<HttpResponseMessage> GetCircuitBreakerPolicy()
        {
            return HttpPolicyExtensions
                .HandleTransientHttpError()
                .CircuitBreakerAsync(
                    handledEventsAllowedBeforeBreaking: 5,
                    durationOfBreak: TimeSpan.FromSeconds(30),
                    onBreak: (outcome, timespan) =>
                    {
                        Console.WriteLine($"[养老院网关] 熔断器打开，财务服务不可用，{timespan.TotalSeconds}秒后重试");
                    },
                    onReset: () =>
                    {
                        Console.WriteLine("[养老院网关] 熔断器关闭，财务服务恢复正常");
                    },
                    onHalfOpen: () =>
                    {
                        Console.WriteLine("[养老院网关] 熔断器半开，试探性调用财务服务");
                    });
        }
    }
}
```

### 19.4.5 超时与降级策略

```csharp
namespace Elderly.HttpApi.Client
{
    public static class TimeoutPolicies
    {
        // 超时策略：超过 5 秒未响应则超时
        public static IAsyncPolicy<HttpResponseMessage> GetTimeoutPolicy()
        {
            return Policy
                .TimeoutAsync<HttpResponseMessage>(
                    timeout: TimeSpan.FromSeconds(5),
                    onTimeoutAsync: (context, timespan, task) =>
                    {
                        Console.WriteLine("[养老院网关] 调用超时，超过5秒未响应");
                        return System.Threading.Tasks.Task.CompletedTask;
                    });
        }

        // 降级策略：当服务不可用时返回兜底数据
        public static IAsyncPolicy<HttpResponseMessage> GetFallbackPolicy()
        {
            return Policy<HttpResponseMessage>
                .Handle<Exception>()
                .FallbackAsync(
                    fallbackAction: (cancellationToken) =>
                    {
                        var response = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
                        {
                            Content = new StringContent("{\"message\":\"财务服务暂时不可用，请稍后重试\"}")
                        };
                        return System.Threading.Tasks.Task.FromResult(response);
                    },
                    onFallbackAsync: (outcome, context) =>
                    {
                        Console.WriteLine("[养老院网关] 触发降级策略，返回兜底数据");
                        return System.Threading.Tasks.Task.CompletedTask;
                    });
        }
    }
}
```

### 19.4.6 组合策略

实际项目中通常将多种策略组合使用：

```csharp
namespace Elderly.HttpApi.Client
{
    public static class CombinedPolicies
    {
        public static IAsyncPolicy<HttpResponseMessage> GetCombinedPolicy()
        {
            var fallback = PollyPolicies.GetFallbackPolicy();  // 兜底策略放最外层
            var circuitBreaker = CircuitBreakerPolicies.GetCircuitBreakerPolicy();
            var retry = PollyPolicies.GetRetryPolicy();
            var timeout = TimeoutPolicies.GetTimeoutPolicy();

            // 执行顺序：fallback → circuitBreaker → retry → timeout
            return Policy.WrapAsync(fallback, circuitBreaker, retry, timeout);
        }
    }
}
```

---

## 19.5 HttpApi.Client 动态代理

ABP 框架提供了微服务间 HTTP 调用的便捷方式。就像养老院各楼栋之间的内部对讲系统——你只需说出对方楼栋的名字和需求，对讲系统自动帮你联系。

### 19.5.1 定义服务接口

```csharp
// 在共享的契约层定义接口
namespace Elderly.Finance
{
    public interface IBillingAppService : IApplicationService
    {
        Task<BillingDto> GetBillingByElderIdAsync(Guid elderId);
    }

    public class BillingDto
    {
        public Guid ElderId { get; set; }
        public string ElderName { get; set; }
        public decimal TotalAmount { get; set; }
        public bool IsPaid { get; set; }
    }
}
```

### 19.5.2 配置 HttpClient 代理

```csharp
// ElderServiceHostModule.cs
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Http.Client;

namespace Elderly.Elder
{
    [DependsOn(typeof(AbpHttpClientModule))]
    public class ElderServiceHostModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            // 注册远程服务代理
            context.Services.AddHttpClientProxies(
                typeof(Elderly.Finance.ElderlyFinanceApplicationContractsModule).Assembly,
                remoteServiceConfigurationName: "Finance"
            );
        }
    }
}
```

### 19.5.3 appsettings.json 配置远程服务地址

```json
{
  "RemoteServices": {
    "Finance": {
      "BaseUrl": "http://finance-service:5002/"
    }
  }
}
```

### 19.5.4 在服务中注入并使用

```csharp
using Volo.Abp.Application.Services;

namespace Elderly.Elder.Services
{
    [Area("elder")]
    [Route("api/elder/dashboard")]
    public class DashboardAppService : ApplicationService
    {
        private readonly IBillingAppService _billingAppService;

        public DashboardAppService(IBillingAppService billingAppService)
        {
            _billingAppService = billingAppService;
        }

        [HttpGet("{elderId}")]
        public async Task<DashboardDto> GetDashboardAsync(Guid elderId)
        {
            // 通过动态代理调用财务服务，ABP 自动生成 HTTP 客户端
            var billing = await _billingAppService.GetBillingByElderIdAsync(elderId);

            return new DashboardDto
            {
                ElderId = elderId,
                BillingInfo = billing,
                Message = $"长者费用信息获取成功，应缴金额：{billing.TotalAmount}元"
            };
        }
    }
}
```

---

## 19.6 CorrelationId 调用链追踪

在微服务架构中，一个请求可能经过网关→长者服务→财务服务三个节点。如果出了问题，如何把这些分散在不同服务中的日志串联起来？答案是 CorrelationId。

### 19.6.1 工作原理

```
客户端请求 → 网关（生成 CorrelationId: abc-123）
    → 长者服务（收到 abc-123，记录日志）
        → 财务服务（收到 abc-123，记录日志）
```

每个服务在处理请求时，都会在日志中记录同一个 CorrelationId，排查问题时只需搜索这个 ID 就能看到完整的调用链。

### 19.6.2 网关中间件注入 CorrelationId

```csharp
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace Elderly.Gateway.Middleware
{
    public class CorrelationIdMiddleware : IMiddleware
    {
        private const string CorrelationIdHeader = "X-Correlation-Id";

        public async Task InvokeAsync(HttpContext context, RequestDelegate next)
        {
            var correlationId = context.Request.Headers[CorrelationIdHeader].FirstOrDefault()
                ?? Guid.NewGuid().ToString();

            // 将 CorrelationId 存入 HttpContext，方便后续使用
            context.Items["CorrelationId"] = correlationId;

            // 传递给下游服务
            context.Request.Headers[CorrelationIdHeader] = correlationId;

            // 响应中也返回 CorrelationId
            context.Response.OnStarting(() =>
            {
                context.Response.Headers[CorrelationIdHeader] = correlationId;
                return System.Threading.Tasks.Task.CompletedTask;
            });

            await next(context);
        }
    }
}
```

### 19.6.3 下游服务提取 CorrelationId

```csharp
using Microsoft.Extensions.Logging;

namespace Elderly.Elder.Middleware
{
    public class CorrelationIdLoggingMiddleware : IMiddleware
    {
        private readonly ILogger<CorrelationIdLoggingMiddleware> _logger;

        public CorrelationIdLoggingMiddleware(ILogger<CorrelationIdLoggingMiddleware> logger)
        {
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context, RequestDelegate next)
        {
            var correlationId = context.Request.Headers["X-Correlation-Id"].FirstOrDefault()
                ?? "unknown";

            // 使用结构化日志记录 CorrelationId
            using (_logger.BeginScope(new Dictionary<string, object>
            {
                ["CorrelationId"] = correlationId
            }))
            {
                _logger.LogInformation("[长者服务] 开始处理请求，CorrelationId: {CorrelationId}", correlationId);
                await next(context);
                _logger.LogInformation("[长者服务] 请求处理完成，CorrelationId: {CorrelationId}", correlationId);
            }
        }
    }
}
```

排查问题时，只需在日志系统中搜索 CorrelationId，即可看到完整的请求链路。

---

## 19.7 服务注册与发现

### 19.7.1 为什么需要服务注册与发现？

在微服务架构中，服务的实例数量和地址是动态变化的。就像养老院的工作人员——你不能把每个护工的手机号硬编码到通讯录里，而需要一个动态的「员工通讯录系统」。

### 19.7.2 Consul 服务注册与发现

Consul 是 HashiCorp 开源的服务发现工具：

```
服务启动 → 向 Consul 注册（服务名 + IP + 端口）
         → 定期发送心跳（健康检查）
客户端   → 从 Consul 查询服务地址
         → 获取可用实例列表
         → 自行负载均衡
```

```csharp
// 服务注册示例（概念代码）
public class ConsulRegistration
{
    public static async Task RegisterServiceAsync()
    {
        var consulClient = new ConsulClient(config =>
        {
            config.Address = new Uri("http://consul:8500");
        });

        var registration = new AgentServiceRegistration
        {
            ID = "elder-service-1",
            Name = "elder-service",
            Address = "10.0.0.1",
            Port = 5001,
            Check = new AgentServiceCheck
            {
                HTTP = "http://10.0.0.1:5001/health",
                Interval = TimeSpan.FromSeconds(10),
                Timeout = TimeSpan.FromSeconds(5),
                DeregisterCriticalServiceAfter = TimeSpan.FromMinutes(1)
            }
        };

        await consulClient.Agent.ServiceRegister(registration);
    }
}
```

### 19.7.3 Nacos 概念

Nacos 是阿里巴巴开源的服务发现与配置管理平台，在国内 .NET 项目中也有广泛使用。与 Consul 相比，Nacos 额外提供了配置中心功能，支持动态配置更新。

面试时如果被问到，只需说清楚三个核心概念：**服务注册**（服务启动时告诉注册中心自己的地址）、**健康检查**（定期证明自己还活着）、**服务发现**（从注册中心查询其他服务的地址）。

---

## 19.8 实战：将养老院系统拆分为微服务

### 19.8.1 项目结构

```
ElderlyMicroservices/
├── Elderly.Gateway/                  # API 网关
│   ├── ocelot.json
│   ├── Middleware/
│   │   └── CorrelationIdMiddleware.cs
│   └── Program.cs
├── Elderly.ElderService/             # 长者服务
│   ├── Controllers/
│   │   └── ElderController.cs
│   └── Services/
│       └── ElderAppService.cs
├── Elderly.FinanceService/           # 财务服务
│   ├── Controllers/
│   │   └── BillingController.cs
│   └── Services/
│       └── BillingAppService.cs
└── Elderly.Shared/                   # 共享契约
    ├── IBillingAppService.cs
    └── BillingDto.cs
```

### 19.8.2 网关项目配置

```csharp
// Gateway/Program.cs
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;

namespace Elderly.Gateway
{
    public class Program
    {
        public static void Main(string[] args)
        {
            CreateHostBuilder(args).Build().Run();
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>();
                });
    }
}
```

### 19.8.3 长者服务 Controller

```csharp
using Microsoft.AspNetCore.Mvc;
using System;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;

namespace Elderly.ElderService.Controllers
{
    [Area("elder")]
    [Route("api/elder/elders")]
    public class ElderController : AbpController
    {
        private readonly ElderAppService _elderAppService;

        public ElderController(ElderAppService elderAppService)
        {
            _elderAppService = elderAppService;
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetAsync(Guid id)
        {
            var result = await _elderAppService.GetAsync(id);
            return Ok(result);
        }

        [HttpGet]
        public async Task<IActionResult> GetListAsync()
        {
            var result = await _elderAppService.GetListAsync();
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> CreateAsync(CreateElderInput input)
        {
            var result = await _elderAppService.CreateAsync(input);
            return Ok(result);
        }
    }
}
```

### 19.8.4 财务服务 Controller

```csharp
using Microsoft.AspNetCore.Mvc;
using System;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;

namespace Elderly.FinanceService.Controllers
{
    [Area("finance")]
    [Route("api/finance/billing")]
    public class BillingController : AbpController
    {
        private readonly BillingAppService _billingAppService;

        public BillingController(BillingAppService billingAppService)
        {
            _billingAppService = billingAppService;
        }

        [HttpGet("elder/{elderId}")]
        public async Task<IActionResult> GetByElderIdAsync(Guid elderId)
        {
            var result = await _billingAppService.GetByElderIdAsync(elderId);
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> CreateAsync(CreateBillingInput input)
        {
            var result = await _billingAppService.CreateAsync(input);
            return Ok(result);
        }
    }
}
```

### 19.8.5 网关 ocelot.json 完整配置

```json
{
  "Routes": [
    {
      "UpstreamPathTemplate": "/api/elder/{everything}",
      "UpstreamHttpMethod": [ "GET", "POST", "PUT", "DELETE" ],
      "DownstreamPathTemplate": "/api/elder/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "localhost", "Port": 5001 }
      ],
      "RateLimitOptions": {
        "EnableRateLimiting": true,
        "Period": "1m",
        "PeriodTimespan": "00:01:00",
        "Limit": 100
      }
    },
    {
      "UpstreamPathTemplate": "/api/finance/{everything}",
      "UpstreamHttpMethod": [ "GET", "POST", "PUT", "DELETE" ],
      "DownstreamPathTemplate": "/api/finance/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "localhost", "Port": 5002 }
      ],
      "RateLimitOptions": {
        "EnableRateLimiting": true,
        "Period": "1m",
        "PeriodTimespan": "00:01:00",
        "Limit": 100
      }
    }
  ],
  "GlobalConfiguration": {
    "BaseUrl": "http://localhost:5000"
  }
}
```

---

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | 项目刚启动就拆成 10 个微服务 | 从单体开始，按需拆分 | 过早微服务化增加运维复杂度，小团队无法承受 |
| 2 | 所有服务共享同一个数据库 | 每个微服务拥有独立数据库 | 数据库耦合违背微服务独立部署的原则 |
| 3 | 在 Controller 中直接 `new HttpClient()` | 使用 `IHttpClientFactory` 或 ABP 动态代理 | 直接 new 会导致端口耗尽和 DNS 更新问题 |
| 4 | 熔断器阈值设为 1 次失败就熔断 | 设为 5-10 次连续失败 | 阈值太低会导致偶发网络抖动就触发熔断 |
| 5 | 重试策略不设退避间隔（立即重试） | 使用指数退避 `2^n` 秒 | 立即重试会加重下游服务负担，导致雪崩 |
| 6 | 网关不配置限流 | 根据业务配置合理的限流规则 | 无限流则任何客户端都可能压垮后端服务 |
| 7 | 日志不包含 CorrelationId | 所有日志通过中间件注入 CorrelationId | 无 CorrelationId 则无法追踪跨服务调用链 |
| 8 | 用 `lock` 实现令牌桶但不做时间补偿 | 每次获取令牌时根据时间差补充令牌 | 不做时间补偿会导致长时间无请求后令牌数不准确 |

---

## 本章小结

本章从养老院的业务场景出发，系统讲解了微服务架构的核心概念与实践：

1. **单体 vs 微服务**：理解了拆分的时机和原则，不盲目追求微服务
2. **Ocelot 网关**：掌握了路由转发、负载均衡、聚合路由的配置方法
3. **限流算法**：深入理解了固定窗口、滑动窗口、漏桶、令牌桶四种算法的原理与区别
4. **Polly 弹性策略**：学会了熔断器三状态、重试策略、超时策略、降级策略的使用
5. **HttpApi.Client**：了解了 ABP 微服务间 HTTP 调用的便捷方式
6. **CorrelationId**：实现了跨服务调用链追踪
7. **服务注册与发现**：理解了 Consul/Nacos 的核心概念
8. **实战拆分**：将养老院系统成功拆分为网关、长者服务、财务服务三个独立项目

---

## 面试题

### 面试题 1（中级 / 概念题）
**题目：什么是微服务？单体架构和微服务架构有什么区别？**

**参考答案**：微服务是一种架构风格，将应用程序拆分为一组小型、独立部署的服务。以养老院为例，单体架构就像一栋综合楼管理所有业务（接待、财务、护理），微服务则拆分为多栋独立小楼各管各的。单体架构部署简单但耦合度高，修改财务模块需要重新部署整个系统；微服务各服务独立部署，但引入了网络通信、分布式事务等复杂性。选择时需要根据团队规模、业务复杂度和部署频率来决定。

### 面试题 2（高级 / 概念题）
**题目：请比较令牌桶和漏桶算法的区别，各自适用于什么场景？**

**参考答案**：漏桶算法以恒定速率处理请求，就像养老院前台以固定速度接待访客，超出桶容量的请求直接丢弃，适合需要严格控速的场景。令牌桶算法以恒定速率生成令牌，允许桶中积累令牌从而应对突发流量，就像前台每天准备一定数量的访客牌，积攒的访客牌可以在高峰期一次性使用。令牌桶更适合生产环境，因为大多数业务场景需要允许一定的突发流量。养老院系统在月底集中缴费时会产生突发请求，使用令牌桶可以平滑处理这种场景。

### 面试题 3（高级 / 概念题）
**题目：请解释熔断器的三种状态及其转换条件。**

**参考答案**：熔断器有三种状态：Closed（关闭/正常）、Open（打开/熔断）、HalfOpen（半开/试探）。正常情况下处于 Closed 状态，所有请求正常通过但记录失败次数；当失败次数达到阈值（如连续 5 次），熔断器切换到 Open 状态，此时所有请求直接返回失败（快速失败），不再调用下游服务；经过一段超时时间后，熔断器进入 HalfOpen 状态，允许少量请求通过以试探下游服务是否恢复，如果试探成功则回到 Closed 状态，失败则回到 Open 状态。在养老院系统中，当财务服务连续 5 次超时后，网关会自动熔断，避免请求堆积压垮财务服务。

### 面试题 4（中级 / 场景题）
**题目：Polly 的重试策略有哪些参数可以配置？指数退避是什么意思？**

**参考答案**：Polly 重试策略主要配置三个参数：重试次数、退避间隔和重试回调。指数退避是指每次重试的等待时间按 2 的幂次递增，如第 1 次等 2 秒，第 2 次等 4 秒，第 3 次等 8 秒。这种策略的好处是给下游服务更多恢复时间，避免密集重试导致雪崩。在养老院系统中，如果财务服务暂时过载，指数退避可以减轻其压力，而不是立即重试加重负担。

### 面试题 5（中级 / 概念题）
**题目：什么是 API 网关？Ocelot 网关的主要功能有哪些？**

**参考答案**：API 网关是微服务架构的统一入口，负责路由转发、负载均衡、认证授权、限流等功能。Ocelot 是 .NET 生态中的 API 网关库，主要功能包括：路由转发（将外部请求映射到对应的内部服务）、负载均衡（支持轮询和最少连接策略）、限流（限制客户端请求速率）、请求聚合（合并多个下游服务的响应）。在养老院系统中，网关接收所有外部请求，根据 URL 路径将长者相关请求转发到长者服务，财务相关请求转发到财务服务。

### 面试题 6（中级 / 场景题）
**题目：什么是 CorrelationId？在微服务架构中有什么作用？**

**参考答案**：CorrelationId（关联 ID）是一个唯一标识符，用于串联一次请求在多个微服务中的完整调用链。当养老院系统的前端发起一个查询请求，经过网关到达长者服务，长者服务再调用财务服务，每个环节的日志都会记录同一个 CorrelationId。排查问题时只需搜索这个 ID，就能看到从网关到各服务的完整日志链路，快速定位问题所在。通常通过 HTTP Header（X-Correlation-Id）在服务间传递。

### 面试题 7（初级 / 概念题）
**题目：服务注册与发现的流程是什么？Consul 和 Nacos 有什么区别？**

**参考答案**：服务注册与发现的流程是：服务启动时向注册中心注册自己的地址和端口，定期发送心跳证明自己还活着（健康检查），客户端从注册中心查询目标服务的可用实例列表。Consul 是 HashiCorp 开源的，主要提供服务发现和健康检查；Nacos 是阿里巴巴开源的，额外提供配置中心功能，支持动态配置更新。在养老院系统中，长者服务启动时向注册中心注册，财务服务需要调用时从注册中心获取长者服务的地址。

### 面试题 8（高级 / 设计题）
**题目：如何设计一个令牌桶限流器？请描述核心数据结构和算法。**

**参考答案**：令牌桶限流器需要三个核心参数：桶容量（最大令牌数）、补充速率（每秒生成的令牌数）、当前令牌数。核心算法是：每次请求到来时，先根据上次补充时间和当前时间的差值计算应补充的令牌数（不能超过桶容量），然后检查当前令牌数是否大于 0，是则消耗一个令牌放行请求，否则拒绝。需要注意线程安全，使用锁或原子操作。在养老院系统中，如果设定桶容量为 50、补充速率为每秒 10 个令牌，那么可以应对最多 50 个并发请求的突发，之后以每秒 10 个的速率平稳处理。

### 面试题 9（中级 / 场景题）
**题目：Ocelot 的负载均衡策略有哪些？LeastConnection 和 RoundRobin 有什么区别？**

**参考答案**：Ocelot 支持两种主要的负载均衡策略：RoundRobin（轮询）和 LeastConnection（最少连接）。RoundRobin 按顺序轮流分配请求，每个实例获得相同数量的请求，适合实例性能一致的场景。LeastConnection 优先将请求分配给当前活跃连接数最少的实例，适合实例处理能力不同或请求处理时间差异大的场景。在养老院系统中，如果财务服务有两个实例且处理能力相同，用 RoundRobin；如果一个实例配置较高，用 LeastConnection 更合理。

### 面试题 10（高级 / 设计题）
**题目：微服务拆分应该遵循什么原则？什么时候不应该拆分？**

**参考答案**：微服务拆分应遵循业务边界原则，按限界上下文拆分，每个服务拥有独立的数据存储。以养老院为例，长者管理、财务管理、护理管理是三个独立的业务域，应该拆分为独立服务。拆分时还要考虑团队组织结构（康威定律）、数据独立性和部署独立性。不应该拆分的情况包括：团队规模小（少于 5 人）、业务逻辑简单、不需要独立部署、网络延迟对性能影响大。盲目拆分会增加运维复杂度，得不偿失。

### 面试题 11（中级 / 概念题）
**题目：什么是降级策略？与熔断策略有什么区别？**

**参考答案**：降级策略是在服务不可用时返回兜底数据，保证用户仍能获得基本功能；熔断策略是在检测到下游服务故障时主动切断调用，避免级联故障。区别在于：熔断是被动触发（基于失败率），降级是主动设计（预先准备兜底方案）。在养老院系统中，当财务服务熔断后，长者信息查询可以触发降级，返回「财务信息暂时不可用」的友好提示，而不是直接报错。熔断和降级通常配合使用，熔断是前提，降级是结果。

### 面试题 12（中级 / 场景题）
**题目：滑动窗口限流相比固定窗口限流有什么优势？**

**参考答案**：固定窗口限流在窗口边界存在突刺问题——第一个窗口末尾和第二个窗口开头可以短时间内通过两倍于限制的请求。滑动窗口将时间窗口划分为多个小格子，每次滑动一格统计最近一段时间的请求总量，有效避免了边界突刺。以养老院前台为例，固定窗口每分钟限 100 人，如果第一分钟最后 1 秒来了 100 人，第二分钟第 1 秒又来 100 人，2 秒内通过了 200 人。滑动窗口则会统计最近 1 分钟内的总数，有效平滑限流。

### 面试题 13（高级 / 设计题）
**题目：在 ABP 框架中如何实现微服务间的 HTTP 调用？有哪些方式？**

**参考答案**：ABP 框架提供了两种微服务间 HTTP 调用方式。第一种是动态代理（HttpClientProxy），在契约层定义接口，ABP 自动生成 HTTP 客户端实现，使用时像调用本地方法一样，配置 `RemoteServices` 指定目标服务地址即可。第二种是直接使用 `IHttpClientFactory`，手动发送 HTTP 请求。推荐使用动态代理方式，因为它与 ABP 的依赖注入、异常处理、序列化等机制深度集成。在养老院系统中，长者服务需要查询财务信息时，通过 `IBillingAppService` 接口的动态代理即可透明调用财务服务。

### 面试题 14（初级 / 概念题）
**题目：什么是请求聚合？在什么场景下使用？**

**参考答案**：请求聚合是 API 网关将一个外部请求分解为多个内部请求，分别调用不同的下游服务，最后将多个响应合并为一个响应返回给客户端。适用场景是前端需要同时获取多个服务的数据，但不希望发起多次请求。在养老院系统中，长者仪表盘页面需要同时显示长者基本信息（来自长者服务）和费用信息（来自财务服务），网关的聚合路由可以一次请求拿到两个服务的数据，减少网络往返次数，提升用户体验。

---

## 下一章预告

**第 20 章：第三方服务集成**

养老院系统需要对接微信、阿里云、钉钉等外部服务。下一章将学习：
- HttpClientFactory 原理（为什么不能直接 new HttpClient？Socket 耗尽 + DNS 刷新问题）
- 微信公众号/小程序 OAuth 登录流程
- 阿里云短信（SMS）发送（异常体征通知家属）
- 阿里云 OSS 文件存储（健康档案附件）
- MailKit 邮件发送（月度报告邮件）
- 钉钉考勤 API 对接（护理员排班同步）
- 实战：长者家属微信小程序绑定 + 异常短信通知


---

## 时效性声明

本章基于 **.NET 5.0**、**ABP 4.4.0**、**Ocelot 16.0**、**Polly 7.2** 编写。

说明：Ocelot 在 .NET 6+ 仍可用但社区活跃度下降，YARP（Yet Another Reverse Proxy）为微软官方推荐的反向代理方案，面试了解即可；Consul/Nacos 为概念讲解，养老院项目（d:\yls）当前以固定地址 + HttpApi.Client 为主，未实际接入服务注册中心。

---

## 修订记录

### 第 2 轮修订（2026-07-10）

| # | 修改项 | 原问题 | 处理方式 |
|---|--------|--------|---------|
| 1 | 面试题格式 | 简单/中等/困难 | 改为初级/中级/高级 + 四类题型 |
| 2 | 下一章预告 | 标题不规范、内容偏题 | 改为「第 20 章：第三方服务集成」并列举大纲要点 |
| 3 | 前置知识 | 无具体章号 | 补充第 10/12/18 章引用 |
| 4 | 重复实战 | 独立「实战案例」块重复 | 删除，保留 19.8 节 |
| 5 | 时效性声明 | v1.2 修复时误删 | 补回（本轮） |
