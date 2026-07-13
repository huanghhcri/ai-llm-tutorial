# 第 15 章：文件管理与 Excel 导入导出

## 学习目标

- 理解养老院系统中文档管理的核心需求，掌握文件上传、存储、下载的完整链路
- 掌握 ASP.NET Core 文件上传接口设计，包括大小限制与类型校验
- 对比本地文件存储与 OSS 对象存储的优劣，能根据业务场景做出合理选型
- 掌握 NPOI 基于模板导出 Excel 的原理与实现
- 掌握 NPOI 导入 Excel 数据的完整流程：解析、校验、批量入库
- 掌握文件下载 URL 的生成方式
- 完成实战：长者健康档案批量导入 + 月度报表导出

## 前置知识

- 第04章：ABP 框架深度解析（依赖注入、模块系统）
- 第06章：EFCore 进阶与数据库设计
- 第08章：应用服务与 DTO 设计

## 为什么需要学这个？

几乎所有企业级系统都离不开两件事：**存文件**和**导报表**。养老院系统尤其典型——长者的身份证扫描件、体检报告、护理合同需要长期存档；每月的入住统计、费用明细需要导出为 Excel 交给上级部门审查。这一章在实际项目中使用频率极高，也是面试中"你项目里怎么处理文件上传和 Excel 导出"的常见考点。

---

## 1. 为什么需要文件管理

### 1.1 养老院场景：无处不在的文件

| 业务场景 | 文件类型 | 说明 |
|---------|---------|------|
| 入住登记 | 身份证扫描件、监护人委托书 | 法律合规要求，必须存档 |
| 健康档案 | 体检报告 PDF、影像片子 | 每次体检或就医都会产生 |
| 护理合同 | 合同扫描件 PDF | 双方签署后需存档备查 |
| 月度报表 | Excel 统计表 | 每月上报入住率、费用数据 |
| 批量导入 | Excel 导入长者信息 | 集中入住时避免逐条录入 |

### 1.2 核心需求

```
上传：文件怎么进入服务器？
存储：文件放在哪里？怎么组织目录？
下载：前端怎么拿到文件？
```

---

## 2. 文件上传接口设计

### 2.1 使用 IFormFile 接收文件

```csharp
[HttpPost("upload")]
public async Task<IActionResult> Upload(IFormFile file)
{
    if (file == null || file.Length == 0)
        throw new UserFriendlyException("请选择要上传的文件");

    using var stream = new MemoryStream();
    await file.CopyToAsync(stream);
    // 保存到指定路径...
    return Ok(new { fileName = file.FileName, size = file.Length });
}
```

### 2.2 大小限制：MultipartBodyLengthLimit

默认限制 30MB，需在 `Startup.cs` 中显式配置：

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.Configure<FormOptions>(options =>
    {
        options.MultipartBodyLengthLimit = 50 * 1024 * 1024; // 50MB
    });

    services.Configure<KestrelServerOptions>(options =>
    {
        options.Limits.MaxRequestBodySize = 50 * 1024 * 1024;
    });
}
```

> **面试要点**：上传报 413 就是这个限制没配够。`MultipartBodyLengthLimit` 管 multipart 表单，`MaxRequestBodySize` 管整个请求体，两个都要设。

### 2.3 类型校验：ContentType 白名单

```csharp
private static readonly HashSet<string> AllowedContentTypes = new()
{
    "image/jpeg", "image/png", "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

private static readonly HashSet<string> AllowedExtensions = new()
{
    ".jpg", ".jpeg", ".png", ".pdf", ".xls", ".xlsx"
};

public static void ValidateFile(IFormFile file)
{
    if (!AllowedContentTypes.Contains(file.ContentType))
        throw new UserFriendlyException($"不支持的文件类型：{file.ContentType}");

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!AllowedExtensions.Contains(ext))
        throw new UserFriendlyException($"不支持的文件扩展名：{ext}");

    if (file.Length > 50 * 1024 * 1024)
        throw new UserFriendlyException("文件大小不能超过 50MB");
}
```

> **注意**：`ContentType` 由客户端声明，可以伪造。生产环境更安全的做法是读取文件头（magic number）判断真实类型。

---

## 3. 本地文件存储 vs OSS 对象存储

### 3.1 方案对比

| 维度 | 本地文件存储 | OSS 对象存储 |
|------|------------|-------------|
| **成本** | 零额外费用 | 按量付费（存储+流量） |
| **可靠性** | 单机，磁盘故障可能丢数据 | 多副本，99.999999999% 可靠性 |
| **扩展性** | 受限于单机磁盘 | 无限扩展 |
| **运维** | 需自行备份 | 托管服务，免运维 |
| **适用场景** | 内部系统、文件量小 | 面向公网、多服务器部署 |

对于中小型养老院系统，**本地文件存储完全够用**，配合定期备份即可。无论哪种方案，代码层应抽象统一接口：

```csharp
public interface IFileStorageService
{
    Task<string> SaveAsync(Stream stream, string fileName, string category);
    Task<Stream> GetAsync(string filePath);
    Task DeleteAsync(string filePath);
}
```

---

## 4. NPOI 基于模板导出 Excel

### 4.1 核心原理

```
模板文件（.xls）         输出文件（.xls）
┌─────────────┐        ┌─────────────┐
│ 表头（固定）  │   →    │ 表头（不变）  │
│ [数据区域]   │        │ 实际数据      │
└─────────────┘        └─────────────┘
```

样式在模板中预设好，代码只负责填数据，导出的报表格式统一美观。

### 4.2 NpoiExcelExportHelper 单例实现

```csharp
public class NpoiExcelExportHelper
{
    public static NpoiExcelExportHelper Instance { get; } = new();

    public string ExportWithTemplate(string templatePath,
        List<Dictionary<int, object>> data, int startRow)
    {
        if (!File.Exists(templatePath))
            throw new FileNotFoundException("模板文件不存在", templatePath);

        using var templateStream = new FileStream(templatePath, FileMode.Open, FileAccess.Read);
        var workbook = new HSSFWorkbook(templateStream);
        var sheet = workbook.GetSheetAt(0);

        for (int i = 0; i < data.Count; i++)
        {
            var row = sheet.GetRow(startRow + i) ?? sheet.CreateRow(startRow + i);
            foreach (var kvp in data[i])
            {
                var cell = row.GetCell(kvp.Key) ?? row.CreateCell(kvp.Key);
                SetCellValue(cell, kvp.Value);
            }
        }

        var outputDir = Path.Combine("wwwroot", "exports");
        Directory.CreateDirectory(outputDir);
        var outputFile = Path.Combine(outputDir, $"Export_{DateTime.Now:yyyyMMddHHmmss}.xls");

        using var outputStream = new FileStream(outputFile, FileMode.Create, FileAccess.Write);
        workbook.Write(outputStream);
        return outputFile;
    }

    private static void SetCellValue(ICell cell, object value)
    {
        switch (value)
        {
            case int or long or short or byte or double or float or decimal:
                cell.SetCellValue(Convert.ToDouble(value)); break;
            case DateTime dt: cell.SetCellValue(dt); break;
            case bool b: cell.SetCellValue(b); break;
            default: cell.SetCellValue(value?.ToString() ?? string.Empty); break;
        }
    }
}
```

---

## 5. NPOI 导入 Excel 数据

### 5.1 导入流程

```
Excel 文件 → NPOI 解析 → 逐行读取 → 数据校验 → DTO 集合 → 批量入库
```

### 5.2 NpoiExcelImportHelper 实现

```csharp
public class NpoiExcelImportHelper
{
    public static NpoiExcelImportHelper Instance { get; } = new();

    public List<Dictionary<int, string>> ReadExcel(string filePath, int startRow = 1)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException("文件不存在", filePath);

        var result = new List<Dictionary<int, string>>();
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        var workbook = new HSSFWorkbook(stream);
        var sheet = workbook.GetSheetAt(0);

        for (int i = startRow; i <= sheet.LastRowNum; i++)
        {
            var row = sheet.GetRow(i);
            if (row == null) continue;

            var rowData = new Dictionary<int, string>();
            bool isEmpty = true;
            for (int j = 0; j < row.LastCellNum; j++)
            {
                var cellValue = GetCellStringValue(row.GetCell(j));
                rowData[j] = cellValue;
                if (!string.IsNullOrWhiteSpace(cellValue)) isEmpty = false;
            }
            if (!isEmpty) result.Add(rowData);
        }
        return result;
    }

    private static string GetCellStringValue(ICell cell)
    {
        if (cell == null) return string.Empty;
        return cell.CellType switch
        {
            CellType.Numeric => DateUtil.IsCellDateFormatted(cell)
                ? cell.DateCellValue.ToString("yyyy-MM-dd")
                : cell.NumericCellValue.ToString(),
            CellType.String => cell.StringCellValue?.Trim() ?? string.Empty,
            CellType.Boolean => cell.BooleanCellValue.ToString(),
            _ => string.Empty
        };
    }
}
```

### 5.3 数据校验策略

**收集所有错误一次性返回**，避免一次改一个、反复导入的低效操作：

```csharp
public List<ElderImportDto> ValidateImportData(List<Dictionary<int, string>> rows)
{
    var dtos = new List<ElderImportDto>();
    var errors = new List<string>();

    for (int i = 0; i < rows.Count; i++)
    {
        var row = rows[i];
        var lineNo = i + 2; // 第 1 行是表头

        var name = row.GetValueOrDefault(0);
        var idCard = row.GetValueOrDefault(1);
        var gender = row.GetValueOrDefault(2);
        var ageStr = row.GetValueOrDefault(3);

        if (string.IsNullOrWhiteSpace(name))
        { errors.Add($"第 {lineNo} 行：姓名不能为空"); continue; }

        if (string.IsNullOrWhiteSpace(idCard) || idCard.Length != 18)
        { errors.Add($"第 {lineNo} 行：身份证号必须为 18 位"); continue; }

        if (!int.TryParse(ageStr, out var age) || age < 60 || age > 130)
        { errors.Add($"第 {lineNo} 行：年龄必须为 60-130 的整数"); continue; }

        if (gender != "男" && gender != "女")
        { errors.Add($"第 {lineNo} 行：性别只能填写\"男\"或\"女\""); continue; }

        dtos.Add(new ElderImportDto
        {
            Name = name, IdCard = idCard, Gender = gender, Age = age,
            Phone = row.GetValueOrDefault(4),
            EmergencyContact = row.GetValueOrDefault(5),
            EmergencyPhone = row.GetValueOrDefault(6),
            CareLevel = row.GetValueOrDefault(7)
        });
    }

    if (errors.Count > 0)
        throw new UserFriendlyException("导入校验失败：\n" + string.Join("\n", errors));
    return dtos;
}
```

---

## 6. 文件下载 URL 生成

不同部署环境域名不同，URL 根路径应可配置。`ApplicationHelper.GetUrl` 负责拼接：

```csharp
public static class ApplicationHelper
{
    public static string GetUrl(string rootUrl, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(rootUrl))
            throw new ArgumentException("FileRootUrl 未配置");

        rootUrl = rootUrl.TrimEnd('/');
        relativePath = relativePath.TrimStart('/');
        return $"{rootUrl}/{relativePath}";
    }
}
```

在 `appsettings.json` 中配置：

```json
{
  "YlsOptions": {
    "FileRootUrl": "http://localhost:5000/files"
  }
}
```

使用时从 Options 注入，拼接文件相对路径即可得到完整下载地址。

---

## 7. 实战：长者健康档案批量导入 + 月度报表导出

### 7.1 场景描述

**场景一**：集中入住，行政部门提供 50 名长者信息的 Excel，需批量导入系统。

**场景二**：每月初生成上月入住统计报表（入住/退住人数、费用合计），导出为 Excel 上报。

### 7.2 批量导入——完整实现

```csharp
[Authorize]
public class ElderImportExportAppService : ApplicationService
{
    private readonly IRepository<Elder, Guid> _elderRepository;
    private readonly YlsOptions _options;

    public ElderImportExportAppService(
        IRepository<Elder, Guid> elderRepository,
        IOptions<YlsOptions> options)
    {
        _elderRepository = elderRepository;
        _options = options.Value;
    }

    public async Task<ImportResultDto> ImportEldersAsync(IFormFile file)
    {
        // 1. 校验 + 保存临时文件
        FileValidator.ValidateFile(file);
        var tempFile = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.xls");
        using (var fs = new FileStream(tempFile, FileMode.Create))
            await file.CopyToAsync(fs);

        try
        {
            // 2. 读取 Excel（数据从第 2 行开始）
            var rows = NpoiExcelImportHelper.Instance.ReadExcel(tempFile, startRow: 1);

            // 3. 校验并转换
            var dtos = ValidateImportData(rows);

            // 4. 批量入库
            var successCount = 0;
            var errors = new List<string>();

            foreach (var dto in dtos)
            {
                try
                {
                    var elder = new Elder
                    {
                        Name = dto.Name,
                        IdCard = dto.IdCard,
                        Gender = dto.Gender == "男" ? Gender.Male : Gender.Female,
                        Age = dto.Age,
                        Phone = dto.Phone,
                        EmergencyContact = dto.EmergencyContact,
                        EmergencyPhone = dto.EmergencyPhone,
                        CareLevel = Enum.Parse<CareLevel>(dto.CareLevel)
                    };
                    await _elderRepository.InsertAsync(elder);
                    successCount++;
                }
                catch (Exception ex)
                {
                    errors.Add($"{dto.Name}：{ex.Message}");
                }
            }

            return new ImportResultDto
            {
                TotalRows = dtos.Count,
                SuccessCount = successCount,
                FailCount = dtos.Count - successCount,
                Errors = errors
            };
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }
}
```

### 7.3 月度报表导出——完整实现

```csharp
public async Task<ReportExportResultDto> ExportMonthlyReportAsync(int year, int month)
{
    // 1. 查询统计数据
    var startDate = new DateTime(year, month, 1);
    var endDate = startDate.AddMonths(1);
    var elders = await _elderRepository.GetListAsync();

    var checkInCount = elders.Count(e =>
        e.CreationTime >= startDate && e.CreationTime < endDate);
    var totalCount = elders.Count(e => e.Status == ElderStatus.Active);

    // 2. 组装数据（模板第 0 行是表头，数据从第 1 行开始）
    var dataList = new List<Dictionary<int, object>>
    {
        new()
        {
            { 0, $"{year}年{month}月" },
            { 1, totalCount },
            { 2, checkInCount },
            { 3, elders.Count(e => e.CareLevel == CareLevel.Special) },
            { 4, elders.Count(e => e.CareLevel == CareLevel.FullDay) }
        }
    };

    // 3. 基于模板导出
    var templatePath = Path.Combine("wwwroot", "templates", "MonthlyReport.xls");
    var outputPath = NpoiExcelExportHelper._.ExportWithTemplate(
        templatePath, dataList, startRow: 1);

    // 4. 返回下载 URL
    var relativePath = outputPath.Replace("wwwroot", "").Replace("\\", "/");
    var fileUrl = ApplicationHelper.GetUrl(_options.FileRootUrl, relativePath);

    return new ReportExportResultDto
    {
        FileName = Path.GetFileName(outputPath),
        FileUrl = fileUrl,
        GenerateTime = DateTime.Now
    };
}
```

### 7.4 配套 DTO

```csharp
public class ImportResultDto
{
    public int TotalRows { get; set; }
    public int SuccessCount { get; set; }
    public int FailCount { get; set; }
    public List<string> Errors { get; set; } = new();
}

public class ReportExportResultDto
{
    public string FileName { get; set; }
    public string FileUrl { get; set; }
    public DateTime GenerateTime { get; set; }
}
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | 文件上传不限类型，仅检查扩展名 | ContentType 白名单 + 文件头(magic number)校验 | 扩展名可伪造，恶意用户上传 .exe 改名为 .jpg |
| 2 | 上传文件存项目目录 | 存独立目录或 OSS，通过配置 `FileRootUrl` 访问 | 项目重新部署会丢失文件，且占用代码仓库空间 |
| 3 | 导出 Excel 用 `new XSSFWorkbook()` 处理 .xls | `HSSFWorkbook` 处理 .xls，`XSSFWorkbook` 处理 .xlsx | 格式不匹配导致文件损坏，Excel 打开报错 |
| 4 | 导入 Excel 不校验数据直接入库 | 逐行校验，收集全部错误后一次性返回 | 一条数据有问题就中断，用户看不到其他行的错误 |
| 5 | 大文件上传不限大小 | 配置 `MultipartBodyLengthLimit` + 前端分片 | 超大文件耗尽服务器内存，OOM 崩溃 |
| 6 | 文件 URL 硬编码域名 | 用 `ApplicationHelper.GetUrl(Options.FileRootUrl, path)` | 换域名要改所有代码，配置化一处修改 |
| 7 | 导出时循环中逐行写入 | 先构建完整数据，一次性写入 Excel | 循环写入性能差，且无法利用模板格式 |
| 8 | 文件名用中文或特殊字符 | 用 GUID 重命名，保留原始文件名在数据库中 | 中文文件名在不同浏览器编码不一致导致下载失败 |

---

## 本章小结

本章学习了文件管理与 Excel 导入导出的核心技术：**文件上传**通过 IFormFile 接收，配合大小限制和 ContentType 白名单校验安全；**文件存储**通过 IFileStorageService 接口抽象，支持本地存储和 OSS 无缝切换；**NPOI 导出**基于模板（HSSFWorkbook）填充数据，保持格式统一；**NPOI 导入**逐行校验收集错误，批量插入提升性能；**文件下载**通过 YlsOptions.FileRootUrl 拼接完整 URL。核心原则：**接口抽象隔离存储细节，模板驱动保证导出格式，批量操作优化导入性能。**

---

## 面试题

### 面试题 1（初级 / 概念题）
**题目**：文件上传时如何校验文件类型？

**参考答案**：读取文件头（magic number）判断真实类型。例如 PNG 前 8 字节是 `89 50 4E 47 0D 0A 1A 0A`，PDF 以 `%PDF` 开头。对内部系统，ContentType + 扩展名双重校验通常已够用。养老院场景：健康档案上传只允许 PDF/JPG/PNG，拒绝 .exe/.bat 等可执行文件。

### 面试题 2（初级 / 概念题）
**题目**：HSSFWorkbook 和 XSSFWorkbook 有什么区别？

**参考答案**：`HSSFWorkbook` 处理 `.xls`（97-2003），最大 65536 行；`XSSFWorkbook` 处理 `.xlsx`（2007+），无行数限制。养老院上报模板多为 `.xls`，用 `HSSFWorkbook`。两者 API 几乎一致，替换即可。注意：`SXSSFWorkbook` 是 `XSSFWorkbook` 的流式版本，适合大数据量导出。

### 面试题 3（中级 / 概念题）
**题目**：Excel 导入大量数据时如何优化性能？

**参考答案**：① UnitOfWork 在最后统一提交事务（避免每行一次事务）；② `AddRangeAsync` 批量插入（减少数据库交互次数）；③ 数据量极大时用 `SqlBulkCopy`（绕过 EF Core，直接批量写入）。养老院场景：批量导入 5000 条长者健康档案，用 `AddRangeAsync` 比逐条 `InsertAsync` 快 10 倍。

### 面试题 4（初级 / 概念题）
**题目**：为什么文件存储要用接口抽象（IFileStorageService）？

**参考答案**：依赖倒置原则（DIP）。上层代码依赖 `IFileStorageService` 接口，不关心本地存储还是 OSS。迁移到 OSS 时只需新增实现，业务代码零修改。养老院场景：初期用本地存储快速上线，后期迁移到阿里云 OSS，只需替换实现类。

### 面试题 5（中级 / 场景题）
**题目**：如何用 NPOI 基于模板导出 Excel？

**参考答案**：用 `HSSFWorkbook` 读取预定义的 `.xls` 模板文件（含表头、样式、公式），通过 `GetRow`/`GetCell` 定位单元格，`SetCellValue` 填入数据，`NpoiExcelExportHelper._.CreateStyle` 创建样式，最后 `Write` 保存到文件。养老院场景：月度费用报表模板已定义好表头和格式，代码只需填入长者姓名、费用金额、缴费状态等数据。

### 面试题 6（高级 / 场景题）
**题目**：文件上传接口如何防止恶意攻击？

**参考答案**：① ContentType 白名单（只允许 PDF/JPG/PNG）；② 文件大小限制（`MultipartBodyLengthLimit` 设为 10MB）；③ 文件头校验（magic number，防伪造扩展名）；④ 文件名用 GUID 重命名（防路径遍历攻击）；⑤ 存储目录不与 Web 根目录重叠（防直接 URL 访问）。养老院场景：家属上传长者身份证扫描件，必须严格校验。

### 面试题 7（初级 / 概念题）
**题目**：NpoiExcelExportHelper 的作用是什么？

**参考答案**：`NpoiExcelExportHelper` 是项目封装的 Excel 导出辅助类（单例模式），提供 `CreateStyle` 创建单元格样式、`SetCellValue` 设置单元格值等方法。它统一了导出逻辑，避免每个导出功能重复写 NPOI 样式代码。养老院系统中所有报表导出都通过这个 Helper 完成。

### 面试题 8（中级 / 概念题）
**题目**：文件下载 URL 怎么生成？

**参考答案**：通过 `ApplicationHelper.GetUrl(Options.FileRootUrl, "/" + filePath)` 拼接完整 URL。`YlsOptions.FileRootUrl` 在配置文件中定义（如 `https://files.nursinghome.com`），文件存储时只保存相对路径（如 `uploads/2026/07/elder-001.pdf`），下载时拼接完整 URL 返回给前端。这样换域名只需改配置。

### 面试题 9（高级 / 设计题）
**题目**：如何设计一个支持本地存储和 OSS 的文件服务？

**参考答案**：定义 `IFileStorageService` 接口（`UploadAsync`/`DownloadAsync`/`DeleteAsync`），分别实现 `LocalStorageService`（存本地磁盘）和 `OssStorageService`（调阿里云 OSS SDK）。通过 DI 注册具体实现，业务代码只依赖接口。养老院场景：开发环境用本地存储，生产环境用 OSS，通过配置切换实现类。

### 面试题 10（中级 / 场景题）
**题目**：Excel 导入时如何处理数据校验错误？

**参考答案**：逐行读取数据，校验每个字段（姓名非空、年龄范围、日期格式），将错误信息收集到列表中（包含行号+字段+错误原因）。全部读取完毕后，如果有错误则一次性返回所有错误信息，不插入任何数据；如果无错误则批量插入。养老院场景：导入长者信息时，第 3 行年龄为 -5、第 7 行姓名为空，应同时报告两个错误。

## 下一章预告

**第 16 章：日志体系与异常处理**

养老院系统上线后，出了 bug 怎么快速定位？生产环境异常怎么第一时间通知开发团队？下一章将学习：
- Serilog 结构化日志配置（文件/控制台/ES 三种 Sink）
- ABP 异常处理机制（UserFriendlyException vs BusinessException vs 普通 Exception）
- 全局异常过滤器与异常邮件通知
- 审计日志详细配置

---

## 时效性声明

本章内容基于 **NPOI 2.7.0**（本项目统一使用此版本）、**ABP 4.4.0**、**.NET 5.0** 编写。NPOI 的 API 在各版本中保持稳定。在 .NET 6+ 中可考虑使用 `EPPlus` 或 `ClosedXML` 替代 NPOI。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：文件上传、NPOI 导入导出、文件存储抽象、实战 |
| 2026-07-10 | v1.1 | 补全常见错误表、面试题（10题）、下一章预告、时效性声明、修订记录 |
| 2026-07-10 | v1.2 | 本章小结移到常见错误表之后（正确顺序：错误表→小结→面试题） |
| 2026-07-10 | v1.3 | NpoiExcelExportHelper.Instance → ._ |
