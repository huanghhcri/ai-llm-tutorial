# 第 03 章：配置体系与 appsettings.json 编写

> **适用版本**：.NET 5.0 / C# 9 / ABP 4.4.0 / MySQL 8.0+ / Redis 6.0+
> **领域模型**：养老院管理系统（Yls）
> **预计阅读时间**：45 分钟
> **预计代码量**：约 200 行

---

## 学习目标

完成本章学习后，你将能够：

1. 理解 ASP.NET Core 配置体系的整体架构和加载优先级
2. 编写规范、可维护的 `appsettings.json` 文件，为养老院系统提供完整配置方案
3. 掌握多环境配置机制，实现开发、测试、生产环境的配置隔离
4. 深入理解 Options 模式（`IOptions<T>` / `IOptionsSnapshot<T>` / `IOptionsMonitor<T>`），这是面试高频考点
5. 使用环境变量覆盖配置，为 Docker 部署做好准备
6. 实现配置热重载，让系统在不重启的情况下感知配置变化
7. 设计并实现养老院系统的 `YlsOptions` 配置类

---

## 前置知识

- 已完成第 01 章学习（C# 运行时原理：GC、async/await、线程安全）
- 已完成第 02 章学习（ASP.NET Core 核心原理：依赖注入、中间件管道、Filter 过滤器）
- 了解 JSON 格式的基本语法

---

## 为什么需要学这个？

在真实的企业开发中，几乎每个应用都需要连接数据库、连接 Redis 缓存、连接消息队列、配置日志级别、设置业务参数……这些信息不能硬编码在代码里，否则换个环境就得改代码重新编译。

**配置体系就是应用程序的「外部参数系统」**——它让同一份代码在不同环境下表现不同，而不需要修改一行代码。

养老院管理系统需要配置的东西非常多：

- 数据库连接字符串（MySQL 地址、账号、密码）
- Redis 缓存地址
- RabbitMQ 消息队列地址
- 文件服务地址（老人照片、合同扫描件存放位置）
- 微信小程序版本号
- 日志输出级别
- 报修服务地址

这些配置散落在代码里是灾难，集中在 `appsettings.json` 里才是正道。

---

## 1. appsettings.json 完整结构规范

### 1.1 生活类比：养老院的「规章制度手册」

想象一下，养老院有一本《规章制度手册》，手册分为多个章节：

- **第一章：厨房管理**（对应 `ConnectionStrings`——数据从哪来）
- **第二章：安保管理**（对应 `Redis`——缓存和会话管理）
- **第三章：医疗管理**（对应 `RabbitMQ`——消息传递）
- **第四章：卫生管理**（对应 `Serilog`——日志记录）
- **第五章：入住管理**（对应业务配置——`Yls` 自定义配置段）

每个章节各司其职，查找方便，互不干扰。`appsettings.json` 就是应用程序的「规章制度手册」，每个 Section（配置段）放一类配置。

### 1.2 推荐结构

一个规范的 `appsettings.json` 应该包含以下标准配置段：

| Section 名称 | 用途 | 示例 |
|---|---|---|
| `ConnectionStrings` | 数据库连接字符串 | MySQL、SQL Server 连接 |
| `Redis` | Redis 缓存配置 | Host、Port、Password、Database |
| `RabbitMQ` | 消息队列配置 | HostName、UserName、Password |
| `Serilog` | 日志配置 | MinimumLevel、WriteTo |
| `Yls`（业务配置） | 养老院系统专属配置 | 文件服务地址、报修地址等 |
| `Logging` | 内置日志框架配置 | LogLevel |
| `AllowedHosts` | 允许的主机名 | 安全白名单 |

### 1.3 命名规范

- **Section 名称**：使用 **PascalCase**（大驼峰），如 `ConnectionStrings`、`Redis`、`Yls`
- **Key 名称**：使用 **camelCase**（小驼峰），如 `host`、`port`、`fileRootUrl`
- JSON 本身是大小写敏感的，但 .NET 的配置系统默认**不区分大小写**

### 1.4 完整示例：养老院管理系统的 appsettings.json

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Port=3306;Database=yls_db;Uid=root;Pwd=your_password;Allow User Variables=True;SslMode=None;",
    "AbpIdentity": "Server=localhost;Port=3306;Database=yls_identity;Uid=root;Pwd=your_password;"
  },
  "Redis": {
    "Host": "127.0.0.1",
    "Port": 6379,
    "Password": "",
    "Database": 0,
    "InstanceName": "yls_"
  },
  "RabbitMQ": {
    "HostName": "localhost",
    "Port": 5672,
    "UserName": "guest",
    "Password": "guest",
    "VirtualHost": "/"
  },
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "System": "Warning",
        "Volo.Abp": "Information"
      }
    },
    "WriteTo": [
      {
        "Name": "Console"
      },
      {
        "Name": "File",
        "Args": {
          "path": "Logs/yls-.log",
          "rollingInterval": "Day",
          "retainedFileCountLimit": 30
        }
      }
    ]
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "Yls": {
    "FileRootUrl": "http://file.yls.com/",
    "RepairUrl": "http://repair.yls.com/api/",
    "Company": "幸福养老院管理有限公司",
    "GetHist": false,
    "WechatVersion": "1.0.0",
    "SwaggerEnable": true,
    "IsTest": false,
    "AdIp": "192.168.1.100",
    "AdDomain": "yls.local",
    "AdPort": 389
  },
  "AllowedHosts": "*"
}
```

> **注意**：`ConnectionStrings` 是 ASP.NET Core 内置的约定名称，不要改成 `Connectionstrings` 或 `connectionStrings`，否则框架无法自动识别。

---

## 2. 多环境配置

### 2.1 生活类比：日常运营 vs 节假日运营

养老院在日常运营和节假日运营时，规则不同：

- **日常**：探访时间 9:00-18:00，食堂供应三餐
- **节假日**：探访时间 8:00-20:00，食堂加餐

应用程序也是如此——开发环境和生产环境的数据库地址、日志级别、调试开关都不一样。

### 2.2 配置文件加载优先级

ASP.NET Core 支持按环境名称加载不同的配置文件：

```
appsettings.json                  ← 基础配置（所有环境共享）
appsettings.{Environment}.json    ← 环境专属配置（覆盖基础配置）
```

加载顺序和优先级（从低到高）：

| 优先级 | 配置源 | 说明 |
|---|---|---|
| 1（最低） | `appsettings.json` | 基础配置 |
| 2 | `appsettings.{Env}.json` | 环境配置，覆盖同名 Key |
| 3 | 用户机密（Secrets） | 仅 Development 环境 |
| 4 | 环境变量 | 运行时注入 |
| 5 | 命令行参数 | 启动时传入 |
| 6（最高） | 代码中硬编码 | `AddInMemoryCollection` |

**规则**：后加载的配置源会覆盖先加载的同名 Key，这就是「后来者居上」。

### 2.3 launchSettings.json 中的 ASPNETCORE_ENVIRONMENT

环境名称通过 `ASPNETCORE_ENVIRONMENT` 环境变量指定。在开发阶段，它定义在 `Properties/launchSettings.json` 中：

```json
{
  "profiles": {
    "Yls.Web": {
      "commandName": "Project",
      "launchBrowser": true,
      "applicationUrl": "https://localhost:44377",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    }
  }
}
```

在生产服务器上，通过系统环境变量设置：

```bash
# Linux
export ASPNETCORE_ENVIRONMENT=Production

# Windows PowerShell
$env:ASPNETCORE_ENVIRONMENT="Production"
```

常见的环境名称约定：

| 环境名 | 用途 |
|---|---|
| `Development` | 本地开发 |
| `Staging` | 测试/预发布环境 |
| `Production` | 生产环境 |

> **注意**：ASP.NET Core **只识别这三个名称**的拼写，大小写敏感。写成 `development` 或 `DEV` 不会被识别为开发环境（但框架不会报错，只是不会做特殊处理）。

### 2.4 环境变量覆盖规则

环境变量用 **双下划线 `__`** 表示 JSON 的层级关系：

| 环境变量名 | 对应的 JSON 路径 |
|---|---|
| `Redis__Host` | `Redis:Host` |
| `Yls__FileRootUrl` | `Yls:FileRootUrl` |
| `ConnectionStrings__Default` | `ConnectionStrings:Default` |

```bash
# 设置环境变量覆盖 Redis 配置
export Redis__Host=10.0.0.50
export Redis__Port=6380
export Yls__FileRootUrl=http://prod-file.yls.com/
```

### 2.5 代码示例：不同环境的日志级别配置

`appsettings.Development.json`：

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Debug",
      "Microsoft": "Information",
      "Volo.Abp": "Debug"
    }
  },
  "Yls": {
    "SwaggerEnable": true,
    "IsTest": true
  }
}
```

`appsettings.Production.json`：

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Warning",
      "Microsoft": "Error",
      "Volo.Abp": "Warning"
    }
  },
  "Yls": {
    "SwaggerEnable": false,
    "IsTest": false
  }
}
```

在代码中判断当前环境：

```csharp
public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
{
    if (env.IsDevelopment())
    {
        // 开发环境：显示详细错误页面
        app.UseDeveloperExceptionPage();
    }

    if (env.IsProduction())
    {
        // 生产环境：使用全局异常处理
        app.UseExceptionHandler("/Error");
    }
}
```

---

## 3. Options 模式详解（面试高频考点）

### 3.1 生活类比：三种手册

- **规章制度手册**（`IOptions<T>`）：每年修订一次，印刷好后发到各科室。一旦发下去，今年内不会改。所有人看到的是同一版本。
- **值班人员手册**（`IOptionsSnapshot<T>`）：每次换班时重新领取最新版。每班看到的可能不同。
- **自动更新的手册**（`IOptionsMonitor<T>`）：放在公告栏上，管理员随时可以更新。更新后所有人自动看到最新内容，而且可以订阅「手册更新了」的通知。

### 3.2 三种 Options 接口详解

#### IOptions<T> —— 单例，不可变

```csharp
// 注册
services.Configure<YlsOptions>(configuration.GetSection("Yls"));

// 使用（注入到 Singleton 服务中也可以）
public class RoomAppService
{
    private readonly YlsOptions _options;

    public RoomAppService(IOptions<YlsOptions> options)
    {
        _options = options.Value; // 只读，应用生命周期内不变
    }

    public string GetCompanyInfo()
    {
        return $"当前机构：{_options.Company}";
    }
}
```

**特点**：应用启动时读取一次，之后永远不变。即使修改了 `appsettings.json` 文件，已经运行的应用不会感知变化。

#### IOptionsSnapshot<T> —— Scoped，每次请求重新读取

```csharp
public class RepairAppService
{
    private readonly YlsOptions _options;

    public RepairAppService(IOptionsSnapshot<YlsOptions> options)
    {
        _options = options.Value; // 每次 HTTP 请求重新读取
    }

    public string GetRepairUrl()
    {
        return _options.RepairUrl;
    }
}
```

**特点**：每个 HTTP 请求开始时重新从配置源读取。配合 `reloadOnChange: true`，可以实现配置热重载。

> **注意**：`IOptionsSnapshot<T>` **不能注入到 Singleton 服务**中！因为 Singleton 的生命周期比 Scope 长，会导致捕获过期的值。

#### IOptionsMonitor<T> —— Singleton，支持 OnChange 回调

```csharp
public class ConfigWatchService
{
    private readonly YlsOptions _options;

    public ConfigWatchService(IOptionsMonitor<YlsOptions> monitor)
    {
        _options = monitor.CurrentValue;

        // 监听配置变化
        monitor.OnChange((newOptions, name) =>
        {
            Console.WriteLine($"配置发生变化！新公司名：{newOptions.Company}");
            // 可以在这里刷新缓存、重新初始化连接等
        });
    }
}
```

**特点**：即使注入到 Singleton 服务中也能感知配置变化，适合需要监听变化的场景。

### 3.3 三者对比表格

| 对比项 | IOptions\<T\> | IOptionsSnapshot\<T\> | IOptionsMonitor\<T\> |
|---|---|---|---|
| **生命周期** | Singleton | Scoped | Singleton |
| **应用启动后值是否变化** | 不变 | 每个请求重新读取 | 自动感知变化 |
| **支持热重载** | ❌ 不支持 | ✅ 支持 | ✅ 支持 |
| **支持 OnChange 回调** | ❌ | ❌ | ✅ |
| **可注入 Singleton 服务** | ✅ | ❌ 不可以 | ✅ |
| **可注入 Scoped 服务** | ✅ | ✅ | ✅ |
| **可注入 Transient 服务** | ✅ | ✅ | ✅ |
| **典型场景** | 数据库连接字符串、公司名等静态配置 | 每个请求可能变化的业务规则 | 配置中心、动态刷新缓存 |

### 3.4 Configure<T> 与 PostConfigure<T> 的区别

```csharp
// Configure：正常绑定配置
services.Configure<YlsOptions>(configuration.GetSection("Yls"));

// PostConfigure：在所有 Configure 之后执行，用于补充默认值或校验
services.PostConfigure<YlsOptions>(options =>
{
    // 如果没有配置公司名，给个默认值
    if (string.IsNullOrEmpty(options.Company))
    {
        options.Company = "默认养老院";
    }

    // 确保文件 URL 以 / 结尾
    if (!string.IsNullOrEmpty(options.FileRootUrl) 
        && !options.FileRootUrl.EndsWith("/"))
    {
        options.FileRootUrl += "/";
    }
});
```

**执行顺序**：先执行所有 `Configure<T>`，再执行所有 `PostConfigure<T>`。

**典型用途**：
- `Configure<T>`：绑定配置文件到 Options 类
- `PostConfigure<T>`：设置默认值、数据校验、格式规范化

---

## 4. 环境变量覆盖配置

### 4.1 为什么需要环境变量覆盖？

在 Docker 容器中，我们通常不会把包含密码的 `appsettings.json` 打包进镜像。正确做法是：

1. 镜像中保留一份**不含敏感信息**的 `appsettings.json`
2. 部署时通过**环境变量**注入数据库密码、Redis 密码等敏感配置

### 4.2 命名规则

环境变量名用 **双下划线 `__`** 代替 JSON 的冒号 `:` 层级：

| JSON 路径 | 环境变量名 |
|---|---|
| `Redis:Host` | `Redis__Host` |
| `Redis:Port` | `Redis__Port` |
| `ConnectionStrings:Default` | `ConnectionStrings__Default` |
| `Yls:FileRootUrl` | `Yls__FileRootUrl` |
| `RabbitMQ:HostName` | `RabbitMQ__HostName` |

> **注意**：在 Linux 容器中，有些操作系统也用 `__` 作为环境变量分隔符。如果前缀冲突，可以在 `Program.cs` 中自定义分隔符（但通常不需要）。

### 4.3 docker-compose.yml 配置示例

```yaml
version: '3.8'

services:
  yls-web:
    image: yls-web:latest
    container_name: yls-web
    ports:
      - "8080:80"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:80
      - ConnectionStrings__Default=Server=mysql-server;Port=3306;Database=yls_db;Uid=root;Pwd=S3cretP@ss!;
      - Redis__Host=redis-server
      - Redis__Port=6379
      - Redis__Password=redis_pass_123
      - RabbitMQ__HostName=rabbitmq-server
      - RabbitMQ__UserName=admin
      - RabbitMQ__Password=mq_pass_456
      - Yls__FileRootUrl=http://prod-file.yls.com/
      - Yls__IsTest=false
    depends_on:
      - mysql-server
      - redis-server

  mysql-server:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=db_root_pass

  redis-server:
    image: redis:6.0
    command: redis-server --requirepass redis_pass_123
```

### 4.4 Program.cs 中如何确保环境变量生效

在 ABP 框架中，`Program.cs` 通常如下：

```csharp
public class Program
{
    public static int Main(string[] args)
    {
        Log.Logger = new LoggerConfiguration()
            .WriteTo.Console()
            .CreateBootstrapLogger();

        try
        {
            Log.Information("养老院管理系统启动中...");
            CreateHostBuilder(args).Build().Run();
            return 0;
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "应用启动失败！");
            return 1;
        }
        finally
        {
            Log.CloseAndFlush();
        }
    }

    internal static IHostBuilder CreateHostBuilder(string[] args)
    {
        return Host.CreateDefaultBuilder(args)
            .ConfigureAppConfiguration((context, config) =>
            {
                // 环境变量和命令行参数已在 CreateDefaultBuilder 中自动添加
                // 这里可以添加自定义配置源
                var env = context.HostingEnvironment;

                config.AddJsonFile("appsettings.json", 
                    optional: false, 
                    reloadOnChange: true);

                config.AddJsonFile($"appsettings.{env.EnvironmentName}.json", 
                    optional: true, 
                    reloadOnChange: true);

                // 环境变量会自动添加，但也可以显式添加
                config.AddEnvironmentVariables();
            })
            .UseAutofac()
            .UseSerilog()
            .ConfigureWebHostDefaults(webBuilder =>
            {
                webBuilder.UseStartup<Startup>();
            });
    }
}
```

> `CreateDefaultBuilder` 已经自动添加了 `appsettings.json`、`appsettings.{Env}.json`、环境变量、命令行参数。上面的代码是为了展示完整逻辑，在实际项目中可以简化。

---

## 5. 配置的热重载

### 5.1 reloadOnChange: true 的作用

在添加 JSON 配置文件时，`reloadOnChange` 参数决定了是否监听文件变化：

```csharp
config.AddJsonFile("appsettings.json", 
    optional: false, 
    reloadOnChange: true);  // 文件修改后自动重新加载
```

当设置为 `true` 时：
- 运行中的应用会**监听文件系统事件**
- 当 `appsettings.json` 被修改并保存后，配置会自动重新加载
- 配合 `IOptionsSnapshot<T>` 或 `IOptionsMonitor<T>` 即可感知变化

### 5.2 什么配置支持热重载？

| 配置源 | 支持热重载 | 说明 |
|---|---|---|
| JSON 文件 | ✅ 支持（需设置 reloadOnChange: true） | 最常用 |
| XML 文件 | ✅ 支持（需设置 reloadOnChange: true） | 较少使用 |
| 环境变量 | ❌ 不支持 | 环境变量在进程启动时读取，运行时改不了 |
| 命令行参数 | ❌ 不支持 | 启动时一次性传入 |
| Azure App Configuration | ✅ 支持 | 需额外配置 |
| Consul / Nacos 等配置中心 | ✅ 支持 | 需额外集成 |

### 5.3 热重载的注意事项

1. **热重载只改变配置值，不会触发服务重启**。如果你在 `Startup.Configure` 中使用了配置值（如中间件顺序），热重载不会影响这些一次性绑定的逻辑。
2. **热重载与依赖注入的 Options 类型有关**：`IOptions<T>` 不感知变化，`IOptionsSnapshot<T>` 和 `IOptionsMonitor<T>` 感知变化。
3. **Docker 部署时**：容器内的文件修改通常通过环境变量或挂载卷实现，文件热重载在容器场景下使用较少。

---

## 6. YlsOptions 配置类设计实战

### 6.1 定义 YlsOptions 类

```csharp
using System;

namespace Yls.Options
{
    /// <summary>
    /// 养老院管理系统业务配置
    /// 对应 appsettings.json 中的 "Yls" 节点
    /// </summary>
    public class YlsOptions
    {
        /// <summary>
        /// 配置段名称，用于 GetSection 绑定
        /// </summary>
        public const string SectionName = "Yls";

        /// <summary>
        /// 文件服务根 URL（老人照片、合同扫描件等）
        /// </summary>
        public string FileRootUrl { get; set; }

        /// <summary>
        /// 报修服务 URL
        /// </summary>
        public string RepairUrl { get; set; }

        /// <summary>
        /// 养老院/公司名称
        /// </summary>
        public string Company { get; set; }

        /// <summary>
        /// 是否获取历史数据
        /// </summary>
        public bool GetHist { get; set; }

        /// <summary>
        /// 微信小程序版本号
        /// </summary>
        public string WechatVersion { get; set; }

        /// <summary>
        /// 是否启用 Swagger 文档（仅开发环境开启）
        /// </summary>
        public bool SwaggerEnable { get; set; }

        /// <summary>
        /// 是否为测试模式
        /// </summary>
        public bool IsTest { get; set; }

        /// <summary>
        /// AD 域控服务器 IP
        /// </summary>
        public string AdIp { get; set; }

        /// <summary>
        /// AD 域名
        /// </summary>
        public string AdDomain { get; set; }

        /// <summary>
        /// AD 域控端口
        /// </summary>
        public int AdPort { get; set; } = 389;
    }
}
```

### 6.2 在 Startup 中注册

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Yls.Options;

namespace Yls.Web
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
            // 注册 Options 模式：将 "Yls" 配置段绑定到 YlsOptions 类
            services.Configure<YlsOptions>(_configuration.GetSection(YlsOptions.SectionName));

            // PostConfigure：补充默认值和格式校验
            services.PostConfigure<YlsOptions>(options =>
            {
                if (string.IsNullOrEmpty(options.Company))
                {
                    options.Company = "幸福养老院";
                }

                // 确保 FileRootUrl 以 / 结尾
                if (!string.IsNullOrEmpty(options.FileRootUrl)
                    && !options.FileRootUrl.EndsWith("/"))
                {
                    options.FileRootUrl += "/";
                }

                // AD 端口默认值
                if (options.AdPort <= 0)
                {
                    options.AdPort = 389;
                }
            });

            // 其他服务注册...
        }
    }
}
```

### 6.3 在 AppService 中注入使用

```csharp
using Microsoft.Extensions.Options;
using Volo.Abp.Application.Services;
using Yls.Options;

namespace Yls.Services
{
    /// <summary>
    /// 老人档案服务
    /// </summary>
    public class ElderAppService : ApplicationService
    {
        private readonly YlsOptions _ylsOptions;

        public ElderAppService(IOptions<YlsOptions> ylsOptions)
        {
            _ylsOptions = ylsOptions.Value;
        }

        /// <summary>
        /// 获取老人照片的完整 URL
        /// </summary>
        public string GetPhotoUrl(string fileName)
        {
            // 例如：http://file.yls.com/photos/zhangsan.jpg
            return $"{_ylsOptions.FileRootUrl}photos/{fileName}";
        }

        /// <summary>
        /// 获取当前养老院名称
        /// </summary>
        public string GetCompanyDisplayName()
        {
            return _ylsOptions.Company;
        }

        /// <summary>
        /// 判断当前是否为测试环境
        /// </summary>
        public bool IsInTestMode()
        {
            return _ylsOptions.IsTest;
        }
    }
}
```

### 6.4 在 Singleton 服务中使用 IOptionsMonitor

如果需要在 Singleton 服务中感知配置变化：

```csharp
using Microsoft.Extensions.Options;
using Yls.Options;

namespace Yls.BackgroundServices
{
    /// <summary>
    /// 配置监控后台服务（Singleton 生命周期）
    /// </summary>
    public class ConfigMonitorService : Volo.Abp.DependencyInjection.ITransientDependency
    {
        private readonly IOptionsMonitor<YlsOptions> _monitor;

        public ConfigMonitorService(IOptionsMonitor<YlsOptions> monitor)
        {
            _monitor = monitor;

            // 监听配置变化
            _monitor.OnChange((options, sectionName) =>
            {
                // 配置变化时的处理逻辑
                // 例如：刷新缓存、重新初始化连接池等
                System.Console.WriteLine(
                    $"[配置变更通知] 公司名已更新为：{options.Company}");
            });
        }

        public string GetCurrentCompany()
        {
            return _monitor.CurrentValue.Company;
        }
    }
}
```

---

## 7. 实战案例：养老院系统完整配置方案

### 方案概览

| 配置分类 | 配置段 | 安全级别 |
|---|---|---|
| 数据库 | `ConnectionStrings` | 🔴 高（密码不能进 Git） |
| 缓存 | `Redis` | 🔴 高（密码不能进 Git） |
| 消息队列 | `RabbitMQ` | 🔴 高（密码不能进 Git） |
| 日志 | `Serilog` / `Logging` | 🟢 低 |
| 业务配置 | `Yls` | 🟡 中 |
| 框架配置 | `Abp` | 🟢 低 |

### 敏感配置分离策略

**开发环境**：使用 `appsettings.Development.json` 或 .NET User Secrets 存放敏感信息，该文件在 `.gitignore` 中排除。

**生产环境**：通过环境变量注入敏感配置，不将密码写入任何文件。

`.gitignore` 中需要添加：

```
# 不要提交包含密码的配置文件
appsettings.Development.json
appsettings.Staging.json
# 生产环境配置不应放在代码仓库中
```

---

## 8. 常见错误与最佳实践

| 序号 | 错误/场景 | 错误做法 | 正确做法 |
|---|---|---|---|
| 1 | 密码硬编码 | `"Pwd=123456"` 写死在代码里 | 使用环境变量或 User Secrets |
| 2 | 直接读取 IConfiguration | 到处注入 `IConfiguration["Redis:Host"]` | 定义 Options 类，通过 `IOptions<T>` 注入 |
| 3 | Singleton 注入 IOptionsSnapshot | 在 Singleton 服务中注入 `IOptionsSnapshot<T>` | Singleton 服务应注入 `IOptions<T>` 或 `IOptionsMonitor<T>` |
| 4 | 忘记 reloadOnChange | `AddJsonFile("appsettings.json")` 没加热重载参数 | 加上 `reloadOnChange: true` |
| 5 | Section 名拼错 | `GetSection("yls")` vs `GetSection("Yls")` | 使用常量 `YlsOptions.SectionName` 避免拼写错误 |
| 6 | 不做空值检查 | 直接用 `_options.Company.Length` | 先判断 `string.IsNullOrEmpty` |
| 7 | 所有配置堆在一个文件 | 500 行的 appsettings.json | 按职责分段，敏感配置用环境变量 |
| 8 | 忘记 PostConfigure | 没有给必填配置设默认值 | 使用 `PostConfigure<T>` 补充默认值 |
| 9 | 环境名拼错 | `ASPNETCORE_ENVIRONMENT=Dev` | 使用 `Development` / `Production` / `Staging` |
| 10 | 不同环境共用数据库 | 开发和生产连接同一个 MySQL | 每个环境独立数据库，通过 `appsettings.{Env}.json` 区分 |

---

## 9. 本章小结

本章我们系统学习了 ASP.NET Core 的配置体系：

1. **appsettings.json** 是配置的核心载体，应按功能分段（ConnectionStrings、Redis、RabbitMQ、Serilog、业务配置），命名规范为 Section 用 PascalCase、Key 用 camelCase。
2. **多环境配置**通过 `appsettings.{Environment}.json` 实现，后加载的配置覆盖先加载的。`ASPNETCORE_ENVIRONMENT` 环境变量决定当前环境。
3. **Options 模式**是 .NET 推荐的配置使用方式，三种接口各有适用场景：
   - `IOptions<T>`：静态配置，注入到任何生命周期的服务
   - `IOptionsSnapshot<T>`：动态配置，只能注入到 Scoped/Transient 服务
   - `IOptionsMonitor<T>`：动态配置 + 变化通知，注入到任何生命周期的服务
4. **环境变量**通过双下划线 `__` 分隔层级，覆盖 JSON 配置，是 Docker 部署的标准做法。
5. **热重载**通过 `reloadOnChange: true` 实现，仅文件配置源支持。
6. **`YlsOptions`** 类是养老院系统的业务配置载体，通过 `services.Configure<YlsOptions>()` 注册，在服务中通过 `IOptions<YlsOptions>` 注入使用。

---

## 10. 面试题

### 面试题 1（初级 / 概念题）
**题目**：ASP.NET Core 中配置文件的加载顺序是什么？后加载的配置会覆盖先加载的吗？

**参考答案**：加载顺序为：`appsettings.json` → `appsettings.{Env}.json` → User Secrets → 环境变量 → 命令行参数。后加载的配置源会覆盖先加载的同名 Key，这就是「后来者居上」的优先级规则。这个设计让基础配置放在 `appsettings.json` 中，敏感配置通过环境变量注入，实现配置分离。

---

### 面试题 2（初级 / 概念题）
**题目**：`appsettings.json` 中的 `ConnectionStrings` 节点有什么特殊含义？

**参考答案**：`ConnectionStrings` 是 ASP.NET Core 的**约定名称**，框架内置了对它的支持。可以通过 `configuration.GetConnectionString("Default")` 直接获取连接字符串，而不需要写 `configuration["ConnectionStrings:Default"]`。这个约定让连接字符串的获取更加简洁。在 ABP 框架中，`ConnectionStrings:Default` 是默认数据库连接的约定名称。

---

### 面试题 3（中级 / 概念题）
**题目**：`IOptions<T>`、`IOptionsSnapshot<T>` 和 `IOptionsMonitor<T>` 有什么区别？分别在什么场景下使用？

**参考答案**：

| 接口 | 生命周期 | 热重载 | 典型场景 |
|---|---|---|---|
| `IOptions<T>` | Singleton | 不支持 | 数据库连接字符串、公司名称等静态配置 |
| `IOptionsSnapshot<T>` | Scoped | 支持 | 每个请求可能需要最新值的业务配置 |
| `IOptionsMonitor<T>` | Singleton | 支持 + OnChange | 需要在配置变化时执行额外逻辑（如刷新缓存） |

`IOptions<T>` 在应用启动时绑定一次，之后值不变。`IOptionsSnapshot<T>` 每个 HTTP 请求重新读取，但不能注入到 Singleton 服务中。`IOptionsMonitor<T>` 是 Singleton 生命周期但支持动态更新，还提供 `OnChange` 回调。

---

### 面试题 4（中级 / 概念题）
**题目**：为什么 `IOptionsSnapshot<T>` 不能注入到 Singleton 服务中？

**参考答案**：`IOptionsSnapshot<T>` 的生命周期是 Scoped（每个 HTTP 请求创建一个新实例）。Singleton 服务在整个应用生命周期内只创建一次，如果把 Scoped 的 `IOptionsSnapshot<T>` 注入到 Singleton 中，会出现「被俘获的依赖（Captive Dependency）」问题——Singleton 服务持有的 `IOptionsSnapshot<T>` 实例在第一个请求结束后就被销毁了，后续请求拿到的值可能过期或抛出异常。ASP.NET Core 的依赖注入容器在默认严格模式下会检测到这个问题并抛出异常。

---

### 面试题 5（初级 / 概念题）
**题目**：如何在 Docker 部署时用环境变量覆盖 `appsettings.json` 中的配置？

**参考答案**：环境变量名用双下划线 `__` 表示 JSON 的层级关系。例如，`appsettings.json` 中 `Redis:Host` 对应环境变量 `Redis__Host`。在 `docker-compose.yml` 的 `environment` 段中配置即可。ASP.NET Core 的默认配置加载器会自动将环境变量映射到对应的配置 Key 上。

---

### 面试题 6（中级 / 概念题）
**题目**：`Configure<T>` 和 `PostConfigure<T>` 有什么区别？

**参考答案**：`Configure<T>` 用于正常绑定配置，可以多次调用（多次调用时后面的覆盖前面的）。`PostConfigure<T>` 在所有 `Configure<T>` 执行完毕后才执行，适合做补充默认值、数据校验、格式规范化等后处理工作。例如，确保 URL 以 `/` 结尾、为未配置的字段设置默认值等。执行顺序是：所有 `Configure<T>` → 所有 `PostConfigure<T>`。

---

### 面试题 7（初级 / 代码题）
**题目**：如何实现 `appsettings.json` 修改后不重启应用就能生效？

**参考答案**：两步：(1) 在添加配置文件时设置 `reloadOnChange: true`——`config.AddJsonFile("appsettings.json", reloadOnChange: true)`；(2) 在业务代码中使用 `IOptionsSnapshot<T>` 或 `IOptionsMonitor<T>` 而不是 `IOptions<T>`。注意：只有文件类型的配置源支持热重载，环境变量和命令行参数不支持。

---

### 面试题 8（中级 / 场景题）
**题目**：如果同时在 `appsettings.json` 和环境变量中配置了 `Redis:Host`，最终生效的是哪个？为什么？

**参考答案**：最终生效的是**环境变量**中的值。因为 `CreateDefaultBuilder` 的加载顺序是：先加载 `appsettings.json`，再加载 `appsettings.{Env}.json`，最后加载环境变量。同名 Key 以最后加载的为准，所以环境变量优先级更高。这个设计让运维人员可以在不修改配置文件的情况下覆盖任何配置。

---

### 面试题 9（高级 / 设计题）
**题目**：如何设计一个 Options 类来组织应用的配置？请以养老院系统为例说明。

**参考答案**：定义一个 POCO 类，属性名与 JSON Key 对应（使用 camelCase）。在类中定义一个 `const string SectionName = "Yls"` 常量表示配置段名称。在 `Startup.ConfigureServices` 中通过 `services.Configure<YlsOptions>(configuration.GetSection(YlsOptions.SectionName))` 注册。在业务服务中通过构造函数注入 `IOptions<YlsOptions>` 使用。好处是：强类型、有智能提示、不会因为字符串拼错导致运行时错误。

---

### 面试题 10（高级 / 概念题）
**题目**：ASP.NET Core 的配置系统底层是如何工作的？`IConfigurationRoot` 和 `IConfigurationSection` 的关系是什么？

**参考答案**：ASP.NET Core 的配置系统基于 `IConfigurationRoot` 和 `IConfigurationProvider`。`IConfigurationRoot` 是配置的根节点，内部持有多个 `IConfigurationProvider`（每种配置源一个）。当读取某个 Key 时，`IConfigurationRoot` 会按 Provider 的注册顺序依次查找，返回第一个非空值。`IConfigurationSection` 表示配置的某个子节点，通过 `GetSection("Yls")` 获取。本质上是一个树形结构，用 `:` 分隔层级，如 `Yls:Company` 表示根节点下的 Yls 子节点下的 Company。

---

### 面试题 11（中级 / 代码题）
**题目**：在 ABP 框架中，如何自定义配置来替换 ABP 默认的配置加载行为？

**参考答案**：在 `CreateHostBuilder` 中通过 `ConfigureAppConfiguration` 添加自定义配置源。ABP 框架内部使用 `IOptions<AbpDbConnectionOptions>` 管理数据库连接，使用 `IOptions<RedisCacheOptions>` 管理 Redis 缓存。可以通过 `services.Configure<AbpDbConnectionOptions>(...)` 覆盖默认行为。在模块类的 `PreConfigureServices` 或 `ConfigureServices` 方法中操作。

---

### 面试题 12（高级 / 场景题）
**题目**：你的养老院系统部署了 3 个实例（容器），需要修改某个配置项让所有实例同时生效。你会怎么做？

**参考答案**：有几种方案：(1) 如果使用了 `reloadOnChange` 且通过挂载共享配置卷的方式，修改配置文件后所有实例自动感知。(2) 通过 Kubernetes ConfigMap 更新配置，Pod 重启后生效。(3) 使用配置中心（如 Nacos、Consul、Azure App Configuration），所有实例通过 `IOptionsMonitor<T>` 监听配置变化，实时生效。(4) 如果是简单的环境变量变更，需要重新部署容器。推荐方案是配置中心 + `IOptionsMonitor<T>` 的组合。

---

### 面试题 13（中级 / 概念题）
**题目**：什么是 User Secrets？它和 `appsettings.Development.json` 有什么区别？

**参考答案**：User Secrets 是 .NET 提供的开发者敏感信息存储机制，存储在用户目录下（Linux: `~/.microsoft/usersecrets/`，Windows: `%APPDATA%\Microsoft\UserSecrets\`），不在项目目录中，因此不会被误提交到 Git。`appsettings.Development.json` 虽然也可以 `.gitignore` 排除，但它物理上存在于项目目录中，存在泄露风险。User Secrets 仅在 Development 环境下加载，适合存放数据库密码、API Key 等。

---

### 面试题 14（高级 / 概念题）
**题目**：`IOptionsMonitor<T>` 是如何感知配置变化的？

**参考答案**：`IOptionsMonitor<T>` 内部持有一个 `IOptionsChangeTokenSource<T>`，它使用 `IChangeToken` 机制监听变化。对于文件配置源，当 `reloadOnChange: true` 时，底层使用 `FileSystemWatcher` 监听文件变化。文件变化时触发 `IChangeToken` 的回调，`OptionsMonitor` 收到通知后重新从 `IConfigurationRoot` 读取值并创建新的 Options 实例，然后触发 `OnChange` 回调。这是一个观察者模式的典型应用。

---

## 11. 下一章预告

**第 04 章：ABP 框架深度解析**

配置写好了，接下来要理解 ABP 框架的核心机制。下一章我们将深入学习：

- ABP 模块系统原理（PreConfigureServices → ConfigureServices → OnApplicationInitialization 三阶段生命周期）
- DDD 分层各层职责（Domain.Shared / Domain / Application.Contracts / Application / EntityFrameworkCore / HttpApi — 每层放什么代码？）
- AutoMapper Profile 配置（CreateMap / ForMember / Ignore / ReverseMap — ABP 中 ObjectMapper 的底层原理）
- ABP 工作单元原理（UnitOfWork 什么时候自动开启？手动控制事务怎么写？嵌套 UoW 的行为？）

理解了配置体系和 ABP 框架机制，你就掌握了后续所有业务模块开发的基础。

---

## 时效性声明

> 本文档基于以下版本编写，内容在对应版本范围内有效：
>
> | 技术 | 版本 |
> |---|---|
> | .NET | 5.0 |
> | C# | 9 |
> | ABP | 4.4.0 |
> | MySQL | 8.0+ |
> | Redis | 6.0+ |
> | Docker Compose | v3.8 |
>
> 如果你使用的版本高于上述版本，核心概念不变，但部分 API 签名或配置格式可能有细微差异。.NET 6+ 可使用 `WebApplication.CreateBuilder` 简化启动代码，但配置体系原理完全一致。

---

## 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
|---|---|---|---|
| v1.0 | 2026-07-10 | 初始版本，覆盖 appsettings.json 规范、多环境配置、Options 模式、环境变量覆盖、热重载、YlsOptions 实战 | 课程组 |
| v1.1 | 2026-07-10 | 下一章预告改为「ABP 框架深度解析」；章节编号统一为 1-11；面试题难度标签统一（基础→初级、重点→中级）；前置知识改为引用第 01-02 章；面试题问题→题目、答→参考答案 | 课程组 |

---

> **本章字数**：约 14000 字符（含代码）
> **下一章**：第 04 章 — ABP 框架深度解析（模块生命周期、DDD 分层、AutoMapper、工作单元）
