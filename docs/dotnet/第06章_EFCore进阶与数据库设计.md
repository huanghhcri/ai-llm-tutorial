# 第 06 章：EF Core 进阶与数据库设计

> **适用版本**：ABP 4.4.0 / .NET 5.0 / EF Core 5.0（Pomelo MySQL 驱动）/ MySQL 8.0+  
> **代码规范**：C# 9（不使用 record、init-only、primary constructor、raw string literal、file-scoped namespace）

---

## 学习目标

完成本章学习后，你将能够：

1. 深入理解 DbContext 的生命周期机制，避免多线程并发陷阱
2. 掌握 EF Core 变更追踪原理，正确处理实体状态管理
3. 使用 AsNoTracking、投影查询、预加载等手段优化查询性能
4. 理解 MySQL 四种事务隔离级别及其对应的并发问题
5. 掌握 MVCC 多版本并发控制的核心原理
6. 深入理解 MySQL 索引原理，学会分析执行计划并优化慢查询
7. 了解数据库连接池机制与连接泄漏排查方法
8. 掌握 EF Core 数据库迁移的多人协作策略

---

## 前置知识

- C# 基础语法与 LINQ
- EF Core 基本 CRUD 操作（第 04 章）
- 依赖注入基础概念（第 02 章）
- MySQL 基本 SQL 语法

---

## 为什么需要学这个？

在前几章中，我们学会了如何用 EF Core 进行基本的增删改查。但在实际企业项目中，你很快会遇到以下问题：

- 为什么接口偶尔报 `ObjectDisposedException` 或 `A second operation was started on this context instance`？
- 为什么更新实体时数据没变？
- 为什么一个页面加载要执行 100 多条 SQL？
- 为什么并发下单时库存扣错了？

这些问题的根源都在本章的内容中。EF Core 的生命周期管理、变更追踪机制、事务隔离级别、索引设计——这些是区分初级与中级开发者的分水岭，也是面试中出现频率最高的话题。

---

## 1. DbContext 生命周期与并发问题

### 1.1 生活类比：养老院的「档案室」

想象养老院有一间档案室，里面存放着所有长者的健康档案。每天，护理部、餐饮部、财务部的工作人员都需要查阅和更新这些档案。

- **Singleton** 模式相当于全院只请一个档案员，所有人排队找他——看似省人，但一个人同时被多人叫，就会手忙脚乱、搞混档案。
- **Transient** 模式相当于每次查阅都临时请一个新档案员——每次都要重新熟悉档案室布局，效率极低。
- **Scoped** 模式相当于每个科室有自己的档案员，每次请求（如一次体检流程）由一个档案员全程负责——既不混乱，也不会重复学习。

EF Core 的 DbContext 就是这个「档案员」，它内部维护了所有已加载实体的快照（变更追踪器），天然不适合被多线程共享。

### 1.2 为什么 DbContext 是 Scoped

在 ABP 框架中，DbContext 默认注册为 **Scoped** 生命周期，即每个 HTTP 请求（或每个工作单元 UnitOfWork）创建一个实例。原因如下：

```csharp
// ABP 源码中的注册方式（简化）
services.AddDbContext<NursingHomeDbContext>(options =>
{
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString));
}, ServiceLifetime.Scoped);
```

**Scoped 的合理性：**

| 生命周期 | 优点 | 缺点 | 适用场景 |
|----------|------|------|----------|
| Singleton | 只创建一次，性能最高 | 变更追踪器状态混乱，线程不安全 | ❌ 不适用 |
| Transient | 每次请求新实例，无状态冲突 | 频繁创建销毁，丧失一级缓存优势 | ❌ 不推荐 |
| Scoped | 每个请求一个实例，兼顾安全与性能 | 需注意不要跨作用域使用 | ✅ 最佳选择 |

### 1.3 Singleton 持有 DbContext 的经典坑

这是初学者最容易犯的错误之一，与第 02 章中介绍的 DI 陷阱一脉相承：

```csharp
// ❌ 致命错误：Singleton 服务注入了 Scoped 的 DbContext
public class ElderArchiveService : ISingletonDependency
{
    private readonly NursingHomeDbContext _dbContext;

    public ElderArchiveService(NursingHomeDbContext dbContext)
    {
        _dbContext = dbContext; // 问题：这个实例被所有请求共享
    }

    public async Task<Elder> GetElderAsync(long id)
    {
        // 第一个请求正在查询时，第二个请求同时进来 → 崩溃
        return await _dbContext.Elders.FindAsync(id);
    }
}
```

运行后会抛出：`InvalidOperationException: A second operation was started on this context instance before a previous operation completed.`

**修复方案：注入 `IServiceScopeFactory`，按需创建 DbContext：**

```csharp
// ✅ 正确做法
public class ElderArchiveService : ISingletonDependency
{
    private readonly IServiceScopeFactory _scopeFactory;
    public ElderArchiveService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }
    public async Task<Elder> GetElderAsync(long id)
    {
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NursingHomeDbContext>();
            return await db.Elders.FindAsync(id);
        }
    }
}
```

### 1.4 多线程并发访问同一个 DbContext

即使 DbContext 是 Scoped 的，在同一个请求内部如果使用了 `Task.WhenAll` 或手动创建了新线程，仍然可能触发并发问题：

```csharp
// ❌ 错误：并行操作同一个 DbContext
public async Task LoadAllDataAsync()
{
    var eldersTask = _dbContext.Elders.ToListAsync();
    var roomsTask = _dbContext.Rooms.ToListAsync();
    await Task.WhenAll(eldersTask, roomsTask); // 报错！
}

// ✅ 正确：串行执行
public async Task LoadAllDataAsync()
{
    var elders = await _dbContext.Elders.ToListAsync();
    var rooms = await _dbContext.Rooms.ToListAsync();
}
```

> **经验法则**：同一个 DbContext 实例上，同一时刻只允许一个异步操作在执行。

---

## 2. 变更追踪原理

### 2.1 生活类比：「修改档案要先借出原件」

养老院规定，如果要修改长者的健康档案，必须先从档案柜中取出原件，修改后放回。你不能凭空写一份新档案直接塞进柜子——档案员不知道这份新档案对应的是哪位长者，也无法判断它和原件有什么区别。

EF Core 的变更追踪器（ChangeTracker）就是这个「档案员」。它必须先「认识」一个实体，才能追踪它的变化。

### 2.2 EntityState 状态机

EF Core 为每个被追踪的实体维护一个状态，共五种：

| 状态 | 含义 | SaveChanges 时的操作 |
|------|------|---------------------|
| **Added** | 实体是新添加的 | INSERT |
| **Modified** | 实体被修改了 | UPDATE |
| **Deleted** | 实体被标记为删除 | DELETE |
| **Unchanged** | 实体未被修改 | 什么都不做 |
| **Detached** | 实体未被追踪 | 什么都不做 |

```
新对象 → [Add] → Added → [SaveChanges] → Unchanged
已追踪对象 → 修改属性 → Modified → [SaveChanges] → Unchanged
已追踪对象 → [Remove] → Deleted → [SaveChanges] → 脱离追踪
```

### 2.3 错误写法 vs 正确写法

```csharp
// ❌ 错误写法：直接 new 一个实体然后 Update
public async Task UpdateElderRoom_WrongAsync(long elderId, long newRoomId)
{
    var elder = new Elder { Id = elderId, RoomId = newRoomId };
    _dbContext.Elders.Update(elder); // 所有字段都被标记为 Modified
    await _dbContext.SaveChangesAsync();
    // Name、Age 等未设置的字段被更新为 null/默认值！
}

// ✅ 正确写法：先查询再修改
public async Task UpdateElderRoom_CorrectAsync(long elderId, long newRoomId)
{
    var elder = await _dbContext.Elders.FindAsync(elderId);
    elder.RoomId = newRoomId;
    await _dbContext.SaveChangesAsync();
    // 只生成 UPDATE Elders SET RoomId=@p0 WHERE Id=@p1
}
```

**ChangeTracker 原理：** 实体查询出来时，EF Core 对所有属性做快照（原始值）。SaveChanges 时比较当前值与快照值，只有变化的字段出现在 UPDATE 的 SET 子句中。

---

## 3. 查询性能优化

### 3.1 N+1 问题

假设养老院要展示所有长者及其房间信息：

```csharp
// ❌ N+1 问题：1 次查询长者列表 + 100 次查询房间
var elders = await _dbContext.Elders.ToListAsync();
foreach (var elder in elders)
{
    Console.WriteLine(elder.Room.RoomNumber); // 每次循环触发一次查询
}
// 总共 101 次 SQL 查询！

// ✅ 使用 Include 预加载：只需 1 次查询（JOIN）
var elders = await _dbContext.Elders.Include(e => e.Room).ToListAsync();
```

### 3.2 AsNoTracking 只读查询

对于只需展示、不需要修改的查询，使用 `AsNoTracking` 跳过变更追踪：

```csharp
var elders = await _dbContext.Elders
    .AsNoTracking()  // 性能提升 20%-50%
    .Include(e => e.Room)
    .Select(e => new ElderDto { Id = e.Id, Name = e.Name, Age = e.Age, RoomNumber = e.Room.RoomNumber })
    .ToListAsync();
```

### 3.3 投影查询：只查需要的字段

```csharp
// ❌ 查出所有字段，浪费带宽和内存
var elders = await _dbContext.Elders
    .Include(e => e.Room)
    .ToListAsync();

// ✅ 投影查询：只查需要的字段，SQL 只 SELECT 4 个列
var dtos = await _dbContext.Elders
    .AsNoTracking()
    .Select(e => new ElderDto
    {
        Id = e.Id,
        Name = e.Name,
        Age = e.Age,
        RoomNumber = e.Room.RoomNumber
    })
    .ToListAsync();
```

### 3.4 IQueryable 延迟执行

`IQueryable` 并不会立即执行查询，它只是在「拼 SQL」：

```csharp
// 以下代码不会立即执行 SQL
IQueryable<Elder> query = _dbContext.Elders.Where(e => e.Age > 70);

// 可以继续拼接条件（仍然不执行）
if (!string.IsNullOrWhiteSpace(keyword))
{
    query = query.Where(e => e.Name.Contains(keyword));
}

// 直到调用 ToListAsync / FirstOrDefaultAsync / CountAsync 等终结方法才执行
var result = await query.ToListAsync(); // 此时才生成并执行 SQL
```

### 3.5 三种加载策略对比

| 策略 | 代码 | 适用场景 | 注意事项 |
|------|------|----------|----------|
| **预加载** Include | `.Include(e => e.Room)` | 明确需要关联数据 | 生成 JOIN，一次查完 |
| **延迟加载** | 配置 `UseLazyLoadingProxies` | 不确定是否需要关联数据 | 容易产生 N+1 |
| **显式加载** | `Entry(e).Reference(x => x.Room).LoadAsync()` | 偶尔需要关联数据 | 手动控制，代码较多 |

> **最佳实践**：大多数情况下使用 **Include 预加载** + **投影查询**，禁用延迟加载。

---

## 4. MySQL 事务与隔离级别

### 4.1 生活类比：养老院「财务对账」

养老院月底要给每位长者生成账单。财务部需要统计房间费、护理费、餐饮费等。在对账期间：

- 如果允许护理部随时修改费用记录，财务部可能会看到前后不一致的数据
- 如果完全锁定所有费用表直到对账结束，其他部门就无法正常工作

不同的「对账规则」就对应不同的事务隔离级别——在数据一致性和系统并发性之间寻找平衡。

### 4.2 并发问题详解（养老院场景）

**脏读（Dirty Read）**：财务部小王读到了护理部小李还没提交的护理费修改——300 元。但小李后来发现录错了，回滚了事务。小王基于 300 元生成的账单就是错误的。

**不可重复读（Non-Repeatable Read）**：财务部小王上午读到护理费是 200 元，下午再读发现变成了 300 元——因为小李在中午提交了修改。同一次对账中读到两次不同的值。

**幻读（Phantom Read）**：财务部小王统计"年龄大于 80 岁的长者有 10 位"。此时新入住了一位 82 岁的老人。小王再次统计，发现变成了 11 位——凭空多出来一条记录。

### 4.3 四种隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 性能 |
|---------|------|-----------|------|------|
| READ UNCOMMITTED | ✅ 可能 | ✅ 可能 | ✅ 可能 | 最高 |
| READ COMMITTED | ❌ 不会 | ✅ 可能 | ✅ 可能 | 较高 |
| **REPEATABLE READ**（MySQL 默认） | ❌ 不会 | ❌ 不会 | ⚠️ 部分解决 | 中等 |
| SERIALIZABLE | ❌ 不会 | ❌ 不会 | ❌ 不会 | 最低 |

### 4.4 EF Core 中的事务管理

```csharp
// 养老院账单生成：多步操作必须在同一事务中
public async Task GenerateMonthlyBillAsync(long elderId, int year, int month)
{
    using (var transaction = await _dbContext.Database.BeginTransactionAsync())
    {
        try
        {
            var elder = await _dbContext.Elders.FindAsync(elderId);
            var roomFee = elder.Room.Price;
            var nursingFee = await _dbContext.NursingRecords
                .Where(r => r.ElderId == elderId && r.RecordDate.Year == year && r.RecordDate.Month == month)
                .SumAsync(r => r.Fee);

            var bill = new Bill
            {
                ElderId = elderId, Year = year, Month = month,
                RoomFee = roomFee, NursingFee = nursingFee,
                TotalAmount = roomFee + nursingFee, CreatedTime = DateTime.Now
            };
            _dbContext.Bills.Add(bill);
            elder.PendingAmount += bill.TotalAmount;
            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }
}
```

---

## 5. MVCC 多版本并发控制

### 5.1 生活类比：「档案版本管理」

养老院改进了档案管理流程：修改档案时不再锁住原件，而是创建一个新版本。每个工作人员查看档案时，看到的是自己"开始工作时"的那个版本，不受别人修改的干扰。这就是 MVCC（Multi-Version Concurrency Control）的核心思想。

### 5.2 InnoDB 的隐藏列

InnoDB 为每一行数据自动维护三个隐藏列：

| 隐藏列 | 作用 |
|--------|------|
| **DB_TRX_ID** | 最后修改该行的事务 ID |
| **DB_ROLL_PTR** | 回滚指针，指向 Undo Log 中该行的上一个版本 |
| **DB_ROW_ID** | 自增行 ID（如果没有主键，InnoDB 会自动创建） |

### 5.3 Undo Log 版本链

每次修改一行数据时，InnoDB 并不直接覆盖旧值，而是将旧值写入 **Undo Log**，通过 `DB_ROLL_PTR` 将新旧版本串联成一条 **版本链**。当事务需要读取该行时，沿版本链查找对自己"可见"的第一个版本。

### 5.4 ReadView 机制

ReadView 是事务执行快照读时创建的数据结构，包含：**m_ids**（活跃事务 ID 列表）、**min_trx_id**（最小活跃事务 ID）、**max_trx_id**（下一个待分配事务 ID）、**creator_trx_id**（创建者事务 ID）。

可见性判断：沿版本链从新到旧查找，如果版本的事务 ID 是自己的或已提交（不在 m_ids 中且小于 max_trx_id），则可见。

**快照读 vs 当前读：** 普通 SELECT 是快照读（使用 ReadView，不加锁）；SELECT FOR UPDATE、INSERT、UPDATE、DELETE 是当前读（读最新版本，加行锁）。

### 5.5 RR 级别下的幻读问题

在 MySQL 默认的 **REPEATABLE READ** 级别下：

- **快照读**（普通 SELECT）：通过 ReadView 机制，整个事务期间看到的数据一致，不会出现幻读
- **当前读**（SELECT FOR UPDATE / UPDATE / DELETE）：读取的是数据的最新版本，可能出现幻读

解决方案：当前读时使用 **Next-Key Lock**（记录锁 + 间隙锁），锁住索引记录及其间隙，防止其他事务在间隙中插入新数据。

---

## 6. MySQL 索引深入

### 6.1 生活类比：「长者索引卡」

养老院为方便查找长者信息，制作了一套按姓名拼音排序的索引卡片。卡片上只有姓名和档案编号，找到卡片后按编号去档案柜取完整档案。这套索引卡片就是数据库中的 **索引**。

### 6.2 B+Tree 索引原理

InnoDB 使用 B+Tree 作为索引结构，为什么不用其他数据结构？

| 数据结构 | 缺点 |
|----------|------|
| 二叉树 | 极端情况退化为链表，O(n) |
| 红黑树 | 树高随数据量增长，磁盘 IO 次数多 |
| Hash | 不支持范围查询（`WHERE age > 70`） |
| **B+Tree** | ✅ 矮胖结构（3-4 层可存千万级数据），叶子节点有序链表支持范围查询 |

B+Tree 的特点：
- 非叶子节点只存索引键，不存数据 → 每个节点可容纳更多键 → 树更矮
- 叶子节点存数据，且通过双向链表连接 → 范围查询高效
- 所有查询都走到叶子节点 → 查询性能稳定

### 6.3 聚簇索引 vs 非聚簇索引

**聚簇索引（主键索引）：** 叶子节点存储的是完整的行数据。表数据本身就是按主键组织的 B+Tree。

**非聚簇索引（二级索引）：** 叶子节点存储的是主键值。查到主键后，需要再回表到聚簇索引中查找完整数据。

`SELECT * FROM Elders WHERE Name='张三'` → 先在 Name 索引中找到 Id=1 → 再到主键索引中找 Id=1 的完整行 → 这个过程叫做「回表」。

### 6.4 复合索引与最左前缀原则

```sql
CREATE INDEX idx_elder_room ON Elders(RoomId, Age, Name);
```

最左前缀原则——索引 `(a, b, c)` 可以用于以下查询条件组合：

| 查询条件 | 能否使用索引 | 说明 |
|----------|------------|------|
| `WHERE RoomId = 1` | ✅ 使用 (a) | 最左前缀 |
| `WHERE RoomId = 1 AND Age > 70` | ✅ 使用 (a, b) | 最左前缀 |
| `WHERE RoomId = 1 AND Age = 70 AND Name LIKE '张%'` | ✅ 使用 (a, b, c) | 全部使用 |
| `WHERE Age = 70` | ❌ 不能使用 | 跳过了 a |
| `WHERE RoomId = 1 AND Name = '张三'` | ⚠️ 只使用 (a) | 跳过了 b，b 之后的列无法使用 |

### 6.5 覆盖索引

如果索引已经包含了查询所需的所有字段，则无需回表——这就是 **覆盖索引**：

```sql
-- 假设有索引 INDEX(RoomId, Age, Name)
SELECT Name, Age FROM Elders WHERE RoomId = 1;
-- EXPLAIN 的 Extra 列会显示 "Using index"，说明使用了覆盖索引
```

### 6.6 EXPLAIN 执行计划分析

```sql
EXPLAIN SELECT * FROM Elders WHERE Name = '张三';
```

关键列解读：

| 列 | 含义 | 关注点 |
|----|------|--------|
| **type** | 访问类型 | `ALL`(全表扫描) < `index` < `range` < `ref` < `eq_ref` < `const` |
| **key** | 实际使用的索引 | NULL 表示没用索引 |
| **rows** | 预估扫描行数 | 越小越好 |
| **Extra** | 额外信息 | `Using index`(覆盖索引)、`Using filesort`(文件排序)、`Using temporary`(临时表) |

> **优化目标**：type 达到 `ref` 或更优，rows 尽量小，Extra 中避免 `Using filesort` 和 `Using temporary`。

### 6.7 索引失效的常见原因

```sql
-- 1. 对索引列使用函数
WHERE YEAR(CreateTime) = 2024        -- ❌ 失效
WHERE CreateTime >= '2024-01-01'     -- ✅ 正确

-- 2. 隐式类型转换
WHERE PhoneNumber = 13800138000      -- ❌ Phone 是 varchar，传了数字，触发隐式转换
WHERE PhoneNumber = '13800138000'    -- ✅ 正确

-- 3. LIKE 左模糊
WHERE Name LIKE '%三'                -- ❌ 失效
WHERE Name LIKE '张%'                -- ✅ 可以用索引

-- 4. OR 条件中有非索引列
WHERE Name = '张三' OR Age = 80      -- 如果 Age 没索引，整个查询失效

-- 5. 不满足最左前缀
-- 索引 (a, b, c)
WHERE b = 1 AND c = 2               -- ❌ 跳过了 a
```

### 6.8 慢查询定位与优化

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1; -- 超过 1 秒记录

-- 查看慢查询
SHOW VARIABLES LIKE 'slow_query_log_file';
```

优化步骤：开启慢查询日志 → 定位慢 SQL → EXPLAIN 分析 → 添加合适的索引 → 优化 SQL 写法。

---

## 7. 数据库连接池

### 7.1 连接池原理

每次建立数据库连接都需要经历 TCP 三次握手、MySQL 认证等步骤，耗时约 50-200ms。连接池的思路是：预先创建一批连接，用完后归还而不是销毁，下次请求直接复用。

```
请求 → 从池中取连接 → 执行 SQL → 归还连接到池中
                    ↑                              |
                    └──────── 复用 ←────────────────┘
```

### 7.2 MySQL 连接数配置

```sql
-- 查看最大连接数
SHOW VARIABLES LIKE 'max_connections';        -- 默认 151

-- 查看超时时间
SHOW VARIABLES LIKE 'wait_timeout';           -- 非交互连接超时（默认 28800 秒）
SHOW VARIABLES LIKE 'interactive_timeout';    -- 交互连接超时

-- 查看当前连接数
SHOW STATUS LIKE 'Threads_connected';
```

EF Core 连接字符串中的连接池配置：

```
Server=localhost;Database=NursingHome;Uid=root;Pwd=xxx;
Min Pool Size=5;Max Pool Size=100;Connection Timeout=30;
```

### 7.3 连接泄漏排查

连接泄漏是指从连接池取出了连接但没有归还，最终连接池耗尽，新请求无法获取连接。

```csharp
// ❌ 连接泄漏：异常时连接未释放
public async Task<Elder> GetElderAsync(long id)
{
    var conn = new MySqlConnection(_connectionString);
    await conn.OpenAsync();
    // 如果这里抛异常，conn 不会被关闭
    var cmd = new MySqlCommand("SELECT * FROM Elders WHERE Id=@id", conn);
    // ...
    return elder;
}

// ✅ 使用 using 确保释放
public async Task<Elder> GetElderAsync(long id)
{
    using (var conn = new MySqlConnection(_connectionString))
    {
        await conn.OpenAsync();
        using (var cmd = new MySqlCommand("SELECT * FROM Elders WHERE Id=@id", conn))
        {
            // ...
            return elder;
        }
    }
}
```

> EF Core 内部已正确管理连接，通常不需要手动操作。但直接使用 ADO.NET 时必须用 `using` 包裹。

---

## 8. 数据库迁移管理

### 8.1 多人协作时的迁移冲突

当团队中两个人同时修改了实体模型并各自生成迁移文件时，可能出现迁移冲突。解决策略：

1. **生成前先拉取**：在生成迁移之前，先 `git pull` 最新代码，确保本地有队友的迁移
2. **冲突时合并**：如果两个迁移有依赖关系（如都改了同一张表），需要手动合并
3. **删除重建**：最简单的办法——删掉冲突的迁移，合并代码后重新生成

```bash
# 删除有问题的迁移
dotnet ef migrations remove --project YourProject.EntityFrameworkCore

# 重新生成
dotnet ef migrations add MergedMigration --project YourProject.EntityFrameworkCore
```

### 8.2 多 DbContext 场景

ABP 项目中可能存在多个 DbContext（如主业务库、日志库、Identity 库）：

```bash
# 指定 DbContext 生成迁移
dotnet ef migrations add AddElderTable \
    --context NursingHomeDbContext \
    --project YourProject.EntityFrameworkCore

# 指定 DbContext 执行迁移
dotnet ef database update \
    --context NursingHomeDbContext \
    --project YourProject.EntityFrameworkCore
```

---

## 9. 实战案例：养老院长者管理查询优化

```csharp
// ❌ 优化前：N+1 + 全字段 + 有变更追踪
public async Task<List<ElderDto>> GetElderList_BeforeAsync(string keyword, int pageIndex, int pageSize)
{
    var query = _dbContext.Elders.AsQueryable();
    if (!string.IsNullOrWhiteSpace(keyword))
    {
        query = query.Where(e => e.Name.Contains(keyword));
    }
    var elders = await query.OrderBy(e => e.Id)
        .Skip((pageIndex - 1) * pageSize).Take(pageSize).ToListAsync();

    // 循环中访问导航属性 → 延迟加载 → N+1
    return elders.Select(e => new ElderDto
    {
        Id = e.Id, Name = e.Name, Age = e.Age,
        RoomNumber = e.Room.RoomNumber,    // 延迟加载！
        NurseName = e.Room.Nurse.Name      // 延迟加载！
    }).ToList();
}
// 生成 SQL：1 + 100 + 100 = 201 条查询

// ✅ 优化后：投影查询 + NoTracking，1 条 SQL
public async Task<List<ElderDto>> GetElderList_AfterAsync(string keyword, int pageIndex, int pageSize)
{
    var query = _dbContext.Elders.AsNoTracking()
        .Where(e => !e.IsDeleted);
    if (!string.IsNullOrWhiteSpace(keyword))
    {
        query = query.Where(e => e.Name.Contains(keyword));
    }
    return await query.OrderBy(e => e.Id)
        .Skip((pageIndex - 1) * pageSize).Take(pageSize)
        .Select(e => new ElderDto
        {
            Id = e.Id, Name = e.Name, Age = e.Age,
            RoomNumber = e.Room.RoomNumber,
            NurseName = e.Room.Nurse.Name
        }).ToListAsync();
}
```

---

## 10. 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | Singleton 服务注入 Scoped DbContext | 通过 IServiceScopeFactory 创建作用域 | 多线程共享 DbContext 导致并发异常 |
| 2 | `new Elder(){Id=1}; _db.Update(e);` | 先 `FindAsync(1)` 再修改属性 | 直接 Update 会把未赋值字段覆盖为默认值 |
| 3 | 循环中访问导航属性（延迟加载） | 使用 `Include` 或 `Select` 投影查询 | 产生 N+1 查询，性能灾难 |
| 4 | 列表查询不加 `AsNoTracking` | 只读查询添加 `AsNoTracking` | 多余的变更追踪开销，浪费内存 |
| 5 | `Task.WhenAll` 并行查同一 DbContext | 串行执行或使用独立 DbContext | DbContext 不是线程安全的 |
| 6 | 多步操作不使用事务 | 使用 `BeginTransactionAsync` 包裹 | 部分成功部分失败导致数据不一致 |
| 7 | `WHERE YEAR(dt)=2024` | `WHERE dt >= '2024-01-01' AND dt < '2025-01-01'` | 函数操作导致索引失效 |
| 8 | `LIKE '%关键词'` | `LIKE '关键词%'` 或全文索引 | 左模糊导致索引失效，全表扫描 |

---

## 11. 本章小结

本章深入探讨了 EF Core 和 MySQL 的核心进阶知识：DbContext 的 Scoped 生命周期与并发陷阱、变更追踪状态机、AsNoTracking/投影查询/Include 预加载消除 N+1 问题、四种事务隔离级别与脏读/不可重复读/幻读、MVCC 版本链与 ReadView 机制、B+Tree 索引原理与最左前缀原则、连接池复用与泄漏排查、迁移多人协作策略。

---

## 12. 面试题

### 面试题 1（初级 / 概念题）
**题目**：DbContext 为什么不能注册为 Singleton？

**参考答案**： DbContext 内部维护了 ChangeTracker（变更追踪器），它会记录所有已加载实体的状态和原始值快照。如果注册为 Singleton，所有请求共享同一个追踪器，会导致：①实体状态混乱；②多线程并发访问引发异常；③一级缓存数据污染。Scoped 保证每个请求有独立的 DbContext 实例。

### 面试题 2（初级 / 概念题）
**题目**：什么是变更追踪？EntityState 有哪几种状态？

**参考答案**： 变更追踪是 EF Core 自动记录实体属性变化的机制。EntityState 有五种状态：Added（新增，将执行 INSERT）、Modified（已修改，将执行 UPDATE）、Deleted（已删除，将执行 DELETE）、Unchanged（未变化，不操作）、Detached（未被追踪）。

### 面试题 3（中级 / 概念题）
**题目**：什么是 N+1 查询问题？如何解决？

**参考答案**： N+1 问题是指查询主表 1 次后，遍历结果时每次访问导航属性又触发 1 次额外查询，总共 N+1 次。解决方案：①使用 Include 预加载（生成 JOIN）；②使用 Select 投影查询（只查需要的字段）；③禁用延迟加载。

### 面试题 4（中级 / 概念题）
**题目**：AsNoTracking 的作用是什么？什么时候用？

**参考答案**： AsNoTracking 让查询结果跳过变更追踪，不被 ChangeTracker 跟踪。适用于只读场景（如列表展示、报表查询），可减少内存分配和跟踪开销，性能提升 20%-50%。不适用于需要修改实体并 SaveChanges 的场景。

### 面试题 5（高级 / 概念题）
**题目**：MySQL 四种事务隔离级别分别解决什么问题？

**参考答案**： ①READ UNCOMMITTED：最低级别，允许脏读；②READ COMMITTED：解决脏读，存在不可重复读；③REPEATABLE READ（MySQL 默认）：解决脏读和不可重复读，通过MVCC+Next-Key Lock大部分解决幻读；④SERIALIZABLE：完全串行，解决所有并发问题但性能最差。

### 面试题 6（高级 / 概念题）
**题目**：用养老院场景解释脏读、不可重复读、幻读的区别。

**参考答案**： 脏读：财务部读到护理部未提交的费用修改，护理部回滚后数据无效。不可重复读：上午读到护理费200元，下午读到300元（中间被修改提交了）。幻读：统计80岁以上长者10位，中间新入住一位82岁老人，再统计变成11位。

### 面试题 7（高级 / 概念题）
**题目**：简述 MVCC 的工作原理。

**参考答案**： InnoDB 为每行维护隐藏列 DB_TRX_ID（最后修改的事务 ID）和 DB_ROLL_PTR（回滚指针）。修改数据时旧版本写入 Undo Log 形成版本链。快照读时创建 ReadView，沿版本链查找已提交且在 ReadView 创建前的版本，实现无锁读取。

### 面试题 8（高级 / 概念题）
**题目**：为什么 MySQL 在 RR 级别下仍可能出现幻读？

**参考答案**： 快照读（普通 SELECT）通过 ReadView 机制不会出现幻读。但当前读（SELECT FOR UPDATE、UPDATE、DELETE）读取的是最新数据，如果在两次当前读之间有其他事务插入了新记录，就会出现幻读。解决方案是使用 Next-Key Lock（记录锁 + 间隙锁）锁住索引区间。

### 面试题 9（高级 / 概念题）
**题目**：解释 B+Tree 索引的结构及为什么 InnoDB 选择它。

**参考答案**： B+Tree 是多路平衡搜索树：非叶子节点只存索引键，叶子节点存完整数据并通过双向链表连接。选择原因：①矮胖结构减少磁盘 IO；②叶子有序链表支持范围查询；③查询性能稳定。二叉树/红黑树树高太大，Hash 不支持范围查询。

### 面试题 10（高级 / 概念题）
**题目**：什么是聚簇索引和非聚簇索引？什么是回表？

**参考答案**： 聚簇索引叶子节点存完整行数据，InnoDB 表数据本身按主键组织。非聚簇索引叶子节点存主键值。通过二级索引查到主键后再到聚簇索引查完整行叫「回表」。覆盖索引可避免回表——索引已包含所有查询字段时直接返回。

### 面试题 11（高级 / 概念题）
**题目**：复合索引的最左前缀原则是什么？

**参考答案**： 最左前缀原则要求查询条件从索引最左列开始连续使用。Index(a,b,c) 可用于：`WHERE a=1`、`WHERE a=1 AND b=2`、`WHERE a=1 AND b=2 AND c=3`。不能用于：`WHERE b=2`（跳过了 a）。`WHERE a=1 AND c=3` 只能用到 a 列，c 因跳过 b 无法使用。

### 面试题 12（中级 / 概念题）
**题目**：如何查看和分析 MySQL 的执行计划？

**参考答案**： 使用 `EXPLAIN` 命令。关键列：`type`（访问类型，ALL < index < range < ref < eq_ref < const）、`key`（实际使用的索引，NULL 表示没用索引）、`rows`（预估扫描行数）、`Extra`（Using index 表示覆盖索引，Using filesort 表示文件排序需优化）。

### 面试题 13（中级 / 概念题）
**题目**：什么是数据库连接池？如何排查连接泄漏？

**参考答案**： 连接池预先创建一批数据库连接，请求结束后归还而非销毁，避免频繁建立 TCP 连接的开销。排查连接泄漏：①监控 `Threads_connected` 是否持续增长；②检查代码中是否有未用 `using` 包裹的数据库连接；③EF Core 通常自动管理连接，但如果直接使用 ADO.NET，必须用 `using` 确保释放。

### 面试题 14（中级 / 概念题）
**题目**：IQueryable 的延迟执行是什么意思？

**参考答案**： IQueryable 只构建表达式树（拼 SQL），不立即执行查询。只有调用终结方法（ToListAsync、CountAsync 等）时才生成 SQL 发送到数据库。这允许链式拼接条件和排序，最终只执行一次查询。

---

## 13. 下一章预告

**第 07 章：实体设计与仓储模式进阶** — 探讨实体基类选型指南、值对象 vs 实体、领域服务 vs 应用服务的边界、仓储接口设计规范、AsyncExecuter 原理、原始 SQL 查询使用场景。

---

## 时效性声明

本文基于 2021-2022 年技术版本（ABP 4.4.0 / .NET 5.0 / EF Core 5.0 / MySQL 8.0）。MySQL 核心原理（MVCC、B+Tree、事务隔离级别）长期稳定，具体语法可能随版本变化，建议结合官方文档查阅。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初稿，涵盖 DbContext 生命周期、变更追踪、查询优化、事务隔离级别、MVCC、索引、连接池、迁移管理 |
| 2026-07-10 | v1.1 | 章节编号统一为 1-13；面试题难度标签改为初级/中级/高级；下一章预告删除分库分表 |
| 2026-07-10 | v1.2 | 面试题改为标准格式（补类型标签、答→参考答案） |
| 2026-07-10 | v1.3 | 去掉参考答案后多余空格 |
