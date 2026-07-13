# .NET 企业开发篇

<p align="center">
  <strong>面向后端开发者的 .NET 企业级全栈实战指南</strong><br>
  从 C# 进阶到 Docker 容器化部署，23 章深度教学
</p>

---

## 🎯 教程特色

- **养老院管理系统实战**：所有代码基于真实 ASP.NET Core + ABP 项目
- **面试导向**：297 道面试题，覆盖初级/中级/高级，标注难度与题型
- **企业级技术栈**：ABP Framework 4.4.0 + EF Core + Redis + RabbitMQ + Docker
- **版本锁定**：基于 .NET 5.0 / C# 9，确保代码可直接运行

---

## 📚 教程大纲

### 语言与框架基础（第 1-5 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 01 章](第01章_CSharp进阶与面试高频原理.md) | C# 进阶 | GC 分代回收、async/await 状态机、IDisposable 模式、泛型协变逆变 |
| [第 02 章](第02章_AspNetCore核心原理.md) | ASP.NET Core 核心 | 中间件管道、依赖注入、请求生命周期、Kestrel |
| [第 03 章](第03章_配置体系与appsettings.json编写.md) | 配置体系 | appsettings.json、Options 模式、环境变量、强类型配置 |
| [第 04 章](第04章_ABP框架深度解析.md) | ABP 框架 | 模块系统、DDD 分层、约定优于配置、自动 API 控制器 |
| [第 05 章](第05章_ABP内置模块与基础设施.md) | ABP 内置模块 | 审计日志、数据过滤、工作单元、事件总线 |

### 数据与设计（第 6-9 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 06 章](第06章_EFCore进阶与数据库设计.md) | EF Core 进阶 | Fluent API、迁移策略、性能优化、MySQL 适配 |
| [第 07 章](第07章_实体设计与仓储模式进阶.md) | 实体设计与仓储 | 聚合根、值对象、领域事件、自定义仓储 |
| [第 08 章](第08章_应用服务DTO与API设计规范.md) | DTO 与 API 设计 | 输入/输出 DTO、AutoMapper、RESTful 规范、版本控制 |
| [第 09 章](第09章_设计模式与架构原则.md) | 设计模式 | 策略/工厂/观察者/模板方法、SOLID、DDD 战术模式 |

### 安全与多租户（第 10-11 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 10 章](第10章_认证与授权.md) | 认证与授权 | JWT、IdentityServer4、权限系统、策略授权 |
| [第 11 章](第11章_多租户架构.md) | 多租户 | 数据隔离策略、租户解析、ABP 多租户实现 |

### 中间件与基础设施（第 12-16 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 12 章](第12章_Redis缓存与分布式锁.md) | Redis | 缓存策略、分布式锁、StackExchange.Redis、ABP 缓存抽象 |
| [第 13 章](第13章_RabbitMQ与CAP分布式事件总线.md) | 消息队列 | RabbitMQ、CAP 事件总线、分布式事务、最终一致性 |
| [第 14 章](第14章_Hangfire后台任务与定时作业.md) | 后台任务 | Hangfire、Quartz、ABP BackgroundWorker、定时作业 |
| [第 15 章](第15章_文件管理与Excel导入导出.md) | 文件管理 | NPOI 导入导出、文件上传下载、模板填充 |
| [第 16 章](第16章_日志体系与异常处理.md) | 日志与异常 | Serilog、结构化日志、全局异常过滤器、ELK 集成 |

### 网络与实时通信（第 17-18 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 17 章](第17章_网络协议与安全防护.md) | 网络与安全 | HTTPS/TLS、CORS、CSRF、限流、请求过滤 |
| [第 18 章](第18章_SignalR实时通信与消息推送.md) | 实时通信 | SignalR Hub、消息推送、连接管理、横向扩展 |

### 架构与工程化（第 19-23 章）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| [第 19 章](第19章_微服务架构与API网关.md) | 微服务架构 | 服务拆分、API 网关、服务发现、Ocelot |
| [第 20 章](第20章_第三方服务集成.md) | 第三方集成 | 支付、短信、钉钉、微信、OCR、地图服务 |
| [第 21 章](第21章_单元测试与质量保障.md) | 单元测试 | xUnit、Moq、集成测试、代码覆盖率、CI 集成 |
| [第 22 章](第22章_Git工作流与Linux运维基础.md) | Git 与运维 | Git Flow、Linux 基础、Nginx、systemd |
| [第 23 章](第23章_Docker容器化CICD与生产运维.md) | Docker 与 CI/CD | Dockerfile、docker-compose、GitHub Actions、生产部署 |

### 题库

- [面试题汇总](interview-questions.md) — 297 道面试题，覆盖全部 23 章

---

## 📋 技术栈版本

| 工具/框架 | 版本 | 说明 |
|-----------|------|------|
| .NET | 5.0 | 宿主/Application 层 |
| C# | 9 | LangVersion=latest |
| ABP Framework | 4.4.0 | 开源版 |
| EF Core | 5.0 | + Pomelo MySQL 驱动 |
| Redis | StackExchange.Redis | 缓存 + 分布式锁 |
| RabbitMQ | CAP 5.1.2 | 事件总线 |
| Hangfire | 2.0.3 | 后台任务 |
| NPOI | 2.7.0 | Excel 导入导出 |

> 版本信息来源于项目 common.props 及各模块 .csproj 文件
