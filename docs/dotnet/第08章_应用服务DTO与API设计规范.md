# 第 08 章：应用服务、DTO 与 API 设计规范

## 学习目标

1. 掌握 CrudAppService 继承体系，能快速实现标准 CRUD 操作
2. 理解 DTO 与 Dbo 的命名规范和存放位置
3. 掌握 ABP 数据验证机制，能在 DTO 上正确配置验证规则
4. 掌握分页查询规范，能实现标准的分页排序接口
5. 了解 Swagger 配置与 OAuth2 集成
6. 掌握 Controller 路由设计规范
7. 掌握 HTTP 状态码规范（面试高频考点）
8. 能独立完成从 Entity → Dto → AppService → Controller 的完整链路

## 前置知识

- ABP 框架基础与工作单元（第 04 章）
- ABP 内置模块与基础设施（第 05 章）

## 为什么需要学这个？

你写的接口，前端同事能看懂吗？参数名用驼峰还是下划线？查询接口分页怎么传参？新增和修改能不能合并一个接口？这些问题的答案，就是 API 设计规范。规范不是束缚，是团队协作的共同语言。养老院系统有几十个实体，每个都要写增删改查，如果没有统一规范，代码会变成一团乱麻。

---

## 1. CrudAppService 继承体系

### 1.1 生活类比

养老院的「标准入住流程模板」。每个长者入住都走同一套流程：登记基本信息 → 健康评估 → 分配房间 → 签订合同 → 缴纳费用。新来的长者，工作人员拿出模板照着填就行，不用每次都从零设计流程。

CrudAppService 就是这个模板——它帮你自动生成增删改查的全套代码，你只需要定义实体和 DTO。

### 1.2 四个泛型参数

CrudAppService 有四个泛型参数，每个都有明确职责：

```csharp
CrudAppService<TEntity, TEntityDto, TKey, TGetListInput>
```

| 参数 | 含义 | 示例 |
|------|------|------|
| TEntity | 实体类型 | Elder |
| TEntityDto | DTO 类型（用于返回和输入） | ElderDto |
| TKey | 主键类型 | Guid |
| TGetListInput | 列表查询输入类型 | GetElderListInput |

### 1.3 自动提供的方法

继承 CrudAppService 后，ABP 自动提供五个标准方法：

| 方法 | HTTP 动词 | 功能 |
|------|-----------|------|
| CreateAsync(CreateInput) | POST | 新增 |
| UpdateAsync(Id, UpdateInput) | PUT | 修改 |
| DeleteAsync(Id) | DELETE | 删除 |
| GetAsync(Id) | GET | 查询单个 |
| GetListAsync(GetListInput) | GET | 查询列表 |

### 1.4 什么时候继承 CrudAppService？

**继承 CrudAppService 的场景：**
- 标准的增删改查，逻辑简单
- 不需要复杂的业务校验
- 查询条件可以映射为简单的 Where 条件

**自定义 AppService 的场景：**
- 复杂业务逻辑（如长者退住流程涉及多个实体）
- 需要调用外部系统（如发送短信通知）
- 查询逻辑复杂，需要联合多表
- 需要批量操作（如批量入住确认）

### 1.5 代码示例：ElderAppService

```csharp
using System;
using System.Threading.Tasks;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace RBL.Yls.Elders
{
    // 列表查询输入
    public class GetElderListInput : PagedAndSortedResultRequestDto
    {
        public string Name { get; set; }
        public string RoomNumber { get; set; }
    }

    // 长者 DTO（用于返回和输入）
    public class ElderDto : EntityDto<Guid>
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string RoomNumber { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
        public DateTime CheckInDate { get; set; }
    }

    // 创建 DTO
    public class CreateElderDto
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
    }

    // 更新 DTO
    public class UpdateElderDto
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
    }

    // 应用服务
    public class ElderAppService :
        CrudAppService<Elder, ElderDto, Guid, GetElderListInput>,
        IElderAppService
    {
        public ElderAppService(IRepository<Elder, Guid> repository)
            : base(repository)
        {
        }

        // 重写查询，添加过滤条件
        protected override async Task<IQueryable<Elder>> CreateFilteredQueryAsync(
            GetElderListInput input)
        {
            var query = await base.CreateFilteredQueryAsync(input);

            if (!string.IsNullOrWhiteSpace(input.Name))
            {
                query = query.Where(x => x.Name.Contains(input.Name));
            }

            if (!string.IsNullOrWhiteSpace(input.RoomNumber))
            {
                query = query.Where(x => x.RoomNumber == input.RoomNumber);
            }

            return query;
        }
    }
}
```

---

## 2. DTO/Dbo 命名规范与存放位置

### 2.1 生活类比

养老院有两套表格：一套是「入住登记表」（需要填写、提交、修改），放在前台；另一份是「长者信息一览表」（只供查看，不用填写），贴在护士站。前者是 DTO，后者是 Dbo。

### 2.2 Dbo：展示用，放 Domain 层

Dbo（Database Object）是只读的展示对象，用于复杂查询结果。它放在 Domain 层，因为它只负责「读」，不参与「写」操作。

```csharp
// Domain 层：ElderlyCare.Domain/Elders/Dbo/ElderInfoDbo.cs
namespace RBL.Yls.Elders.Dbo
{
    // 只读展示对象，用于复杂查询
    public class ElderInfoDbo
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string RoomNumber { get; set; }
        public string FloorName { get; set; }
        public string NurseName { get; set; }
        public DateTime CheckInDate { get; set; }
        public int StayDays { get; set; }
        public decimal MonthlyFee { get; set; }
    }
}
```

### 2.3 Dto：CRUD 用，放 Contracts 层

Dto 是可读写的传输对象，用于增删改查操作。它放在 Contracts 层，因为它是前后端之间的「契约」。

```csharp
// Contracts 层：ElderlyCare.Application.Contracts/Elders/ElderDto.cs
namespace RBL.Yls.Elders
{
    // 查询返回 DTO
    public class ElderDto : EntityDto<Guid>
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string RoomNumber { get; set; }
    }

    // 创建 DTO
    public class CreateElderDto
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
    }

    // 更新 DTO
    public class UpdateElderDto
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
    }
}
```

### 2.4 CreateAndUpdateDto：合并新增/修改的统一 DTO

当新增和修改的字段基本一致时，可以合并为一个 DTO，用 Guid? Id 区分：

```csharp
// Contracts 层
namespace RBL.Yls.Elders
{
    public class CreateAndUpdateElderDto
    {
        public Guid? Id { get; set; } // null 表示新增，有值表示修改

        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
    }
}
```

在 AppService 中使用：

```csharp
public async Task<Guid> CreateOrUpdateAsync(CreateAndUpdateElderDto input)
{
    if (input.Id.HasValue)
    {
        // 修改
        var elder = await Repository.GetAsync(input.Id.Value);
        ObjectMapper.Map(input, elder);
        await Repository.UpdateAsync(elder);
        return elder.Id;
    }
    else
    {
        // 新增
        var elder = ObjectMapper.Map<CreateAndUpdateElderDto, Elder>(input);
        await Repository.InsertAsync(elder);
        return elder.Id;
    }
}
```

### 2.5 命名约定总结

| 类型 | 后缀 | 存放层 | 用途 |
|------|------|--------|------|
| 查询返回 | Dto | Contracts | 单个实体返回 |
| 列表输入 | GetListInput | Contracts | 列表查询参数 |
| 创建输入 | CreateDto | Contracts | 新增参数 |
| 更新输入 | UpdateDto | Contracts | 修改参数 |
| 合并输入 | CreateAndUpdateDto | Contracts | 新增/修改通用 |
| 展示对象 | Dbo | Domain | 复杂查询只读展示 |

---

## 3. 数据验证

### 3.1 生活类比

养老院入住登记表上标着：「姓名（必填）」「年龄（1-150）」「紧急联系人电话（必填，11位）」。这些就是验证规则——提交前自动检查，填错了当场指出。

### 3.2 DataAnnotations 验证

最简单的验证方式，直接在 DTO 属性上加标注：

```csharp
using System;
using System.ComponentModel.DataAnnotations;

namespace RBL.Yls.Elders
{
    public class CreateElderDto
    {
        [Required(ErrorMessage = "长者姓名不能为空")]
        [StringLength(50, MinimumLength = 2, ErrorMessage = "姓名长度2-50个字符")]
        public string Name { get; set; }

        [Required(ErrorMessage = "年龄不能为空")]
        [Range(1, 150, ErrorMessage = "年龄范围1-150")]
        public int Age { get; set; }

        [Required(ErrorMessage = "性别不能为空")]
        [StringLength(2)]
        public string Gender { get; set; }

        [Required(ErrorMessage = "紧急联系人不能为空")]
        [StringLength(50)]
        public string EmergencyContact { get; set; }

        [Required(ErrorMessage = "紧急联系人电话不能为空")]
        [Phone(ErrorMessage = "请输入有效的电话号码")]
        [StringLength(11)]
        public string EmergencyPhone { get; set; }
    }
}
```

### 3.3 ABP 自动验证机制

ABP 内置了 `ValidationActionFilter`，当请求进入 Controller 时，自动检查 DTO 上的 DataAnnotations。如果验证失败，自动返回 400 状态码和错误信息，无需手动写验证代码。

验证失败时返回的 JSON 格式：

```json
{
    "error": {
        "code": null,
        "message": "Your request is not valid!",
        "details": "The Name field is required.",
        "validationErrors": [
            {
                "message": "长者姓名不能为空",
                "members": ["name"]
            }
        ]
    }
}
```

### 3.4 IValidatableObject 自定义验证

当简单的标注无法满足需求时，实现 IValidatableObject 接口：

```csharp
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace RBL.Yls.Elders
{
    public class CreateElderDto : IValidatableObject
    {
        [Required]
        [StringLength(50)]
        public string Name { get; set; }

        [Required]
        [Range(1, 150)]
        public int Age { get; set; }

        [Required]
        public string Gender { get; set; }

        public DateTime? CheckInDate { get; set; }
        public DateTime? CheckOutDate { get; set; }

        public IEnumerable<ValidationResult> Validate(
            ValidationContext validationContext)
        {
            // 自定义验证：退住日期必须晚于入住日期
            if (CheckInDate.HasValue && CheckOutDate.HasValue)
            {
                if (CheckOutDate.Value <= CheckInDate.Value)
                {
                    yield return new ValidationResult(
                        "退住日期必须晚于入住日期",
                        new[] { nameof(CheckOutDate) });
                }
            }

            // 自定义验证：性别只能是"男"或"女"
            if (Gender != "男" && Gender != "女")
            {
                yield return new ValidationResult(
                    "性别只能是'男'或'女'",
                    new[] { nameof(Gender) });
            }
        }
    }
}
```

### 3.5 FluentValidation 集成（可选）

FluentValidation 提供更强大的链式验证语法。安装 NuGet 包：

```
FluentValidation
Volo.Abp.FluentValidation
```

在 Application 层注册模块依赖：

```csharp
using Volo.Abp.FluentValidation;
using Volo.Abp.Modularity;

[DependsOn(typeof(AbpFluentValidationModule))]
public class ElderlyCareApplicationModule : AbpModule
{
}
```

编写验证器：

```csharp
using FluentValidation;

namespace RBL.Yls.Elders
{
    public class CreateElderDtoValidator : AbstractValidator<CreateElderDto>
    {
        public CreateElderDtoValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("长者姓名不能为空")
                .Length(2, 50).WithMessage("姓名长度2-50个字符");

            RuleFor(x => x.Age)
                .InclusiveBetween(1, 150).WithMessage("年龄范围1-150");

            RuleFor(x => x.Gender)
                .NotEmpty().WithMessage("性别不能为空")
                .Must(g => g == "男" || g == "女").WithMessage("性别只能是'男'或'女'");

            RuleFor(x => x.EmergencyPhone)
                .NotEmpty().WithMessage("紧急联系人电话不能为空")
                .Matches(@"^1\d{10}$").WithMessage("请输入有效的11位手机号");
        }
    }
}
```

---

## 4. 分页查询规范

### 4.1 生活类比

养老院的长者名册有几百人，不可能一次打印出来。护理员会说：「给我看第3页，每页20条，按入住时间倒序排列。」这就是分页查询。

### 4.2 PagedAndSortedResultRequestDto

ABP 提供了 `PagedAndSortedResultRequestDto` 基类，包含三个标准参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| SkipCount | int | 0 | 跳过条数 |
| MaxResultCount | int | 10 | 每页条数（上限1000） |
| Sorting | string | null | 排序字段 |

继承它来定义查询输入：

```csharp
using Volo.Abp.Application.Dtos;

namespace RBL.Yls.Elders
{
    public class GetElderListInput : PagedAndSortedResultRequestDto
    {
        public string Name { get; set; }
        public string RoomNumber { get; set; }
        public string Gender { get; set; }
        public bool? IsActive { get; set; }
    }
}
```

### 4.3 MaxResultCount 限制

为防止前端一次请求过多数据，应在 AppService 中限制最大分页大小：

```csharp
public class ElderAppService : ApplicationService, IElderAppService
{
    private const int MaxPageSize = 100;

    public async Task<PagedResultDto<ElderDto>> GetListAsync(GetElderListInput input)
    {
        // 限制每页最多100条
        input.MaxResultCount = Math.Min(input.MaxResultCount, MaxPageSize);

        var query = await CreateFilteredQueryAsync(input);
        var totalCount = await AsyncExecuter.CountAsync(query);

        query = query
            .OrderBy(input.Sorting ?? "creationTime desc")
            .PageBy(input);

        var items = await AsyncExecuter.ToListAsync(query);

        return new PagedResultDto<ElderDto>(totalCount,
            ObjectMapper.Map<List<Elder>, List<ElderDto>>(items));
    }
}
```

### 4.4 排序字段名规范

排序字段名使用 camelCase（小驼峰），与前端 JavaScript 命名一致：

```
// 前端传参示例
sorting=creationTime desc
sorting=name asc
sorting=age desc, name asc（多字段排序）
```

默认排序规则：如果没有传 sorting 参数，默认按 `"creationTime desc"` 排序，即最新创建的排在前面。

### 4.5 完整的分页查询示例

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Dynamic.Core;
using System.Threading.Tasks;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace RBL.Yls.Elders
{
    public class ElderAppService :
        CrudAppService<Elder, ElderDto, Guid, GetElderListInput>,
        IElderAppService
    {
        public ElderAppService(IRepository<Elder, Guid> repository)
            : base(repository)
        {
        }

        protected override async Task<IQueryable<Elder>> CreateFilteredQueryAsync(
            GetElderListInput input)
        {
            var query = await base.CreateFilteredQueryAsync(input);

            return query
                .WhereIf(!string.IsNullOrWhiteSpace(input.Name),
                    x => x.Name.Contains(input.Name))
                .WhereIf(!string.IsNullOrWhiteSpace(input.RoomNumber),
                    x => x.RoomNumber == input.RoomNumber)
                .WhereIf(!string.IsNullOrWhiteSpace(input.Gender),
                    x => x.Gender == input.Gender)
                .WhereIf(input.IsActive.HasValue,
                    x => x.IsActive == input.IsActive.Value);
        }

        // 设置默认排序
        protected override IQueryable<Elder> ApplySorting(
            IQueryable<Elder> query, GetElderListInput input)
        {
            return base.ApplySorting(query, input)
                ?? query.OrderByDescending(x => x.CreationTime);
        }
    }
}
```

前端调用示例：

```
GET /api/app/elder?skipCount=0&maxResultCount=20&sorting=creationTime desc&name=张
```

---

## 5. Swagger 配置与 OAuth2 集成

### 5.1 Swagger 是什么？

Swagger（现在叫 OpenAPI）是 API 文档自动生成工具。它根据你的 Controller 和 DTO 自动生成交互式文档页面，前端同事可以直接在页面上测试接口，不用写代码。

养老院类比：Swagger 就像养老院的「服务指南手册」，列出所有服务项目、每个项目需要什么材料、会返回什么结果，而且是自动更新的。

### 5.2 ABP 中 Swagger 的默认集成

ABP 模板项目默认集成了 Swagger，不需要额外配置。启动项目后访问：

```
https://localhost:44310/swagger/index.html
```

如果需要自定义配置，在 HttpApi.Host 项目的 Startup 中：

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "养老院管理系统 API",
            Version = "v1",
            Description = "养老院长者管理、护理管理、费用管理等接口"
        });

        // 包含 XML 注释
        var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
        var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
        if (File.Exists(xmlPath))
        {
            options.IncludeXmlComments(xmlPath);
        }
    });
}
```

### 5.3 OAuth2 集成配置

在 Swagger UI 中直接获取 Token，方便调试：

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "养老院管理系统 API",
            Version = "v1"
        });

        // OAuth2 配置
        options.AddSecurityDefinition("oauth2", new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.OAuth2,
            Flows = new OpenApiOAuthFlows
            {
                AuthorizationCode = new OpenApiOAuthFlow
                {
                    AuthorizationUrl = new Uri("https://localhost:44310/connect/authorize"),
                    TokenUrl = new Uri("https://localhost:44310/connect/token"),
                    Scopes = new Dictionary<string, string>
                    {
                        { "ElderlyCare", "养老院管理系统" }
                    }
                }
            }
        });

        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = "oauth2"
                    }
                },
                new[] { "ElderlyCare" }
            }
        });
    });
}
```

配置 Swagger UI 的 OAuth2 客户端：

```csharp
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "养老院管理系统 API");
    options.OAuthClientId("SwaggerTestApplication");
    options.OAuthClientSecret("1q2w3e*");
    options.OAuthAppName("养老院管理系统 Swagger");
});
```

配置完成后，Swagger UI 右上角会显示「Authorize」按钮，点击后可以直接输入用户名密码获取 Token，后续所有请求自动携带。

---

## 6. Controller 路由设计

### 6.1 生活类比

养老院的楼层指示牌：「3楼 — 护理区」「5楼 — 康复中心」。路由就像楼层指示牌，告诉请求该去哪里找对应的服务。

### 6.2 [Area] + [Route] 约定

ABP 的路由采用「模块名/资源名」的约定：

```csharp
using Microsoft.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc;

namespace RBL.Yls.Elders
{
    [Area("ElderlyCare")]           // 模块名
    [Route("api/app/elder")]        // 路由路径
    public class ElderController : AbpController, IElderAppService
    {
        private readonly IElderAppService _elderAppService;

        public ElderController(IElderAppService elderAppService)
        {
            _elderAppService = elderAppService;
        }

        [HttpGet("{id}")]
        public Task<ElderDto> GetAsync(Guid id)
        {
            return _elderAppService.GetAsync(id);
        }

        [HttpGet]
        public Task<PagedResultDto<ElderDto>> GetListAsync(GetElderListInput input)
        {
            return _elderAppService.GetListAsync(input);
        }

        [HttpPost]
        public Task<ElderDto> CreateAsync(CreateElderDto input)
        {
            return _elderAppService.CreateAsync(input);
        }

        [HttpPut("{id}")]
        public Task<ElderDto> UpdateAsync(Guid id, UpdateElderDto input)
        {
            return _elderAppService.UpdateAsync(id, input);
        }

        [HttpDelete("{id}")]
        public Task DeleteAsync(Guid id)
        {
            return _elderAppService.DeleteAsync(id);
        }
    }
}
```

### 6.3 AbpController 基类

继承 `AbpController` 而非普通的 `Controller`，它提供了：
- 自动的本地化支持
- 统一的异常处理
- 审计日志自动记录
- 工作单元自动管理

### 6.4 方法参数规范

ABP 的 Controller 方法参数不需要加 `[FromQuery]` 和 `[FromBody]`，ABP 会自动根据 HTTP 方法推断：

- GET 请求：参数自动从 Query String 绑定
- POST/PUT 请求：参数自动从 Request Body 绑定

```csharp
// ✅ 正确：不加标注
[HttpGet]
public Task<PagedResultDto<ElderDto>> GetListAsync(GetElderListInput input)
{
    return _elderAppService.GetListAsync(input);
}

// ❌ 错误：不需要加 [FromQuery]
[HttpGet]
public Task<PagedResultDto<ElderDto>> GetListAsync([FromQuery] GetElderListInput input)
{
    return _elderAppService.GetListAsync(input);
}
```

### 6.5 HTTP 方法规范

| 操作 | HTTP 方法 | 路由示例 | 说明 |
|------|-----------|----------|------|
| 查询列表 | GET | /api/app/elder | 无参数或 Query String |
| 查询单个 | GET | /api/app/elder/{id} | 路径参数 |
| 新增 | POST | /api/app/elder | Body 传参 |
| 修改 | PUT | /api/app/elder/{id} | 路径参数 + Body |
| 删除 | DELETE | /api/app/elder/{id} | 路径参数 |

---

## 7. HTTP 状态码规范

### 7.1 生活类比

养老院前台接电话的回应方式：「好的，已记录」（200）、「您说的信息不完整，请补充」（400）、「您没有权限查看此信息」（403）、「查无此人」（404）。

### 7.2 状态码详解

**2xx 成功类：**

| 状态码 | 含义 | 何时使用 |
|--------|------|----------|
| 200 OK | 请求成功 | 查询、修改成功 |
| 201 Created | 资源创建成功 | 新增成功，返回新资源 |
| 204 No Content | 操作成功，无返回内容 | 删除成功 |

**4xx 客户端错误类：**

| 状态码 | 含义 | 何时使用 |
|--------|------|----------|
| 400 Bad Request | 请求参数错误 | DTO 验证失败、参数格式错误 |
| 401 Unauthorized | 未认证 | 未登录、Token 过期 |
| 403 Forbidden | 无权限 | 已登录但权限不足 |
| 404 Not Found | 资源不存在 | 查询的 ID 不存在 |

**5xx 服务端错误类：**

| 状态码 | 含义 | 何时使用 |
|--------|------|----------|
| 500 Internal Server Error | 服务器内部错误 | 未捕获的异常、数据库连接失败 |

### 7.3 ABP 的统一异常处理与状态码映射

ABP 自动将常见异常映射为 HTTP 状态码：

```csharp
// ABP 内置异常 → 状态码映射
AbpException              → 500
EntityNotFoundException   → 404
AbpAuthorizationException → 401 / 403
AbpValidationException    → 400
BusinessException         → 403（默认）
UserFriendlyException     → 403（友好提示）
```

自定义业务异常示例：

```csharp
public class ElderAlreadyCheckedInException : BusinessException
{
    public ElderAlreadyCheckedInException(string elderName)
        : base("ElderlyCare:ElderAlreadyCheckedIn")
    {
        WithData("elderName", elderName);
    }
}

// 使用
public async Task CheckInAsync(Guid elderId)
{
    var elder = await Repository.GetAsync(elderId);
    if (elder.IsActive)
    {
        throw new ElderAlreadyCheckedInException(elder.Name);
    }
    // 入住逻辑...
}
```

ABP 返回的错误 JSON 格式统一：

```json
{
    "error": {
        "code": "ElderlyCare:ElderAlreadyCheckedIn",
        "message": "该长者已经入住，不能重复办理",
        "details": null,
        "validationErrors": null
    }
}
```

---

## 8. 实战：完整的长者管理 CRUD + 分页查询 + 导出

### 8.1 Entity（Domain 层）

```csharp
// Domain/Elders/Elder.cs
using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace RBL.Yls.Elders
{
    public class Elder : AuditedAggregateRoot<Guid>
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string IdCard { get; set; }
        public string RoomNumber { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
        public DateTime CheckInDate { get; set; }
        public DateTime? CheckOutDate { get; set; }
        public bool IsActive { get; set; }
        public string Remark { get; set; }

        protected Elder() { }

        public Elder(Guid id, string name, int age, string gender)
            : base(id)
        {
            Name = name;
            Age = age;
            Gender = gender;
            IsActive = true;
            CheckInDate = DateTime.Now;
        }
    }
}
```

### 8.2 DTO（Contracts 层）

```csharp
// Contracts/Elders/ElderDto.cs
using System;
using Volo.Abp.Application.Dtos;

namespace RBL.Yls.Elders
{
    public class ElderDto : AuditedEntityDto<Guid>
    {
        public string Name { get; set; }
        public int Age { get; set; }
        public string Gender { get; set; }
        public string RoomNumber { get; set; }
        public string EmergencyContact { get; set; }
        public string EmergencyPhone { get; set; }
        public DateTime CheckInDate { get; set; }
        public DateTime? CheckOutDate { get; set; }
        public bool IsActive { get; set; }
    }
}
```

```csharp
// Contracts/Elders/CreateElderDto.cs
using System;
using System.ComponentModel.DataAnnotations;

namespace RBL.Yls.Elders
{
    public class CreateElderDto
    {
        [Required(ErrorMessage = "长者姓名不能为空")]
        [StringLength(50, MinimumLength = 2, ErrorMessage = "姓名长度2-50个字符")]
        public string Name { get; set; }

        [Required(ErrorMessage = "年龄不能为空")]
        [Range(1, 150, ErrorMessage = "年龄范围1-150")]
        public int Age { get; set; }

        [Required(ErrorMessage = "性别不能为空")]
        public string Gender { get; set; }

        [StringLength(18, MinimumLength = 18, ErrorMessage = "身份证号必须为18位")]
        public string IdCard { get; set; }

        [Required(ErrorMessage = "紧急联系人不能为空")]
        [StringLength(50)]
        public string EmergencyContact { get; set; }

        [Required(ErrorMessage = "紧急联系人电话不能为空")]
        [Phone(ErrorMessage = "请输入有效的电话号码")]
        public string EmergencyPhone { get; set; }

        public string Remark { get; set; }
    }
}
```

```csharp
// Contracts/Elders/UpdateElderDto.cs
using System.ComponentModel.DataAnnotations;

namespace RBL.Yls.Elders
{
    public class UpdateElderDto
    {
        [Required(ErrorMessage = "长者姓名不能为空")]
        [StringLength(50, MinimumLength = 2)]
        public string Name { get; set; }

        [Required]
        [Range(1, 150)]
        public int Age { get; set; }

        [Required]
        public string EmergencyContact { get; set; }

        [Required]
        [Phone]
        public string EmergencyPhone { get; set; }

        public string RoomNumber { get; set; }
        public string Remark { get; set; }
    }
}
```

```csharp
// Contracts/Elders/GetElderListInput.cs
using Volo.Abp.Application.Dtos;

namespace RBL.Yls.Elders
{
    public class GetElderListInput : PagedAndSortedResultRequestDto
    {
        public string Name { get; set; }
        public string RoomNumber { get; set; }
        public string Gender { get; set; }
        public bool? IsActive { get; set; }
    }
}
```

### 8.3 AppService（Application 层）

```csharp
// Application/Elders/ElderAppService.cs
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Linq.Dynamic.Core;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace RBL.Yls.Elders
{
    [Authorize("ElderlyCare.Elders")]
    public class ElderAppService :
        CrudAppService<Elder, ElderDto, Guid, GetElderListInput>,
        IElderAppService
    {
        public ElderAppService(IRepository<Elder, Guid> repository)
            : base(repository)
        {
        }

        protected override async Task<IQueryable<Elder>> CreateFilteredQueryAsync(
            GetElderListInput input)
        {
            var query = await base.CreateFilteredQueryAsync(input);

            return query
                .WhereIf(!string.IsNullOrWhiteSpace(input.Name),
                    x => x.Name.Contains(input.Name))
                .WhereIf(!string.IsNullOrWhiteSpace(input.RoomNumber),
                    x => x.RoomNumber == input.RoomNumber)
                .WhereIf(!string.IsNullOrWhiteSpace(input.Gender),
                    x => x.Gender == input.Gender)
                .WhereIf(input.IsActive.HasValue,
                    x => x.IsActive == input.IsActive.Value);
        }

        // 重写新增，设置初始值
        public override async Task<ElderDto> CreateAsync(CreateElderDto input)
        {
            var elder = ObjectMapper.Map<CreateElderDto, Elder>(input);
            elder.IsActive = true;
            elder.CheckInDate = DateTime.Now;

            await Repository.InsertAsync(elder);

            return ObjectMapper.Map<Elder, ElderDto>(elder);
        }

        // 导出长者信息为 CSV
        public async Task<byte[]> ExportAsync(GetElderListInput input)
        {
            input.MaxResultCount = 1000; // 导出最多1000条
            input.Sorting = "creationTime desc";

            var query = await CreateFilteredQueryAsync(input);
            var elders = await AsyncExecuter.ToListAsync(query);

            var sb = new StringBuilder();
            sb.AppendLine("姓名,年龄,性别,房间号,入住日期,是否在住");

            foreach (var elder in elders)
            {
                sb.AppendLine(
                    $"{elder.Name},{elder.Age},{elder.Gender}," +
                    $"{elder.RoomNumber},{elder.CheckInDate:yyyy-MM-dd}," +
                    $"{(elder.IsActive ? "是" : "否")}");
            }

            return Encoding.UTF8.GetBytes(sb.ToString());
        }

        // 退住
        public async Task CheckOutAsync(Guid id)
        {
            var elder = await Repository.GetAsync(id);

            if (!elder.IsActive)
            {
                throw new BusinessException("ElderlyCare:ElderNotActive",
                    "该长者已经退住，不能重复操作");
            }

            elder.IsActive = false;
            elder.CheckOutDate = DateTime.Now;

            await Repository.UpdateAsync(elder);
        }
    }
}
```

### 8.4 Controller（HttpApi 层）

```csharp
// HttpApi/Elders/ElderController.cs
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc;

namespace RBL.Yls.Elders
{
    [Area("ElderlyCare")]
    [Route("api/app/elder")]
    public class ElderController : AbpController, IElderAppService
    {
        private readonly IElderAppService _elderAppService;

        public ElderController(IElderAppService elderAppService)
        {
            _elderAppService = elderAppService;
        }

        [HttpGet("{id}")]
        public Task<ElderDto> GetAsync(Guid id)
        {
            return _elderAppService.GetAsync(id);
        }

        [HttpGet]
        public Task<PagedResultDto<ElderDto>> GetListAsync(GetElderListInput input)
        {
            return _elderAppService.GetListAsync(input);
        }

        [HttpPost]
        public Task<ElderDto> CreateAsync(CreateElderDto input)
        {
            return _elderAppService.CreateAsync(input);
        }

        [HttpPut("{id}")]
        public Task<ElderDto> UpdateAsync(Guid id, UpdateElderDto input)
        {
            return _elderAppService.UpdateAsync(id, input);
        }

        [HttpDelete("{id}")]
        public Task DeleteAsync(Guid id)
        {
            return _elderAppService.DeleteAsync(id);
        }

        [HttpPost("export")]
        public Task<byte[]> ExportAsync(GetElderListInput input)
        {
            return _elderAppService.ExportAsync(input);
        }

        [HttpPost("{id}/check-out")]
        public Task CheckOutAsync(Guid id)
        {
            return _elderAppService.CheckOutAsync(id);
        }
    }
}
```

### 8.5 接口接口（Contracts 层）

```csharp
// Contracts/Elders/IElderAppService.cs
using System;
using System.Threading.Tasks;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace RBL.Yls.Elders
{
    public interface IElderAppService :
        ICrudAppService<ElderDto, Guid, GetElderListInput,
            CreateElderDto, UpdateElderDto>
    {
        Task<byte[]> ExportAsync(GetElderListInput input);
        Task CheckOutAsync(Guid id);
    }
}
```

### 8.6 对象映射配置

```csharp
// Application/ElderlyCareApplicationAutoMapperProfile.cs
using AutoMapper;

namespace RBL.Yls.Elders
{
    public class ElderlyCareApplicationAutoMapperProfile : Profile
    {
        public ElderlyCareApplicationAutoMapperProfile()
        {
            CreateMap<Elder, ElderDto>();
            CreateMap<CreateElderDto, Elder>();
            CreateMap<UpdateElderDto, Elder>();
        }
    }
}
```

### 8.7 前端调用示例

```
# 查询列表（分页 + 过滤）
GET /api/app/elder?skipCount=0&maxResultCount=20&sorting=creationTime%20desc&name=张

# 查询单个
GET /api/app/elder/3fa85f64-5717-4562-b3fc-2c963f66afa6

# 新增
POST /api/app/elder
{
    "name": "张大爷",
    "age": 78,
    "gender": "男",
    "idCard": "110101194501011234",
    "emergencyContact": "张小明",
    "emergencyPhone": "13800138000"
}

# 修改
PUT /api/app/elder/3fa85f64-5717-4562-b3fc-2c963f66afa6
{
    "name": "张大爷",
    "age": 78,
    "emergencyContact": "张小红",
    "emergencyPhone": "13900139000"
}

# 删除
DELETE /api/app/elder/3fa85f64-5717-4562-b3fc-2c963f66afa6

# 退住
POST /api/app/elder/3fa85f64-5717-4562-b3fc-2c963f66afa6/check-out

# 导出
POST /api/app/elder/export
{
    "isActive": true
}
```

---

## 9. 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | Controller 参数加 `[FromBody]` | 不加任何绑定特性 | ASP.NET Core 默认已按类型自动绑定，显式标注是冗余代码 |
| 2 | 分页查询不限制 MaxResultCount | 用 `Math.Min(input.MaxResultCount, 100)` 限制 | 前端传 999999 会导致一次查全表，内存溢出 |
| 3 | 排序字段名用 PascalCase | 用 camelCase（`creationTime desc`） | 前端 JS 惯用 camelCase，PascalCase 需额外映射 |
| 4 | 生产环境开放 Swagger UI | `if (env.IsDevelopment())` 条件注册 | 暴露所有 API 端点结构，降低安全性 |
| 5 | 所有接口统一返回 200 | 按 RESTful 规范返回 201/204/400/404 | 200 无法区分创建成功和普通成功，前端逻辑混乱 |
| 6 | CrudAppService 处理复杂业务 | 复杂场景用自定义 AppService + 领域服务 | CrudAppService 适合标准 CRUD，复杂联动逻辑应分层 |
| 7 | DTO 和 Dbo 混用 | DTO 放 Contracts（读写），Dbo 放 Domain（只读） | Dbo 是展示对象不应参与写操作，混用破坏分层 |
| 8 | 验证失败手动返回 BadRequest | 用 DataAnnotations + ABP 自动验证 | 手动处理容易遗漏字段，ABP 自动验证更规范一致 |

---

## 本章小结

| 知识点 | 核心要点 |
|--------|----------|
| CrudAppService | 四个泛型参数，自动生成五个标准方法 |
| DTO/Dbo 命名 | Dbo 只读放 Domain，Dto 读写放 Contracts |
| 数据验证 | DataAnnotations 自动生效，复杂场景用 IValidatableObject |
| 分页查询 | 继承 PagedAndSortedResultRequestDto，限制 MaxResultCount |
| Swagger | ABP 默认集成，OAuth2 配置后可直接获取 Token |
| Controller 路由 | [Area] + [Route]，继承 AbpController |
| HTTP 状态码 | 200 成功/201 创建/400 参数错误/401 未认证/403 无权限/404 不存在 |

---

## 10. 面试题

### 面试题 1（初级 / 概念题）
**题目**：CrudAppService 和自定义 AppService 什么时候用哪个？

**参考答案**：标准 CRUD 用 CrudAppService，复杂业务逻辑（涉及多实体联动、外部调用）用自定义 AppService。CrudAppService 本质是模板方法模式，封装了 Create/Update/Delete/Get/GetList 五个标准方法。养老院场景：长者基本信息管理用 CrudAppService 即可；但长者入住流程涉及创建长者 + 分配床位 + 生成账单 + 通知家属，需要自定义 AppService 编排多个领域服务。

### 面试题 2（初级 / 概念题）
**题目**：DTO 和 Dbo 有什么区别？

**参考答案**：DTO 放在 Contracts 层，用于增删改查的数据传输，前后端共享；Dbo 放在 Domain 层，是只读的展示对象，用于复杂查询结果。DTO 是契约（有 CreateDto/UpdateDto），Dbo 是视图（只有 GetDbo）。养老院场景：`ElderCreateDto` 用于新增长者（Contracts 层），`ElderBillDbo` 用于展示长者账单汇总（Domain 层，跨表 Join 结果）。

### 面试题 3（中级 / 概念题）
**题目**：ABP 如何自动验证 DTO？

**参考答案**：ABP 内置 `ValidationActionFilter`（ActionFilter 类型），当请求进入 Controller 时自动检查 DTO 上的 DataAnnotations（如 `[Required]`、`[StringLength]`）。验证失败直接返回 400 状态码和 `HttpValidationProblemDetails` 格式的错误详情，无需手动编写 `if (!ModelState.IsValid)` 代码。开发者只需在 DTO 属性上标注验证特性即可。

### 面试题 4（中级 / 概念题）
**题目**：CreateAndUpdateDto 中的 Guid? Id 有什么作用？

**参考答案**：`Guid? Id` 用于合并新增和修改的统一入口。当 Id 为 null 时视为新增（调用 InsertAsync），有值时视为修改（先 GetAsync 再赋值 UpdateAsync）。养老院场景：前端长者信息编辑页面，新增和修改共用同一个表单组件，只需判断 Id 是否有值即可，无需维护两套页面。这是 ABP 推荐的"合并新增修改"模式。

### 面试题 5（初级 / 概念题）
**题目**：Controller 方法参数为什么不加 [FromQuery] 和 [FromBody]？

**参考答案**：ASP.NET Core 的默认绑定规则已经足够：简单类型（int、string、Guid）自动从 Query String 绑定，复杂类型自动从 Request Body 绑定。显式标注虽然不报错，但增加了冗余代码，且与项目约定不一致。ABP 推荐不加，保持代码简洁。这是约定优于配置的体现。

### 面试题 6（中级 / 概念题）
**题目**：HTTP 状态码 201 和 204 分别在什么时候返回？

**参考答案**：201 Created 表示资源创建成功，响应头应包含 Location 指向新资源的 URL，Body 返回新创建的对象。204 No Content 表示操作成功但无返回内容，常用于 DELETE 操作。养老院系统中：POST /api/elder 创建长者返回 201，DELETE /api/elder/{id} 退住返回 204。ABP 的 CrudAppService 已内置此逻辑。

### 面试题 7（初级 / 代码题）
**题目**：分页查询时如何防止一次查询太多数据？

**参考答案**：继承 PagedAndSortedResultRequestDto 后，MaxResultCount 默认最大 1000。在 AppService 中可以用 `Math.Min(input.MaxResultCount, 100)` 进一步限制。养老院场景：长者列表接口限制每页最多 100 条，防止前端误传 pageSize=99999 导致全表查询。同时在 DTO 中设置 `[Range(1, 100)]` 做输入验证。

### 面试题 8（高级 / 场景题）
**题目**：ABP 中如何自定义异常的状态码映射？

**参考答案**：ABP 将 `BusinessException` 映射为 403，`EntityNotFoundException` 映射为 404，`AbpAuthorizationException` 映射为 401/403。可以通过自定义 `AbpExceptionStatusCodeProvider` 来修改映射规则。例如养老院系统中，床位已满时抛出的 `BedFullException` 可以映射为 409 Conflict。在模块的 ConfigureServices 中注册自定义 Provider。

### 面试题 9（中级 / 概念题）
**题目**：Swagger 在生产环境应该禁用吗？

**参考答案**：强烈建议生产环境禁用 Swagger UI，因为它暴露了所有 API 端点和参数结构，降低了安全性。可以通过 `if (env.IsDevelopment())` 条件注册 Swagger 中间件。如果必须在生产环境保留（如给合作方看文档），应加 IP 白名单或 Basic Auth 认证保护。

### 面试题 10（高级 / 场景题）
**题目**：分页查询的 totalCount 在 ABP 中是怎么获取的？

**参考答案**：继承 `CrudAppService` 的 `GetListAsync` 方法内部会自动执行两次查询：一次 `CountAsync` 获取总数，一次 `Skip/Take` 获取分页数据，最终封装为 `PagedResultDto<T>` 返回。开发者无需手动处理。如果用自定义 AppService，需要显式调用 `await query.CountAsync()` 和 `await query.PageBy(input).ToListAsync()`。养老院场景：长者列表页需要 totalCount 来计算总页数。

### 面试题 11（初级 / 概念题）
**题目**：DTO 中的 DataAnnotations 验证失败时，ABP 返回什么格式？

**参考答案**：ABP 返回 400 状态码，Body 是标准的 `HttpValidationProblemDetails` 格式，包含 `errors` 字典，Key 是属性名（camelCase），Value 是错误消息数组。例如：`{ "errors": { "name": ["The Name field is required."] } }`。前端可以据此高亮对应的表单字段并显示错误提示。

### 面试题 12（高级 / 场景题）
**题目**：如何为养老院系统的某个接口返回 201 Created 并带 Location 头？

**参考答案**：在 Controller 方法中使用 `CreatedAtAction`：`return CreatedAtAction(nameof(Get), new { id = entity.Id }, dto)`。ASP.NET Core 会自动设置 201 状态码和 Location 响应头（如 `/api/elder/uuid`）。ABP 的 CrudAppService 已内置此逻辑（CreateAsync 返回 EntityDto），自定义 AppService 需手动处理。前端收到 201 后可通过 Location 头跳转到新资源详情页。

---

## 11. 下一章预告

**第 09 章：设计模式与架构原则**

本章我们掌握了应用服务和 API 设计规范，下一章将提升到架构层面：
- SOLID 五大原则（用养老院业务代码举例 — 面试必问）
- 常见设计模式在 ABP 项目中的体现（仓储模式、观察者模式、策略模式、模板方法模式）
- DDD 核心概念深化（聚合根边界、限界上下文、领域事件驱动设计）
- 实战：用策略模式重构养老院护理等级评估逻辑

---

## 时效性声明

本章内容基于 **ABP Framework 4.4.0** + **.NET 5.0** 编写。CrudAppService 的泛型参数和方法签名在 ABP 各版本中保持稳定。Swagger 集成方式在 .NET 6+ 中可能有细微变化（Minimal API 模式）。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：CrudAppService、DTO/Dbo 规范、数据验证、分页查询、Swagger、Controller 路由、HTTP 状态码 |
| 2026-07-10 | v1.1 | 新增常见错误四列表格、下一章预告、时效性声明、修订记录；面试高频问题改为标准面试题格式（12题含难度/类型） |
| 2026-07-10 | v1.2 | 本章小结移到常见错误表之后（正确顺序：错误表→小结→面试题） |
| 2026-07-10 | v1.3 | 命名空间 MyElderlyCare → RBL.Yls（19处） |
