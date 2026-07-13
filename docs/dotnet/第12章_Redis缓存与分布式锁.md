# 第 12 章：Redis 缓存与分布式锁

## 学习目标

- 理解缓存在养老院系统中的核心价值，掌握 Redis 五种数据结构及应用场景
- 深入理解 Redis 为什么快（面试高频），能够条理清晰地回答
- 掌握 ABP 分布式缓存 API，实现 Cache-Aside 等缓存策略
- 彻底搞清缓存穿透、击穿、雪崩三大问题及解决方案（面试必考）
- 掌握 Redis 持久化 RDB/AOF/混合模式、8 种淘汰策略、集群模式（面试必考）
- 能够用 Redis 实现分布式锁，防止养老院重复入住等并发问题
- 完成实战：缓存长者基本信息 + 分布式锁防止重复入住

## 前置知识

- 第04章：ABP 框架深度解析（依赖注入、模块系统）
- 第06章：EFCore 进阶与数据库设计
- 第08章：应用服务与 DTO 设计

## 为什么需要学这个？

Redis 是 .NET 后端面试的"必考题库"。从"Redis 为什么快"到"缓存穿透怎么解决"，再到"分布式锁怎么实现"，几乎每场面试都会涉及。更重要的是，在真实的企业级项目中，缓存是提升系统性能最直接、最有效的手段。养老院系统中，长者信息、房间状态、排班表这些频繁读取的数据，如果不加缓存，每次都去数据库查，就像每次都去档案室翻资料——慢且不必要。

---

## 1. 为什么需要缓存

### 1.1 生活类比：养老院的前台与档案室

想象养老院的日常场景：护工需要频繁查看长者的健康档案——过敏史、用药记录、护理等级。如果每次都跑到三楼档案室翻找纸质档案，来回要花 10 分钟。但如果前台有一份"常用信息速查卡"，护工 10 秒就能查到。

```
档案室（数据库）  →  慢，容量大，数据完整
前台速查卡（缓存） →  快，容量小，常用数据副本
```

这就是缓存的本质：**用空间换时间，把热点数据放在离请求更近的地方**。

### 1.2 缓存在架构中的位置

```
客户端请求 → 应用服务器 → 【缓存层 Redis】 → 数据库
                        ↑ 命中则直接返回
                        ↓ 未命中才查数据库
```

养老院系统中适合缓存的数据：长者基本信息（极高频读、低频变）、房间/床位状态（高频读、中频变）、护理排班表（高频读、低频变）。不适合缓存：操作日志（只写不读）。

---

## 2. Redis 五种数据结构与养老院场景

### 2.1 String — 字符串（最基础）

存储单个长者的基本信息 JSON，也可做计数器和分布式锁。

```csharp
var db = redis.GetDatabase();
await db.StringSetAsync("elder:1001", JsonSerializer.Serialize(elderDto), TimeSpan.FromMinutes(30));
var json = await db.StringGetAsync("elder:1001");
```

### 2.2 Hash — 哈希表（字段级操作）

存储长者健康指标，可以单独更新某一项而不覆盖整体。

```csharp
await db.HashSetAsync("elder:1001:health", new[]
{
    new HashEntry("blood_pressure", "130/85"),
    new HashEntry("heart_rate", 72)
});
// 只更新血糖，不影响其他字段
await db.HashSetAsync("elder:1001:health", "blood_sugar", 5.8);
```

### 2.3 List — 双向链表

长者用药记录时间线，从左侧推入最新记录。

```csharp
await db.ListLeftPushAsync("elder:1001:medicines", JsonSerializer.Serialize(record));
var recent = await db.ListRangeAsync("elder:1001:medicines", 0, 9);
```

### 2.4 Set — 无序集合（自动去重）

记录今天所有已服药的长者编号，自动去重。

```csharp
await db.SetAddAsync("today_medicated", elderId);
bool hasTaken = await db.SetContainsAsync("today_medicated", elderId);
```

### 2.5 ZSet — 有序集合（带分数排序）

长者健康风险评分排行榜，分数越高越需要关注。

```csharp
await db.SortedSetAddAsync("elder:risk_score", new[]
{
    new SortedSetEntry("1001", 95),
    new SortedSetEntry("1002", 80)
});
var topRisk = await db.SortedSetRangeByRankWithScoresAsync(
    "elder:risk_score", 0, 2, Order.Descending);
```

**数据结构速查表**：

| 结构 | 养老院场景 | 底层实现 | 核心操作 |
|------|-----------|---------|---------|
| String | 长者信息缓存 | SDS | GET/SET |
| Hash | 健康指标局部更新 | ziplist/hashtable | HSET/HGET |
| List | 用药记录时间线 | quicklist | LPUSH/LRANGE |
| Set | 已服药去重统计 | intset/hashtable | SADD/SISMEMBER |
| ZSet | 风险评分排行 | skiplist | ZADD/ZREVRANGE |

---

## 3. Redis 为什么快？（面试必考）

这是面试中最高频的 Redis 问题。完整答案包含四点：

### 3.1 单线程模型

Redis 核心命令执行是单线程的，避免了多线程的锁竞争和上下文切换开销。命令顺序执行，无锁竞争。

### 3.2 IO 多路复用

Redis 使用 epoll/kqueue 实现 IO 多路复用，一个线程同时监听上万个连接的读写事件。

**养老院类比**：前台只有一位工作人员（单线程），但她在等档案室回传数据时，可以同时接听其他护工的电话（IO 多路复用），而不是傻等。

> 注意：Redis 6.0 引入了多线程 IO（处理网络读写），但命令执行仍然是单线程。

### 3.3 纯内存操作

数据全部存储在内存中，读写速度是纳秒级，比磁盘（毫秒级）快 10 万倍。

### 3.4 高效的数据结构

Redis 针对不同场景设计了专门的数据结构：SDS（简单动态字符串）、quicklist（压缩列表+链表）、skiplist（跳表，支持 O(logN) 范围查询）。

**面试回答模板**：

> Redis 快的原因有四点：第一，单线程模型避免了锁竞争和上下文切换；第二，IO 多路复用让单线程能同时处理大量连接；第三，数据全部在内存中操作，读写纳秒级；第四，底层使用了 SDS、跳表、压缩列表等高效数据结构。

---

## 4. ABP IDistributedCache 泛型缓存使用

### 4.1 安装与配置

```bash
dotnet add package Volo.Abp.Caching.StackExchangeRedis
```

```csharp
[DependsOn(typeof(AbpCachingStackExchangeRedisModule))]
public class ElderlyHomeHttpApiHostModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<RedisCacheOptions>(options =>
        {
            options.Configuration = "localhost:6379,password=yourpassword";
            options.InstanceName = "ElderlyHome:";
        });
    }
}
```

### 4.2 基本用法

```csharp
public class ElderAppService : ApplicationService, IElderAppService
{
    private readonly IRepository<Elder, Guid> _repository;
    private readonly IDistributedCache<ElderDto> _cache;

    public ElderAppService(
        IRepository<Elder, Guid> repository,
        IDistributedCache<ElderDto> cache)
    {
        _repository = repository;
        _cache = cache;
    }

    public async Task<ElderDto> GetAsync(Guid id)
    {
        return await _cache.GetOrAddAsync(
            $"Elder:{id}",
            async () =>
            {
                var elder = await _repository.GetAsync(id);
                return ObjectMapper.Map<Elder, ElderDto>(elder);
            },
            () => new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });
    }

    public async Task UpdateAsync(Guid id, UpdateElderDto input)
    {
        var elder = await _repository.GetAsync(id);
        ObjectMapper.Map(input, elder);
        await _repository.UpdateAsync(elder);
        await _cache.RemoveAsync($"Elder:{id}");
    }
}
```

`GetOrAddAsync` 是 ABP 提供的便捷方法：缓存命中直接返回，未命中则执行委托加载并写入缓存。

---

## 5. 缓存策略

### 5.1 Cache-Aside（旁路缓存）— 最常用

```
读：先查缓存 → 命中返回 → 未命中查数据库 → 写入缓存 → 返回
写：更新数据库 → 删除缓存
```

优点：实现简单，缓存只存热点数据。缺点：首次请求必然穿透到数据库。

### 5.2 Read-Through（读穿透）

缓存层自己负责加载数据，业务代码只和缓存交互，不直接访问数据库。`GetOrAddAsync` 本质上就是 Read-Through 模式。

### 5.3 Write-Behind（异步写回）

写操作只更新缓存，由后台线程异步批量写入数据库。写入性能极高，但数据可能丢失。适合养老院实时健康监控数据上报。

### 5.4 策略对比

| 策略 | 数据一致性 | 读性能 | 写性能 | 复杂度 | 适用场景 |
|------|-----------|--------|--------|--------|---------|
| Cache-Aside | 高 | 高 | 中 | 低 | 通用（推荐默认） |
| Read-Through | 高 | 高 | 中 | 中 | 业务代码简洁化 |
| Write-Behind | 低 | 极高 | 极高 | 高 | 高并发写入 |

---

## 6. 缓存三大问题（面试必考）

### 6.1 缓存穿透 — 查不存在的数据

**问题**：请求的数据在缓存和数据库中都不存在，每次请求都穿透缓存直接打到数据库。

**养老院场景**：有人用不存在的长者 ID（如 `elder:99999`）反复查询，缓存永远查不到，每次都去数据库查。

**解决方案一：缓存空值**

```csharp
var elder = await _repository.FindAsync(id);
if (elder == null)
{
    // 缓存空值，过期时间短一些
    await _cache.SetAsync(cacheKey, (ElderDto?)null,
        new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
        });
    return null;
}
```

**解决方案二：布隆过滤器**

在缓存前加一层布隆过滤器，快速判断 Key 是否可能存在。不存在则直接拒绝请求。布隆过滤器可能误判（false positive），但绝不会漏判。

### 6.2 缓存击穿 — 热点 Key 突然过期

**问题**：热点 Key（如全院长者统计报表）过期瞬间，大量并发请求同时穿透到数据库。

**解决方案一：互斥锁（分布式锁）**

```csharp
var lockKey = "Lock:Schedule:Today";
var acquired = await db.LockTakeAsync(lockKey, "1", TimeSpan.FromSeconds(10));
if (acquired)
{
    try
    {
        // 双重检查缓存
        cached = await _cache.GetAsync(cacheKey);
        if (cached != null) return cached;
        // 从数据库加载并写缓存...
    }
    finally
    {
        await db.LockReleaseAsync(lockKey, "1");
    }
}
```

**解决方案二：逻辑过期** — 不在缓存上设置 TTL，而是在 Value 中存储逻辑过期时间。发现过期时异步刷新，当前请求返回旧数据。

### 6.3 缓存雪崩 — 大量 Key 同时过期

**问题**：大批缓存 Key 在同一时间过期，大量请求瞬间涌向数据库。

**解决方案一：过期时间加随机值**

```csharp
var baseExpiry = TimeSpan.FromMinutes(30);
var randomExtra = TimeSpan.FromSeconds(Random.Shared.Next(0, 600));
var options = new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = baseExpiry + randomExtra
};
```

**解决方案二：多级缓存** — L1 本地内存（IMemoryCache）+ L2 Redis，即使 Redis 全部过期，本地缓存还能挡一层。

**解决方案三：熔断降级** — 使用 Polly 熔断器，数据库压力过大时返回默认值。

---

## 7. Redis 持久化（面试必考）

Redis 数据在内存中，不做持久化重启后数据全丢。

### 7.1 RDB（快照）

定时将内存全部数据生成快照写入 `.rdb` 文件。如果 T2-T3 之间崩溃，T2 之后的数据丢失。

触发条件：`save 900 1`（900秒内1次写入）、`save 300 10`、`save 60 10000`。

优点：文件紧凑、恢复快。缺点：可能丢几分钟数据。

### 7.2 AOF（追加日志）

将每条写命令追加到日志文件。同步策略：`always`（最安全最慢）、`everysec`（推荐，最多丢1秒）、`no`（最快不安全）。

优点：数据安全性高。缺点：文件体积大，恢复慢。

### 7.3 混合持久化（Redis 4.0+）

AOF 重写时前半段用 RDB 格式，后半段用 AOF 格式。兼顾快速恢复和数据安全。

### 7.4 对比总结

| 特性 | RDB | AOF | 混合 |
|------|-----|-----|------|
| 数据安全性 | 可能丢几分钟 | 最多丢 1 秒 | 最多丢 1 秒 |
| 文件大小 | 小 | 大 | 中 |
| 恢复速度 | 快 | 慢 | 较快 |
| 推荐场景 | 冷备份 | 高安全要求 | 生产首选 |

**养老院建议**：开启混合持久化，AOF 同步策略 `everysec`。

---

## 8. Redis 淘汰策略（面试必考）

当内存达到 `maxmemory` 上限时，Redis 淘汰 Key 腾出空间。共 8 种策略：

| 策略 | 范围 | 算法 | 说明 |
|------|------|------|------|
| `noeviction` | — | — | 不淘汰，写入报错（默认） |
| `allkeys-lru` | 所有Key | LRU | 淘汰最近最少使用 |
| `volatile-lru` | 有过期时间 | LRU | 淘汰有TTL且最近最少使用 |
| `allkeys-random` | 所有Key | 随机 | 随机淘汰 |
| `volatile-random` | 有过期时间 | 随机 | 随机淘汰有TTL的 |
| `allkeys-lfu` | 所有Key | LFU | 淘汰使用频率最低 |
| `volatile-lfu` | 有过期时间 | LFU | 淘汰有TTL且频率最低 |
| `volatile-ttl` | 有过期时间 | TTL | 淘汰最快过期的 |

**LRU vs LFU**：LRU 关注"时间"（最近一次访问），LFU 关注"频率"（总共被访问次数）。一个 Key 1 小时前被访问 1000 次之后再没访问：LRU 可能淘汰它，LFU 不会。

**养老院建议**：`allkeys-lru`，自然淘汰冷数据，符合热点数据特性。

---

## 9. Redis 集群模式概览

### 9.1 主从复制（Replication）

主节点负责读写，从节点只读并同步主节点数据。主节点挂了需手动切换。

### 9.2 哨兵模式（Sentinel）

在主从复制基础上增加哨兵进程，自动监控主节点存活状态，主节点挂了自动选举新主节点（自动故障转移）。养老院生产环境推荐方案。

### 9.3 Cluster 分片模式

数据分片存储到多个节点（16384 个槽位），每个节点负责一部分。支持水平扩展，不支持跨槽多 Key 操作。适合大规模部署。

| 特性 | 主从复制 | 哨兵 | Cluster |
|------|---------|------|---------|
| 高可用 | ❌ 手动 | ✅ 自动 | ✅ 自动 |
| 水平扩展 | ❌ | ❌ | ✅ |
| 养老院推荐 | 开发环境 | 生产（中小规模） | 大规模 |

---

## 10. 分布式锁原理与实现

### 10.1 为什么需要分布式锁

养老院部署多台服务器，两个护工同时为同一长者办理入住，没有锁就会重复入住。单机 `lock` 只对当前进程有效，分布式环境需要分布式锁。

### 10.2 Redis SETNX 实现

```csharp
public class RedisDistributedLock : ITransientDependency
{
    private readonly IDatabase _database;

    public RedisDistributedLock(IConnectionMultiplexer redis)
    {
        _database = redis.GetDatabase();
    }

    public async Task<string?> TryAcquireAsync(string lockKey, TimeSpan expiry)
    {
        var lockValue = Guid.NewGuid().ToString();
        var acquired = await _database.StringSetAsync(lockKey, lockValue, expiry, When.NotExists);
        return acquired ? lockValue : null;
    }

    public async Task<bool> ReleaseAsync(string lockKey, string lockValue)
    {
        var script = @"
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end";
        var result = await _database.ScriptEvaluateAsync(script,
            new RedisKey[] { lockKey },
            new RedisValue[] { lockValue });
        return (int)result == 1;
    }
}
```

**关键点**：`SET key value NX EX` 原子操作；value 用唯一标识防误删；Lua 脚本保证释放原子性。

### 10.3 结合 Polly 重试

```csharp
var retryPolicy = Policy
    .HandleResult<bool>(r => !r)
    .WaitAndRetryAsync(3, attempt => TimeSpan.FromMilliseconds(200 * attempt));

var acquired = await retryPolicy.ExecuteAsync(() =>
    distributedLock.TryAcquireAsync(lockKey, TimeSpan.FromSeconds(30)));
```

### 10.4 Redlock 算法概念

单节点锁可能因主从切换丢失。Redlock 向 N 个独立节点请求加锁，多数节点（N/2+1）成功即加锁成功。实际生产中单节点+合理过期时间已足够，养老院系统使用单节点方案即可。

---

## 11. 缓存 Key 设计规范

### 11.1 命名规范

```
{业务}:{模块}:{对象}:{标识}
```

```csharp
public static class CacheKeys
{
    private const string Prefix = "ElderlyHome:";

    public static string ElderInfo(Guid id) => $"{Prefix}Elder:Info:{id}";
    public static string RoomStatus(Guid roomId) => $"{Prefix}Room:Status:{roomId}";
    public static string TodaySchedule => $"{Prefix}Schedule:Today";
    public static string CheckInLock(Guid elderId) => $"{Prefix}Lock:CheckIn:{elderId}";
}
```

### 11.2 过期时间策略

| 数据类型 | 过期时间 | 原因 |
|---------|---------|------|
| 长者基本信息 | 30 分钟 | 变更不频繁 |
| 房间状态 | 5 分钟 | 变化较频繁 |
| 排班表 | 1 小时 | 一天更新一次 |
| 验证码 | 5 分钟 | 时效性要求高 |

---

## 12. DataProtection 密钥 Redis 持久化

ASP.NET Core DataProtection 默认将密钥存储在本地文件系统。多实例部署时每个实例有各自密钥，导致实例 A 加密的 Cookie，实例 B 无法解密。

```bash
dotnet add package Microsoft.AspNetCore.DataProtection.StackExchangeRedis
```

```csharp
var redis = ConnectionMultiplexer.Connect("localhost:6379");
context.Services.AddDataProtection()
    .PersistKeysToStackExchangeRedis(redis, "ElderlyHome:DataProtection:Keys")
    .SetApplicationName("ElderlyHome");
```

所有实例共享同一个 Redis 中的密钥环，加密解密使用相同密钥。

---

## 13. 实战：缓存长者基本信息 + 分布式锁防止重复入住

### 13.1 分布式锁服务

```csharp
public interface IDistributedLockService
{
    Task<string?> TryAcquireAsync(string lockKey, TimeSpan expiry);
    Task<bool> ReleaseAsync(string lockKey, string lockValue);
}

public class RedisDistributedLockService : IDistributedLockService, ITransientDependency
{
    private readonly IConnectionMultiplexer _redis;

    public RedisDistributedLockService(IConnectionMultiplexer redis)
    {
        _redis = redis;
    }

    public async Task<string?> TryAcquireAsync(string lockKey, TimeSpan expiry)
    {
        var db = _redis.GetDatabase();
        var lockValue = Guid.NewGuid().ToString();
        var acquired = await db.StringSetAsync(lockKey, lockValue, expiry, When.NotExists);
        return acquired ? lockValue : null;
    }

    public async Task<bool> ReleaseAsync(string lockKey, string lockValue)
    {
        var db = _redis.GetDatabase();
        const string script = @"
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end";
        var result = await db.ScriptEvaluateAsync(script,
            new RedisKey[] { lockKey },
            new RedisValue[] { lockValue });
        return (int)result == 1;
    }
}
```

### 13.2 长者应用服务（完整实现）

```csharp
public class ElderAppService : ApplicationService, IElderAppService
{
    private readonly IRepository<Elder, Guid> _repository;
    private readonly IDistributedCache<ElderDto> _cache;
    private readonly IDistributedLockService _lockService;
    private readonly AsyncRetryPolicy _retryPolicy;

    public ElderAppService(
        IRepository<Elder, Guid> repository,
        IDistributedCache<ElderDto> cache,
        IDistributedLockService lockService)
    {
        _repository = repository;
        _cache = cache;
        _lockService = lockService;

        _retryPolicy = Policy
            .Handle<CheckInConcurrencyException>()
            .WaitAndRetryAsync(3, attempt => TimeSpan.FromMilliseconds(200 * attempt));
    }

    /// <summary>
    /// 获取长者信息（带缓存，Cache-Aside 策略）
    /// </summary>
    public async Task<ElderDto> GetAsync(Guid id)
    {
        var cacheKey = CacheKeys.ElderInfo(id);
        return await _cache.GetOrAddAsync(cacheKey, async () =>
        {
            var elder = await _repository.GetAsync(id);
            return ObjectMapper.Map<Elder, ElderDto>(elder);
        }, () => new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
        });
    }

    /// <summary>
    /// 更新长者信息（更新后清除缓存）
    /// </summary>
    public async Task UpdateAsync(Guid id, UpdateElderDto input)
    {
        var elder = await _repository.GetAsync(id);
        ObjectMapper.Map(input, elder);
        await _repository.UpdateAsync(elder);
        await _cache.RemoveAsync(CacheKeys.ElderInfo(id));
    }

    /// <summary>
    /// 长者入住（分布式锁防止重复入住 + Polly 重试）
    /// </summary>
    public async Task<CheckInResultDto> CheckInAsync(CreateCheckInDto input)
    {
        var lockKey = CacheKeys.CheckInLock(input.ElderId);
        var lockExpiry = TimeSpan.FromSeconds(30);

        return await _retryPolicy.ExecuteAsync(async () =>
        {
            var lockValue = await _lockService.TryAcquireAsync(lockKey, lockExpiry);
            if (lockValue == null)
            {
                throw new CheckInConcurrencyException(input.ElderId);
            }

            try
            {
                // 双重检查：是否已入住
                var existing = await _repository.FindAsync(e => e.Id == input.ElderId);
                if (existing?.Status == ElderStatus.CheckedIn)
                {
                    throw new ElderAlreadyCheckedInException(input.ElderId);
                }

                var elder = new Elder
                {
                    Id = input.ElderId,
                    Name = input.Name,
                    Age = input.Age,
                    RoomId = input.RoomId,
                    CareLevel = input.CareLevel,
                    Status = ElderStatus.CheckedIn,
                    CheckInTime = Clock.Now
                };
                await _repository.InsertAsync(elder);

                // 缓存新入住的长者信息
                var dto = ObjectMapper.Map<Elder, ElderDto>(elder);
                await _cache.SetAsync(CacheKeys.ElderInfo(elder.Id), dto,
                    new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });

                return new CheckInResultDto
                {
                    Success = true,
                    ElderId = elder.Id,
                    Message = $"长者 {elder.Name} 入住成功"
                };
            }
            finally
            {
                await _lockService.ReleaseAsync(lockKey, lockValue);
            }
        });
    }
}
```

### 13.3 自定义异常

```csharp
public class CheckInConcurrencyException : BusinessException
{
    public CheckInConcurrencyException(Guid elderId)
        : base("ElderlyHome:CheckInConcurrency",
            $"长者 {elderId} 正在办理入住，请稍后重试") { }
}

public class ElderAlreadyCheckedInException : BusinessException
{
    public ElderAlreadyCheckedInException(Guid elderId)
        : base("ElderlyHome:AlreadyCheckedIn",
            $"长者 {elderId} 已经入住，不能重复办理") { }
}
```

### 13.4 模块完整配置

```csharp
[DependsOn(typeof(AbpCachingStackExchangeRedisModule))]
public class ElderlyHomeHttpApiHostModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        var configuration = context.Services.GetConfiguration();

        Configure<RedisCacheOptions>(options =>
        {
            options.Configuration = configuration["Redis:Configuration"];
            options.InstanceName = configuration["Redis:InstanceName"];
        });

        // 注册 IConnectionMultiplexer（分布式锁需要）
        context.Services.AddSingleton<IConnectionMultiplexer>(sp =>
        {
            var config = ConfigurationOptions.Parse(configuration["Redis:Configuration"]);
            config.AbortOnConnectFail = false;
            return ConnectionMultiplexer.Connect(config);
        });

        // DataProtection 密钥持久化到 Redis
        var redis = ConnectionMultiplexer.Connect(configuration["Redis:Configuration"]);
        context.Services.AddDataProtection()
            .PersistKeysToStackExchangeRedis(redis, "ElderlyHome:DataProtection:Keys")
            .SetApplicationName("ElderlyHome");
    }
}
```

### 13.5 执行流程

```
长者查询流程：
请求 → 查 Redis 缓存 → 命中 → 返回
                   → 未命中 → 查数据库 → 写入缓存 → 返回

长者入住流程：
请求 → 获取分布式锁 → 获取失败 → Polly 重试（最多3次）
                   → 获取成功 → 检查是否已入住
                              → 已入住 → 抛异常
                              → 未入住 → 写入数据库 → 更新缓存 → 释放锁 → 返回
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | 缓存不设过期时间 | 所有缓存 key 都设 TTL | 不设过期会导致内存持续增长，最终 OOM |
| 2 | 缓存穿透不处理 | 对不存在的 key 缓存空值（TTL 30s） | 每次请求都穿透到数据库，缓存形同虚设 |
| 3 | 用 `DEL` 命令做分布式锁 | 用 Lua 脚本原子释放（先 GET 再 DEL） | 可能误删其他线程的锁 |
| 4 | 热点 key 不做特殊处理 | 热点 key 加互斥锁或逻辑过期 | 热点 key 过期瞬间大量请求穿透到数据库 |
| 5 | 所有数据都往 Redis 塞 | 只缓存高频访问、变化不频繁的数据 | Redis 内存昂贵，冷数据浪费资源 |
| 6 | 生产环境用 noeviction | 配置 allkeys-lru 或 volatile-lru | 内存满时拒绝写入，导致业务报错 |
| 7 | 分布式锁不设超时 | SETNX 加 PX 过期时间（如 10s） | 持有锁的线程崩溃后锁永远不释放，死锁 |
| 8 | 缓存和数据库双写不一致 | 用 Cache-Aside 模式（先删缓存再更新DB） | 先更新 DB 再更新缓存可能导致脏数据覆盖 |

---

## 本章小结

| 知识点 | 核心要点 | 面试频率 |
|--------|---------|---------|
| Redis 为什么快 | 单线程+IO多路复用+内存+高效数据结构 | ⭐⭐⭐⭐⭐ |
| 缓存三大问题 | 穿透→缓存空值/布隆，击穿→互斥锁，雪崩→随机TTL | ⭐⭐⭐⭐⭐ |
| 持久化 | RDB快但丢数据，AOF安全但慢，混合最优 | ⭐⭐⭐⭐ |
| 淘汰策略 | 8种，生产推荐 allkeys-lru | ⭐⭐⭐⭐ |
| 分布式锁 | SETNX+Lua+Polly重试，Redlock概念 | ⭐⭐⭐⭐ |
| 缓存策略 | Cache-Aside 最常用 | ⭐⭐ |
| 集群模式 | 主从→哨兵→Cluster，按规模选择 | ⭐⭐ |
| DataProtection | 多实例共享密钥用Redis持久化 | ⭐⭐ |

**一句话总结**：Redis 是养老院系统的"前台速查卡"——把高频数据放在内存里，用缓存策略保证一致性，用分布式锁保证并发安全，用集群保证高可用。

---

## 面试题

### 面试题 1（高级 / 概念题）
**题目**：Redis 为什么这么快？

**参考答案**：四个原因：①单线程模型避免了上下文切换和锁竞争开销；②IO 多路复用（epoll）让单线程能同时处理大量连接；③纯内存操作，读写速度比磁盘快 10 万倍；④高效数据结构（SDS、跳跃表、压缩列表）针对不同场景做了极致优化。养老院场景：长者信息查询走 Redis 缓存，响应时间从 MySQL 的 50ms 降到 1ms。

### 面试题 2（高级 / 概念题）
**题目**：缓存穿透、击穿、雪崩分别是什么？怎么解决？

**参考答案**：**穿透**：查询不存在的 key，请求全部打到数据库。解决：缓存空值（TTL 30s）+ 布隆过滤器。**击穿**：热点 key 过期瞬间，大量并发请求穿透。解决：互斥锁（SETNX）保证只有一个线程回源，其他线程等待或返回旧值。**雪崩**：大量 key 同时过期，数据库压力骤增。解决：过期时间加随机偏移量 + 多级缓存（本地+Redis）+ 熔断降级。养老院场景：长者信息缓存雪崩会导致入住高峰期数据库崩溃。

### 面试题 3（中级 / 概念题）
**题目**：RDB 和 AOF 持久化有什么区别？

**参考答案**：RDB 是定时快照（fork 子进程生成二进制文件），恢复快但可能丢失最后一次快照后的数据。AOF 是每次写操作追加日志文件，数据更安全但文件大、恢复慢。生产推荐混合持久化：RDB 做定期全量备份，AOF 做增量日志。养老院系统：财务数据必须用 AOF（不能丢），统计数据可以用 RDB（允许少量丢失）。

### 面试题 4（中级 / 概念题）
**题目**：Redis 的 8 种淘汰策略分别是什么？生产环境推荐哪种？

**参考答案**：noeviction（不淘汰，内存满拒绝写入）、allkeys-lru（所有 key 中淘汰最近最少使用）、volatile-lru（仅淘汰设了过期时间的 key）、allkeys-random（随机淘汰）、volatile-random（随机淘汰有过期时间的 key）、allkeys-lfu（所有 key 中淘汰最不经常使用）、volatile-lfu（淘汰有过期时间且最不常用的）、volatile-ttl（淘汰即将过期的 key）。生产推荐 allkeys-lru，适合缓存场景。

### 面试题 5（初级 / 概念题）
**题目**：Redis 的五种数据结构在养老院系统中分别怎么用？

**参考答案**：**String**：缓存长者基本信息（JSON 序列化）、分布式锁（SETNX）。**Hash**：存储长者的多个字段（姓名、年龄、护理等级），支持单字段读取。**List**：消息队列（入住通知队列）、最近访问记录。**Set**：长者标签（过敏源、疾病史），支持交集运算（同时对花粉和海鲜过敏的长者）。**ZSet**：排行榜（本月消费排行）、延迟队列（score 为时间戳）。

### 面试题 6（高级 / 场景题）
**题目**：分布式锁用 Redis 怎么实现？有什么坑？

**参考答案**：用 `SET key value NX PX 30000` 原子命令获取锁（NX=不存在才设置，PX=毫秒级过期）。释放锁用 Lua 脚本原子判断 value 再 DEL（防止误删别人的锁）。坑：①锁超时但业务未完成→用看门狗续期；②Redis 主从切换时锁丢失→Redlock 算法（向 N 个独立 Redis 实例加锁，多数成功才算获取）；③GC 停顿导致锁过期→业务幂等性保证。养老院场景：防止同一床位被重复分配。

### 面试题 7（初级 / 概念题）
**题目**：Cache-Aside 模式的工作流程是什么？

**参考答案**：**读**：先查缓存→命中则返回→未命中则查数据库→写入缓存→返回。**写**：先更新数据库→再删除缓存（不是更新缓存）。为什么删而不是更新？因为并发场景下，更新缓存可能导致旧值覆盖新值。养老院场景：修改长者护理等级后，先更新 MySQL，再删除 Redis 中的缓存，下次查询时重新从数据库加载最新值。

### 面试题 8（中级 / 概念题）
**题目**：Redis 单线程模型的优缺点是什么？

**参考答案**：优点：无锁设计，避免上下文切换和竞态条件，代码简单高效。缺点：无法利用多核 CPU（Redis 6.0 引入多线程 IO 解决网络瓶颈）、大 key 操作会阻塞整个服务。养老院场景：如果用 `KEYS *` 扫描所有 key，会阻塞其他所有请求，应用 `SCAN` 命令替代。

### 面试题 9（高级 / 概念题）
**题目**：Redis 哨兵和 Cluster 集群有什么区别？

**参考答案**：**哨兵（Sentinel）**：主从架构+自动故障转移，数据全量复制，适合数据量<16GB 的场景。**Cluster**：数据分片（16384 个 slot 分布在多个主节点），支持水平扩展，适合大数据量。哨兵只解决高可用，Cluster 同时解决高可用和大数据量。养老院初期用哨兵（3 节点），长者数据超过 10 万后迁移到 Cluster。

### 面试题 10（中级 / 概念题）
**题目**：Redis 持久化中的混合持久化是什么？

**参考答案**：混合持久化在 AOF 重写时，将 RDB 格式的数据写入 AOF 文件头部，增量数据以 AOF 格式追加在后面。这样兼顾了 RDB 的快速加载和 AOF 的数据安全性。Redis 4.0+ 默认开启。恢复时先加载 RDB 部分（快），再回放 AOF 部分（保证数据完整）。

### 面试题 11（初级 / 概念题）
**题目**：ABP 中如何使用 Redis 缓存？

**参考答案**：注入 `IDistributedCache<T>` 泛型接口，调用 `GetOrAddAsync(key, factory, options)` 获取或创建缓存。ABP 封装了 StackExchange.Redis，支持分布式缓存和滑动过期。养老院场景：`_cache.GetOrAddAsync("elder:" + id, () => _repo.GetAsync(id), () => new DistributedCacheEntryOptions { SlidingExpiration = TimeSpan.FromMinutes(30) })`。

### 面试题 12（高级 / 场景题）
**题目**：DataProtection 密钥为什么需要 Redis 持久化？

**参考答案**：ASP.NET Core DataProtection 用于加密 Cookie、Token 等敏感数据。默认密钥存储在本地文件系统，多实例部署时各实例密钥不同，导致 A 签发的 Token B 无法解密。将密钥存储到 Redis 后，所有实例共享同一密钥，实现分布式环境下的数据保护一致性。养老院系统部署 3 个容器实例时必须配置。

---

## 下一章预告

**第 13 章：RabbitMQ + CAP 分布式事件总线**

本章我们掌握了缓存和分布式锁，下一章将学习异步通信：
- 为什么需要消息队列（同步调用的痛点 — 用养老院值班交接本做类比）
- RabbitMQ 核心概念（Exchange/Queue/Binding/RoutingKey）
- CAP 框架原理（本地消息表保证最终一致性）
- 分布式事务（CAP 定理/BASE 理论/2PC/TCC/Saga — 面试必考）
- 实战：长者入住事件驱动（自动创建账单 + 分配床位 + 通知家属）

---

## 时效性声明

本章内容基于 **Redis 6.0+**、**ABP Framework 4.4.0**、**.NET 5.0** 编写。Redis 6.0 引入了多线程 IO（`io-threads` 配置），Redis 7.0 引入了 Function 替代 Lua 脚本。核心数据结构和缓存策略在各版本中保持稳定。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：五种数据结构、为什么快、缓存三大问题、持久化、淘汰策略、集群模式、分布式锁、实战 |
| 2026-07-10 | v1.1 | 补全面试题（12题）、常见错误表、下一章预告、时效性声明、修订记录 |
| 2026-07-10 | v1.2 | 本章小结移到常见错误表之后（正确顺序：错误表→小结→面试题） |
