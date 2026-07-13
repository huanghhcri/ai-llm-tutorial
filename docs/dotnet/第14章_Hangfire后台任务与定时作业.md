# 第 14 章：Hangfire 后台任务与定时作业

## 学习目标

1. 理解后台任务在养老院系统中的必要性与典型场景
2. 掌握 ABP 内置 `IBackgroundJobManager` 接口的基本用法
3. 熟练使用 Hangfire 的即时任务、延迟任务、周期任务三种模式
4. 学会通过 `AsyncPeriodicBackgroundWorkerBase` 实现 ABP 风格的周期性 Worker
5. 配置 Hangfire Dashboard 的访问控制与权限
6. 使用 MySQL 作为 Hangfire 持久化存储
7. 掌握任务重试策略与幂等性设计原则
8. 完成实战案例：每月自动生成账单、过期提醒、数据报表定时生成

## 前置知识

- 已完成第 02 章学习（ASP.NET Core 核心原理：依赖注入、中间件管道）
- 已完成第 04 章学习（ABP 框架深度解析：模块系统、工作单元）
- 已完成第 07 章学习（实体设计与仓储模式：AsyncExecuter、仓储接口）
- ASP.NET Core 中间件管道概念

## 为什么需要学这个？

养老院系统中存在大量**不适合同步执行**的操作：每月生成数百位老人的费用账单、定时检查药品和合同是否过期、深夜统计当月运营报表。如果让用户在前端点击按钮后等待这些操作完成，不仅体验极差，还可能因为超时导致请求失败。后台任务和定时作业正是解决这类问题的核心手段，让耗时操作在后台异步执行，用户无需等待。

---

## 14.1 为什么需要后台任务

### 14.1.1 养老院场景分析

在养老院管理系统中，以下场景必须使用后台任务：

| 场景 | 触发方式 | 执行耗时 | 为何不能同步 |
|------|---------|---------|-------------|
| 月度账单生成 | 每月1号定时 | 30秒-5分钟 | 账单数量多，同步会超时 |
| 药品过期提醒 | 每天凌晨检查 | 10-30秒 | 不需要用户触发 |
| 合同到期预警 | 每天定时扫描 | 5-15秒 | 系统主动通知 |
| 月度运营报表 | 每月定时生成 | 1-10分钟 | 涉及大量聚合计算 |
| 入住登记后发送通知 | 事件触发 | 2-5秒 | 不应阻塞主流程 |

### 14.1.2 同步 vs 异步执行的对比

```csharp
// ❌ 同步方式：用户点击后等待3分钟，体验极差
public async Task<IActionResult> GenerateAllBills()
{
    var tenants = await _tenantRepository.GetAllListAsync();
    foreach (var tenant in tenants)
    {
        await _billingService.GenerateBillAsync(tenant.Id); // 每个账单耗时数秒
    }
    return Ok("生成完成");
}

// ✅ 异步方式：立即返回，后台执行
public IActionResult GenerateAllBills()
{
    BackgroundJob.Enqueue(() => _billingService.GenerateAllBillsJobAsync());
    return Ok("账单生成任务已提交，请稍后查看结果");
}
```

---

## 14.2 ABP IBackgroundJobManager

### 14.2.1 ABP 内置后台任务接口

ABP 框架内置了 `IBackgroundJobManager` 接口，提供了与具体实现无关的后台任务抽象：

```csharp
public interface IBackgroundJobManager
{
    Task<string> EnqueueAsync<TArgs>(
        TArgs args,
        BackgroundJobPriority priority = BackgroundJobPriority.Normal,
        TimeSpan? delay = null);
}
```

### 14.2.2 定义后台任务类

每个后台任务需要一个 `IBackgroundJob<TArgs>` 实现：

```csharp
public class SendNotificationJobArgs
{
    public Guid TenantId { get; set; }
    public string Message { get; set; }
    public string NotificationType { get; set; }
}

public class SendNotificationJob
    : BackgroundJob<SendNotificationJobArgs>, ITransientDependency
{
    private readonly INotificationService _notificationService;

    public SendNotificationJob(INotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    public override async Task ExecuteAsync(SendNotificationJobArgs args)
    {
        await _notificationService.SendAsync(
            args.TenantId,
            args.Message,
            args.NotificationType);
    }
}
```

### 14.2.3 使用 Hangfire 替换默认实现

ABP 默认使用内存队列处理后台任务，生产环境需要替换为 Hangfire：

```bash
# 安装 NuGet 包
dotnet add package Volo.Abp.Hangfire --version 4.4.0
dotnet add package Hangfire.MySqlStorage --version 2.0.3
```

在模块类中集成：

```csharp
using Hangfire;
using Hangfire.MySql;
using Volo.Abp.Hangfire;

[DependsOn(typeof(AbpHangfireModule))]
public class ElderlyCareHttpApiHostModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        // 连接字符串提取为变量，避免重复
        var hangfireConnStr = "Server=localhost;Database=ElderlyCareHangfire;Uid=root;Pwd=123456;";
        var storageOptions = new MySqlStorageOptions
        {
            PrepareSchemaIfNecessary = true,
            TablesPrefix = "Hangfire_"
        };

        // 将 ABP 的 IBackgroundJobManager 替换为 Hangfire 实现
        context.Services.AddHangfire(config => config
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_170)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UseStorage(new MySqlStorage(hangfireConnStr, storageOptions)));

        // 注册 Hangfire 服务器
        context.Services.AddHangfireServer();
    }

    public override void OnApplicationInitialization(
        ApplicationInitializationContext context)
    {
        var app = context.GetApplicationBuilder();
        app.UseHangfireDashboard("/hangfire");
    }
}
```

---

## 14.3 即时任务

即时任务（Fire-and-forget）是最基本的后台任务类型，提交后立即进入队列执行。

### 14.3.1 基本用法

```csharp
// 直接使用 Hangfire 静态 API
BackgroundJob.Enqueue(() => Console.WriteLine("任务已执行"));
```

### 14.3.2 养老院场景：入住登记后发送欢迎通知

```csharp
public class TenantAppService : ElderlyCareAppService, ITenantAppService
{
    private readonly IRepository<Tenant, Guid> _tenantRepository;
    private readonly INotificationService _notificationService;

    public TenantAppService(
        IRepository<Tenant, Guid> tenantRepository,
        INotificationService notificationService)
    {
        _tenantRepository = tenantRepository;
        _notificationService = notificationService;
    }

    public async Task<TenantDto> CreateAsync(CreateTenantDto input)
    {
        var tenant = ObjectMapper.Map<CreateTenantDto, Tenant>(input);
        await _tenantRepository.InsertAsync(tenant);

        // 入住登记完成后，立即发送欢迎通知（后台执行）
        BackgroundJob.Enqueue<INotificationService>(
            service => service.SendWelcomeNotificationAsync(tenant.Id));

        return ObjectMapper.Map<Tenant, TenantDto>(tenant);
    }
}
```

### 14.3.3 通过 IBackgroundJobManager 使用

```csharp
// 使用 ABP 抽象层（推荐，便于切换实现）
await _backgroundJobManager.EnqueueAsync(
    new SendNotificationJobArgs
    {
        TenantId = tenant.Id,
        Message = $"欢迎 {tenant.Name} 入住养老院",
        NotificationType = "Welcome"
    });
```

---

## 14.4 延迟任务

延迟任务在指定时间后才开始执行，适合需要等待一段时间再处理的场景。

### 14.4.1 基本用法

```csharp
// 30分钟后执行
BackgroundJob.Schedule(
    () => Console.WriteLine("30分钟后执行的任务"),
    TimeSpan.FromMinutes(30));

// 指定时间执行
BackgroundJob.Schedule(
    () => Console.WriteLine("明天早上8点执行的任务"),
    DateTimeOffset.Now.AddDays(1).Date.AddHours(8));
```

### 14.4.2 养老院场景：入住后三天发送满意度调查

```csharp
public async Task CheckInAsync(Guid tenantId)
{
    var tenant = await _tenantRepository.GetAsync(tenantId);
    tenant.CheckInDate = Clock.Now;
    await _tenantRepository.UpdateAsync(tenant);

    // 入住成功后立即发送欢迎通知
    BackgroundJob.Enqueue<INotificationService>(
        s => s.SendWelcomeNotificationAsync(tenantId));

    // 三天后发送满意度调查问卷
    BackgroundJob.Schedule<ISurveyAppService>(
        s => s.SendSatisfactionSurveyAsync(tenantId),
        TimeSpan.FromDays(3));
}
```

### 14.4.3 养老院场景：药品领取后定时提醒下次服药

```csharp
public class MedicationReminderJobArgs
{
    public Guid TenantId { get; set; }
    public string MedicationName { get; set; }
    public int IntervalHours { get; set; }
}

public async Task RecordMedicationDispenseAsync(
    Guid tenantId, string medicationName, int intervalHours)
{
    // 记录发药记录
    await _medicationLogService.LogDispenseAsync(tenantId, medicationName);

    // 安排下一次服药提醒
    BackgroundJob.Schedule<IMedicationReminderJob>(
        job => job.RemindAsync(new MedicationReminderJobArgs
        {
            TenantId = tenantId,
            MedicationName = medicationName,
            IntervalHours = intervalHours
        }),
        TimeSpan.FromHours(intervalHours));
}
```

---

## 14.5 周期任务

周期任务按照 CRON 表达式定期执行，适合定时检查、报表生成等场景。

### 14.5.1 CRON 表达式基础

| 表达式 | 含义 |
|--------|------|
| `0 0 * * *` | 每小时整点 |
| `0 8 * * *` | 每天早上8点 |
| `0 0 1 * *` | 每月1号零点 |
| `0 2 * * 1` | 每周一凌晨2点 |
| `*/5 * * * *` | 每5分钟 |
| `0 9 1,15 * *` | 每月1号和15号上午9点 |

### 14.5.2 基本用法

```csharp
// 每天凌晨1点检查药品过期
RecurringJob.AddOrUpdate(
    "medication-expiry-check",
    () => _medicationService.CheckExpiringMedicationsAsync(),
    "0 1 * * *",
    new RecurringJobOptions
    {
        TimeZone = TimeZoneInfo.FindSystemTimeZoneById("China Standard Time")
    });

// 每月1号零点生成账单
RecurringJob.AddOrUpdate(
    "monthly-bill-generation",
    () => _billingService.GenerateMonthlyBillsAsync(),
    "0 0 1 * *",
    new RecurringJobOptions
    {
        TimeZone = TimeZoneInfo.FindSystemTimeZoneById("China Standard Time")
    });

// 每天晚上10点生成日报
RecurringJob.AddOrUpdate(
    "daily-report",
    () => _reportService.GenerateDailyReportAsync(),
    "0 22 * * *",
    new RecurringJobOptions
    {
        TimeZone = TimeZoneInfo.FindSystemTimeZoneById("China Standard Time")
    });
```

### 14.5.3 管理周期任务

```csharp
// 删除周期任务
RecurringJob.RemoveIfExists("medication-expiry-check");

// 立即触发一次（不影响周期计划）
RecurringJob.TriggerJob("medication-expiry-check");

// 获取所有周期任务
var jobs = JobStorage.Current.GetConnection().GetRecurringJobs();
```

---

## 14.6 ABP AsyncPeriodicBackgroundWorkerBase

ABP 提供了 `AsyncPeriodicBackgroundWorkerBase` 基类，用于创建符合 ABP 规范的周期性后台工作者。

### 14.6.1 创建周期性 Worker

```csharp
public class MedicationExpiryCheckWorker
    : AsyncPeriodicBackgroundWorkerBase
{
    public MedicationExpiryCheckWorker(
        AbpTimer timer,
        IServiceScopeFactory serviceScopeFactory)
        : base(timer, serviceScopeFactory)
    {
        // 每小时检查一次
        Timer.Period = 60 * 60 * 1000; // 毫秒
    }

    protected override async Task DoWorkAsync(
        PeriodicBackgroundWorkerContext workerContext)
    {
        var medicationService = workerContext
            .ServiceProvider
            .GetRequiredService<IMedicationService>();

        var expiringMedications = await medicationService
            .GetExpiringMedicationsAsync(daysThreshold: 30);

        foreach (var medication in expiringMedications)
        {
            await medicationService.SendExpiryAlertAsync(medication.Id);
        }

        Logger.LogInformation(
            $"药品过期检查完成，发现 {expiringMedications.Count} 种即将过期的药品");
    }
}
```

### 14.6.2 注册 Worker

```csharp
public class ElderlyCareDomainModule : AbpModule
{
    public override void OnApplicationInitialization(
        ApplicationInitializationContext context)
    {
        // 启动药品过期检查 Worker
        context.AddBackgroundWorker<MedicationExpiryCheckWorker>();
    }
}
```

### 14.6.3 多个 Worker 的组合使用

```csharp
// 合同到期检查 Worker
public class ContractExpiryCheckWorker
    : AsyncPeriodicBackgroundWorkerBase
{
    public ContractExpiryCheckWorker(
        AbpTimer timer,
        IServiceScopeFactory serviceScopeFactory)
        : base(timer, serviceScopeFactory)
    {
        Timer.Period = 24 * 60 * 60 * 1000; // 每天执行一次
    }

    protected override async Task DoWorkAsync(
        PeriodicBackgroundWorkerContext workerContext)
    {
        var contractService = workerContext.ServiceProvider
            .GetRequiredService<IContractService>();

        var expiringContracts = await contractService
            .GetExpiringContractsAsync(daysThreshold: 15);

        foreach (var contract in expiringContracts)
        {
            await contractService.SendExpiryNotificationAsync(contract.Id);
        }

        Logger.LogInformation(
            $"合同到期检查完成，发现 {expiringContracts.Count} 份即将到期的合同");
    }
}
```

---

## 14.7 Hangfire Dashboard

### 14.7.1 启用 Dashboard

```csharp
public override void OnApplicationInitialization(
    ApplicationInitializationContext context)
{
    var app = context.GetApplicationBuilder();
    app.UseHangfireDashboard("/hangfire", new DashboardOptions
    {
        DashboardTitle = "养老院后台任务管理",
        // 自定义路径前缀
        AppPath = "/admin"
    });
}
```

### 14.7.2 访问控制与权限

生产环境必须限制 Dashboard 的访问权限：

```csharp
public class HangfireAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();

        // 方式一：检查是否已认证
        if (!httpContext.User.Identity.IsAuthenticated)
        {
            return false;
        }

        // 方式二：检查是否为管理员角色
        if (!httpContext.User.IsInRole("admin"))
        {
            return false;
        }

        return true;
    }
}

// 在模块中应用
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = new[] { new HangfireAuthorizationFilter() },
    DashboardTitle = "养老院后台任务管理"
});
```

### 14.7.3 基于 ABP 权限的过滤器

```csharp
public class AbpHangfireAuthorizationFilter : IDashboardAuthorizationFilter
{
    private readonly string _requiredPermission;

    public AbpHangfireAuthorizationFilter(
        string requiredPermission = "Hangfire.Dashboard")
    {
        _requiredPermission = requiredPermission;
    }

    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();
        if (!httpContext.User.Identity.IsAuthenticated)
        {
            return false;
        }

        // 检查 ABP 权限系统
        var permissionChecker = httpContext.RequestServices
            .GetService<IPermissionChecker>();
        if (permissionChecker == null)
        {
            return false;
        }

        var result = AsyncHelper.RunSync(
            () => permissionChecker.IsGrantedAsync(_requiredPermission));
        return result;
    }
}
```

### 14.7.4 Dashboard 功能概览

Hangfire Dashboard 提供以下核心功能页面：

- **仪表盘首页**：显示任务执行统计、成功/失败率、执行时间趋势
- **即时任务**：查看已入队和正在执行的即时任务
- **延迟任务**：查看所有已调度的延迟任务及其执行时间
- **周期任务**：查看、编辑、手动触发周期任务
- **成功/失败任务**：查看任务执行历史和失败详情
- **服务器信息**：查看 Hangfire 服务器状态和 Worker 数量

---

## 14.8 MySQL 作为 Hangfire 存储

### 14.8.1 安装配置

```bash
dotnet add package Hangfire.MySqlStorage --version 2.0.3
```

### 14.8.2 配置选项详解

```csharp
var storageOptions = new MySqlStorageOptions
{
    // 表前缀，默认 "Hangfire"
    TablesPrefix = "Hangfire_",

    // 是否自动创建表结构
    PrepareSchemaIfNecessary = true,

    // 任务队列轮询间隔（秒）
    QueuePollInterval = TimeSpan.FromSeconds(15),

    // 作业过期检查间隔（分钟）
    JobExpirationCheckInterval = TimeSpan.FromMinutes(30),

    // 已完成任务保留时间（天）
    CountersAggregateInterval = TimeSpan.FromMinutes(5),

    // 分布式锁超时时间
    DistributedLockLifetime = TimeSpan.FromMinutes(10),

    // 事务超时时间
    TransactionIsolationLevel = IsolationLevel.ReadCommitted,

    // 最大连接数
    MaxConnectionCount = 10
};

GlobalConfiguration.Configuration
    .UseStorage(new MySqlStorage(
        "Server=localhost;Port=3306;Database=ElderlyCareHangfire;Uid=root;Pwd=123456;Allow User Variables=True;",
        storageOptions));
```

### 14.8.3 与主应用数据库分离

建议为 Hangfire 创建独立的数据库，避免与业务数据混在一起：

```sql
-- 创建独立的 Hangfire 数据库
CREATE DATABASE ElderlyCareHangfire
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

```json
// appsettings.json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Database=ElderlyCare;Uid=root;Pwd=123456;",
    "Hangfire": "Server=localhost;Database=ElderlyCareHangfire;Uid=root;Pwd=123456;"
  }
}
```

---

## 14.9 任务重试与幂等性设计

### 14.9.1 自动重试机制

Hangfire 默认会对失败的任务进行自动重试。可以通过特性控制重试行为：

```csharp
public class BillGenerationJob : ITransientDependency
{
    // 重试3次，每次间隔递增（1分钟、5分钟、15分钟）
    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 60, 300, 900 })]
    public async Task GenerateBillForTenantAsync(Guid tenantId)
    {
        var tenant = await _tenantRepository.GetAsync(tenantId);
        var bill = await _billingService.CreateBillAsync(tenant);
        await _billingService.SaveBillAsync(bill);
    }

    // 禁用重试（适用于不应重复执行的任务）
    [AutomaticRetry(Attempts = 0)]
    public async Task SendOneTimeNotificationAsync(Guid tenantId)
    {
        // 一次性通知，不需要重试
    }

    // 指定重试时队列
    [AutomaticRetry(Attempts = 5)]
    [Queue("critical")]
    public async Task GenerateCriticalReportAsync()
    {
        // 关键报表生成，最多重试5次
    }
}
```

### 14.9.2 幂等性设计

**幂等性**意味着任务执行多次与执行一次的结果相同，这是后台任务设计的核心原则。

```csharp
public class IdempotentBillJob : ITransientDependency
{
    private readonly IRepository<Bill, Guid> _billRepository;

    // 幂等设计：先检查再执行
    public async Task GenerateMonthlyBillAsync(
        Guid tenantId, int year, int month)
    {
        // 1. 幂等性检查：账单是否已存在
        var existingBill = await _billRepository.FirstOrDefaultAsync(
            b => b.TenantId == tenantId
              && b.Year == year
              && b.Month == month);

        if (existingBill != null)
        {
            // 账单已存在，跳过生成
            Logger.LogWarning(
                $"老人 {tenantId} 的 {year}年{month}月账单已存在，跳过生成");
            return;
        }

        // 2. 使用分布式锁防止并发重复执行
        await using var handle = await _distributedLock
            .TryAcquireAsync(
                $"bill-generation-{tenantId}-{year}-{month}",
                TimeSpan.FromMinutes(5));

        if (handle == null)
        {
            Logger.LogWarning("获取分布式锁失败，可能有其他实例正在执行");
            return;
        }

        // 3. 二次检查（双重检查锁模式）
        existingBill = await _billRepository.FirstOrDefaultAsync(
            b => b.TenantId == tenantId
              && b.Year == year
              && b.Month == month);

        if (existingBill != null)
        {
            return;
        }

        // 4. 执行实际的账单生成逻辑
        var bill = new Bill
        {
            TenantId = tenantId,
            Year = year,
            Month = month,
            Amount = await CalculateBillAmountAsync(tenantId, year, month),
            Status = BillStatus.Generated,
            GeneratedTime = Clock.Now
        };

        await _billRepository.InsertAsync(bill);
    }
}
```

### 14.9.3 使用唯一标识实现幂等

```csharp
public class NotificationJob : ITransientDependency
{
    // 使用唯一键确保同一通知不会重复发送
    [AutomaticRetry(Attempts = 3)]
    public async Task SendExpiryReminderAsync(
        Guid entityId, string entityType)
    {
        // 生成唯一业务键
        var businessKey = $"reminder-{entityType}-{entityId}-{Clock.Now:yyyyMMdd}";

        // 检查是否已发送
        var alreadySent = await _notificationLogRepository
            .AnyAsync(n => n.BusinessKey == businessKey);

        if (alreadySent)
        {
            return;
        }

        // 发送通知
        await _notificationService.SendExpiryReminderAsync(entityId, entityType);

        // 记录发送日志
        await _notificationLogRepository.InsertAsync(new NotificationLog
        {
            BusinessKey = businessKey,
            EntityType = entityType,
            EntityId = entityId,
            SentTime = Clock.Now
        });
    }
}
```

---

## 14.10 实战：每月自动生成账单 + 过期提醒 + 数据报表定时生成

### 14.10.1 业务需求

1. **每月1号凌晨2点**：自动生成上月所有入住老人的费用账单
2. **每天早上8点**：检查药品和合同是否即将过期，发送提醒通知
3. **每月2号凌晨3点**：生成上月运营数据报表
4. **入住登记完成后**：立即发送欢迎通知，3天后发送满意度调查

### 14.10.2 项目结构

```
ElderlyCare.Domain/
├── BackgroundJobs/
│   ├── BillGeneration/
│   │   ├── BillGenerationJobArgs.cs
│   │   ├── BillGenerationJob.cs
│   │   └── IBillingService.cs
│   ├── ExpiryReminder/
│   │   ├── ExpiryCheckWorker.cs
│   │   └── IExpiryReminderService.cs
│   ├── ReportGeneration/
│   │   ├── MonthlyReportJob.cs
│   │   └── IReportService.cs
│   └── HangfireJobScheduler.cs
```

### 14.10.3 账单生成作业

```csharp
public class BillGenerationJobArgs
{
    public int Year { get; set; }
    public int Month { get; set; }
}

public interface IBillingService
{
    Task GenerateMonthlyBillsAsync(int year, int month);
    Task<Bill> GenerateBillForTenantAsync(
        Guid tenantId, int year, int month);
    Task<decimal> CalculateMonthlyFeeAsync(
        Guid tenantId, int year, int month);
}

public class BillingService : ElderlyCareDomainService, IBillingService
{
    private readonly IRepository<Tenant, Guid> _tenantRepository;
    private readonly IRepository<Bill, Guid> _billRepository;
    private readonly IRepository<BillItem, Guid> _billItemRepository;
    private readonly IDistributedLock _distributedLock;

    public BillingService(
        IRepository<Tenant, Guid> tenantRepository,
        IRepository<Bill, Guid> billRepository,
        IRepository<BillItem, Guid> billItemRepository,
        IDistributedLock distributedLock)
    {
        _tenantRepository = tenantRepository;
        _billRepository = billRepository;
        _billItemRepository = billItemRepository;
        _distributedLock = distributedLock;
    }

    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 60, 300, 900 })]
    public async Task GenerateMonthlyBillsAsync(int year, int month)
    {
        var tenants = await _tenantRepository.GetListAsync(
            t => t.Status == TenantStatus.Active);

        var successCount = 0;
        var failCount = 0;

        foreach (var tenant in tenants)
        {
            try
            {
                await GenerateBillForTenantAsync(tenant.Id, year, month);
                successCount++;
            }
            catch (Exception ex)
            {
                failCount++;
                Logger.LogError(ex,
                    $"为老人 {tenant.Name} 生成 {year}年{month}月 账单失败");
            }
        }

        Logger.LogInformation(
            $"账单生成完成：成功 {successCount}，失败 {failCount}，" +
            $"总计 {tenants.Count}");
    }

    public async Task<Bill> GenerateBillForTenantAsync(
        Guid tenantId, int year, int month)
    {
        // 幂等性检查
        var existing = await _billRepository.FirstOrDefaultAsync(
            b => b.TenantId == tenantId
              && b.Year == year
              && b.Month == month);

        if (existing != null)
        {
            Logger.LogWarning(
                $"老人 {tenantId} 的 {year}年{month}月账单已存在");
            return existing;
        }

        await using var handle = await _distributedLock.TryAcquireAsync(
            $"bill-{tenantId}-{year}-{month}",
            TimeSpan.FromMinutes(2));

        if (handle == null) return null;

        // 二次检查
        existing = await _billRepository.FirstOrDefaultAsync(
            b => b.TenantId == tenantId
              && b.Year == year
              && b.Month == month);

        if (existing != null) return existing;

        // 计算费用
        var totalAmount = await CalculateMonthlyFeeAsync(
            tenantId, year, month);

        var bill = new Bill
        {
            TenantId = tenantId,
            Year = year,
            Month = month,
            Amount = totalAmount,
            Status = BillStatus.Generated,
            GeneratedTime = Clock.Now
        };

        await _billRepository.InsertAsync(bill);

        // 生成账单明细
        await GenerateBillItemsAsync(bill, tenantId, year, month);

        return bill;
    }

    public async Task<decimal> CalculateMonthlyFeeAsync(
        Guid tenantId, int year, int month)
    {
        var tenant = await _tenantRepository.GetAsync(tenantId);
        decimal total = 0;

        // 基础住宿费
        total += tenant.RoomFee;

        // 护理费
        total += tenant.CareLevelFee;

        // 餐费
        total += tenant.MealFee;

        // 医疗费（根据实际发生计算）
        var medicalExpenses = await _medicalExpenseRepository
            .GetListAsync(m => m.TenantId == tenantId
                && m.ExpenseDate.Year == year
                && m.ExpenseDate.Month == month);
        total += medicalExpenses.Sum(m => m.Amount);

        return total;
    }

    private async Task GenerateBillItemsAsync(
        Bill bill, Guid tenantId, int year, int month)
    {
        var tenant = await _tenantRepository.GetAsync(tenantId);

        var items = new List<BillItem>
        {
            new()
            {
                BillId = bill.Id,
                Category = "住宿费",
                Amount = tenant.RoomFee,
                Description = $"{year}年{month}月住宿费"
            },
            new()
            {
                BillId = bill.Id,
                Category = "护理费",
                Amount = tenant.CareLevelFee,
                Description = $"{year}年{month}月{tenant.CareLevel}护理费"
            },
            new()
            {
                BillId = bill.Id,
                Category = "餐费",
                Amount = tenant.MealFee,
                Description = $"{year}年{month}月餐饮费"
            }
        };

        await _billItemRepository.InsertManyAsync(items);
    }
}
```

### 14.10.4 过期提醒 Worker

```csharp
public class ExpiryCheckWorker : AsyncPeriodicBackgroundWorkerBase
{
    public ExpiryCheckWorker(
        AbpTimer timer,
        IServiceScopeFactory serviceScopeFactory)
        : base(timer, serviceScopeFactory)
    {
        // 每天执行一次（24小时）
        Timer.Period = 24 * 60 * 60 * 1000;
    }

    protected override async Task DoWorkAsync(
        PeriodicBackgroundWorkerContext workerContext)
    {
        var expiryService = workerContext.ServiceProvider
            .GetRequiredService<IExpiryReminderService>();

        // 检查药品过期
        await expiryService.CheckMedicationExpiryAsync();

        // 检查合同到期
        await expiryService.CheckContractExpiryAsync();

        Logger.LogInformation("过期提醒检查完成");
    }
}

public interface IExpiryReminderService
{
    Task CheckMedicationExpiryAsync();
    Task CheckContractExpiryAsync();
}

public class ExpiryReminderService
    : ElderlyCareDomainService, IExpiryReminderService
{
    private readonly IRepository<Medication, Guid> _medicationRepo;
    private readonly IRepository<Contract, Guid> _contractRepo;
    private readonly INotificationService _notificationService;

    public ExpiryReminderService(
        IRepository<Medication, Guid> medicationRepo,
        IRepository<Contract, Guid> contractRepo,
        INotificationService notificationService)
    {
        _medicationRepo = medicationRepo;
        _contractRepo = contractRepo;
        _notificationService = notificationService;
    }

    public async Task CheckMedicationExpiryAsync()
    {
        var threshold = Clock.Now.AddDays(30);
        var expiringMeds = await _medicationRepo.GetListAsync(
            m => m.ExpiryDate <= threshold
              && m.ExpiryDate > Clock.Now
              && !m.ExpiryAlertSent);

        foreach (var med in expiringMeds)
        {
            var daysRemaining = (med.ExpiryDate - Clock.Now).Days;
            await _notificationService.SendToAdminsAsync(
                $"药品【{med.Name}】将在{daysRemaining}天后过期，" +
                $"批次号：{med.BatchNumber}，请及时处理");

            med.ExpiryAlertSent = true;
            await _medicationRepo.UpdateAsync(med);
        }

        Logger.LogInformation(
            $"药品过期检查完成，发现 {expiringMeds.Count} 种即将过期的药品");
    }

    public async Task CheckContractExpiryAsync()
    {
        var threshold = Clock.Now.AddDays(15);
        var expiringContracts = await _contractRepo.GetListAsync(
            c => c.EndDate <= threshold
              && c.EndDate > Clock.Now
              && c.Status == ContractStatus.Active
              && !c.ExpiryAlertSent);

        foreach (var contract in expiringContracts)
        {
            var daysRemaining = (contract.EndDate - Clock.Now).Days;
            await _notificationService.SendToAdminsAsync(
                $"老人【{contract.TenantName}】的合同将在" +
                $"{daysRemaining}天后到期，请及时与家属沟通续签事宜");

            contract.ExpiryAlertSent = true;
            await _contractRepo.UpdateAsync(contract);
        }

        Logger.LogInformation(
            $"合同到期检查完成，发现 {expiringContracts.Count} 份即将到期的合同");
    }
}
```

### 14.10.5 月度报表生成

```csharp
public class MonthlyReportJobArgs
{
    public int Year { get; set; }
    public int Month { get; set; }
}

public class MonthlyReportJob : ITransientDependency
{
    private readonly IRepository<Bill, Guid> _billRepository;
    private readonly IRepository<Tenant, Guid> _tenantRepository;
    private readonly IReportStorageService _reportStorage;

    public MonthlyReportJob(
        IRepository<Bill, Guid> billRepository,
        IRepository<Tenant, Guid> tenantRepository,
        IReportStorageService reportStorage)
    {
        _billRepository = billRepository;
        _tenantRepository = tenantRepository;
        _reportStorage = reportStorage;
    }

    [AutomaticRetry(Attempts = 3)]
    public async Task GenerateMonthlyReportAsync(int year, int month)
    {
        Logger.LogInformation($"开始生成 {year}年{month}月 运营报表");

        // 收集数据
        var reportData = await CollectReportDataAsync(year, month);

        // 生成报表
        var report = await CreateReportDocumentAsync(reportData);

        // 保存报表
        var filePath = await _reportStorage.SaveReportAsync(
            report, $"月度运营报表_{year}_{month:D2}.pdf");

        // 通知管理员
        await _notificationService.SendToAdminsAsync(
            $"{year}年{month}月运营报表已生成，报表路径：{filePath}");

        Logger.LogInformation(
            $"月度运营报表生成完成：{filePath}");
    }

    private async Task<MonthlyReportData> CollectReportDataAsync(
        int year, int month)
    {
        var startDate = new DateTime(year, month, 1);
        var endDate = startDate.AddMonths(1);

        // 入住统计
        var totalTenants = await _tenantRepository.CountAsync(
            t => t.Status == TenantStatus.Active);
        var newCheckIns = await _tenantRepository.CountAsync(
            t => t.CheckInDate >= startDate && t.CheckInDate < endDate);

        // 收入统计
        var bills = await _billRepository.GetListAsync(
            b => b.Year == year && b.Month == month);
        var totalRevenue = bills.Sum(b => b.Amount);
        var paidAmount = bills
            .Where(b => b.Status == BillStatus.Paid)
            .Sum(b => b.Amount);

        return new MonthlyReportData
        {
            Year = year,
            Month = month,
            TotalTenants = totalTenants,
            NewCheckIns = newCheckIns,
            TotalRevenue = totalRevenue,
            PaidAmount = paidAmount,
            OutstandingAmount = totalRevenue - paidAmount,
            GeneratedTime = Clock.Now
        };
    }

    private async Task<byte[]> CreateReportDocumentAsync(
        MonthlyReportData data)
    {
        // 使用报表生成库创建 PDF
        // 实际实现可使用 QuestPDF、iTextSharp 等库
        var reportBuilder = new ReportBuilder();

        reportBuilder
            .SetTitle($"{data.Year}年{data.Month}月养老院运营报表")
            .SetGeneratedTime(data.GeneratedTime)
            .AddSection("入住情况", new Dictionary<string, string>
            {
                ["在住老人总数"] = data.TotalTenants.ToString(),
                ["本月新入住"] = data.NewCheckIns.ToString()
            })
            .AddSection("财务情况", new Dictionary<string, string>
            {
                ["账单总额"] = $"¥{data.TotalRevenue:N2}",
                ["已收款"] = $"¥{data.PaidAmount:N2}",
                ["待收款"] = $"¥{data.OutstandingAmount:N2}",
                ["收款率"] = data.TotalRevenue > 0
                    ? $"{data.PaidAmount / data.TotalRevenue:P1}"
                    : "N/A"
            });

        return await reportBuilder.BuildAsync();
    }
}
```

### 14.10.6 任务调度注册

```csharp
public class HangfireJobScheduler : ITransientDependency
{
    public void ScheduleAllJobs()
    {
        // 1. 每月1号凌晨2点：生成上月账单
        RecurringJob.AddOrUpdate<IBillingService>(
            "monthly-bill-generation",
            service => service.GenerateMonthlyBillsAsync(
                Clock.Now.AddMonths(-1).Year,
                Clock.Now.AddMonths(-1).Month),
            "0 2 1 * *",
            new RecurringJobOptions
            {
                TimeZone = TimeZoneInfo.FindSystemTimeZoneById(
                    "China Standard Time")
            });

        // 2. 每月2号凌晨3点：生成上月运营报表
        RecurringJob.AddOrUpdate<MonthlyReportJob>(
            "monthly-report-generation",
            job => job.GenerateMonthlyReportAsync(
                Clock.Now.AddMonths(-1).Year,
                Clock.Now.AddMonths(-1).Month),
            "0 3 2 * *",
            new RecurringJobOptions
            {
                TimeZone = TimeZoneInfo.FindSystemTimeZoneById(
                    "China Standard Time")
            });
    }
}
```

### 14.10.7 Controller 触发任务

```csharp
[Area("admin")]
[Route("api/admin/billing")]
public class BillingController : AbpController
{
    private readonly IBillingService _billingService;
    private readonly IBackgroundJobManager _backgroundJobManager;

    public BillingController(
        IBillingService billingService,
        IBackgroundJobManager backgroundJobManager)
    {
        _billingService = billingService;
        _backgroundJobManager = backgroundJobManager;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> GenerateBills(int year, int month)
    {
        await _backgroundJobManager.EnqueueAsync(
            new BillGenerationJobArgs
            {
                Year = year,
                Month = month
            });

        return Ok(new
        {
            Message = $"账单生成任务已提交（{year}年{month}月）",
            Hint = "请在 Hangfire Dashboard 查看执行进度"
        });
    }

    [HttpPost("trigger-report")]
    public async Task<IActionResult> TriggerReport(int year, int month)
    {
        BackgroundJob.Enqueue<MonthlyReportJob>(
            job => job.GenerateMonthlyReportAsync(year, month));

        return Ok(new
        {
            Message = $"报表生成任务已提交（{year}年{month}月）"
        });
    }

    [HttpGet("recurring-jobs")]
    public IActionResult GetRecurringJobs()
    {
        var connection = JobStorage.Current.GetConnection();
        var jobs = connection.GetRecurringJobs();

        return Ok(jobs.Select(j => new
        {
            j.Id,
            j.Cron,
            j.NextExecution,
            j.LastExecution,
            j.LastJobState
        }));
    }
}
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | 在任务中直接注入 DbContext | 通过 `IServiceScopeFactory` 创建新作用域 | Hangfire 在独立线程执行，没有请求作用域，直接使用会报错 |
| 2 | 周期任务用 `0 0 1 2 *` 误写为2月执行 | 使用 `0 0 1 * *` 每月1号执行 | CRON 表达式第4位是月份，容易混淆日期和月份的位置 |
| 3 | 不做幂等性检查就生成账单 | 先查询是否已存在再生成 | 重试机制会导致任务重复执行，产生重复账单 |
| 4 | Dashboard 不设权限直接暴露 | 使用 `IDashboardAuthorizationFilter` 限制访问 | 任何人都可以操作后台任务，存在严重安全风险 |
| 5 | Hangfire 与业务共用同一个数据库 | 创建独立的 Hangfire 数据库 | 任务日志表增长快，会影响业务数据库性能 |
| 6 | 任务中直接使用 `Clock.Now` | 任务参数中传入具体时间 | 任务可能延迟执行，`Clock.Now` 取到的时间不是预期的 |
| 7 | 所有任务都用即时任务 | 区分即时、延迟、周期任务场景 | 不同场景应选择合适的任务类型，否则无法满足业务需求 |
| 8 | 任务失败后不做日志记录 | 使用 `Logger` 记录任务执行日志 | 任务在后台执行，没有日志就无法排查失败原因 |

---

## 本章小结

本章详细介绍了养老院系统中后台任务与定时作业的完整解决方案。首先从养老院实际业务场景出发，说明了月度账单生成、过期提醒、数据报表等操作必须异步执行的原因。然后系统讲解了 ABP 框架的 `IBackgroundJobManager` 接口以及 Hangfire 作为替代实现的集成方式，包括即时任务、延迟任务和周期任务三种模式的使用方法。接着介绍了 ABP 风格的 `AsyncPeriodicBackgroundWorkerBase` 基类、Hangfire Dashboard 的访问控制、MySQL 存储配置以及任务重试与幂等性设计。最后通过完整的实战案例，展示了如何实现每月自动生成账单、每天检查过期提醒和每月生成运营报表的功能。掌握这些知识后，你就能够为养老院系统构建可靠、高效的后台任务处理体系。

---

## 面试题

### 面试题 1（初级 / 概念题）
**题目：什么是后台任务？在养老院系统中，为什么需要后台任务？**

**参考答案：** 后台任务是指不需要用户等待执行完成的异步操作。在养老院系统中，月度账单生成需要为数百位老人计算费用并生成账单，这个过程可能需要几分钟，如果同步执行会导致前端请求超时。药品过期检查和合同到期提醒需要每天定时执行，不是由用户主动触发的。运营数据报表涉及大量数据聚合计算，也不适合在用户请求中同步完成。后台任务让这些耗时操作在服务端异步执行，用户提交后即可获得响应，提升了系统响应速度和用户体验。

### 面试题 2（初级 / 概念题）
**题目：ABP 的 `IBackgroundJobManager` 接口有什么作用？为什么要用 Hangfire 替换它？**

**参考答案：** `IBackgroundJobManager` 是 ABP 框架内置的后台任务抽象接口，提供了 `EnqueueAsync` 方法用于提交后台任务。它默认使用内存队列实现，任务存储在内存中，应用重启后任务会丢失，不支持持久化、重试、Dashboard 监控等功能。Hangfire 作为成熟的后台任务框架，支持将任务持久化到 MySQL 等数据库中，应用重启后任务不会丢失，还提供了自动重试、Dashboard 可视化管理、周期任务调度等生产环境必需的功能。因此在养老院系统中，需要将 ABP 的默认实现替换为 Hangfire，以确保账单生成、过期提醒等关键任务的可靠性。

### 面试题 3（初级 / 概念题）
**题目：Hangfire 有哪些任务类型？分别适用于什么养老院场景？**

**参考答案：** Hangfire 支持三种主要任务类型。即时任务（Fire-and-forget）使用 `BackgroundJob.Enqueue()` 提交后立即执行，适用于入住登记完成后发送欢迎通知这类需要立即处理的场景。延迟任务使用 `BackgroundJob.Schedule()` 在指定时间后执行，适用于入住三天后发送满意度调查这类需要延迟执行的场景。周期任务使用 `RecurringJob.AddOrUpdate()` 配合 CRON 表达式定期执行，适用于每月1号生成账单、每天早上检查药品过期这类需要定期重复执行的场景。合理选择任务类型能够使养老院系统的任务调度更加清晰和高效。

### 面试题 4（中级 / 概念题）
**题目：什么是 CRON 表达式？请写出养老院系统中月度账单生成的 CRON 表达式。**

**参考答案：** CRON 表达式是一种用于定义定时任务执行时间的字符串格式，由5个字段组成：分钟、小时、日、月、星期。例如 `0 2 1 * *` 表示每月1号凌晨2点执行。在养老院系统中，月度账单生成任务应该在每月1号凌晨2点执行，因为此时系统负载最低，可以避免影响白天的正常使用。对应的 CRON 表达式为 `0 2 1 * *`。需要注意配置正确的时区，确保任务在中国标准时间的凌晨2点执行，而不是 UTC 时间。如果需要每天早上8点检查过期提醒，则使用 `0 8 * * *` 表达式。

### 面试题 5（中级 / 概念题）
**题目：`AsyncPeriodicBackgroundWorkerBase` 与 Hangfire 的 `RecurringJob` 有什么区别？在养老院系统中如何选择？**

**参考答案：** `AsyncPeriodicBackgroundWorkerBase` 是 ABP 框架提供的周期性 Worker 基类，通过 `AbpTimer` 控制执行间隔，以毫秒为单位设置周期。它运行在应用进程内部，依赖 ABP 的依赖注入容器，可以方便地注入各种服务。`RecurringJob` 是 Hangfire 提供的周期任务机制，使用 CRON 表达式定义执行计划，任务存储在数据库中，支持分布式执行和 Dashboard 监控。在养老院系统中，对于需要简单定时执行且不需要复杂管理的场景，可以使用 `AsyncPeriodicBackgroundWorkerBase`，如药品过期检查。对于需要持久化、分布式执行、可视化管理的关键任务，如月度账单生成和报表生成，建议使用 `RecurringJob`。

### 面试题 6（中级 / 概念题）
**题目：为什么建议为 Hangfire 创建独立的数据库？**

**参考答案：** 建议为 Hangfire 创建独立的数据库主要有以下几个原因。首先，Hangfire 会在数据库中创建多个表来存储任务信息、执行历史、计数器等，这些表的数据量会随着任务执行不断增长，与业务数据混在一起会影响业务查询性能。其次，Hangfire 的数据生命周期与业务数据不同，任务执行历史可以定期清理，而业务数据需要长期保留，分开存储便于独立管理数据清理策略。在养老院系统中，每月生成账单会产生大量任务记录，如果与入住信息、账单数据共用数据库，可能会因为任务表的膨胀影响账单查询等核心业务的响应速度。独立数据库还可以独立进行备份、扩展和故障隔离。

### 面试题 7（高级 / 设计题）
**题目：什么是幂等性？在养老院账单生成任务中如何保证幂等性？**

**参考答案：** 幂等性是指一个操作执行一次和执行多次的结果完全相同。在后台任务场景中，由于网络异常、服务重启等原因，Hangfire 可能会重复执行同一个任务，如果任务不具备幂等性，就可能产生重复数据。在养老院账单生成任务中，保证幂等性的方法包括：首先在生成账单前查询是否已存在相同老人、相同年月的账单，如果已存在则跳过生成。其次使用分布式锁防止并发重复执行，确保同一时间只有一个实例在生成某个老人的账单。还可以使用双重检查锁模式，在获取锁之后再次检查，防止在等待锁的过程中其他实例已完成生成。这些措施共同保证了即使任务被重复执行，也不会产生重复的账单记录。

### 面试题 8（高级 / 设计题）
**题目：Hangfire 的自动重试机制是如何工作的？如何配置重试策略？**

**参考答案：** Hangfire 的自动重试机制在任务执行失败后，会按照配置的策略自动重新执行任务。默认情况下，Hangfire 会重试10次，重试间隔采用指数退避算法，从1分钟开始逐渐增加。可以通过 `[AutomaticRetry]` 特性自定义重试行为：`Attempts` 属性设置最大重试次数，`DelaysInSeconds` 数组设置每次重试的间隔时间，设置 `Attempts = 0` 可以禁用自动重试。在养老院系统中，账单生成任务建议设置重试3次，间隔分别为1分钟、5分钟、15分钟，因为账单生成可能因为数据库连接问题暂时失败，适当重试可以提高成功率。对于发送通知等一次性任务，可以设置较少的重试次数或禁用重试，避免重复发送。

### 面试题 9（高级 / 设计题）
**题目：在养老院系统中，如何设计一个可靠的任务调度架构？**

**参考答案：** 设计可靠的任务调度架构需要考虑以下几个方面。首先，使用 Hangfire 作为任务调度框架，将任务持久化到 MySQL 数据库中，确保应用重启后任务不丢失。其次，将 Hangfire 数据库与业务数据库分离，避免任务日志影响业务性能。第三，实现任务的幂等性设计，防止重复执行产生错误数据。第四，配置合理的自动重试策略，对不同类型的任务设置不同的重试次数和间隔。第五，使用 Hangfire Dashboard 配合权限控制，让管理员可以监控任务执行状态并手动触发任务。第六，对于关键任务实现分布式锁，防止在多实例部署时重复执行。第七，定期清理已完成的任务历史记录，防止数据库表过度膨胀。在养老院系统中，这样的架构能够确保每月账单生成、每日过期提醒等关键任务可靠执行。

### 面试题 10（高级 / 场景题）
**题目：养老院系统部署了多个应用实例，如何确保周期任务只执行一次？**

**参考答案：** 在多实例部署环境下，Hangfire 通过分布式锁机制确保周期任务只执行一次。Hangfire 在执行任务时会从数据库中获取分布式锁，同一时刻只有一个实例能够获取到锁并执行任务，其他实例会等待或跳过。使用 MySQL 存储时，分布式锁通过数据库的行级锁实现。在养老院系统中，月度账单生成任务如果被多个实例同时执行，会导致重复账单，Hangfire 的分布式锁机制天然解决了这个问题。此外，还可以在业务代码中通过 `IDistributedLock` 接口实现更细粒度的并发控制，例如在生成单个老人的账单时获取独立的锁，允许不同老人的账单并行生成，提高整体执行效率。需要注意配置合理的锁超时时间，防止长时间持有锁导致其他实例无法执行。

### 面试题 11（高级 / 场景题）
**题目：Hangfire 任务执行失败后如何排查问题？**

**参考答案：** 排查 Hangfire 任务执行失败可以从以下几个方面入手。首先，访问 Hangfire Dashboard 的"失败"页面，查看任务的异常信息和堆栈跟踪，这是最直接的排查方式。其次，查看应用日志，任务执行过程中的 `Logger.LogError` 输出会记录详细的错误信息。第三，检查任务方法的参数是否正确，序列化问题可能导致任务无法正确执行。第四，确认依赖注入的服务是否正确注册，Hangfire 在独立线程中执行任务，需要确保所有依赖的服务都在作用域中可用。在养老院系统中，账单生成任务失败可能是因为数据库连接超时、某个老人的数据不完整等原因，通过 Dashboard 可以快速定位失败的任务和具体原因，然后修复问题后手动重新触发任务执行。

### 面试题 12（高级 / 设计题）
**题目：请为养老院系统设计一套完整的后台任务方案，涵盖账单、提醒、报表三大场景。**

**参考答案：** 养老院后台任务方案设计如下。技术选型方面，使用 Hangfire 作为任务调度框架，MySQL 作为持久化存储，与业务数据库分离部署。账单场景方面，每月1号凌晨2点通过 `RecurringJob` 触发月度账单生成任务，使用幂等性设计防止重复生成，支持管理员通过 Controller 手动触发补生成。提醒场景方面，使用 `AsyncPeriodicBackgroundWorkerBase` 每天早上8点检查药品过期和合同到期，发现即将过期的项目后发送通知给管理员和相关护理人员。报表场景方面，每月2号凌晨3点生成上月运营报表，包括入住统计、收入统计、服务满意度等数据，生成 PDF 后通知管理员下载。所有任务都配置合理的自动重试策略，关键任务使用分布式锁防止并发问题，通过 Dashboard 进行任务监控和管理，配合权限控制确保只有管理员可以访问。

---

## 下一章预告

**第 15 章：文件管理与 Excel 导入导出**

养老院系统中，长者的健康档案、合同扫描件需要长期存档，每月的费用报表需要导出为 Excel。下一章将学习：
- 文件上传接口设计（IFormFile 接收、大小限制、类型校验）
- NPOI 基于模板导出 Excel（HSSFWorkbook 读模板 → 填数据 → 保存）
- NPOI 导入 Excel 数据（NpoiExcelImportHelper）
- 实战：长者健康档案批量导入 + 月度报表导出

---

## 时效性声明

本章内容基于以下版本编写：

| 技术 | 版本 |
|------|------|
| .NET | 5.0 |
| ABP Framework | 4.4.0（开源版） |
| Hangfire | 1.7+ |
| Hangfire.MySqlStorage | 2.0.3 |

Hangfire 核心 API（BackgroundJob/RecurringJob）在各版本中保持稳定。Hangfire 1.8+ 引入了 `BackgroundJob.Schedule` 的 Cron 表达式重载。在 .NET 6+ 中 ABP 的 `IBackgroundJobManager` 接口不变，但模块注册方式可能有细微调整。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：即时/延迟/周期任务、AsyncPeriodicBackgroundWorkerBase、Dashboard、MySQL 存储、幂等性设计、实战 |
| 2026-07-10 | v1.1 | 下一章预告改为第15章文件管理；面试题类型标签统一为初级/中级/高级；前置知识章号修正；面试题12类型改为高级/设计题 |
| 2026-07-10 | v1.2 | 补回误删的时效性声明与修订记录 |
| 2026-07-10 | v1.3 | 合并 MySqlStorage 重复配置，提取连接字符串变量 |
