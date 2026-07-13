# 第 05 章：ABP 内置模块与基础设施

## 学习目标

1. 理解 ABP 设置管理的原理，能在运行时动态修改系统参数
2. 理解功能开关机制，能按租户控制功能可用性
3. 理解本地化实现方式，能为系统添加多语言支持
4. **深入理解**数据过滤的工作原理，尤其是 ISoftDelete 和 IMultiTenant 背后的全局过滤器
5. 理解审计日志的自动记录机制
6. 能在养老院系统中综合运用以上基础设施

## 前置知识

- C# 基础与依赖注入（第 01-02 章）
- ABP 应用服务与工作单元（第 04 章）

## 为什么需要学这个？

你一定遇到过这些困惑：收费标准要改还得重新发布；查询时退住长者自动消失；切换租户后数据自动隔离；领导要查谁改了长者信息。这些答案就是 ABP 的内置模块与基础设施——你每天都在用，只是还没理解原理。

---

## 1. ABP 设置管理（Setting Management）

### 1.1 生活类比

养老院的「系统参数配置表」。院长办公室墙上贴着：收费标准每人每月 5000 元、探视时间 9:00-18:00、最大入住 200 人。物价涨了，院长只改表格，不用重新装修养老院。

### 1.2 为什么需要设置管理？

```csharp
public class BillingAppService : ApplicationService
{
    public decimal CalculateMonthlyFee()
    {
        // 硬编码！改一次就要重新发布
        return 5000m;
    }
}
```

收费标准从 5000 涨到 6000，必须修改代码、编译、发布。使用设置管理后，收费标准变成数据库中的参数，改完立刻生效。

### 1.3 定义设置项（SettingDefinitionProvider）

```csharp
using Volo.Abp.Settings;

namespace MyElderlyCare.Settings
{
    public class ElderlyCareSettingDefinitionProvider : SettingDefinitionProvider
    {
        public override void Define(ISettingDefinitionContext context)
        {
            context.Add(new SettingDefinition(
                name: "ElderlyCare.Billing.MonthlyFee",
                defaultValue: "5000",
                displayName: "每月收费标准",
                isVisibleToClients: true));

            context.Add(new SettingDefinition(
                name: "ElderlyCare.Visiting.StartTime",
                defaultValue: "09:00",
                displayName: "探视开始时间",
                isVisibleToClients: true));

            context.Add(new SettingDefinition(
                name: "ElderlyCare.Visiting.EndTime",
                defaultValue: "18:00",
                displayName: "探视结束时间",
                isVisibleToClients: true));

            context.Add(new SettingDefinition(
                name: "ElderlyCare.Capacity.MaxResidents",
                defaultValue: "200",
                displayName: "最大入住人数",
                isVisibleToClients: true));
        }
    }
}
```

### 1.4 读取设置（ISettingProvider）

```csharp
public class BillingAppService : ApplicationService
{
    private readonly ISettingProvider _settingProvider;

    public BillingAppService(ISettingProvider settingProvider)
    {
        _settingProvider = settingProvider;
    }

    public async Task<BillingInfoDto> GetBillingInfoAsync()
    {
        var feeStr = await _settingProvider.GetOrNullAsync(
            "ElderlyCare.Billing.MonthlyFee");
        var monthlyFee = decimal.Parse(feeStr ?? "5000");

        return new BillingInfoDto
        {
            MonthlyFee = monthlyFee,
            Description = $"每人每月收费 {monthlyFee} 元"
        };
    }
}
```

### 1.5 修改设置（ISettingManager）

```csharp
public class SystemSettingAppService : ApplicationService
{
    private readonly ISettingManager _settingManager;

    public SystemSettingAppService(ISettingManager settingManager)
    {
        _settingManager = settingManager;
    }

    public async Task UpdateSettingAsync(string key, string value)
    {
        await _settingManager.SetGlobalAsync(key, value);
    }
}
```

### 1.6 设置的作用域

ABP 设置有三个作用域，读取优先级从高到低：

| 作用域 | 存储位置 | 使用场景 |
|--------|----------|----------|
| **Application** | `AbpSettings` 表，ProviderKey 为空 | 所有租户通用参数 |
| **Tenant** | `AbpSettings` 表，ProviderKey = TenantId | 不同租户不同收费标准 |
| **User** | `AbpSettings` 表，ProviderKey = UserId | 用户个人偏好 |

读取顺序：**User → Tenant → Application → 默认值**，找到第一个非空值即返回。

```csharp
// Application 级别
await _settingManager.SetGlobalAsync("ElderlyCare.Billing.MonthlyFee", "5000");
// Tenant 级别（覆盖全局）
await _settingManager.SetForTenantAsync(tenantId, "ElderlyCare.Billing.MonthlyFee", "6000");
// User 级别（覆盖租户）
await _settingManager.SetForCurrentTenantAsync(userId, "ElderlyCare.Billing.MonthlyFee", "4500");
```

---

## 2. ABP 功能开关（Feature Toggle）

### 2.1 生活类比

养老院的「增值服务开关」。基础版只有日常护理，高级版额外有康复训练、智能监护。院长根据每栋楼（租户）购买的套餐开通功能。

### 2.2 定义功能（FeatureDefinitionProvider）

```csharp
using Volo.Abp.Features;

namespace MyElderlyCare.Features
{
    public class ElderlyCareFeatureDefinitionProvider : FeatureDefinitionProvider
    {
        public override void Define(IFeatureDefinitionContext context)
        {
            context.Group("ElderlyCare").AddFeature(
                name: "ElderlyCare.SmartMonitor",
                defaultValue: "false",
                displayName: "智能监护功能",
                valueType: new ToggleStringValueType());

            context.Group("ElderlyCare").AddFeature(
                name: "ElderlyCare.MealManagement",
                defaultValue: "false",
                displayName: "膳食管理功能",
                valueType: new ToggleStringValueType());
        }
    }
}
```

### 2.3 检查功能是否启用（IFeatureChecker）

```csharp
public class SmartMonitorAppService : ApplicationService
{
    private readonly IFeatureChecker _featureChecker;

    public SmartMonitorAppService(IFeatureChecker featureChecker)
    {
        _featureChecker = featureChecker;
    }

    public async Task<MonitorDataDto> GetMonitorDataAsync()
    {
        var isEnabled = await _featureChecker.IsEnabledAsync(
            "ElderlyCare.SmartMonitor");
        if (!isEnabled)
        {
            throw new BusinessException("ElderlyCare:SmartMonitorNotEnabled");
        }
        return new MonitorDataDto { /* ... */ };
    }
}
```

也可以用特性标记：

```csharp
[RequiresFeature("ElderlyCare.MealManagement")]
public async Task<List<MealPlanDto>> GetMealPlansAsync()
{
    // 只有启用了膳食管理功能的租户才能调用
}
```

---

## 3. ABP 本地化（Localization）

### 3.1 生活类比

养老院的「多语言指示牌」。门口写着「前台 / Reception / 受付」。不同来访者看不同语言，指向同一个地方。

### 3.2 创建本地化资源文件

**zh-Hans.json：**

```json
{
  "culture": "zh-Hans",
  "texts": {
    "Menu:Home": "首页",
    "Menu:ElderlyManagement": "长者管理",
    "Menu:SystemSettings": "系统设置",
    "ElderlyName": "长者姓名",
    "MonthlyFee": "每月费用",
    "Discharge": "退住",
    "ConfirmDelete": "确定要删除吗？",
    "OperationSuccess": "操作成功"
  }
}
```

**en.json：**

```json
{
  "culture": "en",
  "texts": {
    "Menu:Home": "Home",
    "Menu:ElderlyManagement": "Elderly Management",
    "Menu:SystemSettings": "System Settings",
    "ElderlyName": "Elderly Name",
    "MonthlyFee": "Monthly Fee",
    "Discharge": "Discharge",
    "ConfirmDelete": "Are you sure to delete?",
    "OperationSuccess": "Operation succeeded"
  }
}
```

### 3.3 注册本地化资源

```csharp
[DependsOn(typeof(AbpLocalizationModule))]
public class ElderlyCareApplicationModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options =>
        {
            options.FileSets.AddEmbedded<ElderlyCareApplicationModule>(
                "MyElderlyCare");
        });

        Configure<AbpLocalizationOptions>(options =>
        {
            options.Resources
                .Add<ElderlyCareResource>("zh-Hans")
                .AddVirtualJson("/Localization/ElderlyCare");
            options.DefaultResourceType = typeof(ElderlyCareResource);
        });
    }
}
```

资源类：

```csharp
[LocalizationResourceName("ElderlyCare")]
public class ElderlyCareResource
{
}
```

### 3.4 使用本地化字符串

```csharp
public class ElderlyAppService : ApplicationService
{
    private readonly IStringLocalizer<ElderlyCareResource> _localizer;

    public ElderlyAppService(IStringLocalizer<ElderlyCareResource> localizer)
    {
        _localizer = localizer;
    }

    public string GetDischargeConfirmMessage(string elderlyName)
    {
        return $"{_localizer["ConfirmDelete"]} {elderlyName}";
    }
}
```

在 Razor 视图中：

```html
@using MyElderlyCare.Localization
@inject IStringLocalizer<ElderlyCareResource> L

<h1>@L["Menu:Home"]</h1>
<p>@L["ElderlyName"]: @Model.ElderlyName</p>
```

---

## 4. ABP 数据过滤（Data Filter）（重点）

### 4.1 生活类比

养老院的「档案管理规则」。档案室存放所有长者档案，护理员默认只看到在住的。院长需要查看全部时，临时取消过滤。这就是数据过滤。

### 4.2 ISoftDelete 软删除自动过滤原理

你日常使用软删除——调用 `DeleteAsync()` 后记录没有物理删除，`IsDeleted` 变成 `true`，查询时自动消失。背后的原理是 **EF Core 全局查询过滤器（Global Query Filter）**。

ABP 在 `AbpDbContext` 的 `OnModelCreating` 中为所有 `ISoftDelete` 实体注册过滤器：

```csharp
// ABP 框架内部（简化示意）
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    foreach (var entityType in modelBuilder.Model.GetEntityTypes())
    {
        if (typeof(ISoftDelete).IsAssignableFrom(entityType.ClrType))
        {
            modelBuilder.Entity(entityType.ClrType)
                .HasQueryFilter(GenerateIsDeletedFilter(entityType.ClrType));
            // 等价于: entity => !entity.IsDeleted
        }
    }
}
```

生成的 SQL：

```sql
-- 你写的 LINQ
var residents = await _residentRepository.GetListAsync();
-- 实际 SQL（自动附加过滤条件）
SELECT * FROM Residents WHERE IsDeleted = 0
```

### 4.3 IMultiTenant 租户隔离自动过滤

同样的原理适用于多租户。所有 `IMultiTenant` 实体自动附加租户过滤器：

```sql
SELECT * FROM Residents
WHERE TenantId = '当前租户ID' AND IsDeleted = 0
```

A 养老院管理员永远看不到 B 养老院的数据，框架层面自动保证。

### 4.4 临时禁用与启用过滤器

```csharp
public class ElderlyReportAppService : ApplicationService
{
    private readonly IRepository<Resident, Guid> _residentRepository;
    private readonly IDataFilter<ISoftDelete> _softDeleteFilter;

    public ElderlyReportAppService(
        IRepository<Resident, Guid> residentRepository,
        IDataFilter<ISoftDelete> softDeleteFilter)
    {
        _residentRepository = residentRepository;
        _softDeleteFilter = softDeleteFilter;
    }

    // 查询所有长者（包括已退住）
    public async Task<List<ResidentDto>> GetAllResidentsAsync()
    {
        using (_softDeleteFilter.Disable())
        {
            var residents = await _residentRepository.GetListAsync();
            return ObjectMapper.Map<List<Resident>, List<ResidentDto>>(residents);
        }
    }

    // 同时禁用多个过滤器（超级管理员查看所有租户数据）
    public async Task<List<ResidentDto>> GetAllTenantsResidentsAsync()
    {
        using (_unitOfWorkManager.Current.DisableFilter(
            AbpDataFilterNames.MayHaveTenant,
            AbpDataFilterNames.SoftDelete))
        {
            var residents = await _residentRepository.GetListAsync();
            return ObjectMapper.Map<List<Resident>, List<ResidentDto>>(residents);
        }
    }

    // 强制启用过滤器
    public async Task<List<ResidentDto>> GetActiveResidentsOnlyAsync()
    {
        using (_softDeleteFilter.Enable())
        {
            return await GetActiveResidentsInternalAsync();
        }
    }
}
```

### 4.5 自定义数据过滤器

定义接口 → 实体实现 → DbContext 中配置。例如定义 `IVip` 接口，`Resident` 实现该接口后在 DbContext 中注册 `HasQueryFilter(r => !DataFilter.IsEnabled<IVip>() || r.IsVip)`，即可实现 VIP 长者过滤。

### 4.6 性能影响

全局过滤器自动附加到每个查询。**关键优化**：确保 `IsDeleted` 和 `TenantId` 有数据库索引。

```sql
CREATE INDEX IX_Residents_TenantId_IsDeleted
ON Residents(TenantId, IsDeleted);
```

---

## 5. ABP 审计日志（Audit Logging）

### 5.1 生活类比

养老院的「操作日志系统」。谁进入了档案室、查看了哪位长者、修改了哪些信息，全部自动记录。

### 5.2 自动记录内容

| 字段 | 说明 | 示例 |
|------|------|------|
| UserId | 操作人 | `a3b4c5d6-...` |
| UserName | 操作人名称 | `张护士` |
| ExecutionTime | 执行时间 | `2025-07-10 14:30:00` |
| ExecutionDuration | 执行耗时 | `125ms` |
| ServiceName | 服务名称 | `ElderlyAppService` |
| MethodName | 方法名称 | `UpdateAsync` |
| Parameters | 调用参数 | `{"id":"xxx","name":"李大爷"}` |
| ReturnValue | 返回值 | `{"id":"xxx",...}` |
| ClientIpAddress | 客户端 IP | `192.168.1.100` |

### 5.3 实体变更追踪（EntityChangeSets）

修改长者信息后，ABP 自动记录字段级变更：实体类型、变更类型（Created/Updated/Deleted）、实体 ID，以及属性变更列表（属性名、原始值、新值）。例如修改长者姓名和房间号，审计日志中会记录 Name 从「李大爷」变为「李大明」，RoomNumber 从「A101」变为「B203」。

### 5.4 审计日志配置

```csharp
Configure<AbpAuditingOptions>(options =>
{
    options.IsEnabled = true;                    // 启用审计
    options.IsEnabledForGetRequests = false;     // GET 请求不记录
    options.IgnoredTypes.Add(typeof(HealthCheckController));
    options.IgnoredProperties.Add("Password");   // 忽略敏感字段
});
```

用特性标记控制：

```csharp
[DisableAuditing]  // 整个类禁用
public class InternalHelperAppService : ApplicationService { }

public class ElderlyAppService : ApplicationService
{
    [DisableAuditing]  // 单个方法禁用
    public async Task<List<ResidentDto>> GetListAsync() { }
}
```

---

## 6. 实战：为养老院系统添加系统参数管理 + 多语言支持

### 6.1 定义设置常量类

```csharp
namespace MyElderlyCare.Settings
{
    public static class ElderlyCareSettings
    {
        private const string Prefix = "ElderlyCare.";
        public const string MonthlyFee = Prefix + "Billing.MonthlyFee";
        public const string VisitingStartTime = Prefix + "Visiting.StartTime";
        public const string VisitingEndTime = Prefix + "Visiting.EndTime";
        public const string MaxResidents = Prefix + "Capacity.MaxResidents";
        public const string EnableSmsNotification = Prefix + "Notification.EnableSms";
    }
}
```

### 6.2 设置管理应用服务

```csharp
public class SystemSettingAppService : ApplicationService
{
    private readonly ISettingProvider _settingProvider;
    private readonly ISettingManager _settingManager;
    private readonly IStringLocalizer<ElderlyCareResource> _localizer;

    public SystemSettingAppService(
        ISettingProvider settingProvider,
        ISettingManager settingManager,
        IStringLocalizer<ElderlyCareResource> localizer)
    {
        _settingProvider = settingProvider;
        _settingManager = settingManager;
        _localizer = localizer;
    }

    public async Task<List<SettingDto>> GetSettingsAsync()
    {
        return new List<SettingDto>
        {
            new SettingDto {
                Key = ElderlyCareSettings.MonthlyFee,
                Value = await _settingProvider.GetOrNullAsync(
                    ElderlyCareSettings.MonthlyFee),
                DisplayName = _localizer["Setting:MonthlyFee"]
            },
            new SettingDto {
                Key = ElderlyCareSettings.MaxResidents,
                Value = await _settingProvider.GetOrNullAsync(
                    ElderlyCareSettings.MaxResidents),
                DisplayName = _localizer["Setting:MaxResidents"]
            }
        };
    }

    public async Task SaveSettingsAsync(List<SettingDto> settings)
    {
        foreach (var setting in settings)
        {
            await _settingManager.SetCurrentTenantAsync(setting.Key, setting.Value);
        }
    }
}

public class SettingDto
{
    public string Key { get; set; }
    public string Value { get; set; }
    public string DisplayName { get; set; }
}
```

### 6.3 在业务服务中使用设置值

```csharp
public class BillingAppService : ApplicationService
{
    private readonly ISettingProvider _settingProvider;
    private readonly IStringLocalizer<ElderlyCareResource> _localizer;

    public BillingAppService(
        ISettingProvider settingProvider,
        IStringLocalizer<ElderlyCareResource> localizer)
    {
        _settingProvider = settingProvider;
        _localizer = localizer;
    }

    public async Task<BillingResultDto> CalculateMonthlyBillingAsync(
        Guid residentId)
    {
        var feeStr = await _settingProvider.GetOrNullAsync(
            ElderlyCareSettings.MonthlyFee);
        var monthlyFee = decimal.Parse(feeStr ?? "5000");

        var smsStr = await _settingProvider.GetOrNullAsync(
            ElderlyCareSettings.EnableSmsNotification);
        var enableSms = bool.Parse(smsStr ?? "true");

        return new BillingResultDto
        {
            ResidentId = residentId,
            MonthlyFee = monthlyFee,
            NotificationMessage = enableSms
                ? _localizer["Billing:WillSendSms"]
                : _localizer["Billing:SmsDisabled"]
        };
    }
}
```

### 6.4 补充本地化资源

在 zh-Hans.json 中添加 `Setting:MonthlyFee`（每月收费标准）、`Setting:MaxResidents`（最大入住人数）、`Billing:WillSendSms`（费用账单将通过短信通知）等 Key，en.json 中添加对应英文翻译即可。

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | 忘记注册 SettingDefinitionProvider，运行时取不到值 | 用静态类集中定义所有设置 Key，在模块 ConfigureServices 中注册 | 未注册的设置项 GetAsync 返回默认值或 null，不会报错但业务逻辑出错 |
| 2 | 业务代码中用 ISettingManager 修改设置 | 读取用 ISettingProvider，修改用 ISettingManager | Provider 只读保证业务逻辑不会意外修改配置，Manager 写入需在管理后台使用 |
| 3 | 禁用过滤器后执行大量操作 | `using` 块尽量小，查询完立即出块恢复过滤器 | 过滤器禁用期间所有查询都无过滤，可能返回海量数据或泄露其他租户数据 |
| 4 | 本地化 JSON 文件路径与注册路径不一致 | Key 用层级命名如 `Menu:Home`，文件路径和资源名严格对应 | 路径不一致导致本地化资源加载失败，所有文本显示为 Key 而非翻译内容 |
| 5 | 循环中频繁调用 ISettingProvider.GetAsync | 方法开始时一次性读取到变量中 | 每次调用都触发优先级查找链，循环中重复调用浪费性能 |
| 6 | 全局过滤器字段无索引 | 为 `TenantId + IsDeleted` 建复合索引 | 每个查询都附加 WHERE 条件，无索引导致全表扫描，数据量大时性能灾难 |
| 7 | 用硬编码字符串读取设置 | 用常量类定义 Key：`YlsSettings.MaxElderCount` | 字符串拼错不会编译报错，运行时才发现取不到值 |
| 8 | DataFilter.Disable 不用 using 包裹 | 始终用 `using (DataFilter.Disable<T>())` 包裹 | 不用 using 可能忘记重新启用过滤器，后续所有请求都漏掉过滤条件 |

---

## 本章小结

| 模块 | 核心接口 | 一句话总结 |
|------|----------|-----------|
| 设置管理 | `ISettingProvider` / `ISettingManager` | 运行时可修改的参数，不用重新发布 |
| 功能开关 | `IFeatureChecker` | 按租户控制功能可用性 |
| 本地化 | `IStringLocalizer<T>` | Key 代替硬编码文字，多语言支持 |
| 数据过滤 | `IDataFilter<T>` | ISoftDelete 和 IMultiTenant 背后的全局过滤器 |
| 审计日志 | `IAuditLogRepository` | 自动记录操作和实体变更历史 |

**关键记忆点：** 软删除不是你手动加 `Where(!IsDeleted)`，而是框架自动注入全局查询过滤器；设置管理优先级 User > Tenant > Application > 默认值；数据过滤器用 `using` 块临时操作，出了块自动恢复。

---

## 面试题

### 面试题 1（中级 / 概念题）
**题目**：ABP 的软删除是如何实现的？为什么查询时已删除数据会自动过滤？

**参考答案**：ABP 通过 EF Core 的全局查询过滤器（Global Query Filter）实现软删除。在 `AbpDbContext` 的 `OnModelCreating` 中，框架自动为所有实现了 `ISoftDelete` 接口的实体注册 `HasQueryFilter(e => !e.IsDeleted)`，这样每次查询都会自动附加 `WHERE IsDeleted = 0` 条件。开发者无需手动加 `Where(x => !x.IsDeleted)`，查询逻辑完全透明。例如养老院系统中，长者退住后只需设置 `IsDeleted = true`，所有列表查询自动排除已退住长者。需要注意：软删除的实体仍存在于数据库中，只是被标记，如果需要物理删除（如清理过期数据），要使用 `HardDelete` 或直接执行 SQL。
### 面试题 2（初级 / 代码题）
**题目**：如何临时查看已软删除的数据？

**参考答案**：注入 `IDataFilter<ISoftDelete>` 服务，在 `using` 块内调用 `Disable()` 方法临时禁用过滤器。代码示例：`using (_softDeleteFilter.Disable()) { var all = await _repo.GetListAsync(); }`——在 using 块内，全局过滤器被临时移除，查询会返回包括已删除在内的所有数据。出块后过滤器自动恢复。典型场景：养老院院长需要查看已退住长者的完整名单，或管理员需要恢复误删除的数据。注意 `Disable()` 返回的 `IDisposable` 必须用 using 包裹，否则过滤器可能不会恢复，导致后续查询遗漏数据。
### 面试题 3（初级 / 概念题）
**题目**：ABP 设置管理的三个作用域和优先级？

**参考答案**：ABP 设置管理有三个作用域——Application（应用级别，全局默认值）、Tenant（租户级别，每个养老院可独立配置）、User（用户级别，每个用户可个性化设置）。优先级从高到低：User > Tenant > Application > SettingDefinition 中定义的默认值。例如养老院系统的「收费标准」设置：默认值 3000 元/月（定义时），A 养老院设为 3500 元（Tenant 级别），某位长者享受折扣设为 2800 元（User 级别）。`ISettingProvider.GetAsync("收费")` 会按优先级逐级查找，返回最精确的值。
### 面试题 4（初级 / 概念题）
**题目**：ISettingProvider 和 ISettingManager 的区别？

**参考答案**：`ISettingProvider` 是只读接口，用于业务服务中读取配置值（如 `await _settingProvider.GetAsync<string>("Yls.MaxElderCount")`），它按 User > Tenant > Application 的优先级自动查找。`ISettingManager` 是读写接口，用于管理后台修改配置值（如 `await _settingManager.SetGlobalAsync("Yls.MaxElderCount", "200")`），支持按作用域设置。两者遵循读写分离原则：业务代码只读不写，管理后台才写入。这样设计的好处是业务逻辑不会意外修改配置，同时管理界面可以灵活调整系统参数。
### 面试题 5（中级 / 概念题）
**题目**：ABP 多租户数据隔离如何实现？

**参考答案**：ABP 为所有实现了 `IMultiTenant` 接口的实体在 DbContext 中注册全局查询过滤器 `WHERE TenantId = @currentTenantId`。当前租户 ID 通过 `ICurrentTenant` 服务自动获取（从请求头、Cookie 或域名中解析）。例如养老院系统中，A 院和 B 院共用一套代码和数据库，但 A 院的护理员查询长者列表时，SQL 自动附加 `WHERE TenantId = 'A院的Guid'`，只能看到本院数据。开发者无需在每个查询中手动加租户条件，数据隔离完全透明。切换租户使用 `using (_currentTenant.Change(tenantId))` 临时切换。
### 面试题 6（高级 / 场景题）
**题目**：全局查询过滤器对性能的影响？

**参考答案**：全局查询过滤器为每个查询附加额外的 WHERE 条件，对性能有两方面影响：正面影响是减少了返回的数据量（只查未删除、当前租户的数据）；负面影响是每次查询都多一个条件，如果没有合适的索引会导致全表扫描。优化方案：为 `IsDeleted` 和 `TenantId` 建复合索引，例如 `CREATE INDEX IX_Elder_TenantId_IsDeleted ON Elders(TenantId, IsDeleted)`。在养老院系统中，长者表数据量大且频繁按租户+软删除查询，这个复合索引可以将查询从全表扫描优化为索引范围扫描。注意：过多的全局过滤器也会增加 DbContext 初始化开销。
### 面试题 7（高级 / 代码题）
**题目**：如何自定义数据过滤器？

**参考答案**：自定义数据过滤器分三步：第一步定义过滤器接口，如 `public interface IVip { bool IsVip { get; } }`；第二步让实体实现该接口，如 `public class Elder : ..., IVip { public bool IsVip { get; set; } }`；第三步在 DbContext 的 `OnModelCreating` 中注册全局过滤器：`builder.Entity<Elder>().HasQueryFilter(e => !DataFilter.IsEnabled<IVip>() || e.IsVip)`——当过滤器启用时只返回 VIP 长者，禁用时返回全部。使用时通过 `using (DataFilter.Disable<IVip>())` 临时禁用。养老院场景：VIP 长者享受优先护理，护理站默认只显示 VIP 列表，需要时可查看全部。
### 面试题 8（初级 / 概念题）
**题目**：ABP 审计日志默认记录哪些信息？

**参考答案**：ABP 审计日志默认记录以下信息：操作人（UserId、UserName、TenantId）、操作时间（ExecutionTime）、执行耗时（Duration）、服务名（ServiceName）、方法名（MethodName）、HTTP 方法和路径、请求参数（序列化为 JSON）、返回值、客户端 IP 地址、浏览器信息、异常信息（如果有）。启用实体变更追踪后，还会记录 EntityChangeSet：哪些实体被创建/修改/删除、每个实体的哪些属性发生了变化（包含旧值和新值）。养老院场景：修改长者护理等级时，审计日志会记录「张三于 2026-07-10 14:30 将长者李大爷的护理等级从『自理』改为『半护理』」。
### 面试题 9（初级 / 代码题）
**题目**：如何禁用审计日志？

**参考答案**：有两种方式禁用审计日志：第一种是特性方式，在类或方法上加 `[DisableAuditing]`，如 `[DisableAuditing] public async Task<List<ElderDto>> GetAllAsync()` 可以跳过该方法的审计记录；第二种是配置方式，在模块的 `ConfigureServices` 中将类型加入忽略列表：`Configure<AbpAuditingOptions>(options => { options.IgnoredTypes.Add(typeof(HealthCheckService)); })`。典型场景：养老院系统的健康数据轮询接口每 5 秒调用一次，如果每次都记录审计日志会产生大量无用数据，应该禁用。建议只对写操作（增删改）保留审计，纯读操作可以关闭。
### 面试题 10（初级 / 概念题）
**题目**：本地化资源文件的格式和规则？

**参考答案**：本地化资源文件是嵌入式 JSON 文件，放在项目的 `Localization/<ResourceName>/` 目录下，文件名格式为 `{culture}.json`（如 `zh-Hans.json`、`en.json`）。JSON 内容是键值对结构：`{ "Elder:Name": "长者姓名", "Elder:Age": "年龄" }`。需要在 `.csproj` 中设置 `<EmbeddedResource Include="Localization\Yls\*.json" />`，并在模块中注册：`Configure<AbpVirtualFileSystemOptions>(o => o.FileSets.AddEmbedded<YourModule>());` 和 `Configure<AbpLocalizationOptions>(o => o.Resources.Add<YlsResource>("Yls").AddVirtualJson("/Localization/Yls"));`。使用时注入 `IStringLocalizer<YlsResource>`，通过 `L["Elder:Name"]` 获取当前语言的文本。
### 面试题 11（中级 / 概念题）
**题目**：功能开关与设置管理的区别？

**参考答案**：功能开关控制的是「功能模块是否可用」，作用域通常为租户级别，判断的是「这个养老院有没有开通智能监护功能」；设置管理控制的是「功能模块内部的参数值」，有三个作用域（Application/Tenant/User），判断的是「智能监护的告警阈值是多少」。代码层面：功能开关用 `IFeatureChecker.IsEnabledAsync("SmartMonitoring")` 检查，通常配合 `[RequiresFeature("SmartMonitoring")]` 特性在 Controller 级别拦截；设置管理用 `ISettingProvider.GetAsync("Yls.AlarmThreshold")` 读取具体值。简单说：功能开关是「有没有」，设置管理是「是多少」。
### 面试题 12（高级 / 场景题）
**题目**：超级管理员如何查看所有租户数据？

**参考答案**：超级管理员需要临时禁用租户过滤器来查看所有租户的数据。代码示例：`using (_unitOfWorkManager.Current.DisableFilter(AbpDataFilterNames.MayHaveTenant)) { var allElders = await _elderRepo.GetListAsync(); }`——在 using 块内，`WHERE TenantId = @currentTenantId` 条件被移除，查询返回所有租户的长者数据。出块后过滤器自动恢复。养老院集团场景：总部管理员需要查看所有分院的入住率统计，但日常操作时每个分院只能看到自己的数据。注意：禁用过滤器后查询的数据量可能很大，建议配合分页使用，避免一次性加载过多数据导致内存溢出。
### 面试题 13（中级 / 概念题）
**题目**：审计日志中实体变更追踪记录什么？

**参考答案**：ABP 的实体变更追踪（Entity Change Tracking）记录三类信息：第一，实体变更概要——实体类型名称、变更类型（Created/Updated/Deleted）、实体主键 ID、变更时间；第二，属性变更详情——每个被修改的属性的属性名、原始值（OldValue）、新值（NewValue），只有实际发生变化的属性才会被记录；第三，关联信息——关联的审计日志 ID、租户 ID。例如在养老院系统中，修改长者信息时：`Elder` 实体 `Updated`，属性 `NursingLevel` 从 `SelfCare` 改为 `SemiCare`，属性 `MonthlyFee` 从 `3000` 改为 `4500`。启用方式：`Configure<AbpAuditingOptions>(o => o.IsEnabledForEntity = true)`。
---

## 下一章预告

下一章《EF Core 进阶与数据库设计》将学习：**DbContext 生命周期与并发问题**、**变更追踪原理**（为什么 Update 前要先 Get？）、**MySQL 事务与隔离级别**（脏读/幻读/不可重复读 — 面试必考）、**MVCC 多版本并发控制原理**、**MySQL 索引深入**（B+Tree、复合索引最左前缀、EXPLAIN 执行计划分析 — 面试必考）。

---

## 时效性声明

本章内容基于 **ABP Framework 4.4.0** 版本编写，核心基础设施在各版本中保持稳定。

---

## 修订记录

| 版本 | 日期 | 修订内容 |
|------|------|----------|
| v1.0 | 2026-07-10 | 初版：设置管理、功能开关、本地化、数据过滤、审计日志 |
| v1.1 | 2026-07-10 | 面试题答案扩充（每题 3-5 句含养老院场景）；错误对比表改为四列标准格式 |
