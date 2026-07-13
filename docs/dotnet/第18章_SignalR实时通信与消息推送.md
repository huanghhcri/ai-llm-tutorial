# 第 18 章：SignalR 实时通信与消息推送

## 学习目标

- 理解实时通信的必要性，能说清楚 HTTP 轮询为什么不适合养老院体征告警场景
- 掌握 WebSocket 协议原理，理解 HTTP 与 WebSocket 的本质区别
- 掌握 SignalR Hub 的设计模式：连接生命周期、客户端调用、分组管理
- 理解 ABP 通知系统与 SignalR 的集成方式
- 掌握 JWT Token 在 WebSocket 连接中的传递与验证
- 完成实战：长者异常体征实时告警推送到护士工作站大屏

## 前置知识

- 第04章：ABP 框架深度解析
- 第10章：认证与授权（JWT Token 基础）

## 为什么需要学这个？

养老院里，当长者的心率突然飙升到 140，系统必须在秒级内把告警推送到护士工作站大屏。HTTP 轮询不仅延迟不可控，还造成大量无效请求。这就是 SignalR 要解决的问题。

---

## 1. 为什么需要实时通信

### 1.1 养老院场景：体征异常告警的紧迫性

凌晨两点，802房间王爷爷血氧饱和度从 96% 跌到 88%。系统必须立刻通知值班护士——如果要过 10 秒才能看到告警，可能错过最佳干预时机。

核心需求：**服务器主动向客户端推送消息**，而不是客户端反复去"问"服务器。

### 1.2 HTTP 轮询的问题

| 方式 | 原理 | 延迟 | 资源消耗 |
|------|------|------|----------|
| 短轮询 | 每隔 N 秒请求一次 | 最长 N 秒 | 高，大量无意义请求 |
| 长轮询 | 请求挂起直到有数据 | 较低 | 中，连接长时间占用 |
| WebSocket | 建立持久双向通道 | 实时 | 低，仅在有数据时传输 |

50 个护士工作站每 2 秒轮询一次，一分钟 1500 次请求，99% 返回"没有新告警"。

---

## 2. WebSocket 原理

### 2.1 生活类比：写信 vs 对讲机

- **HTTP 就像写信**：护士每天写信问医生"有新医嘱吗？"，有紧急医嘱也得等明天再问。
- **WebSocket 就像对讲机**：频道接通后，任何一方随时说话。医生喊"802需要会诊"，护士立刻听到。

### 2.2 连接建立过程

WebSocket 从一次 HTTP 请求开始，通过"握手"升级：

```
客户端 → 服务器：HTTP 请求，头含 Upgrade: websocket
服务器 → 客户端：HTTP 101 Switching Protocols
（此后双向通道建立，任一方可随时发消息）
```

### 2.3 为什么用 SignalR 而不是原生 WebSocket

原生 WebSocket 很底层——消息格式、重连、心跳、分组、认证都要自己处理。SignalR 自动搞定这些，还支持自动降级（WebSocket → Server-Sent Events → Long Polling）。

---

## 3. SignalR Hub 设计

### 3.1 Hub 是什么

Hub 是 SignalR 的核心类。客户端连上后，可以调用服务器的方法，服务器也能调用客户端的方法——双向 RPC。

### 3.2 创建 Hub

```csharp
using Microsoft.AspNetCore.SignalR;
using System;
using System.Threading.Tasks;

namespace ElderlyCare.Notification
{
    public class NotificationHub : Hub
    {
        public override async Task OnConnectedAsync()
        {
            var tenantId = Context.User?.FindFirst("tenant_id")?.Value;

            if (!string.IsNullOrEmpty(tenantId))
            {
                await Groups.AddToGroupAsync(
                    Context.ConnectionId, $"Tenant_{tenantId}");
            }

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception exception)
        {
            if (exception != null)
            {
                // 记录异常断开
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinGroup(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        }

        public async Task LeaveGroup(string groupName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        }
    }
}
```

### 3.3 推送方式

```csharp
// 推送给所有客户端
await Clients.All.SendAsync("ReceiveNotification", data);

// 推送给指定用户（支持多设备）
await Clients.User(userId).SendAsync("ReceiveNotification", data);

// 推送给指定分组
await Clients.Group("Tenant_1").SendAsync("ReceiveNotification", data);

// 推送给分组，排除调用者自己
await Clients.OthersInGroup("Tenant_1").SendAsync("ReceiveNotification", data);
```

### 3.4 注册 SignalR

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.AddSignalR(options =>
    {
        options.KeepAliveInterval = TimeSpan.FromSeconds(15);
        options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    });
}

public void Configure(IApplicationBuilder app)
{
    app.UseEndpoints(endpoints =>
    {
        endpoints.MapHub<NotificationHub>("/hubs/notification");
    });
}
```

---

## 4. ABP 通知系统与 SignalR 集成

### 4.1 通知数据类

```csharp
using Volo.Abp.Notifications;

namespace ElderlyCare.Notifications
{
    public class VitalSignAlertNotificationData : NotificationData
    {
        public string ElderName { get; set; }
        public string ElderRoom { get; set; }
        public string SignType { get; set; }
        public string CurrentValue { get; set; }
        public string Threshold { get; set; }
        public string AlertLevel { get; set; }

        public override string ToJson()
        {
            return System.Text.Json.JsonSerializer.Serialize(this);
        }
    }
}
```

### 4.2 发布通知

ABP 通过 `INotificationPublisher` 发布通知，自动通过 `SignalRRealTimeNotifier` 推送到客户端：

```csharp
using Volo.Abp.Notifications;

namespace ElderlyCare.Elders
{
    public class VitalSignMonitorService : ElderlyCareAppService
    {
        private readonly INotificationPublisher _notificationPublisher;

        public VitalSignMonitorService(
            INotificationPublisher notificationPublisher)
        {
            _notificationPublisher = notificationPublisher;
        }

        public async Task CheckVitalSignAsync(VitalSignDto sign)
        {
            if (sign.HeartRate > 120 || sign.HeartRate < 50)
            {
                await _notificationPublisher.PublishAsync(
                    "VitalSign.Alert",
                    new VitalSignAlertNotificationData
                    {
                        ElderName = sign.ElderName,
                        ElderRoom = sign.RoomNumber,
                        SignType = "心率",
                        CurrentValue = sign.HeartRate.ToString(),
                        Threshold = "50-120",
                        AlertLevel = sign.HeartRate > 140 ? "严重" : "警告"
                    },
                    notificationSeverity: NotificationSeverity.Error
                );
            }
        }
    }
}
```

模块中需依赖 `AbpSignalRModule`：

```csharp
[DependsOn(typeof(AbpSignalRModule), typeof(AbpAspNetCoreSignalRModule))]
public class ElderlyCareHttpApiHostModule : AbpModule
{
}
```

---

## 5. JWT 在 WebSocket 连接中的传递

### 5.1 问题

HTTP 请求通过 `Authorization` 头传 JWT，但 WebSocket 握手后 HTTP 头就没了，浏览器的 WebSocket API 也不支持自定义请求头。

### 5.2 方案：QueryString 传递

```javascript
// 前端：把 token 放在 URL 参数中
const token = localStorage.getItem('access_token');
const connection = new signalR.HubConnectionBuilder()
    .withUrl(`/hubs/notification?access_token=${token}`)
    .build();
```

### 5.3 服务器端验证

```csharp
services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "ElderlyCare",
            ValidateAudience = true,
            ValidAudience = "ElderlyCare",
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes("Your-Secret-Key-At-Least-32-Bytes!")),
            ValidateLifetime = true
        };

        // 关键：从 QueryString 读取 Token
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken)
                    && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });
```

验证通过后，`Context.User` 包含 JWT 中的 Claims，Hub 中可直接获取用户信息。

---

## 6. 分组管理

### 6.1 按租户分组

连接时自动加入租户分组，推送时只通知对应租户：

```csharp
public override async Task OnConnectedAsync()
{
    var tenantId = Context.User?.FindFirst("tenant_id")?.Value;
    if (!string.IsNullOrEmpty(tenantId))
    {
        await Groups.AddToGroupAsync(
            Context.ConnectionId, $"Tenant_{tenantId}");
    }
    await base.OnConnectedAsync();
}
```

### 6.2 按角色分组

护士收体征告警，医生收会诊请求：

```csharp
public override async Task OnConnectedAsync()
{
    var roles = Context.User?.FindAll("role")?.Select(c => c.Value);
    var tenantId = Context.User?.FindFirst("tenant_id")?.Value;

    foreach (var role in roles ?? Enumerable.Empty<string>())
    {
        await Groups.AddToGroupAsync(
            Context.ConnectionId, $"Tenant_{tenantId}_Role_{role}");
    }

    await base.OnConnectedAsync();
}
```

推送时精确选择目标：

```csharp
// 只推给护士
await Clients.Group($"Tenant_{tenantId}_Role_Nurse")
    .SendAsync("ReceiveAlert", alertData);

// 只推给医生
await Clients.Group($"Tenant_{tenantId}_Role_Doctor")
    .SendAsync("ReceiveConsultation", data);
```

### 6.3 动态订阅

护士长想监控多楼层，可主动加入分组：

```csharp
public async Task SubscribeFloor(string floorId)
{
    var tenantId = Context.User?.FindFirst("tenant_id")?.Value;
    await Groups.AddToGroupAsync(
        Context.ConnectionId, $"Tenant_{tenantId}_Floor_{floorId}");
}
```

---

## 7. 实战：长者异常体征实时告警推送

### 7.1 整体流程

```
体征设备上报 → 监控服务判断异常 → INotificationPublisher 发布
    → SignalRRealTimeNotifier 推送到 Hub → 分组推送到护士大屏
```

### 7.2 体征监控服务

```csharp
using System;
using System.Threading.Tasks;
using Volo.Abp.Notifications;

namespace ElderlyCare.Elders
{
    public class VitalSignInput
    {
        public Guid ElderId { get; set; }
        public string ElderName { get; set; }
        public string RoomNumber { get; set; }
        public int HeartRate { get; set; }
        public int BloodOxygen { get; set; }
        public decimal Temperature { get; set; }
    }

    public class VitalSignMonitorService : ElderlyCareAppService
    {
        private readonly INotificationPublisher _notificationPublisher;
        private readonly NurseWorkstationNotifier _nurseNotifier;

        public VitalSignMonitorService(
            INotificationPublisher notificationPublisher,
            NurseWorkstationNotifier nurseNotifier)
        {
            _notificationPublisher = notificationPublisher;
            _nurseNotifier = nurseNotifier;
        }

        public async Task ProcessVitalSignAsync(VitalSignInput input)
        {
            // 心率检查
            if (input.HeartRate > 120 || input.HeartRate < 50)
            {
                var level = input.HeartRate > 140 || input.HeartRate < 40
                    ? "严重" : "警告";

                await PublishAlertAsync(input, "心率",
                    $"{input.HeartRate}次/分", "50-120次/分", level);
            }

            // 血氧检查
            if (input.BloodOxygen < 90)
            {
                var level = input.BloodOxygen < 85 ? "严重" : "警告";
                await PublishAlertAsync(input, "血氧饱和度",
                    $"{input.BloodOxygen}%", "90%以上", level);
            }

            // 体温检查
            if (input.Temperature > 38.5m || input.Temperature < 35.0m)
            {
                await PublishAlertAsync(input, "体温",
                    $"{input.Temperature}℃", "35.0-38.5℃", "警告");
            }

            // 严重异常额外推送到护士大屏
            if (input.BloodOxygen < 85 || input.HeartRate > 140)
            {
                await _nurseNotifier.PushAlertToNurseStationAsync(
                    CurrentTenant.Id.Value, new VitalSignAlertNotificationData
                    {
                        ElderName = input.ElderName,
                        ElderRoom = input.RoomNumber,
                        SignType = input.BloodOxygen < 85 ? "血氧" : "心率",
                        CurrentValue = input.BloodOxygen < 85
                            ? $"{input.BloodOxygen}%"
                            : $"{input.HeartRate}次/分",
                        AlertLevel = "严重"
                    });
            }
        }

        private async Task PublishAlertAsync(
            VitalSignInput input, string signType,
            string currentValue, string threshold, string alertLevel)
        {
            var severity = alertLevel == "严重"
                ? NotificationSeverity.Error
                : NotificationSeverity.Warning;

            await _notificationPublisher.PublishAsync(
                "VitalSign.Alert",
                new VitalSignAlertNotificationData
                {
                    ElderName = input.ElderName,
                    ElderRoom = input.RoomNumber,
                    SignType = signType,
                    CurrentValue = currentValue,
                    Threshold = threshold,
                    AlertLevel = alertLevel
                },
                notificationSeverity: severity,
                tenantId: CurrentTenant.Id);
        }
    }
}
```

### 7.3 护士工作站推送器

```csharp
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Volo.Abp.DependencyInjection;

namespace ElderlyCare.Notification
{
    public class NurseWorkstationNotifier : ITransientDependency
    {
        private readonly IHubContext<NotificationHub> _hubContext;

        public NurseWorkstationNotifier(
            IHubContext<NotificationHub> hubContext)
        {
            _hubContext = hubContext;
        }

        public async Task PushAlertToNurseStationAsync(
            Guid tenantId, VitalSignAlertNotificationData alert)
        {
            var groupName = $"Tenant_{tenantId}_Role_Nurse";

            var payload = new
            {
                AlertId = Guid.NewGuid(),
                Time = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                ElderName = alert.ElderName,
                Room = alert.ElderRoom,
                SignType = alert.SignType,
                CurrentValue = alert.CurrentValue,
                AlertLevel = alert.AlertLevel,
                Message = $"【{alert.AlertLevel}】{alert.ElderRoom} " +
                          $"{alert.ElderName} {alert.SignType}异常: " +
                          $"当前{alert.CurrentValue}"
            };

            await _hubContext.Clients.Group(groupName)
                .SendAsync("ReceiveVitalSignAlert", payload);
        }
    }
}
```

### 7.4 前端大屏接收（JavaScript）

```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/notification?access_token=" + getToken())
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .build();

// 监听体征告警
connection.on("ReceiveVitalSignAlert", function (alert) {
    showAlertOnScreen(alert);         // 大屏显示告警
    if (alert.AlertLevel === "严重") {
        playAlarmSound();             // 严重告警播放声音
    }
});

// 启动连接，断开自动重连
async function start() {
    try {
        await connection.start();
        console.log("已连接到通知中心");
    } catch (err) {
        setTimeout(start, 5000);
    }
}
connection.onclose(async () => await start());
start();
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | WebSocket 连接不验证身份 | QueryString 传递 JWT Token，Hub 中验证 | 未授权用户可连接 Hub 接收敏感推送 |
| 2 | 推送消息不含租户信息 | 按 TenantId 分组推送（`Clients.Group("Tenant_X")`） | 多租户场景下 A 院护士收到 B 院的告警 |
| 3 | 频繁推送无节流 | 设置推送频率限制（如同一体征 5 分钟内只推一次） | 每秒推送导致前端弹窗轰炸，用户体验极差 |
| 4 | SignalR 不处理断线重连 | 前端配置 `withAutomaticReconnect()` | 网络抖动后连接断开，护士大屏收不到后续告警 |
| 5 | 大量消息不压缩 | 关键消息精简，非关键消息合并批量推送 | WebSocket 带宽有限，大量消息导致延迟 |
| 6 | 不记录推送日志 | 每次推送记录（时间/目标/内容/结果） | 推送失败无法追溯，出了事故不知道通知到没有 |
| 7 | Hub 方法中写业务逻辑 | Hub 只负责连接管理，业务逻辑在 AppService 中 | Hub 是单例，业务逻辑放里面会引发并发问题 |
| 8 | 不配置 CORS | SignalR 跨域需要单独配置 CORS 策略 | 前端连接 Hub 时被 CORS 拦截 |

---

## 本章小结

| 概念 | 要点 |
|------|------|
| WebSocket | 全双工通信，服务器可主动推送，比 HTTP 轮询高效得多 |
| SignalR Hub | 封装 WebSocket 的高级框架，支持 RPC、分组、自动降级 |
| ABP 通知 | INotificationPublisher 发布，SignalRRealTimeNotifier 自动推送 |
| JWT 传递 | 通过 QueryString 传递，服务器端从 QueryString 读取并验证 |
| 分组管理 | 按租户隔离、按角色筛选，确保消息精准投递 |

核心要点：通过 SignalR，异常体征秒级推送到护士工作站，比 HTTP 轮询快 10 倍以上，节省 99% 无效请求。ABP 的通知系统与 SignalR 深度集成，几行代码实现完整推送链路。


---

## 面试题

### 面试题 1（初级 / 概念题）
**题目**：HTTP 和 WebSocket 有什么区别？

**参考答案**：HTTP 是单向请求-响应模式，客户端发请求、服务端返回响应，服务端不能主动推送。WebSocket 是双向通信，建立连接后双方可以随时互发消息。养老院场景：HTTP 适合查询长者信息（请求→响应），WebSocket 适合体征告警推送（服务端主动推送到护士大屏）。HTTP 轮询每 5 秒查一次浪费资源，WebSocket 秒级推送零延迟。

### 面试题 2（初级 / 概念题）
**题目**：SignalR 的 Hub 是什么？生命周期方法有哪些？

**参考答案**：Hub 是 SignalR 的服务端核心类，客户端通过 WebSocket 连接到 Hub，调用 Hub 方法或接收推送。`OnConnectedAsync` 在客户端连接时触发（可记录在线用户），`OnDisconnectedAsync` 在断开时触发（可清理资源）。养老院场景：护士打开大屏时触发 `OnConnectedAsync`，将其加入"护士"分组；关闭页面时触发 `OnDisconnectedAsync`，移出分组。

### 面试题 3（中级 / 概念题）
**题目**：SignalR 如何实现分组推送？

**参考答案**：通过 `Groups.AddToGroupAsync(connectionId, groupName)` 将连接加入分组，推送时用 `Clients.Group("groupName").SendAsync(...)` 只发给组内成员。养老院场景：按养老院分组（`Tenant_阳光院`），按角色分组（`Tenant_阳光院_Role_Nurse`），按楼层分组（`Floor_3`）。长者体征异常时只推送到对应楼层的护士组。

### 面试题 4（中级 / 场景题）
**题目**：多租户场景下 SignalR 如何保证消息隔离？

**参考答案**：连接时根据 JWT Token 中的 TenantId 自动加入对应租户分组（如 `Tenant_{tenantId}`）。推送时只发到对应租户的分组。管理员可加入 `Host` 分组接收所有租户的消息。养老院场景：阳光养老院的告警只推给阳光院的护士，幸福养老院的护士收不到。ABP 的 `INotificationPublisher` 会自动根据当前租户分发。

### 面试题 5（初级 / 概念题）
**题目**：JWT Token 如何在 WebSocket 连接中传递？

**参考答案**：WebSocket 握手阶段无法自定义 Header，所以 Token 通过 QueryString 传递：`/hubs/notification?access_token=xxx`。服务端在 `OnMessageReceived` 回调中从查询参数读取 Token 并验证。养老院场景：护士打开大屏页面时，前端 JS 连接 `/hubs/vital-sign?access_token=xxx`，服务端验证 Token 后允许连接。

### 面试题 6（高级 / 场景题）
**题目**：如何防止 SignalR 推送风暴（同一告警反复推送）？

**参考答案**：① 频率限制：同一体征指标在 5 分钟内只推一次（用 ConcurrentDictionary 记录上次推送时间）；② 告警升级：第一次推送"警告"，持续未处理升级为"紧急"；③ 合并推送：多个体征异常合并为一条消息。养老院场景：长者心率持续偏高，5 分钟内只推一次"心率警告"，10 分钟未处理升级为"紧急告警"。

### 面试题 7（中级 / 概念题）
**题目**：ABP 的通知系统如何与 SignalR 集成？

**参考答案**：ABP 提供 `INotificationPublisher` 发布通知，内部通过 `RealTimeNotifier` 调用 SignalR 的 `IHubContext` 推送到客户端。开发者只需定义通知类型（继承 `NotificationData`）、发布通知（`_notificationPublisher.PublishAsync`），ABP 自动处理 SignalR 推送。养老院场景：体征异常时发布 `VitalSignAlertNotification`，ABP 自动推送到护士大屏。

### 面试题 8（初级 / 概念题）
**题目**：SignalR 断线重连怎么处理？

**参考答案**：前端配置 `withAutomaticReconnect()` 自动重连（默认间隔 0/2/10/30 秒）。重连后需要重新加入分组（因为新连接的 connectionId 不同）。服务端在 `OnReconnected` 中处理。养老院场景：护士大屏网络抖动断开后自动重连，前端在 `onreconnected` 回调中重新订阅楼层分组，确保告警不丢失。

### 面试题 9（高级 / 设计题）
**题目**：如何设计养老院系统的实时告警推送架构？

**参考答案**：三层架构：① 体征监测服务（后台 Worker）定期检查传感器数据，超过阈值时调用 `INotificationPublisher` 发布告警；② ABP 通知系统根据当前租户和角色确定推送目标；③ SignalR Hub 按分组推送到护士大屏、手机 App。告警分级：黄色（Warning）= 需关注，红色（Emergency）= 立即处理。推送记录写入数据库，支持事后追溯。

### 面试题 10（中级 / 概念题）
**题目**：SignalR 的传输方式有哪些？

**参考答案**：三种传输方式按优先级自动降级：① **WebSocket**（全双工，最优）；② **Server-Sent Events**（服务端单向推送，次选）；③ **Long Polling**（长轮询，兜底）。SignalR 自动协商：先尝试 WebSocket，不支持则降级。现代浏览器都支持 WebSocket，通常不会降级。养老院系统的护士大屏用现代浏览器，始终走 WebSocket。

### 面试题 11（高级 / 场景题）
**题目**：如何在 SignalR 中实现按楼层推送？

**参考答案**：护士登录后，前端调用 Hub 方法 `JoinFloorGroup(floorId)`，服务端将其连接加入对应楼层分组。体征异常时根据长者所在楼层推送到对应分组。护士换楼层时调用 `LeaveFloorGroup(oldFloorId)` + `JoinFloorGroup(newFloorId)`。养老院场景：3 楼长者心率异常，只推送到 3 楼护士站大屏。

### 面试题 12（高级 / 设计题）
**题目**：如何保证 SignalR 推送消息的可靠性（不丢失）？

**参考答案**：① 客户端 ACK 确认：推送后等待客户端回复确认，未确认则重发；② 消息持久化：推送记录写入数据库，客户端重连后拉取未读消息；③ 断线重连 + 状态同步：重连后客户端调用 Hub 方法获取最新状态。养老院场景：护士大屏断线 1 分钟后重连，自动拉取这 1 分钟内的未读告警，确保告警不丢失。

---

## 下一章预告

**第 19 章：微服务架构与 API 网关**

养老院系统规模扩大后，单体架构难以应对。下一章将学习：
- 单体 vs 微服务（什么时候该拆？什么时候不该拆？）
- Ocelot 网关配置（路由转发/负载均衡/限流/聚合路由）
- Polly 熔断重试超时策略（下游服务挂了怎么办？）
- 限流算法（令牌桶/漏桶/滑动窗口/固定窗口区别 — 面试常问）

---

## 时效性声明

本章内容基于 **ASP.NET Core 5.0 SignalR**、**ABP Framework 4.4.0** 编写。SignalR 的核心 API（Hub/HubContext/IHubContext）在 .NET 各版本中保持稳定。在 .NET 6+ 中可使用 `IHubContext<THub, T>` 强类型 Hub 上下文。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：WebSocket 原理、Hub 设计、ABP 通知集成、JWT 传递、分组管理、体征告警实战 |
| 2026-07-10 | v1.1 | 补全常见错误表、面试题（12题）、下一章预告、时效性声明、修订记录 |
| 2026-07-10 | v1.2 | 本章小结移到常见错误表之后（正确顺序：错误表→小结→面试题） |
