# 第 13 章：RabbitMQ + CAP 分布式事件总线

> **「在分布式系统中，消息队列就像养老院的值班交接本——你不需要当面告诉每个人，写下来，相关的人自然会看到。」**

## 学习目标

1. 理解消息队列在分布式系统中的核心价值
2. 掌握 RabbitMQ 四种 Exchange 类型及适用场景
3. 理解消息确认机制与死信队列
4. 掌握消息幂等性的三种实现方案
5. 理解 DotNetCore.CAP 框架的本地消息表原理（注意区分 CAP 定理）
6. 全面掌握分布式事务六种方案及对比（面试必考）
7. 区分 ABP 本地事件与分布式事件
8. 实战完成「长者入住」事件驱动全流程

## 前置知识

- 已完成第 04 章学习（ABP 框架深度解析：模块系统、DDD 分层、工作单元）
- 已完成第 05 章学习（ABP 内置模块：设置管理、数据过滤、审计日志）
- 已完成第 12 章学习（Redis 缓存与分布式锁：缓存策略、SETNX 原理）

## 为什么需要学这个？

单体应用中所有操作在同一进程、同一数据库事务中完成。但养老院系统拆分微服务后，一个「长者入住」需要：入住服务记录信息、账单服务创建账单、床位服务分配床位、通知服务短信家属。同步 HTTP 串联四个服务，任一环节失败全链路回滚。消息队列就是解药——把通知写到交接本上，各服务按自己的节奏处理。

---

## 13.1 为什么需要消息队列

### 养老院值班交接本类比

**同步模式（打电话通知）**：护士小王发现301房张大爷血压偏高，她需要打电话给医生→等接听→打给家属→等接听→打给营养师→等接听。家属没接电话，小王一直等，其他工作停滞。

**异步模式（写交接本）**：小王在交接本上写「301房张大爷血压160/100，需医生复诊、通知家属、调整饮食」。写完去忙别的。医生巡房时看到会处理，白班护士看到会通知家属，营养师看到会调整食谱。

同步调用的问题总结：

| 问题 | 说明 |
|------|------|
| 强耦合 | 入住服务必须知道所有下游服务的地址和接口 |
| 级联失败 | 任何一个服务挂掉，整个流程失败 |
| 响应慢 | 总耗时 = 所有服务耗时之和 |
| 扩展困难 | 新增「通知护工」就要改入住服务代码 |

消息队列就是分布式系统中的「交接本」——把通知写下来，各服务按自己的节奏处理，互不阻塞。

---

## 13.2 RabbitMQ 核心概念

RabbitMQ 基于 AMQP 协议，核心组件用养老院类比：

| 概念 | 类比 | 说明 |
|------|------|------|
| Producer | 写交接本的护士 | 发送消息的程序 |
| Exchange | 交接本的分类栏 | 决定消息路由到哪些队列 |
| Queue | 具体工作任务清单 | 存储消息的缓冲区 |
| Binding | 分类栏到任务清单的对应关系 | Exchange 和 Queue 的连接规则 |
| RoutingKey | 交接本上的标签 | 消息路由标识 |
| Consumer | 看交接本处理工作的人 | 接收消息的程序 |
| Virtual Host | 养老院的不同院区 | 逻辑隔离 |

### Exchange 四种类型

**Direct**——精确匹配：标签是「医生」的消息只给医生队列。
**Fanout**——广播：忽略 RoutingKey，消息复制给所有绑定队列（紧急通知场景）。
**Topic**——通配符匹配：`*` 匹配一个单词，`#` 匹配零或多个单词。`medical.#` 匹配 `medical.doctor`。
**Headers**——按消息头键值对路由，较少使用。

```csharp
// Direct Exchange 示例
channel.ExchangeDeclare("elderly-care-direct", ExchangeType.Direct);
channel.QueueDeclare("doctor-queue", durable: true, exclusive: false, autoDelete: false);
channel.QueueBind("doctor-queue", "elderly-care-direct", "medical");

// Topic Exchange 示例
channel.ExchangeDeclare("elderly-care-topic", ExchangeType.Topic);
channel.QueueBind("urgent-queue", "elderly-care-topic", "#.urgent");
channel.QueueBind("room301-queue", "elderly-care-topic", "*.room.301");
```

Docker 部署：
```yaml
# docker-compose.yml
services:
  rabbitmq:
    image: rabbitmq:3.8-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: 123456
      RABBITMQ_DEFAULT_VHOST: elderly-care
```

---

## 13.3 消息确认机制

### Publisher Confirm（发布确认）

```csharp
public class RabbitMqPublisher
{
    private readonly IModel _channel;

    public bool PublishMessage(string routingKey, string message)
    {
        _channel.ConfirmSelect(); // 开启发布确认
        var body = Encoding.UTF8.GetBytes(message);
        var properties = _channel.CreateBasicProperties();
        properties.Persistent = true;
        properties.MessageId = Guid.NewGuid().ToString();

        _channel.BasicPublish("elderly-care-topic", routingKey, properties, body);
        return _channel.WaitForConfirms(TimeSpan.FromSeconds(10));
    }
}
```

### Consumer ACK/NACK/Reject

```csharp
consumer.Received += (sender, args) =>
{
    try
    {
        var message = Encoding.UTF8.GetString(args.Body.ToArray());
        ProcessMessage(message);
        _channel.BasicAck(args.DeliveryTag, multiple: false); // 成功确认
    }
    catch (TemporaryException)
    {
        _channel.BasicNack(args.DeliveryTag, multiple: false, requeue: true); // 重试
    }
    catch (PermanentException)
    {
        _channel.BasicReject(args.DeliveryTag, requeue: false); // 进入死信
    }
};
_channel.BasicConsume("checkin-queue", autoAck: false, consumer);
```

### 死信队列（DLX）

消息在三种情况下成为死信：消费者拒绝（Reject/Nack且requeue=false）、TTL过期、队列满。配置方式：

```csharp
var args = new Dictionary<string, object>
{
    { "x-dead-letter-exchange", "dlx-exchange" },
    { "x-dead-letter-routing-key", "dlx-routing-key" }
};
_channel.QueueDeclare("checkin-queue", durable: true, exclusive: false, autoDelete: false, arguments: args);
```

---

## 13.4 消息幂等性

> **面试高频：如何保证消息不被重复消费？**

网络抖动、消费者重启可能导致同一条消息投递多次。养老院中「创建账单」被消费两次就会创建两份账单。

### 方案一：唯一消息ID + 去重表（推荐首选）

```csharp
public class ProcessedMessage : Entity<Guid>
{
    public string MessageId { get; set; }
    public string MessageType { get; set; }
    public DateTime ProcessedTime { get; set; }
}

public async Task HandleAsync(string messageId, BillCreatedEto eventData)
{
    // 检查是否已处理
    if (await _msgRepo.AnyAsync(m => m.MessageId == messageId)) return;

    await _billRepo.InsertAsync(new Bill(eventData.ElderId, eventData.Amount));
    await _msgRepo.InsertAsync(new ProcessedMessage { MessageId = messageId, ProcessedTime = Clock.Now });
}
```

### 方案二：状态机

利用业务状态防止重复：入住单状态为 `BillCreated` 时，收到「创建账单」消息直接跳过。

### 方案三：乐观锁版本号

EF Core 的 `[ConcurrencyCheck]` 配合版本号字段，重复更新会触发并发冲突。

| 维度 | 唯一消息ID+去重表 | 状态机 | 乐观锁版本号 |
|------|-------------------|--------|-------------|
| 适用场景 | 通用 | 有业务状态场景 | 数据更新场景 |
| 实现复杂度 | 低 | 中 | 低 |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 13.5 CAP 框架原理

> **重要：DotNetCore.CAP 是 .NET 开源框架，不是分布式系统中的 CAP 定理！名字相同含义完全不同！**

### 本地消息表原理

核心思想：**业务操作和消息发送在同一数据库事务中**。

```
入住服务（同一事务）：
  BEGIN TRANSACTION
    1. INSERT INTO CheckInOrders
    2. INSERT INTO Cap.Published  ← 同一事务
  COMMIT

CAP 后台线程（异步）：
  3. 读取待发送消息 → 4. 发送到 RabbitMQ → 5. 标记已发送

账单服务（同一事务）：
  BEGIN TRANSACTION
    1. INSERT INTO Bills
    2. INSERT INTO Cap.Received  ← 同一事务
  COMMIT → 3. ACK 到 RabbitMQ
```

保证最终一致性的原因：业务和消息同事务（要么都成功要么都失败），发送失败自动重试，消费端通过 MessageId 去重。

### 集成配置

```xml
<PackageReference Include="DotNetCore.CAP" Version="5.1.2" />
<PackageReference Include="DotNetCore.CAP.RabbitMQ" Version="5.1.2" />
<PackageReference Include="DotNetCore.CAP.EntityFrameworkCore" Version="5.1.2" />
<PackageReference Include="DotNetCore.CAP.Dashboard" Version="5.1.2" />
```

```csharp
public class ElderlyCareCapModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        context.Services.AddCap(cap =>
        {
            cap.UseEntityFramework<ElderlyCareDbContext>();
            cap.UseRabbitMQ(rabbit =>
            {
                rabbit.HostName = "localhost";
                rabbit.Port = 5672;
                rabbit.UserName = "admin";
                rabbit.Password = "123456";
                rabbit.VirtualHost = "elderly-care";
                rabbit.ExchangeName = "elderly-care-cap";
            });
            cap.UseDashboard(d => d.PathBase = "/cap-dashboard");
            cap.FailedRetryCount = 5;
            cap.FailedRetryInterval = 60;
            cap.SucceedMessageExpiredAfter = 24 * 3600;
        });
    }
}
```

### 发布事件

```csharp
public class CheckInAppService : ApplicationService
{
    private readonly ICapPublisher _capPublisher;
    private readonly ElderlyCareDbContext _dbContext;

    [UnitOfWork]
    public virtual async Task<Guid> CheckInAsync(CheckInDto input)
    {
        var order = new CheckInOrder(GuidGenerator.Create(), input.ElderId, input.RoomId);

        // 同一事务：业务数据 + 消息记录
        using var transaction = _dbContext.Database.BeginTransaction(_capPublisher, autoCommit: true);

        await _checkInRepo.InsertAsync(order);

        await _capPublisher.PublishAsync("elderly-care.checkin.completed", new CheckInCompletedEto
        {
            OrderId = order.Id,
            ElderId = input.ElderId,
            ElderName = input.ElderName,
            RoomId = input.RoomId,
            MonthlyFee = input.MonthlyFee
        });

        return order.Id; // 事务自动提交
    }
}
```

### 消费事件

```csharp
public class BillSubscriberService : ICapSubscribe
{
    [CapSubscribe("elderly-care.checkin.completed")]
    public async Task HandleCheckInAsync(CheckInCompletedEto eventData)
    {
        var bill = new Bill(eventData.ElderId, eventData.ElderName, eventData.MonthlyFee);
        await _billRepo.InsertAsync(bill);
    }
}
```

---

## 13.6 分布式事务（面试必考，重点）

> **牢记：CAP 定理和 CAP 框架不是一回事！**

### CAP 定理

分布式系统理论，由 Eric Brewer 于 2000 年提出：

| 属性 | 全称 | 养老院类比 |
|------|------|-----------|
| C | Consistency（一致性） | 所有护士看到的交接本内容一致 |
| A | Availability（可用性） | 任何时候都能查到长者信息 |
| P | Partition Tolerance（分区容错性） | 院区之间网线断了，各区仍能独立运行 |

C、A、P 最多同时满足两个。网络分区不可避免，实际选择：CP（强一致，如 ZooKeeper）或 AP（高可用，如大多数微服务）。

### BASE 理论

| 属性 | 含义 |
|------|------|
| BA | Basically Available：核心功能可用，允许降级 |
| S | Soft State：允许数据存在中间状态 |
| E | Eventually Consistent：最终达到一致 |

### 2PC 两阶段提交

Phase1 协调者发 Prepare，参与者投票 Yes/No。Phase2 全部 Yes 则 Commit，否则 Rollback。强一致但同步阻塞，协调者单点故障。养老院类比：院长要求所有护士同时签字换班，一人没签所有人等。

### TCC 补偿事务

Try 阶段冻结资源，Confirm 阶段确认扣减，Cancel 阶段解冻回滚。强一致但业务侵入高。养老院场景：Try 冻结床位和余额，Confirm 确认入住扣费，Cancel 取消入住释放资源。

### Saga 长事务

拆分为一系列本地事务，每个有补偿操作。**编排式**有中心协调者指挥流程；**协同式**无中心，事件驱动，各服务自行监听。养老院入住审批：审批→体检→签约→入住，任一步骤失败逆序补偿。

### 最终一致性（CAP 框架方案）

本地消息表模式，业务和消息同一事务写入，后台线程异步投递。性能高、实现简单。

### 方案对比

| 方案 | 一致性 | 性能 | 复杂度 | 适用场景 |
|------|--------|------|--------|---------|
| 2PC | 强一致 | 低 | 中 | 数据库层面同构资源 |
| TCC | 强一致 | 中 | 高 | 资金交易、库存扣减 |
| Saga（编排） | 最终一致 | 中 | 中 | 长流程审批 |
| Saga（协同） | 最终一致 | 高 | 中 | 事件驱动架构 |
| 本地消息表（CAP） | 最终一致 | 高 | 低 | 异步事件通知 |
| 最大努力通知 | 弱一致 | 最高 | 最低 | 允许人工补偿 |

**面试模板**：养老院系统中我选择 CAP 框架处理入住分布式事务，因为后续操作（账单、床位、通知）不需要强一致和实时性，只要最终完成。CAP 将业务和消息写入同一事务，后台线程异步投递到 RabbitMQ，既保证消息不丢失，又不影响响应速度。

---

## 13.7 ABP 本地事件 vs 分布式事件

### 本地事件（ILocalEventHandler）

进程内同步或异步触发，不跨服务：

```csharp
public class ElderCheckedInEventData
{
    public Guid ElderId { get; set; }
    public string ElderName { get; set; }
}

public class UpdateStatusHandler : ILocalEventHandler<ElderCheckedInEventData>, ITransientDependency
{
    public async Task HandleEventAsync(ElderCheckedInEventData eventData)
    {
        var elder = await _elderRepo.GetAsync(eventData.ElderId);
        elder.Status = ElderStatus.CheckedIn;
        await _elderRepo.UpdateAsync(elder);
    }
}

// 发布
await _localEventBus.PublishAsync(new ElderCheckedInEventData { ElderId = elder.Id });
```

### 分布式事件（ETO + CapSubscribe）

跨服务传递，ETO 只携带必要标识：

```csharp
// ✅ 正确：只含必要字段
public class CheckInCompletedEto
{
    public Guid OrderId { get; set; }
    public Guid ElderId { get; set; }
    public string ElderName { get; set; }
    public decimal MonthlyFee { get; set; }
}

// ❌ 错误：包含整个实体
public class BadEto
{
    public CheckInOrder Order { get; set; }    // 不要传整个实体
    public Elder Elder { get; set; }            // 不要传聚合根
}
```

---

## 13.8 CAP Dashboard 监控

```csharp
cap.UseDashboard(d =>
{
    d.PathBase = "/cap-dashboard";
    d.Authorization = new[] { new CapDashboardAuthorizationFilter() };
});

public class CapDashboardAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        return context.GetHttpContext().User.Identity?.IsAuthenticated == true;
    }
}
```

Dashboard 功能：Published Messages（已发布消息状态）、Received Messages（已消费消息）、Subscribers（订阅者列表）、实时统计（吞吐量、失败率）。

---

## 实战案例：长者入住事件驱动全流程

入住→发布事件→自动创建账单+分配床位+通知家属。

**定义 ETO**：

```csharp
public class CheckInCompletedEto
{
    public Guid OrderId { get; set; }
    public Guid ElderId { get; set; }
    public string ElderName { get; set; }
    public Guid RoomId { get; set; }
    public Guid BedId { get; set; }
    public string RoomNumber { get; set; }
    public decimal MonthlyFee { get; set; }
    public DateTime CheckInDate { get; set; }
    public string FamilyPhone { get; set; }
    public string FamilyName { get; set; }
}
```

**入住服务发布事件**：

```csharp
public class CheckInAppService : ApplicationService, ICheckInAppService
{
    private readonly ICapPublisher _capPublisher;
    private readonly IRepository<CheckInOrder, Guid> _orderRepo;
    private readonly ElderlyCareDbContext _dbContext;

    public CheckInAppService(
        ICapPublisher capPublisher,
        IRepository<CheckInOrder, Guid> orderRepo,
        ElderlyCareDbContext dbContext)
    {
        _capPublisher = capPublisher;
        _orderRepo = orderRepo;
        _dbContext = dbContext;
    }

    [UnitOfWork]
    public virtual async Task<Guid> CheckInAsync(CheckInDto input)
    {
        var order = new CheckInOrder(GuidGenerator.Create(), input.ElderId, input.ElderName,
            input.RoomId, input.BedId, input.MonthlyFee, Clock.Now);

        using var transaction = _dbContext.Database.BeginTransaction(_capPublisher, autoCommit: false);

        await _orderRepo.InsertAsync(order);

        await _capPublisher.PublishAsync("elderly-care.checkin.completed", new CheckInCompletedEto
        {
            OrderId = order.Id,
            ElderId = input.ElderId,
            ElderName = input.ElderName,
            RoomId = input.RoomId,
            BedId = input.BedId,
            RoomNumber = input.RoomNumber,
            MonthlyFee = input.MonthlyFee,
            CheckInDate = Clock.Now,
            FamilyPhone = input.FamilyPhone,
            FamilyName = input.FamilyName
        });

        await transaction.CommitAsync();
        return order.Id;
    }
}
```

**控制器**：

```csharp
[Area("checkin")]
[Route("api/checkin/orders")]
public class CheckInController : AbpController
{
    private readonly ICheckInAppService _checkInAppService;
    public CheckInController(ICheckInAppService checkInAppService) => _checkInAppService = checkInAppService;

    [HttpPost]
    [Route("")]
    public async Task<IActionResult> CheckIn(CheckInDto input)
    {
        var orderId = await _checkInAppService.CheckInAsync(input);
        return Ok(new { OrderId = orderId, Message = "入住成功，后续流程已自动触发" });
    }
}
```

**账单服务订阅**：

```csharp
public class CheckInBillingSubscriber : ICapSubscribe
{
    [CapSubscribe("elderly-care.checkin.completed")]
    [UnitOfWork]
    public async Task CreateBillAsync(CheckInCompletedEto eventData)
    {
        var bill = new Bill(GuidGenerator.Create(), eventData.ElderId, eventData.ElderName,
            eventData.MonthlyFee, eventData.CheckInDate.ToString("yyyy-MM"));
        await _billRepo.InsertAsync(bill);
    }
}
```

**床位服务订阅**：

```csharp
public class CheckInBedSubscriber : ICapSubscribe
{
    [CapSubscribe("elderly-care.checkin.completed")]
    [UnitOfWork]
    public async Task AssignBedAsync(CheckInCompletedEto eventData)
    {
        var bed = await _bedRepo.GetAsync(eventData.BedId);
        if (bed.Status != BedStatus.Available) return; // 幂等保护
        bed.Status = BedStatus.Occupied;
        bed.CurrentElderId = eventData.ElderId;
        await _bedRepo.UpdateAsync(bed);
    }
}
```

**通知服务订阅**：

```csharp
public class CheckInNotificationSubscriber : ICapSubscribe
{
    [CapSubscribe("elderly-care.checkin.completed")]
    public async Task NotifyFamilyAsync(CheckInCompletedEto eventData)
    {
        if (string.IsNullOrEmpty(eventData.FamilyPhone)) return;
        var msg = $"尊敬的{eventData.FamilyName}，{eventData.ElderName}已于{eventData.CheckInDate:yyyy年MM月dd日}入住{eventData.RoomNumber}房间，月费{eventData.MonthlyFee}元。";
        await _smsService.SendAsync(eventData.FamilyPhone, msg);
    }
}
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | `PublishAsync` 不在事务内 | 使用 `BeginTransaction(_capPublisher)` 包裹 | 业务成功但消息丢失 |
| 2 | 消费者抛异常靠重试去重 | 用消息ID去重+状态检查 | 重试导致重复消费 |
| 3 | ETO 包含完整领域实体 | ETO 只含必要标识和少量数据 | 消息体过大且含过时数据 |
| 4 | `autoAck: true` | 手动 ACK，处理完再确认 | 自动确认在失败时消息丢失 |
| 5 | 手动维护消息表 | 使用 CAP 的 `ICapPublisher` | 手动维护复杂易错 |
| 6 | 不配置死信队列 | 为业务队列配置 DLX | 失败消息无处排查 |
| 7 | Controller 中直接发布事件 | ApplicationService 中发布 | 违反分层，无法保证事务 |
| 8 | 同组多实例不幂等 | 每个 Consumer 做消息ID去重 | 消息被重复处理 |

---

## 本章小结

1. **消息队列价值**：用值班交接本类比理解异步解耦
2. **RabbitMQ**：四种 Exchange 类型（Direct/Fanout/Topic/Headers）
3. **消息可靠性**：Publisher Confirm + Consumer ACK + 死信队列
4. **消息幂等性**：唯一消息ID+去重表（首选）、状态机、乐观锁
5. **CAP 框架**：本地消息表模式，业务和消息同一事务，最终一致性
6. **分布式事务**：六种方案对比，CAP 定理 ≠ CAP 框架
7. **ABP 事件**：本地事件（进程内）vs 分布式事件（跨服务+ETO）
8. **实战**：入住事件驱动自动账单+床位+通知

---

## 面试题

### 面试题 1（中级 / 概念题）
**题目**：什么是消息队列？在养老院系统中什么场景适合使用？
**参考答案**：消息队列是异步通信中间件，生产者发消息到队列，消费者按自己节奏消费。养老院中「长者入住」后需要创建账单、分配床位、通知家属，这些不需要实时同步完成，用消息队列异步处理可解耦服务、提高响应速度。就像护士在交接本上写待办，相关人员各自处理。

### 面试题 2（中级 / 概念题）
**题目**：RabbitMQ 的四种 Exchange 类型分别是什么？
**参考答案**：Direct 按 RoutingKey 精确匹配，适合点对点通知。Fanout 广播所有绑定队列，适合紧急通知。Topic 支持通配符匹配，适合按主题订阅。Headers 按消息头属性路由，较少使用。养老院最常用 Topic 和 Direct。

### 面试题 3（中级 / 场景题）
**题目**：如何保证 RabbitMQ 消息不丢失？
**参考答案**：三个环节保障：生产端用 Publisher Confirm 确认消息到达 Broker；Broker 端消息和队列设为持久化；消费端用手动 ACK，业务成功才确认。养老院账单消息丢失会导致长者没账单，三环节缺一不可。

### 面试题 4（高级 / 概念题）
**题目**：什么是消息幂等性？如何保证不重复消费？
**参考答案**：幂等性指同一操作执行一次和多次效果相同。养老院中「创建账单」消费两次会产生两份账单。方案：唯一消息ID+去重表（通用首选）、状态机（利用业务状态）、乐观锁版本号（更新场景）。推荐第一种。

### 面试题 5（高级 / 概念题）
**题目**：DotNetCore.CAP 框架的原理是什么？
**参考答案**：CAP 采用本地消息表模式，将业务数据和消息记录写入同一数据库事务。养老院入住为例，入住记录和消息在同一事务提交，要么都成功要么都失败。消息写入本地表后 CAP 后台线程异步发到 RabbitMQ，失败自动重试。消费者处理成功后也通过本地事务记录状态，保证最终一致。

### 面试题 6（高级 / 概念题）
**题目**：CAP 定理和 CAP 框架有什么关系？
**参考答案**：没有任何关系，只是名字碰巧相同。CAP 定理是分布式理论，Consistency/Availability/Partition Tolerance 三者最多同时满足两个。CAP 框架是 DotNetCore.CAP，基于本地消息表的分布式事件总线。面试时一定要明确区分。养老院系统采用 CAP 框架实现最终一致，属 AP 系统。

### 面试题 7（高级 / 概念题）
**题目**：分布式事务有哪些方案？
**参考答案**：2PC 两阶段提交强一致但阻塞；TCC 补偿事务强一致但侵入性高；Saga 长事务适合长流程，有编排和协同两种；本地消息表（CAP）性能高实现简单；最大努力通知允许人工补偿。养老院入住后续操作用 CAP 最合适，不需要强一致。

### 面试题 8（中级 / 概念题）
**题目**：什么是死信队列？
**参考答案**：死信队列是消息处理失败后的归宿。消息在消费者拒绝、TTL 过期、队列满时进入死信队列。养老院中账单消息处理失败3次后进入死信队列，运维可在 Dashboard 查看失败原因手动处理，是消息可靠性的最后一道防线。

### 面试题 9（中级 / 场景题）
**题目**：ABP 本地事件和分布式事件有什么区别？
**参考答案**：本地事件通过 ILocalEventHandler 在进程内触发，适合模块间解耦。分布式事件通过 CapSubscribe 跨服务传递，适合微服务间通信。入住成功后更新长者状态用本地事件，通知账单服务创建账单用分布式事件。

### 面试题 10（高级 / 设计题）
**题目**：养老院「长者入住」如何设计事件驱动架构？
**参考答案**：入住服务通过 CAP 发布 CheckInCompletedEto 到 RabbitMQ，事件只含必要标识。三个下游服务各自订阅：账单服务创建账单、床位服务更新状态、通知服务发短信。每个消费者做消息ID去重保证幂等，Dashboard 监控消息状态。

### 面试题 11（高级 / 概念题）
**题目**：TCC 和 Saga 核心区别是什么？
**参考答案**：TCC 是资源预留模式，Try 冻结资源，Confirm 确认，Cancel 解冻。一致性更强但业务侵入高，需实现三个接口。适合养老院入住扣费。Saga 是补偿模式，直接执行，失败时逆序补偿。侵入性低但中间状态可见。适合入住审批流程。TCC 实现复杂一致性强，Saga 实现简单可能中间不一致。

### 面试题 12（中级 / 代码题）
**题目**：如何配置 CAP 框架连接 RabbitMQ？
**参考答案**：在模块 ConfigureServices 中调用 AddCap，UseEntityFramework 配置本地消息表存储，UseRabbitMQ 配置连接信息（主机、端口、用户名、密码、Virtual Host），UseDashboard 启用监控，配置 FailedRetryCount 和 SucceedMessageExpiredAfter。

### 面试题 13（高级 / 场景题）
**题目**：CAP 消费端处理失败后会怎样？
**参考答案**：消费失败后 CAP 自动重试，默认5次，间隔可通过 FailedRetryInterval 配置。超限后消息标记失败，可在 Dashboard 手动重发。消费者应做幂等处理，如检查消息ID是否已记录或利用业务状态判断。

### 面试题 14（中级 / 概念题）
**题目**：BASE 理论和 CAP 定理的关系？
**参考答案**：BASE 是 CAP 的延伸。CAP 告诉我们要在一致性和可用性间取舍，BASE 给出实践方案：选择可用性，接受最终一致。养老院系统采用 CAP 框架就是 BASE 实践——入住后账单可能延迟几秒，但最终一定创建成功。

---

## 下一章预告

**第 14 章：Hangfire 后台任务与定时作业**

CAP 是「事件驱动」——事情发生才触发下一步；Hangfire 是「时间驱动」——到了时间就执行任务。下一章学习：

- Hangfire 基础配置与 Dashboard
- Fire-and-forget 任务（发完即忘）
- 延迟任务与周期性任务
- 实战：养老院定时巡检提醒、月度账单自动生成

---

## 时效性声明

> ⚠️ **技术版本说明**：本章基于 DotNetCore.CAP 5.1.2、RabbitMQ 3.8+、ABP 4.4.0、.NET 5.0 编写。CAP 5.x API 在后续版本中基本兼容。RabbitMQ 3.8 已 EOL，生产环境建议升级到 3.12+。

---

## 修订记录

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| v1.0 | 2026-07-10 | 初稿，涵盖 RabbitMQ、CAP 框架、分布式事务对比、实战入住事件驱动 |
| 2026-07-10 | v1.1 | 下一章预告修正为「后台任务与定时作业」；面试题类型标签统一；前置知识补充第05/12章 |
| 2026-07-10 | v1.2 | 面试题类型标签统一为概念题/场景题/代码题/设计题四类 |
