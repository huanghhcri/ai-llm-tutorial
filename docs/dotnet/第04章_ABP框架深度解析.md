# 第 04 章：ABP 框架深度解析

> **版本说明**：本章基于 ABP Framework 4.4.0（开源版）+ .NET 5.0，所有代码均使用 C# 9 语法，不使用 record、init-only 属性、主构造函数等新特性。

## 学习目标

完成本章后，你将能够：

1. 理解 ABP 模块系统的生命周期机制，能够创建自定义模块并正确管理依赖
2. 掌握 DDD 分层架构中各层的职责边界，知道什么代码应该放在哪一层
3. 独立从零创建一个完整的 ABP 模块解决方案
4. 理解 ABP「约定优于配置」的设计哲学，减少样板代码
5. 熟练使用 AutoMapper Profile 进行实体与 DTO 之间的映射配置
6. 深入理解工作单元（Unit of Work）机制，正确管理事务边界

## 前置知识

- C# 基础语法与面向对象编程
- ASP.NET Core 基础（依赖注入、中间件管道）
- Entity Framework Core 基础（DbContext、迁移）
- 第 01-03 章内容

## 为什么需要学这个？

在前面几章中，我们已经搭建了养老院管理系统的骨架，创建了基本的实体和应用服务。但你可能已经注意到一些"魔法"——为什么继承 `ApplicationService` 的方法就自动有了事务？为什么只定义了 `IElderRepository` 接口，框架就自动提供了实现？这些都不是巧合，而是 ABP 框架精心设计的模块系统、约定机制和工作单元在背后运作。

理解这些底层原理，不是为了炫技，而是为了在遇到复杂业务场景时——比如跨模块的数据一致性、自定义的事务控制、性能优化——能够做出正确的技术决策，而不是与框架"打架"。

---

## 1. ABP 模块系统原理

### 1.1 生活类比：养老院的「新部门组建流程」

想象养老院要成立一个新的"康复训练中心"。这个过程大致分为三个阶段：

1. **申请阶段**：向院长提交申请，说明需要哪些资源（人员、场地、设备），以及这个新部门依赖哪些已有部门（如医疗部、护理部）
2. **配置阶段**：获批后，配置人员编制、采购设备、制定规章制度
3. **运营阶段**：正式挂牌，开始接收长者，与其他部门协作运转

ABP 的模块系统完全遵循这个模式。每个模块就是一个"部门"，拥有清晰的生命周期。

### 1.2 AbpModule 基类与 DependsOn 特性

在 ABP 中，一个模块就是一个继承自 `AbpModule` 的类。模块之间的依赖关系通过 `[DependsOn]` 特性声明：

```csharp
using Volo.Abp.Modularity;

namespace MyElderCare.Modules.Health
{
    [DependsOn(
        typeof(MyElderCare.DomainModule),
        typeof(MyElderCare.EntityFrameworkCoreModule)
    )]
    public class HealthManagementModule : AbpModule
    {
        // 模块生命周期方法在这里重写
    }
}
```

`[DependsOn]` 的作用类似于养老院新部门申请表上的"协作部门"一栏——框架会根据这些依赖关系自动确定模块的加载顺序，确保被依赖的模块先初始化。

### 1.3 模块生命周期三阶段

`AbpModule` 提供了三个核心虚方法，对应模块生命周期的三个阶段：

**阶段一：PreConfigureServices（预配置服务）**

相当于养老院新部门的"申请阶段"——在正式注册服务之前，做一些前置准备工作。

```csharp
public override void PreConfigureServices(ServiceConfigurationContext context)
{
    // 前置配置，通常用得较少
    // 例如：条件性地替换某个服务的注册
}
```

**阶段二：ConfigureServices（配置服务）**

这是最重要的阶段，相当于"配置人员和设备"。绝大多数服务注册、选项配置都在这里完成。

```csharp
public override void ConfigureServices(ServiceConfigurationContext context)
{
    // 注册服务
    context.Services.AddTransient<IElderHealthChecker, ElderHealthChecker>();

    // 配置选项
    Configure<HealthCheckOptions>(options =>
    {
        options.DefaultCheckInterval = TimeSpan.FromHours(24);
    });

    // 自动注册仓储（ABP 约定）
    context.Services.AddAutoRepositoryTypes();

    // 配置 AutoMapper
    context.Services.AddAutoMapperObjectMapper();
}
```

**阶段三：OnApplicationInitialization（应用初始化）**

相当于"正式挂牌运营"——应用启动时执行初始化逻辑，如配置中间件管道、初始化种子数据。

```csharp
public override void OnApplicationInitialization(ApplicationInitializationContext context)
{
    var app = context.GetApplicationBuilder();

    // 配置中间件
    app.UseRouting();

    // 初始化种子数据
    using (var scope = context.ServiceProvider.CreateScope())
    {
        var seeder = scope.ServiceProvider.GetRequiredService<HealthDataSeeder>();
        seeder.SeedAsync().GetAwaiter().GetResult();
    }
}
```

> **注意**：`OnApplicationInitialization` 在应用启动时只执行一次，不要在这里做每次请求都要执行的逻辑。

### 1.4 阶段能力总览

| 阶段 | 典型操作 | 养老院类比 |
|------|----------|-----------|
| PreConfigureServices | 条件性替换服务、扩展框架注册点 | 提交申请、说明需求 |
| ConfigureServices | 注册服务、配置选项、注册AutoMapper Profile | 人员编制、采购设备 |
| OnApplicationInitialization | 配置中间件、初始化数据、健康检查 | 挂牌运营、开张仪式 |

---

## 2. DDD 分层各层职责

### 2.1 生活类比：养老院的「组织架构」

一家正规养老院的组织架构通常分为四层：

- **决策层**（院长/董事会）：制定战略方向和核心规则，不关心具体执行细节
- **管理层**（各部门主任）：协调资源，把决策层的战略转化为可执行的业务流程
- **执行层**（护理员、厨师、保安）：具体干活的人
- **后勤层**（采购、仓库、IT）：为所有部门提供基础设施支持

ABP 的 DDD 分层与此一一对应。

### 2.2 各层职责详解

#### Domain.Shared 层（共享常量层）

**类比**：全院通用的规章制度手册

这一层是所有其他层都能引用的最底层，通常包含：
- 枚举类型（如 `ElderGender`、`RoomStatus`）
- 常量定义（如 `ElderCareConsts.MaxNameLength`）
- 异常类（业务异常）
- 不依赖任何其他层

```csharp
namespace MyElderCare.Domain.Shared
{
    public static class ElderCareConsts
    {
        public const int MaxNameLength = 50;
        public const int MaxIdCardLength = 18;
        public const int MaxRemarkLength = 500;
    }

    public enum ElderStatus
    {
        Active = 0,
        Transferred = 1,
        Discharged = 2,
        Deceased = 3
    }
}
```

#### Domain 层（领域层）

**类比**：决策层——制定业务规则

这是 DDD 的核心，包含：
- 实体（Entity）、值对象（Value Object）
- 聚合根（Aggregate Root）
- 领域服务（Domain Service）
- 仓储接口（Repository Interface）
- 领域事件（Domain Event）

```csharp
using Volo.Abp.Domain.Entities.Auditing;

namespace MyElderCare.Domain.Elders
{
    public class Elder : FullAuditedAggregateRoot<Guid>
    {
        public string Name { get; private set; }
        public string IdCardNumber { get; private set; }
        public DateTime BirthDate { get; private set; }
        public ElderStatus Status { get; private set; }
        public Guid? RoomId { get; private set; }

        private Elder()
        {
            // EF Core 需要无参构造函数
        }

        public Elder(Guid id, string name, string idCardNumber, DateTime birthDate)
            : base(id)
        {
            Name = name;
            IdCardNumber = idCardNumber;
            BirthDate = birthDate;
            Status = ElderStatus.Active;
        }

        public void CheckIn(Guid roomId)
        {
            RoomId = roomId;
            Status = ElderStatus.Active;
        }

        public void Discharge()
        {
            Status = ElderStatus.Discharged;
            RoomId = null;
        }
    }
}
```

#### Application.Contracts 层（应用契约层）

**类比**：管理层的「工作手册模板」——定义做什么，不定义怎么做

包含：
- 应用服务接口（`IElderAppService`）
- DTO 定义（`CreateElderDto`、`ElderDto`）
- 权限定义（`ElderCarePermissions`）

```csharp
using Volo.Abp.Application.Services;

namespace MyElderCare.Application.Contracts.Elders
{
    public interface IElderAppService :
        ICrudAppService<ElderDto, Guid, PagedAndSortedResultRequestDto, CreateElderDto>
    {
        Task CheckInAsync(Guid elderId, CheckInInput input);
    }

    public class CreateElderDto
    {
        public string Name { get; set; }
        public string IdCardNumber { get; set; }
        public DateTime BirthDate { get; set; }
    }
}
```

#### Application 层（应用层）

**类比**：管理层——协调和编排业务流程

包含：
- 应用服务实现（`ElderAppService`）
- DTO 映射配置（AutoMapper Profile）
- 工作流编排（调用领域服务、仓储）

```csharp
using Volo.Abp.Application.Services;

namespace MyElderCare.Application.Elders
{
    public class ElderAppService :
        CrudAppService<Elder, ElderDto, Guid, PagedAndSortedResultRequestDto, CreateElderDto>,
        IElderAppService
    {
        private readonly IRoomRepository _roomRepository;

        public ElderAppService(
            IRepository<Elder, Guid> repository,
            IRoomRepository roomRepository)
            : base(repository)
        {
            _roomRepository = roomRepository;
        }

        public async Task CheckInAsync(Guid elderId, CheckInInput input)
        {
            var elder = await Repository.GetAsync(elderId);
            var room = await _roomRepository.GetAsync(input.RoomId);

            if (room.CurrentOccupancy >= room.Capacity)
            {
                throw new BusinessException("RoomFull");
            }

            elder.CheckIn(room.Id);
            await Repository.UpdateAsync(elder);
        }
    }
}
```

#### EntityFrameworkCore 层

**类比**：后勤层的仓库管理员

包含：
- DbContext
- 仓储实现（通常 ABP 自动实现，复杂场景才需手动）
- EF Core 实体配置（`IEntityTypeConfiguration`）
- 数据库迁移

#### HttpApi 层

**类比**：前台接待——对外暴露 API 接口

包含：
- API Controller（通常 ABP 自动生成，复杂场景才需手动）

### 2.3 代码放置决策树

当你不确定一段代码应该放在哪一层时，按以下顺序判断：

1. **是枚举、常量、通用异常？** → `Domain.Shared`
2. **是实体、值对象、业务规则、仓储接口？** → `Domain`
3. **是 DTO、服务接口、权限定义？** → `Application.Contracts`
4. **是服务实现、映射配置、业务编排？** → `Application`
5. **是 EF Core 配置、DbContext、迁移？** → `EntityFrameworkCore`
6. **是 API Controller、路由配置？** → `HttpApi`

### 2.4 依赖方向规则

依赖方向**只能从上层指向下层**，绝对不能反向：

```
HttpApi → Application → Application.Contracts → Domain.Shared
                        → Domain → Domain.Shared
EntityFrameworkCore → Domain
```

违反这个规则的典型错误：在 `Domain` 层引用 `Application.Contracts` 中的 DTO——这是绝对禁止的。领域层不应该知道 DTO 的存在。

---

## 3. 从零创建一个 ABP 模块

### 3.1 完整步骤

以创建「康复训练模块」（`Rehabilitation`）为例：

**第一步：创建解决方案结构**

```bash
# 创建解决方案
dotnet new sln -n MyElderCare.Rehabilitation

# 创建各层项目
dotnet new classlib -n MyElderCare.Rehabilitation.Domain.Shared
dotnet new classlib -n MyElderCare.Rehabilitation.Domain
dotnet new classlib -n MyElderCare.Rehabilitation.Application.Contracts
dotnet new classlib -n MyElderCare.Rehabilitation.Application
dotnet new classlib -n MyElderCare.Rehabilitation.EntityFrameworkCore

# 添加到解决方案
dotnet sln add MyElderCare.Rehabilitation.Domain.Shared
dotnet sln add MyElderCare.Rehabilitation.Domain
dotnet sln add MyElderCare.Rehabilitation.Application.Contracts
dotnet sln add MyElderCare.Rehabilitation.Application
dotnet sln add MyElderCare.Rehabilitation.EntityFrameworkCore
```

**第二步：配置项目引用关系**

```bash
# Domain 引用 Domain.Shared
dotnet add MyElderCare.Rehabilitation.Domain reference \
    MyElderCare.Rehabilitation.Domain.Shared

# Application.Contracts 引用 Domain.Shared
dotnet add MyElderCare.Rehabilitation.Application.Contracts reference \
    MyElderCare.Rehabilitation.Domain.Shared

# Application 引用 Domain + Application.Contracts
dotnet add MyElderCare.Rehabilitation.Application reference \
    MyElderCare.Rehabilitation.Domain
dotnet add MyElderCare.Rehabilitation.Application reference \
    MyElderCare.Rehabilitation.Application.Contracts

# EntityFrameworkCore 引用 Domain
dotnet add MyElderCare.Rehabilitation.EntityFrameworkCore reference \
    MyElderCare.Rehabilitation.Domain
```

**第三步：定义各层的模块类**

```csharp
// Domain.Shared 模块
namespace MyElderCare.Rehabilitation.Domain.Shared
{
    [DependsOn()]
    public class RehabilitationDomainSharedModule : AbpModule
    {
    }
}

// Domain 模块
namespace MyElderCare.Rehabilitation.Domain
{
    [DependsOn(typeof(RehabilitationDomainSharedModule))]
    public class RehabilitationDomainModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            // 配置自动仓储
            Configure<AbpDefaultRepositoryTypeOptions>(options =>
            {
                options.DefaultRepositoriesEnabled = true;
            });
        }
    }
}

// Application 模块
namespace MyElderCare.Rehabilitation.Application
{
    [DependsOn(
        typeof(RehabilitationDomainModule),
        typeof(RehabilitationApplicationContractsModule)
    )]
    public class RehabilitationApplicationModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            // 配置 AutoMapper
            Configure<AbpAutoMapperOptions>(options =>
            {
                options.AddMaps<RehabilitationApplicationModule>();
            });
        }
    }
}
```

**第四步：在主应用中引用新模块**

```csharp
namespace MyElderCare.HttpApi.Host
{
    [DependsOn(
        typeof(RehabilitationApplicationModule),
        typeof(RehabilitationEntityFrameworkCoreModule)
    )]
    public class ElderCareHttpApiHostModule : AbpModule
    {
        // ...
    }
}
```

---

## 4. 约定优于配置

### 4.1 ABP 中的具体体现

ABP 大量使用「约定优于配置」原则，让开发者少写样板代码：

**约定一：自动仓储注册**

只要实体继承了 `AggregateRoot` 或 `Entity`，ABP 会自动为 `IRepository<TEntity, TKey>` 注册默认的 `EfCoreRepository` 实现。你不需要手动写 `services.AddScoped<IRepository<Elder, Guid>, EfCoreRepository<...>>()`。

**约定二：自动 API Controller**

应用服务实现了 `IApplicationService` 接口后，ABP 会自动为它生成 API Controller，自动处理路由、参数绑定、验证、序列化。你不需要手动写 `[ApiController]` 类。

**约定三：自动模块依赖**

`AbpModule` 基类本身已经隐式依赖了 `AbpKernelModule`，你不需要显式声明 `[DependsOn(typeof(AbpKernelModule))]`。

**约定四：审计字段自动填充**

实体继承 `FullAuditedEntity` 后，`CreationTime`、`CreatorId`、`LastModificationTime` 等字段会被框架自动填充，无需手动赋值。

### 4.2 Convention vs Configuration 对比

| 场景 | 约定方式（ABP 默认） | 配置方式（手动指定） |
|------|---------------------|---------------------|
| 仓储注册 | 自动注册 `IRepository<Elder, Guid>` | 手动 `services.AddScoped<>()` |
| API 路由 | 自动生成 `/api/app/elder` | 手动写 `[Route("api/elder")]` |
| 审计字段 | `FullAuditedEntity` 自动填充 | 手动在每个方法中赋值 `CreationTime` |
| 模块加载 | 根据 `DependsOn` 自动排序 | 手动控制初始化顺序 |

约定减少了代码量，但当你需要打破约定时，ABP 也提供了充分的配置覆盖能力。

---

## 5. AutoMapper Profile 配置（重点）

### 5.1 生活类比：「档案转录员」

养老院有多种档案格式：入住登记表（手写）、电子病历（系统A）、健康档案（系统B）。同一个长者的信息在不同系统中字段名称不同、格式不同。

AutoMapper 就像一个专业的"档案转录员"——你告诉他"把入住登记表的'姓名'抄到电子病历的'PatientName'字段"，他就能自动完成转换。你只需要定义一次"对照表"（Profile），之后每次转录都自动完成。

### 5.2 ABP 中的 ObjectMapper

ABP 不直接暴露 AutoMapper 的 `IMapper`，而是通过 `IObjectMapper` 接口进行封装。这样做的好处是：如果将来要换映射框架，只需替换 `IObjectMapper` 的实现，不影响业务代码。

在应用服务中使用：

```csharp
public class ElderAppService : ApplicationService
{
    public async Task<ElderDto> GetAsync(Guid id)
    {
        var elder = await _repository.GetAsync(id);
        // 使用 ABP 封装的 ObjectMapper
        return ObjectMapper.Map<Elder, ElderDto>(elder);
    }
}
```

### 5.3 创建 Profile 类

每个映射规则定义在一个 `Profile` 类中，继承自 `AutoMapper.Profile`（ABP 4.4.0 中使用 AutoMapper 10.x）：

```csharp
using AutoMapper;

namespace MyElderCare.Application.Elders
{
    public class ElderMappingProfile : Profile
    {
        public ElderMappingProfile()
        {
            // 基本映射：属性名相同的字段自动对应
            CreateMap<Elder, ElderDto>();

            // 创建时的映射：DTO → 实体
            CreateMap<CreateElderDto, Elder>()
                .ForMember(dest => dest.Id, opt => opt.Ignore());
        }
    }
}
```

然后在模块中注册：

```csharp
public override void ConfigureServices(ServiceConfigurationContext context)
{
    Configure<AbpAutoMapperOptions>(options =>
    {
        options.AddMaps<MyElderCareApplicationModule>();
        // 或者精确指定：options.AddProfile<ElderMappingProfile>(validate: true);
    });
}
```

### 5.4 ForMember 自定义映射

当源和目标的属性名称不一致，或者需要类型转换、条件映射时，使用 `ForMember`：

```csharp
CreateMap<Elder, ElderDetailDto>()
    // 名称不同：实体的 Name → DTO 的 FullName
    .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.Name))

    // 类型转换：DateTime → string
    .ForMember(dest => dest.BirthDateText,
        opt => opt.MapFrom(src => src.BirthDate.ToString("yyyy-MM-dd")))

    // 条件映射：只有 Active 状态才填充房间信息
    .ForMember(dest => dest.RoomNumber,
        opt => opt.MapFrom(src =>
            src.Status == ElderStatus.Active ? src.Room.RoomNumber : "未分配"))

    // 自定义转换逻辑
    .ForMember(dest => dest.Age,
        opt => opt.MapFrom(src =>
            DateTime.Today.Year - src.BirthDate.Year));
```

### 5.5 Ignore 忽略字段

某些字段不应该参与映射（如内部标记、敏感信息）：

```csharp
CreateMap<Elder, ElderDto>()
    // 忽略身份证号（隐私保护）
    .ForMember(dest => dest.IdCardNumber, opt => opt.Ignore())
    // 忽略内部版本号
    .ForMember(dest => dest.ConcurrencyStamp, opt => opt.Ignore());
```

### 5.6 ReverseMap 双向映射

当你需要双向转换（Entity ↔ DTO）时，使用 `ReverseMap`：

```csharp
CreateMap<Elder, ElderDto>()
    .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.Name))
    .ReverseMap();
    // ReverseMap 自动创建 ElderDto → Elder 的映射
    // 并且 FullName → Name 的映射也会自动反转
```

> **注意**：`ReverseMap` 会继承 `Ignore` 规则的反向——如果正向忽略了某个字段，反向映射时该字段也会被忽略。

### 5.7 完整示例：长者实体 → ElderDto

```csharp
using AutoMapper;

namespace MyElderCare.Application.Elders
{
    public class ElderAutoMapperProfile : Profile
    {
        public ElderAutoMapperProfile()
        {
            // Elder → ElderDto（查询用）
            CreateMap<Elder, ElderDto>()
                .ForMember(d => d.StatusText,
                    opt => opt.MapFrom(s => s.Status.ToString()))
                .ForMember(d => d.Age,
                    opt => opt.MapFrom(s => CalculateAge(s.BirthDate)));

            // CreateElderDto → Elder（创建用）
            CreateMap<CreateElderDto, Elder>()
                .ForMember(d => d.Id, opt => opt.Ignore())
                .ForMember(d => d.Status, opt => opt.Ignore())
                .ForMember(d => d.RoomId, opt => opt.Ignore());

            // UpdateElderDto → Elder（更新用）
            CreateMap<UpdateElderDto, Elder>()
                .ForMember(d => d.Id, opt => opt.Ignore())
                .ForMember(d => d.Status, opt => opt.Ignore())
                .ForAllMembers(opt => opt.Condition((src, dest, srcMember) =>
                    srcMember != null));
        }

        private static int CalculateAge(DateTime birthDate)
        {
            var age = DateTime.Today.Year - birthDate.Year;
            if (birthDate.Date > DateTime.Today.AddYears(-age))
            {
                age--;
            }
            return age;
        }
    }
}
```

### 5.8 常见坑

**坑一：属性名大小写敏感**

AutoMapper 默认按属性名匹配，且区分大小写。如果实体有 `Name` 而 DTO 有 `name`（小写），不会自动映射。解决方案：统一使用 PascalCase。

**坑二：嵌套对象映射**

如果 DTO 中包含嵌套对象（如 `ElderDto.RoomDto`），需要为嵌套类型也创建映射规则：

```csharp
CreateMap<Elder, ElderDto>();          // 需要下面这条配合
CreateMap<Room, RoomDto>();            // 否则 Room → RoomDto 不会自动转换
```

**坑三：集合映射**

`List<Elder>` → `List<ElderDto>` 会自动生效，前提是 `Elder → ElderDto` 的映射已注册。但如果集合元素类型不同名，需要显式配置。

**坑四：忽略字段的陷阱**

使用 `.ForAllMembers(opt => opt.Ignore())` 后再用 `.ForMember()` 逐一开放，这种"白名单"模式容易遗漏新字段。建议用"黑名单"模式——只 Ignore 需要忽略的字段。

---

## 6. ABP 工作单元原理（重点）

### 6.1 生活类比：养老院的「一次性审批流程」

长者入住需要经过多个审批步骤：体检报告审核 → 费用确认 → 房间分配 → 合同签署。这些步骤必须作为一个整体——如果费用确认后发现房间已满，前面的步骤也要撤销，不能让长者"半入住"。

这就是工作单元（Unit of Work）的核心思想：**把多个操作打包成一个事务，要么全部成功，要么全部回滚。**

### 6.2 UnitOfWork 什么时候自动开启

在 ABP 中，继承自 `ApplicationService` 的应用服务方法会**自动开启工作单元**。这意味着：

```csharp
public class ElderAppService : ApplicationService
{
    public async Task<ElderDto> CreateAsync(CreateElderDto input)
    {
        // 下面这三个操作在同一个事务中
        // 任何一个失败，全部回滚
        var elder = ObjectMapper.Map<CreateElderDto, Elder>(input);
        await _repository.InsertAsync(elder);
        await _logRepository.InsertAsync(new OperationLog("入住登记", elder.Id));
        return ObjectMapper.Map<Elder, ElderDto>(elder);
    }
    // 方法结束时，事务自动提交
}
```

你不需要手动调用 `SaveChangesAsync` 或 `BeginTransaction`——ABP 在方法正常结束时自动提交事务，抛出异常时自动回滚。

### 6.3 手动控制：IUnitOfWorkManager

在非应用服务类（如领域服务、后台任务）中，需要手动管理工作单元：

```csharp
using Volo.Abp.Uow;

namespace MyElderCare.Domain.Elders
{
    public class ElderDomainService : DomainService
    {
        private readonly IUnitOfWorkManager _unitOfWorkManager;
        private readonly IRepository<Elder, Guid> _repository;

        public ElderDomainService(
            IUnitOfWorkManager unitOfWorkManager,
            IRepository<Elder, Guid> repository)
        {
            _unitOfWorkManager = unitOfWorkManager;
            _repository = repository;
        }

        public async Task BatchTransferAsync(List<Guid> elderIds, Guid targetRoomId)
        {
            // 手动开启工作单元
            using (var uow = _unitOfWorkManager.Begin(
                new AbpUnitOfWorkOptions { IsTransactional = true }))
            {
                foreach (var elderId in elderIds)
                {
                    var elder = await _repository.GetAsync(elderId);
                    elder.CheckIn(targetRoomId);
                    await _repository.UpdateAsync(elder);
                }

                await uow.CompleteAsync();
                // CompleteAsync 后事务提交
            }
        }
    }
}
```

### 6.4 嵌套 UoW 的行为

当内层方法也开启工作单元时，内层**不会创建新事务**，而是与外层共享同一个事务：

```csharp
public class CheckInAppService : ApplicationService
{
    public async Task CheckInAsync(CheckInInput input)
    {
        // 外层 UoW 自动开启（因为是 AppService 方法）

        await AssignRoomAsync(input.ElderId, input.RoomId);  // 内层共享外层事务
        await CreateContractAsync(input.ElderId);             // 内层共享外层事务

        // 三个操作在同一个事务中
    }

    [UnitOfWork]  // 显式标记，但实际共享外层事务
    private async Task AssignRoomAsync(Guid elderId, Guid roomId)
    {
        var elder = await _repository.GetAsync(elderId);
        elder.CheckIn(roomId);
    }

    [UnitOfWork]
    private async Task CreateContractAsync(Guid elderId)
    {
        await _contractRepository.InsertAsync(new Contract(elderId));
    }
}
```

如果需要内层独立事务，使用 `RequiresNew`：

```csharp
using (var uow = _unitOfWorkManager.Begin(
    new AbpUnitOfWorkOptions
    {
        IsTransactional = true,
        IsolationLevel = IsolationLevel.ReadCommitted,
        Propagation = Propagation.RequiresNew  // 强制创建新事务
    }))
{
    // 这里是独立事务
    await uow.CompleteAsync();
}
```

### 6.5 [UnitOfWork] 特性使用场景

当你在非 `ApplicationService` 的类中需要事务支持时，使用 `[UnitOfWork]` 特性：

```csharp
public class ElderReportGenerator
{
    private readonly IRepository<Elder, Guid> _repository;

    public ElderReportGenerator(IRepository<Elder, Guid> repository)
    {
        _repository = repository;
    }

    [UnitOfWork]
    public async Task<string> GenerateDailyReportAsync()
    {
        // 这个方法不在 ApplicationService 中，但需要事务保护
        var elders = await _repository.GetListAsync();
        // ... 生成报表逻辑
        return report;
    }
}
```

### 6.6 IsTransactional 配置

对于只读查询，可以关闭事务来提升性能：

```csharp
[UnitOfWork(IsTransactional = false)]
public async Task<List<ElderDto>> GetActiveEldersAsync()
{
    var elders = await _repository.GetListAsync(e => e.Status == ElderStatus.Active);
    return ObjectMapper.Map<List<Elder>, List<ElderDto>>(elders);
}
```

或者在 `ConfigureServices` 中全局配置：

```csharp
public override void ConfigureServices(ServiceConfigurationContext context)
{
    Configure<AbpUnitOfWorkDefaultOptions>(options =>
    {
        options.TransactionBehavior = UnitOfWorkTransactionBehavior.Disabled;
        // 默认不开启事务，需要时通过 [UnitOfWork(IsTransactional = true)] 显式开启
    });
}
```

### 6.7 完整示例：手动事务控制 + 嵌套 UoW

```csharp
using Volo.Abp.Uow;

namespace MyElderCare.Application.CheckIn
{
    public class ComplexCheckInAppService : ApplicationService
    {
        private readonly IUnitOfWorkManager _uowManager;
        private readonly IRepository<Elder, Guid> _elderRepo;
        private readonly IRepository<Room, Guid> _roomRepo;
        private readonly IRepository<Contract, Guid> _contractRepo;
        private readonly IRepository<Payment, Guid> _paymentRepo;

        public ComplexCheckInAppService(
            IUnitOfWorkManager uowManager,
            IRepository<Elder, Guid> elderRepo,
            IRepository<Room, Guid> roomRepo,
            IRepository<Contract, Guid> contractRepo,
            IRepository<Payment, Guid> paymentRepo)
        {
            _uowManager = uowManager;
            _elderRepo = elderRepo;
            _roomRepo = roomRepo;
            _contractRepo = contractRepo;
            _paymentRepo = paymentRepo;
        }

        /// <summary>
        /// 复杂入住流程：分配房间 + 签合同 + 生成首笔费用
        /// 全部在一个事务中，任一步骤失败则全部回滚
        /// </summary>
        public async Task<CheckInResultDto> ComplexCheckInAsync(ComplexCheckInInput input)
        {
            // 外层 UoW（AppService 方法自动开启）

            // 步骤 1：分配房间
            var elder = await _elderRepo.GetAsync(input.ElderId);
            var room = await _roomRepo.GetAsync(input.RoomId);

            if (room.CurrentOccupancy >= room.Capacity)
            {
                throw new BusinessException("RoomFull")
                    .WithData("RoomNumber", room.RoomNumber);
            }

            elder.CheckIn(room.Id);
            room.CurrentOccupancy++;
            await _elderRepo.UpdateAsync(elder);
            await _roomRepo.UpdateAsync(room);

            // 步骤 2：签署合同（嵌套调用，共享外层事务）
            var contract = await CreateContractInternalAsync(elder.Id, input);

            // 步骤 3：生成首笔费用
            var payment = await CreateInitialPaymentAsync(elder.Id, room.Price);

            return new CheckInResultDto
            {
                ElderId = elder.Id,
                RoomNumber = room.RoomNumber,
                ContractId = contract.Id,
                FirstPaymentId = payment.Id
            };
        }

        /// <summary>
        /// 内部方法：显式标记 UnitOfWork，实际共享外层事务
        /// </summary>
        [UnitOfWork]
        private async Task<Contract> CreateContractInternalAsync(
            Guid elderId, ComplexCheckInInput input)
        {
            var contract = new Contract(GuidGenerator.Create(), elderId,
                input.StartDate, input.EndDate);
            await _contractRepo.InsertAsync(contract);
            return contract;
        }

        /// <summary>
        /// 内部方法：生成首笔费用，同样共享外层事务
        /// </summary>
        [UnitOfWork]
        private async Task<Payment> CreateInitialPaymentAsync(
            Guid elderId, decimal amount)
        {
            var payment = new Payment(GuidGenerator.Create(), elderId, amount,
                "首月费用", DateTime.Now);
            await _paymentRepo.InsertAsync(payment);
            return payment;
        }
    }
}
```

---

## 实战案例：从零创建养老院「健康管理」模块

### 需求描述

创建一个独立的健康管理模块，用于记录长者的日常体检数据、用药记录和健康预警。

### 完整实现

**第一步：创建模块类**

```csharp
// HealthManagement/MyElderCare.HealthManagement.Domain/HealthManagementDomainModule.cs
using Volo.Abp.Modularity;

namespace MyElderCare.HealthManagement.Domain
{
    [DependsOn(typeof(HealthManagementDomainSharedModule))]
    public class HealthManagementDomainModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpDefaultRepositoryTypeOptions>(options =>
            {
                options.DefaultRepositoriesEnabled = true;
            });
        }
    }
}
```

**第二步：定义实体**

```csharp
// Domain 层 - HealthRecord 实体
using Volo.Abp.Domain.Entities.Auditing;

namespace MyElderCare.HealthManagement.Domain.HealthRecords
{
    public class HealthRecord : CreationAuditedEntity<Guid>
    {
        public Guid ElderId { get; private set; }
        public DateTime CheckDate { get; private set; }
        public decimal BloodPressureHigh { get; private set; }
        public decimal BloodPressureLow { get; private set; }
        public decimal BloodSugar { get; private set; }
        public decimal HeartRate { get; private set; }
        public string Remark { get; private set; }

        private HealthRecord() { }

        public HealthRecord(
            Guid id, Guid elderId, DateTime checkDate,
            decimal bpHigh, decimal bpLow, decimal bloodSugar,
            decimal heartRate, string remark)
            : base(id)
        {
            ElderId = elderId;
            CheckDate = checkDate;
            BloodPressureHigh = bpHigh;
            BloodPressureLow = bpLow;
            BloodSugar = bloodSugar;
            HeartRate = heartRate;
            Remark = remark;
        }

        public bool IsBloodPressureAbnormal()
        {
            return BloodPressureHigh > 140 || BloodPressureLow > 90;
        }
    }
}
```

**第三步：定义 DTO 和服务接口（Application.Contracts 层）**

```csharp
using System;
using System.ComponentModel.DataAnnotations;
using Volo.Abp.Application.Dtos;

namespace MyElderCare.HealthManagement.Application.Contracts.HealthRecords
{
    public class HealthRecordDto : CreationAuditedEntityDto<Guid>
    {
        public Guid ElderId { get; set; }
        public DateTime CheckDate { get; set; }
        public decimal BloodPressureHigh { get; set; }
        public decimal BloodPressureLow { get; set; }
        public decimal BloodSugar { get; set; }
        public decimal HeartRate { get; set; }
        public string Remark { get; set; }
        public bool IsAbnormal { get; set; }
    }

    public class CreateHealthRecordDto
    {
        [Required]
        public Guid ElderId { get; set; }

        [Required]
        public DateTime CheckDate { get; set; }

        [Range(60, 250)]
        public decimal BloodPressureHigh { get; set; }

        [Range(30, 150)]
        public decimal BloodPressureLow { get; set; }

        [Range(2.0, 30.0)]
        public decimal BloodSugar { get; set; }

        [Range(30, 220)]
        public decimal HeartRate { get; set; }

        [StringLength(500)]
        public string Remark { get; set; }
    }

    public interface IHealthRecordAppService :
        ICrudAppService<HealthRecordDto, Guid, PagedAndSortedResultRequestDto, CreateHealthRecordDto>
    {
        Task<List<HealthRecordDto>> GetByElderAsync(Guid elderId);
    }
}
```

**第四步：实现应用服务 + AutoMapper Profile**

```csharp
// Application 层
using AutoMapper;

namespace MyElderCare.HealthManagement.Application.HealthRecords
{
    public class HealthRecordAutoMapperProfile : Profile
    {
        public HealthRecordAutoMapperProfile()
        {
            CreateMap<HealthRecord, HealthRecordDto>()
                .ForMember(d => d.IsAbnormal,
                    opt => opt.MapFrom(s => s.IsBloodPressureAbnormal()));

            CreateMap<CreateHealthRecordDto, HealthRecord>()
                .ForMember(d => d.Id, opt => opt.Ignore());
        }
    }

    public class HealthRecordAppService :
        CrudAppService<HealthRecord, HealthRecordDto, Guid,
            PagedAndSortedResultRequestDto, CreateHealthRecordDto>,
        IHealthRecordAppService
    {
        public HealthRecordAppService(IRepository<HealthRecord, Guid> repository)
            : base(repository)
        {
        }

        public async Task<List<HealthRecordDto>> GetByElderAsync(Guid elderId)
        {
            var records = await Repository.GetListAsync(
                r => r.ElderId == elderId,
                includeDetails: false);

            return ObjectMapper.Map<List<HealthRecord>, List<HealthRecordDto>>(records);
        }
    }
}
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | Domain 层写 `public ElderDto ToDto()` | Application 层用 `ObjectMapper.Map<Elder, ElderDto>()` | Domain 层不能引用 Contracts 层的 DTO，违反 DDD 依赖方向 |
| 2 | 新建 Profile 类但未在模块中注册 | 在模块 `ConfigureServices` 中 `Configure<AbpAutoMapperOptions>(o => o.AddMaps<YourModule>())` | 运行时抛 AutoMapperMappingException，映射规则未加载 |
| 3 | 在 UoW 内发邮件、调外部 API | 耗时操作移到 UoW 之外，或用 EventBus.Publish 异步处理 | UoW 持有数据库连接和事务锁，长时间占用导致连接池耗尽 |
| 4 | Singleton 服务注入 `IRepository<T>` | Singleton 服务通过 `IServiceProvider.CreateScope()` 获取 Scoped 仓储 | 仓储依赖 DbContext（Scoped），注入到 Singleton 会捕获已释放的上下文 |
| 5 | 所有实体用 `FullAuditedAggregateRoot` | 只在需要审计的实体用 Full 版，简单实体用 `CreationAuditedEntity` | Full 版增加 6 个审计字段，不需要审计的表浪费存储和性能 |
| 6 | 忘记配置 `CreateMap` 就直接 `Map<T>` | 每个映射对都在 Profile 中显式 `CreateMap<S, D>()` | AutoMapper 不会自动推断复杂映射，缺少规则时抛运行时异常 |
| 7 | 嵌套对象未单独配置映射 | 为嵌套类型也添加 `CreateMap<Room, RoomDto>()` | AutoMapper 不会递归推断嵌套类型的映射规则 |
| 8 | 手动 UoW 不用 using 包裹 | `using (var uow = _uowManager.Begin()) { ... await uow.CompleteAsync(); }` | 不用 using 可能导致事务和连接泄漏 |

**最佳实践**：
1. **模块职责单一**：一个模块只做一件事，不要把所有功能塞进一个模块
2. **DTO 只在 Contracts 层定义**：Application 层和 HttpApi 层引用 Contracts，不要重复定义
3. **只读查询关闭事务**：用 `[UnitOfWork(IsTransactional = false)]` 提升性能
4. **Profile 集中管理**：每个 Application 模块一个 Profile 类，不要分散到多个文件
5. **手动 UoW 要用 using**：确保 `IUnitOfWork` 实现了 `IDisposable`，用 using 包裹防止资源泄漏

---

## 本章小结

本章深入探讨了 ABP 框架的六大核心机制：

| 机制 | 核心要点 |
|------|----------|
| 模块系统 | `AbpModule` + `[DependsOn]`，三阶段生命周期 |
| DDD 分层 | Domain.Shared → Domain → Contracts → Application → EFCore → HttpApi |
| 创建模块 | 解决方案结构 → 项目引用 → 模块类 → 注册 |
| 约定优于配置 | 自动仓储、自动 API Controller、自动审计字段 |
| AutoMapper Profile | `CreateMap` + `ForMember` + `Ignore` + `ReverseMap` |
| 工作单元 | AppService 自动开启、手动 `BeginAsync`、嵌套共享、`IsTransactional` |

---

## 面试题

### 面试题 1（初级 / 概念题）
**题目**：ABP 模块的生命周期分为哪几个阶段？各阶段能做什么？

**参考答案**：三个阶段——`PreConfigureServices`（前置配置，条件性替换服务，如替换默认的序列化器）、`ConfigureServices`（核心阶段，注册服务、配置选项、注册 AutoMapper Profile，养老院系统中注册 `IElderAppService` 等业务服务就在此阶段）、`OnApplicationInitialization`（应用启动时，配置中间件、初始化种子数据，如初始化默认角色、管理员账号、基础数据字典）。例如养老院系统的 `YlsMemberModule` 在 `ConfigureServices` 中注册长者管理相关服务，在 `OnApplicationInitialization` 中初始化默认护理等级数据。

### 面试题 2（初级 / 概念题）
**题目**：[DependsOn] 特性的作用是什么？

**参考答案**：声明当前模块依赖的其他模块。框架根据依赖关系自动确定模块的加载和初始化顺序，类似于拓扑排序。被依赖的模块先初始化。例如养老院的 `YlsFinanceModule` 通过 `[DependsOn(typeof(YlsMemberModule))]` 声明依赖长者模块，确保长者实体和仓储先注册完成，财务模块才能正常引用。如果不声明依赖，框架可能先初始化财务模块，此时注入 `IRepository<Elder>` 会失败。

### 面试题 3（初级 / 概念题）
**题目**：DDD 分层中，Domain.Shared 和 Domain 层有什么区别？

**参考答案**：Domain.Shared 是最底层，包含枚举、常量、通用异常等不依赖具体业务的共享定义，所有层都能引用。Domain 层包含实体、值对象、领域服务、仓储接口等核心业务逻辑，依赖 Domain.Shared。以养老院系统为例：`ElderGender`（性别枚举）、`NursingHomeConsts`（系统常量）放在 Domain.Shared；`Elder`（长者实体）、`IElderRepository`（仓储接口）、`BillManager`（账单领域服务）放在 Domain 层。区分的关键：Domain.Shared 的东西可以被任何层使用，Domain 的东西只有 Application 层及以上才能引用。

### 面试题 4（中级 / 概念题）
**题目**：为什么 Application 层不能被 Domain 层引用？

**参考答案**：因为 DDD 的依赖方向是上层依赖下层。Application 层是 Domain 层的"消费者"，如果 Domain 引用 Application，就形成了循环依赖，破坏了分层架构的隔离性和可测试性。

### 面试题 5（中级 / 概念题）
**题目**：ABP 的"约定优于配置"体现在哪些方面？

**参考答案**：主要体现在四个方面——自动仓储注册（实体自动获得 IRepository 实现）、自动 API Controller（ApplicationService 自动暴露为 REST API）、自动模块依赖（AbpModule 隐式依赖 AbpKernelModule）、审计字段自动填充（FullAuditedEntity 自动维护 CreationTime 等字段）。

### 面试题 6（中级 / 代码题）
**题目**：AutoMapper 的 ForMember 和 Ignore 分别用于什么场景？

**参考答案**：`ForMember` 用于自定义映射逻辑——当属性名不同、需要类型转换或条件映射时使用。`Ignore` 用于排除不需要映射的字段——如敏感信息、内部标记字段。

### 面试题 7（中级 / 概念题）
**题目**：ReverseMap 有什么注意事项？

**参考答案**：`ReverseMap` 会创建反向映射并继承正向的 `ForMember` 配置。但注意：正向 `Ignore` 的字段在反向也会被忽略；`MapFrom` 的映射关系在反向时自动反转。如果正向和反向的忽略逻辑不同，需要在 `ReverseMap()` 后链式调用重新配置。

### 面试题 8（初级 / 概念题）
**题目**：ABP 中工作单元什么时候自动开启？

**参考答案**：继承自 `ApplicationService` 的类的公开虚方法会自动开启工作单元。方法正常结束时自动提交事务，抛出异常时自动回滚。

### 面试题 9（中级 / 概念题）
**题目**：嵌套工作单元的行为是什么？

**参考答案**：默认情况下，内层工作单元不会创建新事务，而是与外层共享同一个事务（传播行为为 `Propagation.Required`）。如果需要独立事务，使用 `Propagation.RequiresNew`。

### 面试题 10（中级 / 场景题）
**题目**：什么时候应该手动管理工作单元？

**参考答案**：在非 ApplicationService 类中需要事务支持时——如领域服务、后台任务、自定义管道。通过注入 `IUnitOfWorkManager` 并调用 `BeginAsync()` 手动开启，用 `using` 包裹并在结束时调用 `CompleteAsync()`。

### 面试题 11（中级 / 概念题）
**题目**：IsTransactional = false 的使用场景是什么？

**参考答案**：只读查询场景。关闭事务可以减少数据库锁竞争，提升并发性能。通过 `[UnitOfWork(IsTransactional = false)]` 特性标记或全局配置。

### 面试题 12（初级 / 概念题）
**题目**：创建自定义 ABP 模块需要哪些步骤？

**参考答案**：五步——①创建解决方案和各层类库项目；②配置项目间的引用关系（严格遵守 DDD 依赖方向）；③为每个项目定义继承 AbpModule 的模块类；④在模块类的 ConfigureServices 中注册服务和配置选项；⑤在主应用的根模块中通过 [DependsOn] 引入新模块。

### 面试题 13（中级 / 代码题）
**题目**：AutoMapper 嵌套对象映射失败怎么解决？

**参考答案**：如果 DTO 中包含嵌套对象类型（如 `RoomDto`），必须为嵌套类型也创建 `CreateMap<Room, RoomDto>()` 映射规则。否则 AutoMapper 不知道如何转换嵌套属性。

### 面试题 14（高级 / 场景题）
**题目**：工作单元中执行耗时操作会有什么问题？

**参考答案**：工作单元持有数据库连接和事务锁。如果在 UoW 内执行耗时操作（如调用外部 API、发送邮件），会长时间占用连接，导致连接池耗尽、数据库锁竞争加剧。应将耗时操作移到 UoW 之外，或使用 `EventBus.Publish` 异步处理。

---

## 下一章预告

**第 05 章：ABP 内置模块与基础设施**

我们将深入学习：
- ABP 设置管理（系统参数在线可配置）
- 功能开关（按租户控制功能可用性）
- 本地化（多语言支持）
- 数据过滤（ISoftDelete 软删除原理、租户隔离）
- 审计日志（自动记录操作历史）

---

## 时效性声明

本章内容基于以下版本编写：
- ABP Framework 4.4.0（开源版）
- .NET 5.0
- C# 9
- AutoMapper 10.x（ABP 4.4.0 内置版本）

框架版本迭代较快，部分 API 签名或配置方式可能在后续版本中有变化。建议结合 [ABP 官方文档](https://docs.abp.io) 对照学习。

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-07-10 | v1.0 | 初版编写，涵盖模块系统、DDD分层、AutoMapper Profile、工作单元 |
| 2026-07-10 | v1.1 | 常见错误改为四列标准表格；面试题 1-3 补充养老院场景说明 |

---

> **作者提示**：本章是全书的技术核心章节之一。模块系统和工作单元机制贯穿后续所有章节，建议反复阅读并通过实践加深理解。如果对某个概念还有疑问，可以先动手创建一个简单的模块，在调试中理解框架的行为。
