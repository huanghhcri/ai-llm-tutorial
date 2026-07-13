# 第 23 章：Docker 容器化、CI/CD 与生产运维

> **版本**：v1.0 | **最后更新**：2026-07-10 | **适用框架**：.NET 5.0 / ABP 4.4.0 / Docker 24+

---

## 学习目标

1. 理解 Docker 镜像、容器、网络和 Volume 的核心概念
2. 编写多阶段 Dockerfile 构建 .NET 应用镜像
3. 使用 Docker Compose 编排养老院系统全部依赖服务
4. 掌握环境变量注入替代 appsettings 的生产实践
5. 配置容器健康检查实现自动故障恢复
6. 使用 Volume 实现数据库和文件的持久化存储
7. 编写 GitHub Actions CI/CD 流水线实现自动构建与部署
8. 配置 Nginx 反向代理、HTTPS 证书和负载均衡
9. 制定开发/测试/生产三套环境管理策略
10. 使用 mysqldump 实现数据库自动备份
11. 了解 Prometheus + Grafana 监控体系
12. 掌握生产环境常见故障排查方法
13. 完成 GitHub Actions 自动部署养老院系统的实战

---

## 前置知识

- 已完成第 03 章学习（配置体系与 appsettings.json：多环境配置、Options 模式、环境变量覆盖）
- 已完成第 22 章学习（Git 工作流与 Linux 运维基础：systemd、SSH、防火墙）
- 具备基本 Linux 命令行操作能力（cd/ls/cat/tail）

---

## 为什么需要学这个？

养老院系统开发完成后，最终要部署到服务器上。传统手动部署方式有三个致命问题：

> **真实场景**：某养老院系统上线后，开发人员在服务器上手动更新版本，结果漏传了一个配置文件，导致新入住的 15 位长者信息全部丢失。运维花了一整天从备份中恢复数据，期间护理员无法查看长者档案，严重影响了日常照护工作。

- **环境不一致**：开发机上跑得好好的，部署到服务器就出问题
- **手动操作易出错**：每次部署都是一次"冒险"
- **故障恢复慢**：服务器挂了，重新部署要几个小时

Docker + CI/CD 正是解决这三个问题的标准方案。**容器化保证环境一致，自动化流水线保证部署可靠，监控体系保证问题早发现。**

---

## 1. Docker 基础概念

### 1.1 镜像（Image）

镜像是一个只读模板，包含了运行应用所需的一切——代码、运行时、库、环境变量和配置文件。可以把它理解为一个"安装光盘"。

```bash
# 拉取 .NET 运行时镜像
docker pull mcr.microsoft.com/dotnet/aspnet:5.0

# 查看本地镜像
docker images

# 构建养老院系统镜像
docker build -t yls-elderlycare:1.0 .
```

### 1.2 容器（Container）

容器是镜像的运行实例。一个镜像可以创建多个容器，就像一个安装光盘可以装到多台电脑上。

```bash
# 启动容器
docker run -d --name yls-app -p 5000:80 yls-elderlycare:1.0

# 查看运行中的容器
docker ps

# 进入容器内部
docker exec -it yls-app /bin/bash

# 查看容器日志
docker logs -f yls-app

# 停止并删除容器
docker stop yls-app && docker rm yls-app
```

### 1.3 网络（Network）

Docker 网络让多个容器之间可以互相通信。养老院系统中，Web 应用需要连接 MySQL、Redis、RabbitMQ，它们通过 Docker 网络互联。

```bash
# 创建自定义网络
docker network create yls-network

# 启动 MySQL 并加入网络
docker run -d --name yls-mysql \
  --network yls-network \
  -e MYSQL_ROOT_PASSWORD=MySql@2026 \
  mysql:8.0

# 启动应用并加入同一网络（可用容器名作为主机名连接）
docker run -d --name yls-app \
  --network yls-network \
  -p 5000:80 \
  yls-elderlycare:1.0
```

在应用配置中，数据库连接字符串的主机名使用容器名 `yls-mysql` 而非 `localhost`：

```json
{
  "ConnectionStrings": {
    "Default": "Server=yls-mysql;Port=3306;Database=YlsElderlyCare;Uid=root;Pwd=MySql@2026;"
  }
}
```

### 1.4 Volume（数据卷）

容器是临时的——删除容器后，容器内的数据会丢失。Volume 将数据存储在宿主机上，容器删了数据还在。

```bash
# 创建命名卷
docker volume create yls-mysql-data

# 挂载到容器
docker run -d --name yls-mysql \
  -v yls-mysql-data:/var/lib/mysql \
  mysql:8.0

# 查看所有卷
docker volume ls
```

---

## 2. 多阶段 Dockerfile

.NET 应用需要先编译再运行，多阶段 Dockerfile 将"编译环境"和"运行环境"分开，最终镜像只包含运行所需的文件，体积可从 1GB 缩小到 200MB。

```dockerfile
# ===== 阶段一：编译 =====
FROM mcr.microsoft.com/dotnet/sdk:5.0 AS build
WORKDIR /src

# 先复制项目文件和 NuGet 配置（利用 Docker 缓存层）
COPY *.sln .
COPY src/Yls.ElderlyCare.Web.Host/*.csproj src/Yls.ElderlyCare.Web.Host/
COPY src/Yls.ElderlyCare.Application/*.csproj src/Yls.ElderlyCare.Application/
COPY src/Yls.ElderlyCare.EntityFrameworkCore/*.csproj src/Yls.ElderlyCare.EntityFrameworkCore/

# 还原 NuGet 包（只要 csproj 没变就命中缓存）
RUN dotnet restore

# 复制全部源代码并编译
COPY src/ src/
RUN dotnet publish src/Yls.ElderlyCare.Web.Host/Yls.ElderlyCare.Web.Host.csproj \
    -c Release -o /app/publish --no-restore

# ===== 阶段二：运行 =====
FROM mcr.microsoft.com/dotnet/aspnet:5.0 AS runtime
WORKDIR /app

# 设置时区（养老院系统需要显示正确的中国时间）
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime

# 从编译阶段复制发布产物
COPY --from=build /app/publish .

# 暴露端口
EXPOSE 80
EXPOSE 443

# 启动应用
ENTRYPOINT ["dotnet", "Yls.ElderlyCare.Web.Host.dll"]
```

构建并验证：

```bash
# 构建镜像
docker build -t yls-elderlycare:1.0 -f Dockerfile .

# 查看镜像大小（应为 200MB 左右，而非 1GB+）
docker images yls-elderlycare
```

> **要点**：先复制 `.csproj` 再 `dotnet restore`，最后才复制全部源代码。这样只要项目文件没变，NuGet 包还原就会命中 Docker 缓存层，大幅加快构建速度。

---

## 3. Docker Compose 编排

养老院系统依赖 MySQL、Redis、RabbitMQ 三个外部服务。Docker Compose 用一个 YAML 文件定义所有服务，一条命令全部启动。

```yaml
# docker-compose.yml
version: '3.8'

services:
  # ===== MySQL 数据库 =====
  yls-mysql:
    image: mysql:8.0
    container_name: yls-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: YlsElderlyCare
      MYSQL_CHARSET: utf8mb4
      MYSQL_COLLATION: utf8mb4_unicode_ci
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./init-sql:/docker-entrypoint-initdb.d
    networks:
      - yls-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ===== Redis 缓存 =====
  yls-redis:
    image: redis:7-alpine
    container_name: yls-redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - yls-network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ===== RabbitMQ 消息队列 =====
  yls-rabbitmq:
    image: rabbitmq:3.12-management-alpine
    container_name: yls-rabbitmq
    restart: always
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks:
      - yls-network
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_running"]
      interval: 15s
      timeout: 10s
      retries: 5

  # ===== 养老院系统 Web 应用 =====
  yls-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: yls-app
    restart: always
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ConnectionStrings__Default=Server=yls-mysql;Port=3306;Database=YlsElderlyCare;Uid=root;Pwd=${MYSQL_ROOT_PASSWORD};
      - ConnectionStrings__Redis=yls-redis:6379,password=${REDIS_PASSWORD}
      - RabbitMQ__HostName=yls-rabbitmq
      - RabbitMQ__UserName=${RABBITMQ_USER}
      - RabbitMQ__Password=${RABBITMQ_PASSWORD}
    ports:
      - "5000:80"
    depends_on:
      yls-mysql:
        condition: service_healthy
      yls-redis:
        condition: service_healthy
      yls-rabbitmq:
        condition: service_healthy
    networks:
      - yls-network

  # ===== Nginx 反向代理 =====
  yls-nginx:
    image: nginx:1.25-alpine
    container_name: yls-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - yls-app
    networks:
      - yls-network

volumes:
  mysql-data:
  redis-data:
  rabbitmq-data:

networks:
  yls-network:
    driver: bridge
```

启动全部服务：

```bash
# 首次启动（构建镜像 + 启动）
docker-compose up -d --build

# 查看所有容器状态
docker-compose ps

# 查看日志
docker-compose logs -f yls-app

# 停止全部服务
docker-compose down

# 停止并删除数据卷（慎用！会丢数据）
docker-compose down -v
```

---

## 4. 环境变量注入替代 appsettings

生产环境中，数据库密码等敏感信息**绝不应该**写在 `appsettings.json` 里提交到 Git。正确做法是通过环境变量注入，Docker Compose 中的 `${VARIABLE}` 语法会从 `.env` 文件读取。

### 4.1 创建 .env 文件

```bash
# .env（不要提交到 Git！加入 .gitignore）
MYSQL_ROOT_PASSWORD=MySql@2026SecurePwd
REDIS_PASSWORD=Redis@2026SecurePwd
RABBITMQ_USER=yls_admin
RABBITMQ_PASSWORD=Rabbit@2026SecurePwd
```

### 4.2 环境变量优先级

ASP.NET Core 的配置读取有优先级，环境变量会覆盖 `appsettings.json` 中的同名配置：

```
命令行参数 > 环境变量 > appsettings.{Environment}.json > appsettings.json
```

双下划线 `__` 表示 JSON 层级嵌套：

```bash
# 环境变量写法（对应 appsettings.json 中的 ConnectionStrings:Default）
ConnectionStrings__Default=Server=yls-mysql;...
```

### 4.3 在 Program.cs 中正常使用

无需任何特殊代码，ASP.NET Core 默认支持环境变量覆盖：

```csharp
var builder = WebApplication.CreateBuilder(args);
// 自动读取 appsettings.json + 环境变量，无需额外配置
var connStr = builder.Configuration.GetConnectionString("Default");
```

---

## 5. 容器健康检查

`depends_on` 默认只等容器启动，不等服务就绪。MySQL 容器启动了，但数据库可能还没初始化完成。健康检查解决这个问题。

Dockerfile 中定义：

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1
```

Docker Compose 中定义（如第 3 节所示）更灵活：

```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  interval: 10s    # 每 10 秒检查一次
  timeout: 5s      # 超时时间
  retries: 5       # 连续失败 5 次标记为不健康
  start_period: 30s # 启动后 30 秒内不计入失败次数
```

配合 `condition: service_healthy`，Compose 会等依赖服务健康后再启动下游服务：

```yaml
depends_on:
  yls-mysql:
    condition: service_healthy  # MySQL 真正就绪后才启动应用
```

---

## 6. Volume 数据持久化

养老院系统的数据（长者档案、护理记录、账单信息）是核心资产，绝不能因容器重建而丢失。

### 6.1 命名卷 vs 绑定挂载

| 类型 | 用途 | 示例 |
|------|------|------|
| 命名卷 | 数据库数据文件 | `mysql-data:/var/lib/mysql` |
| 绑定挂载 | 配置文件、SSL 证书 | `./nginx/nginx.conf:/etc/nginx/nginx.conf:ro` |

### 6.2 文件上传持久化

养老院系统的长者照片、合同扫描件等上传文件也需要持久化：

```yaml
yls-app:
  volumes:
    - app-uploads:/app/wwwroot/uploads
    - app-logs:/app/Logs
```

### 6.3 备份 Volume

```bash
# 备份 MySQL 数据卷
docker run --rm \
  -v yls-mysql-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/mysql-data-$(date +%Y%m%d).tar.gz -C /data .

# 恢复
docker run --rm \
  -v yls-mysql-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/mysql-data-20260710.tar.gz -C /data
```

---

## 7. GitHub Actions CI/CD 流水线

CI/CD 的核心思想是：**代码提交后自动构建、自动测试、自动部署**，消除人为操作的失误风险。

### 7.1 流水线整体流程

```
代码推送到 main 分支
    ↓
GitHub Actions 触发
    ↓
① 拉取代码
    ↓
② 还原 NuGet 包
    ↓
③ 编译项目
    ↓
④ 运行单元测试
    ↓
⑤ 构建 Docker 镜像
    ↓
⑥ 推送到镜像仓库
    ↓
⑦ SSH 到服务器拉取并启动
```

### 7.2 基础 CI 流水线

在项目根目录创建 `.github/workflows/ci.yml`，定义触发条件和构建步骤：

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '5.0.x'
      - run: dotnet restore
      - run: dotnet build -c Release --no-restore
      - run: dotnet test -c Release --no-build --verbosity normal
```

完整流水线（含部署）见第 13 节实战部分。

---


**GitLab CI vs GitHub Actions 选型对比**：

| 对比项 | GitHub Actions | GitLab CI |
|--------|---------------|-----------|
| 托管方式 | GitHub 云端运行 | 自托管 Runner 或 GitLab 云端 |
| 配置文件 | `.github/workflows/*.yml` | `.gitlab-ci.yml` |
| 生态市场 | Marketplace 丰富（官方 + 社区） | 内置功能为主，插件较少 |
| 私有仓库 | 免费额度有限（2000 分钟/月） | 自托管 Runner 无限免费 |
| 适用场景 | 开源项目、GitHub 托管代码 | 企业内网 GitLab、安全要求高 |

养老院项目如果代码托管在 GitHub，用 GitHub Actions；如果在内网 GitLab，用 GitLab CI。两者 YAML 语法不同但核心概念一致（Job → Step → Action）。


## 8. Nginx 反向代理、HTTPS 与负载均衡

### 8.1 Nginx 核心配置

```nginx
# nginx/nginx.conf
worker_processes auto;
events { worker_connections 1024; }
http {
    client_max_body_size 50m;      # 长者档案上传大小限制
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    upstream yls_backend {
        server yls-app:80;
    }

    # HTTP → HTTPS 重定向
    server {
        listen 80;
        server_name yls.example.com;
        return 301 https://$host$request_uri;
    }

    # HTTPS 主站
    server {
        listen 443 ssl http2;
        server_name yls.example.com;
        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;

        location /wwwroot/ {          # 静态文件
            alias /app/wwwroot/;
            expires 30d;
        }
        location / {                   # API 反向代理
            proxy_pass http://yls_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;    # SignalR WebSocket 支持
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

### 8.2 Let's Encrypt 免费 HTTPS 证书

```bash
apt install certbot
certbot certonly --standalone -d yls.example.com
# 证书路径：/etc/letsencrypt/live/yls.example.com/
# 自动续期（90 天有效期）：
0 3 1 */2 * certbot renew --quiet && docker restart yls-nginx
```

### 8.3 负载均衡策略

多个分院同时使用时，可在 `upstream` 中配置多个实例。Nginx 默认轮询分发请求，也可使用加权轮询（`weight`）或 IP Hash（`ip_hash`，适合 Session 场景）。

---

## 9. 环境管理策略

养老院系统通常需要三套环境，各自职责不同：

| 环境 | 用途 | 配置特点 |
|------|------|----------|
| Development | 开发调试 | 详细日志、热重载、本地数据库 |
| Staging | 上线前验证 | 与生产相同配置、测试数据 |
| Production | 正式运行 | 最小日志、真实数据、HTTPS |

### 9.1 环境区分的配置文件

```
appsettings.json                # 公共配置
appsettings.Development.json    # 开发环境
appsettings.Staging.json        # 预发布环境
appsettings.Production.json     # 生产环境
```

### 9.2 Docker Compose 多环境

通过 `-f` 参数叠加 Compose 文件覆盖生产配置：

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` 可覆盖环境变量、日志级别和资源限制（`memory: 512M`、`cpus: '1.0'`）。

---

## 10. 数据库备份——mysqldump

养老院系统的长者数据是核心资产，必须定期备份。

### 10.1 手动备份

```bash
# 进入 MySQL 容器执行备份
docker exec yls-mysql mysqldump \
  -u root -p'MySql@2026SecurePwd' \
  --single-transaction \
  --routines \
  --triggers \
  YlsElderlyCare > backup/yls-$(date +%Y%m%d%H%M).sql
```

### 10.2 自动备份与定时任务

将上述命令封装为脚本 `scripts/backup-db.sh`，加入 `gzip` 压缩和 `find -mtime +30 -delete` 自动清理过期备份。然后通过 crontab 定时执行：

```bash
# 每天凌晨 3 点自动备份
crontab -e
0 3 * * * /opt/scripts/backup-db.sh >> /var/log/mysql-backup.log 2>&1
```

### 10.3 恢复数据

```bash
# 从 SQL 文件恢复
docker exec -i yls-mysql mysql \
  -u root -p'MySql@2026SecurePwd' \
  YlsElderlyCare < backup/yls_20260710_0300.sql
```

---

## 11. Prometheus + Grafana 监控概览

生产环境需要实时监控系统状态，在问题影响用户之前提前发现。

### 11.1 应用端暴露指标

在 ASP.NET Core 中集成 Prometheus：

```csharp
// NuGet: prometheus-net.AspNetCore
app.UseMetricServer();  // 暴露 /metrics 端点
app.UseHttpMetrics();   // 自动采集 HTTP 请求指标
```

### 11.2 Grafana 仪表盘

Grafana 预置了 ASP.NET Core 和 MySQL 的仪表盘模板，导入即可使用：

- **应用指标**：请求速率、响应时间 P99、错误率、活跃连接数
- **系统指标**：CPU 使用率、内存占用、磁盘 IO
- **数据库指标**：查询 QPS、慢查询数量、连接池使用率
- **业务指标**：在线用户数、入住登记数、账单生成数

### 11.3 告警规则示例

```yaml
# Prometheus 告警规则
groups:
  - name: yls-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        annotations:
          summary: "养老院系统错误率过高"
```

---

## 12. 生产故障排查清单

### 12.1 CPU 占用过高

```bash
# 查看容器 CPU 使用率
docker stats --no-stream
# 进入容器查看具体进程
docker exec yls-app top -c
# 获取 .NET 进程 dump
docker exec yls-app dotnet-dump collect -p 1
```
常见原因：死循环（while 缺少退出条件）、密集计算（账单批量生成未分页）、GC 压力（大量短生命周期对象）。

### 12.2 内存泄漏

```bash
docker stats --no-stream
docker exec yls-app dotnet-counters monitor -p 1 --counters System.Runtime
```
常见原因：事件订阅未取消、静态集合无限增长（应使用 MemoryCache 设置过期）、DbContext 未释放（长生命周期 DbContext）。

### 12.3 接口响应慢

```bash
docker exec yls-nginx tail -100 /var/log/nginx/access.log
docker logs yls-app --tail 500 | grep "slow"
```
常见原因：数据库慢查询（见 12.4）、外部 HTTP 调用未设置超时、async 方法中使用 `.Result` 导致同步阻塞（应全程 `await`）。

### 12.4 MySQL 慢查询

```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
SHOW PROCESSLIST;
EXPLAIN SELECT * FROM Elderly WHERE IdCardNo = '310101195001011234';
```
常见原因：WHERE 条件字段缺少索引、`LIKE '%关键词%'` 导致索引失效、大表 JOIN 未优化。EF Core 中应使用 `Where` 表达式让数据库过滤，而非 `GetAllListAsync()` 后在内存中 `.Where()`。

---

## 13. GitHub Actions 自动部署实战

本节完成从代码推送到自动部署养老院系统的完整流水线。

### 13.1 准备工作

在 GitHub 仓库的 Settings → Secrets 中配置以下密钥：

需配置 `SERVER_HOST`、`SERVER_USER`、`SERVER_SSH_KEY`（SSH 部署用）、`MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD`、`RABBITMQ_USER`、`RABBITMQ_PASSWORD` 共 7 个 Secrets。

### 13.2 完整 CI/CD 流水线

```yaml
# .github/workflows/deploy.yml
name: CI/CD - 构建与部署

on:
  push:
    branches: [main]

env:
  IMAGE_NAME: yls-elderlycare
  IMAGE_TAG: ${{ github.sha }}
  # 以下变量需在 GitHub 仓库 Settings > Secrets and variables > Actions 中配置
  REGISTRY: ghcr.io  # 容器镜像仓库地址（GitHub Container Registry）
  PREVIOUS_TAG: latest  # 上一版镜像标签，用于回滚时拉取旧镜像

jobs:
  # ===== 阶段一：构建与测试 =====
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - name: 拉取代码
        uses: actions/checkout@v4

      - name: 设置 .NET SDK
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '5.0.x'

      - name: 还原依赖
        run: dotnet restore

      - name: 编译项目
        run: dotnet build -c Release --no-restore

      - name: 运行测试
        run: dotnet test -c Release --no-build --verbosity normal

  # ===== 阶段二：构建镜像并部署 =====
  deploy:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: 拉取代码
        uses: actions/checkout@v4

      - name: 通过 SSH 部署到服务器
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/yls-elderlycare

            # 拉取最新代码
            git pull origin main

            # 生成 .env 文件
            cat > .env << EOF
            MYSQL_ROOT_PASSWORD=${{ secrets.MYSQL_ROOT_PASSWORD }}
            REDIS_PASSWORD=${{ secrets.REDIS_PASSWORD }}
            RABBITMQ_USER=${{ secrets.RABBITMQ_USER }}
            RABBITMQ_PASSWORD=${{ secrets.RABBITMQ_PASSWORD }}
            EOF

            # 构建并启动（仅重新构建有变化的服务）
            docker-compose up -d --build

            # 等待健康检查通过
            sleep 30

            # 验证服务是否正常
            # 注意：Docker Compose 没有内置 rollback 命令
            # 回滚策略：使用上一版镜像标签重新部署
            curl -f http://localhost:5000/health || {
              echo "部署失败，回滚到上一版本镜像"
              # 方法：用 git 回退到上一次成功的 compose 文件，重新部署
              # 或：docker-compose pull 上一版标签的镜像再 up
              docker-compose down
              docker pull ${{ env.REGISTRY }}/nursinghome:${{ env.PREVIOUS_TAG }}
              PREVIOUS_TAG=${{ env.PREVIOUS_TAG }} docker-compose -f docker-compose.prod.yml up -d
              exit 1
            }

            # 清理旧镜像
            docker image prune -f

            echo "部署完成: ${{ github.sha }}"
```

### 13.3 服务器端初始化

首次部署前，在服务器上执行：

```bash
# 安装 Docker 和 Docker Compose
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin

# 创建部署目录
mkdir -p /opt/yls-elderlycare && cd /opt/yls-elderlycare

# 克隆项目
git clone https://github.com/your-org/yls-elderlycare.git .

# 创建 SSL 证书目录
mkdir -p nginx/ssl

# 首次启动
docker-compose up -d --build
```

### 13.4 部署后验证清单

每次部署后依次验证：首页加载→登录功能→长者列表→入住登记表单→Hangfire 后台→健康检查端点→日志无 ERROR。

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | Dockerfile 不用多阶段构建 | 多阶段构建（build→publish→runtime） | 单阶段镜像 1GB+，多阶段只需 200MB |
| 2 | 密码写在 docker-compose.yml | 用 .env 文件 + .gitignore | 密码提交到代码仓库，安全风险 |
| 3 | 容器内数据不持久化 | MySQL/Redis 数据用 Volume 挂载 | 容器重建后数据全部丢失 |
| 4 | 不配置健康检查 | Dockerfile 加 HEALTHCHECK | 容器进程还在但服务已挂，不自动重启 |
| 5 | CI/CD 不跑测试 | 流水线必须包含 test 步骤 | 坏代码自动部署到生产 |
| 6 | Nginx 不配 HTTPS | 用 Let's Encrypt 免费证书 | HTTP 明文传输，数据可被窃取 |
| 7 | 生产环境用 latest 标签 | 用具体版本号（如 v1.2.3） | latest 可能指向不同版本，部署不可复现 |
| 8 | 不做数据库备份 | mysqldump 定时备份 + 异地存储 | 数据库故障无法恢复，业务瘫痪 |

---

## 本章小结

| 知识点 | 核心要点 |
|--------|----------|
| Docker 基础 | 镜像是模板，容器是实例，网络互联服务，Volume 持久化数据 |
| 多阶段 Dockerfile | 编译与运行分离，镜像体积从 1GB 降至 200MB |
| Docker Compose | 一个 YAML 编排 MySQL + Redis + RabbitMQ + App + Nginx |
| 环境变量注入 | 敏感信息通过 `.env` + 环境变量注入，不提交到 Git |
| 健康检查 | 确保依赖服务真正就绪后再启动下游应用 |
| CI/CD | GitHub Actions 实现"推送即部署"，消除人为操作失误 |
| Nginx | 反向代理 + HTTPS + 负载均衡，保护后端服务 |
| 数据库备份 | mysqldump 定时备份 + 自动清理过期备份 |
| 监控 | Prometheus 采集指标 + Grafana 可视化 + 告警通知 |
| 故障排查 | CPU 高→dump 分析，内存泄漏→计数器监控，慢查询→EXPLAIN |

---


---

## 面试题

### 面试题 1（初级 / 概念题）
**题目**：Docker 镜像和容器有什么区别？

**参考答案**：镜像是只读模板（蓝图），容器是镜像的运行实例（实体）。一个镜像可以创建多个容器。生活类比：镜像是养老院的建筑图纸，容器是按图纸建好的养老院大楼。`docker build` 创建镜像，`docker run` 启动容器。

### 面试题 2（中级 / 概念题）
**题目**：什么是多阶段构建？为什么要用？

**参考答案**：多阶段构建在 Dockerfile 中使用多个 `FROM`，第一阶段编译代码（含 SDK），第二阶段只拷贝编译结果到轻量运行时镜像。养老院场景：编译阶段用 `mcr.microsoft.com/dotnet/sdk:5.0`（1GB），运行阶段用 `mcr.microsoft.com/dotnet/aspnet:5.0`（200MB），最终镜像只有运行时和编译产物。

### 面试题 3（初级 / 概念题）
**题目**：Docker Compose 的作用是什么？

**参考答案**：用 YAML 文件定义和管理多容器应用。一条 `docker-compose up -d` 启动所有服务（MySQL + Redis + RabbitMQ + 应用）。养老院场景：开发环境一条命令启动完整技术栈，不用手动逐个启动。`docker-compose down` 一键停止并清理。

### 面试题 4（中级 / 概念题）
**题目**：Docker 环境变量如何替换 appsettings.json 配置？

**参考答案**：ASP.NET Core 的配置系统支持环境变量覆盖，用双下划线 `__` 表示 JSON 层级。`ConnectionStrings__Default=xxx` 覆盖 `ConnectionStrings:Default`。在 docker-compose.yml 的 `environment` 段配置。与第 3 章呼应：开发用 appsettings.json，Docker 部署用环境变量。

### 面试题 5（高级 / 场景题）
**题目**：如何用 GitHub Actions 实现 CI/CD？

**参考答案**：在 `.github/workflows/deploy.yml` 定义流水线：push 到 main 触发 → checkout 代码 → `dotnet build` → `dotnet test` → `docker build` → `docker push` 到镜像仓库 → SSH 到服务器 `docker-compose pull && docker-compose up -d`。养老院场景：张工合并 PR 后，自动构建、测试、部署到生产服务器，全程无需手动操作。

### 面试题 6（中级 / 概念题）
**题目**：Nginx 反向代理的作用是什么？

**参考答案**：Nginx 作为入口，将请求转发给后端 Kestrel 应用。作用：① SSL 终止（HTTPS → HTTP）；② 负载均衡（多个应用实例）；③ 静态文件服务；④ 安全防护（IP 黑名单、限流）。养老院场景：Nginx 监听 443 端口（HTTPS），转发到 Kestrel 的 5000 端口。

### 面试题 7（初级 / 概念题）
**题目**：Docker Volume 的作用是什么？

**参考答案**：Volume 是持久化存储，数据独立于容器生命周期。容器删除后 Volume 数据仍在。养老院场景：MySQL 数据文件挂载到 `/var/lib/mysql`，Redis 持久化文件挂载到 `/data`，上传的健康档案挂载到 `/uploads`。不用 Volume 的话，`docker-compose down` 后数据全丢。

### 面试题 8（高级 / 场景题）
**题目**：生产环境 CPU 使用率突然飙到 100%，怎么排查？

**参考答案**：① `top` 找到高 CPU 进程（dotnet PID）；② `docker stats` 确认是哪个容器；③ `docker exec -it <container> top -Hp 1` 找高 CPU 线程；④ 收集 dump（`dotnet-dump collect -p 1`）；⑤ 分析线程堆栈找死循环或高频 GC。养老院场景：账单批量生成任务死循环导致 CPU 100%。

### 面试题 9（中级 / 概念题）
**题目**：如何做数据库定时备份？

**参考答案**：用 `mysqldump` 导出 + crontab 定时执行。`mysqldump -u root -p nursinghome > backup_$(date +%Y%m%d).sql`。crontab 每天凌晨 3 点执行：`0 3 * * * /usr/local/bin/backup.sh`。备份文件保留 30 天，建议异地存储（如 OSS）。养老院场景：每天自动备份，出故障时可恢复到前一天的数据。

### 面试题 10（高级 / 设计题）
**题目**：如何设计养老院系统的 Docker Compose 编排？

**参考答案**：5 个服务：mysql（3306 + Volume 持久化）、redis（6379）、rabbitmq（5672 + 15672 管理界面）、nursinghome-api（5000 + 依赖 mysql/redis/rabbitmq + healthcheck）、nginx（80/443 + 反向代理 api）。用 `depends_on` + `condition: service_healthy` 确保依赖服务就绪后再启动 API。`.env` 文件管理密码。

---

## 下一章预告

🎉 **恭喜！你已经完成了全部 23 章的学习！**

接下来的行动建议：

1. **面试冲刺**：打开 **`面试题汇总_DotNet企业开发全栈.md`**，该文件汇总了全部 23 章共 291 道面试题（初级 87 / 中级 115 / 高级 89），按章节分组标注难度和题型，是面试前的最佳复习材料
2. **动手实践**：用本教程的知识从零搭建一个完整的养老院管理系统，把 23 章的技术栈串联起来
3. **持续学习**：关注 .NET 6/7/8+ 的新特性（Minimal API、AOT、gRPC），本教程基于 .NET 5.0 编写，升级路径平滑

---

## 时效性声明

本章内容基于 **.NET 5.0**、**Docker 24.0+**、**Docker Compose v2.20+**、**Nginx 1.24+**、**GitHub Actions（2026年7月）** 编写。Docker 和 Nginx 的核心命令在各版本中保持稳定。GitHub Actions 的 YAML 语法定期更新，建议参考官方文档。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：Docker 基础、多阶段构建、Compose、环境变量、健康检查、Volume、CI/CD、Nginx、备份、监控、故障排查 |
| 2026-07-10 | v1.1 | 补全常见错误表、面试题（10题）、下一章预告、时效性声明、修订记录 |
| 2026-07-10 | v1.2 | 预告中面试题数量更新为 291 题（初级87/中级115/高级89） |
| 2026-07-10 | v1.3 | workflow env 补充 REGISTRY/PREVIOUS_TAG 变量及注释 |
