# 第22章 Git 工作流与 Linux 运维基础

## 学习目标

通过本章学习，你将能够：

1. 理解 Git 的核心概念：工作区、暂存区、本地仓库与远程仓库的关系
2. 熟练使用 Git 常用命令完成多人协作开发
3. 根据团队规模选择合适的分支管理策略
4. 正确处理合并冲突，保障养老院系统代码一致性
5. 建立规范的 Code Review 流程
6. 合理配置 `.gitignore` 避免敏感文件入库
7. 掌握 Linux 常用运维命令进行服务器排障
8. 使用 systemd 托管和管理 .NET 应用服务
9. 配置 SSH 密钥实现安全的远程连接与 Git 认证
10. 通过 firewall-cmd 配置 Linux 防火墙规则

## 前置知识

- 完成前21章的 ASP.NET Core 基础开发学习
- 了解基本的命令行操作
- 具备养老院管理系统的业务理解

## 为什么需要学这个？

养老院管理系统作为一款承载老人健康数据、护理记录、费用结算的核心业务系统，其开发和部署需要可靠的版本控制与运维保障。当团队中多名开发者同时修改护理排班、费用报表等模块时，如果没有规范的 Git 工作流，代码冲突将频繁发生；系统上线后，如果没有 Linux 运维基础，服务宕机时将束手无策。本章将 Git 版本控制与 Linux 运维能力结合起来，让你具备从开发到部署的全链路技能。

---

## 22.1 Git 核心概念

Git 是分布式版本控制系统，每个开发者本地都拥有完整的仓库副本。理解 Git 的四个核心区域是掌握所有 Git 操作的基础。

### 22.1.1 四大区域

| 区域 | 说明 | 养老院场景举例 |
|------|------|----------------|
| **工作区（Working Directory）** | 你正在编辑代码的目录 | 编辑 `ElderlyService.cs` 的界面 |
| **暂存区（Staging Area / Index）** | 执行 `git add` 后，待提交的变更快照 | 你挑选了"护理记录"和"床位管理"两个文件准备提交 |
| **本地仓库（Local Repository）** | 执行 `git commit` 后，变更永久保存在本地 | 本地保存了养老院系统的完整历史 |
| **远程仓库（Remote Repository）** | 托管在服务器上的共享仓库（如 GitHub、Gitea） | 团队共享的养老院系统代码中心 |

### 22.1.2 HEAD 指针

`HEAD` 是一个特殊指针，指向当前分支的最新提交。在养老院项目中，当你切换到 `feature/nursing-schedule` 分支时，`HEAD` 就指向该分支的最新一次提交。

```bash
# 查看 HEAD 当前指向
cat .git/HEAD
# 输出示例：ref: refs/heads/main

# 查看详细的 HEAD 信息
git log -1 --oneline
# 输出示例：a3f2b1c (HEAD -> main) 添加老人健康档案CRUD接口
```

### 22.1.3 文件状态流转

```
未跟踪/未修改 → 修改(Modified) → 暂存(Staged) → 已提交(Committed)
     工作区          工作区           暂存区           本地仓库
```

---

## 22.2 Git 常用命令——养老院多人协作场景

假设养老院系统开发团队有三人：后端开发者张工、前端开发者李工、测试兼运维王工，他们通过 Git 协作完成一个"护理排班优化"迭代。

### 22.2.1 clone —— 首次获取项目

```bash
# 张工首次加入项目，克隆养老院系统仓库
git clone https://gitea.yourcompany.com/nursing-home/elderly-care-system.git
cd elderly-care-system
```

### 22.2.2 add 与 commit —— 保存本地变更

```bash
# 张工修改了护理排班服务
git add src/Services/NursingScheduleService.cs
git add src/Models/ScheduleRecord.cs

# 暂存区确认
git status

# 提交到本地仓库
git commit -m "feat: 添加护理排班自动轮换算法，支持按老人护理等级智能分配"
```

### 22.2.3 push —— 推送到远程

```bash
# 张工将本地提交推送到远程的 feature/nursing-schedule 分支
git push origin feature/nursing-schedule
```

### 22.2.4 pull —— 拉取他人变更

```bash
# 李工拉取最新的前端代码变更
git pull origin develop
# 等价于 git fetch + git merge
```

### 22.2.5 merge —— 合并分支

```bash
# 张工的护理排班功能开发完毕，合并到 develop 分支
git checkout develop
git merge feature/nursing-schedule
```

### 22.2.6 rebase —— 变基保持线性历史

```bash
# 张工希望将 feature 分支的提交"搬"到 develop 最新提交之后
git checkout feature/nursing-schedule
git rebase develop
# 优势：提交历史更整洁，像一条直线
# 注意：不要对已推送到远程的公共分支执行 rebase
```

### 22.2.7 stash —— 临时保存工作

```bash
# 张工正在开发排班功能，突然需要修复线上费用计算Bug
git stash push -m "排班功能半完成，临时保存"
git checkout hotfix/fee-calculation
# 修复完成后切回
git checkout feature/nursing-schedule
git stash pop
```

### 22.2.8 cherry-pick —— 选择性移植提交

```bash
# 王工发现 develop 分支上有一个修复老人入住日期校验的提交需要紧急同步到 release 分支
git checkout release/2.0
git cherry-pick a3f2b1c
# 只将这一个提交应用到当前分支
```

### 22.2.9 reset —— 撤销提交

```bash
# 张工提交了一个有Bug的排班算法，需要撤回
# 软重置：保留工作区和暂存区的修改
git reset --soft HEAD~1

# 混合重置（默认）：保留工作区，撤销暂存
git reset HEAD~1

# 硬重置：彻底丢弃（慎用！）
git reset --hard HEAD~1
```

---

## 22.3 分支管理策略

### 22.3.1 GitFlow 模式

GitFlow 适合养老院系统这类有明确版本发布节奏的项目：

| 分支类型 | 命名规则 | 用途 | 生命周期 |
|----------|----------|------|----------|
| `main` | `main` | 生产环境代码，仅合并已发布的版本 | 永久 |
| `develop` | `develop` | 开发主干，集成各功能分支 | 永久 |
| `feature/*` | `feature/nursing-schedule` | 新功能开发 | 临时，合并后删除 |
| `release/*` | `release/2.1` | 版本发布准备，修复小Bug | 临时 |
| `hotfix/*` | `hotfix/fee-bug` | 线上紧急修复 | 临时 |

### 22.3.2 Trunk-Based 模式

Trunk-Based 适合持续部署的小团队，所有人直接向 `main`（或 `develop`）提交短生命周期的分支：

```
main ──●──●──●──●──●──●──  （频繁集成，分支存活不超过2天）
        \  /    \  /
     feat-a  feat-b
```

### 22.3.3 养老院项目推荐

对于 3-8 人的养老院系统团队，推荐 GitFlow 的简化版：
- 保留 `main`（生产）+ `develop`（开发）两个长期分支
- 功能分支从 `develop` 拉取，合并回 `develop`
- 发布时从 `develop` 创建 `release/*`，测试通过后合并到 `main`

---

## 22.4 合并冲突解决实操

### 22.4.1 冲突场景

张工和李工同时修改了 `NursingScheduleService.cs` 中的 `GetWeeklySchedule` 方法。当张工合并时产生冲突：

```csharp
// 文件：src/Services/NursingScheduleService.cs
<<<<<<< HEAD (当前分支 develop)
    public List<ScheduleRecord> GetWeeklySchedule(int elderlyId)
    {
        var records = _context.ScheduleRecords
            .Where(r => r.ElderlyId == elderlyId)
            .ToList();
        return records;
    }
=======
    public List<ScheduleRecord> GetWeeklySchedule(int elderlyId, DateTime startDate)
    {
        var records = _context.ScheduleRecords
            .Where(r => r.ElderlyId == elderlyId && r.ScheduleDate >= startDate)
            .OrderBy(r => r.ScheduleDate)
            .ToList();
        return records;
    }
>>>>>>> feature/nursing-schedule
```

### 22.2.2 解决步骤

```bash
# 1. 查看冲突文件列表
git status

# 2. 手动编辑文件，保留正确代码
#    删除 <<<<<< ======= >>>>>> 标记行

# 3. 解决后将两个参数版本合并为最终方案
# 最终代码：
public List<ScheduleRecord> GetWeeklySchedule(int elderlyId, DateTime? startDate = null)
{
    var query = _context.ScheduleRecords
        .Where(r => r.ElderlyId == elderlyId);
    if (startDate.HasValue)
        query = query.Where(r => r.ScheduleDate >= startDate.Value);
    return query.OrderBy(r => r.ScheduleDate).ToList();
}

# 4. 标记冲突已解决
git add src/Services/NursingScheduleService.cs

# 5. 完成合并提交
git commit -m "merge: 合并护理排班服务，兼容新旧两种调用方式"
```

---

## 22.5 Code Review 流程

### 22.5.1 流程规范

```
开发者完成功能 → 创建 Pull Request → 指定审查人 → 审查通过 → 合并到目标分支
```

### 22.5.2 养老院项目 PR 模板

```markdown
## 变更说明
- 【护理模块】新增按老人护理等级自动排班功能

## 影响范围
- NursingScheduleService.cs
- ScheduleRecord.cs
- 排班管理前端页面

## 测试情况
- [x] 单元测试通过（覆盖率85%）
- [x] 手工测试：特级护理老人排班正确
- [x] 边界测试：空床位、跨月排班

## 数据库变更
- [ ] 无
- [x] 有（新增 ScheduleRecord.PriorityLevel 字段）

## 自查清单
- [x] 代码符合项目编码规范
- [x] 无硬编码配置
- [x] 已添加必要的日志记录
- [x] 老人隐私数据已脱敏处理
```

### 22.5.3 审查要点

- 业务逻辑：护理排班是否考虑了老人的特殊护理需求（如糖尿病老人的定时血糖监测）
- 数据安全：是否对老人身份证号、健康信息做了脱敏
- 性能：查询是否避免了 N+1 问题
- 异常处理：是否有完善的异常捕获和日志记录

---

## 22.6 .gitignore 配置

### 22.6.1 为什么需要 .gitignore

在养老院系统开发中，如果不配置 `.gitignore`，以下文件会被误提交到仓库：
- 编译产物（`bin/`、`obj/`）——每次编译都会变化，造成无意义的提交差异
- 含有数据库密码的 `appsettings.Production.json`——泄露后可能导致老人隐私数据暴露
- IDE 配置（`.vs/`、`.idea/`）——每个开发者不同，不应强制同步
- 本地数据库文件（`*.db`、`*.mdf`）——体积大且环境相关

### 22.6.2 养老院项目 .gitignore

```gitignore
## .NET 构建产物
bin/
obj/
*.dll
*.exe
*.pdb
*.nupkg

## IDE 配置
.vs/
.vscode/
*.suo
*.user
.idea/

## 配置文件（含敏感信息）
appsettings.Development.json
appsettings.Production.json
*.env

## 日志和临时文件
logs/
*.log
tmp/

## 数据库文件
*.db
*.sqlite
*.mdf

## 包管理
packages/
node_modules/

## 发布输出
publish/
```

> **重要提醒**：`appsettings.Production.json` 中包含数据库连接字符串和第三方服务密钥，绝不能提交到仓库。应通过环境变量或密钥管理服务注入。

---

## 22.7 Linux 常用命令

养老院系统部署在 Linux 服务器上后，日常运维离不开以下命令。

### 22.7.1 文件查看与搜索

```bash
# cat —— 查看文件内容
cat /var/log/elderly-care/app.log          # 查看应用日志

# tail —— 实时跟踪日志
tail -f /var/log/elderly-care/app.log      # 实时监控养老院系统日志
tail -n 100 /var/log/elderly-care/app.log  # 查看最后100行

# grep —— 搜索关键字
grep "ERROR" /var/log/elderly-care/app.log                    # 搜索错误日志
grep -r "护理排班" /var/log/elderly-care/                      # 递归搜索
grep -i "elderly.*入住" /var/log/elderly-care/app.log | tail   # 模糊搜索
```

### 22.7.2 进程管理

```bash
# ps —— 查看进程
ps aux | grep dotnet           # 查看所有 .NET 进程
ps -ef | grep elderly-care     # 查看养老院系统进程

# top —— 实时资源监控
top                            # 查看 CPU、内存使用情况
top -u elderlycare             # 只查看特定用户的进程

# kill —— 终止进程
kill 12345                     # 发送 SIGTERM 优雅终止
kill -9 12345                  # 强制终止（最后手段）
```

### 22.7.3 磁盘与网络

```bash
# df —— 磁盘空间概览
df -h                          # 人类可读格式查看磁盘
df -h /var/log                 # 查看日志分区使用情况

# du —— 目录占用大小
du -sh /var/log/elderly-care/  # 查看养老院日志目录大小
du -sh /opt/elderly-care/      # 查看应用目录大小

# curl —— HTTP 请求测试
curl -s http://localhost:5000/api/health          # 健康检查
curl -X POST http://localhost:5000/api/elderly     # 测试API

# netstat —— 网络连接与端口
netstat -tlnp | grep 5000      # 查看5000端口是否被监听
netstat -an | grep ESTABLISHED # 查看活跃连接数
```

### 22.7.4 系统信息与权限管理

```bash
# 查看系统信息
uname -a                        # 查看内核版本
cat /etc/os-release             # 查看发行版信息
free -h                         # 查看内存使用情况
uptime                          # 查看运行时间和负载

# 查看系统日志（排查养老院系统崩溃原因）
sudo journalctl --since "1 hour ago"  # 最近一小时的系统日志
sudo dmesg | tail -50                  # 内核日志

# 权限管理
# chmod —— 修改文件权限
chmod 755 deploy.sh            # 所有者可读写执行，其他可读执行
chmod 600 appsettings.json     # 仅所有者可读写（敏感配置文件）
chmod -R 755 /opt/elderly-care/ # 递归修改目录权限

# chown —— 修改文件所有者
sudo chown -R elderlycare:elderlycare /opt/elderly-care/
```

---

## 22.8 systemd 管理 .NET 应用

### 22.8.1 创建服务单元文件

```bash
sudo vi /etc/systemd/system/elderly-care.service
```

```ini
[Unit]
Description=养老院管理系统 API 服务
After=network.target

[Service]
WorkingDirectory=/opt/elderly-care/publish
ExecStart=/usr/bin/dotnet /opt/elderly-care/publish/ElderlyCareSystem.dll
Restart=always
RestartSec=10
SyslogIdentifier=elderly-care
User=elderlycare
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://0.0.0.0:5000
Environment=DOTNET_PRINT_TELEMETRY_MESSAGE=false

[Install]
WantedBy=multi-user.target
```

### 22.8.2 常用管理命令

```bash
# 重载 systemd 配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start elderly-care

# 查看服务状态
sudo systemctl status elderly-care

# 停止服务
sudo systemctl stop elderly-care

# 重启服务
sudo systemctl restart elderly-care

# 设置开机自启
sudo systemctl enable elderly-care

# 查看服务日志
sudo journalctl -u elderly-care -f           # 实时跟踪
sudo journalctl -u elderly-care --since today # 查看今天的日志
sudo journalctl -u elderly-care -n 200        # 最后200条
```

---

## 22.9 SSH 密钥配置

### 22.9.1 生成密钥对

```bash
# 生成 ED25519 密钥（推荐）
ssh-keygen -t ed25519 -C "zhanggong@yourcompany.com"
# 默认保存到 ~/.ssh/id_ed25519（私钥）和 ~/.ssh/id_ed25519.pub（公钥）
# 设置密码短语（passphrase）增加安全性
```

### 22.9.2 配置 Git 使用 SSH

```bash
# 将公钥添加到 Gitea/GitHub
cat ~/.ssh/id_ed25519.pub
# 复制输出内容，粘贴到远程仓库的 SSH Keys 设置页面

# 测试连接
ssh -T git@gitea.yourcompany.com

# 配置 SSH config 简化连接
vi ~/.ssh/config
```

```text
Host gitea
    HostName gitea.yourcompany.com
    User git
    IdentityFile ~/.ssh/id_ed25519

Host elderly-server
    HostName 192.168.1.100
    User elderlycare
    IdentityFile ~/.ssh/id_ed25519
    Port 22
```

```bash
# 使用简短别名连接
ssh gitea
ssh elderly-server
```

### 22.9.3 养老院服务器免密登录

```bash
# 将公钥复制到养老院生产服务器
ssh-copy-id elderlycare@192.168.1.100

# 之后登录无需密码
ssh elderlycare@192.168.1.100
```

---

## 22.10 防火墙配置（firewall-cmd）

### 22.10.1 基本操作

```bash
# 查看防火墙状态
sudo firewall-cmd --state
sudo firewall-cmd --list-all

# 查看所有开放的端口
sudo firewall-cmd --list-ports
sudo firewall-cmd --list-services
```

### 22.10.2 开放端口

```bash
# 开放养老院系统 API 端口（临时）
sudo firewall-cmd --add-port=5000/tcp

# 开放端口（永久，重启后生效）
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --permanent --add-port=5001/tcp   # HTTPS 端口

# 重新加载配置
sudo firewall-cmd --reload
```

### 22.10.3 养老院生产环境推荐配置

```bash
# 仅允许内网访问数据库端口
sudo firewall-cmd --permanent --add-rich-rule='
  rule family="ipv4"
  source address="192.168.1.0/24"
  port protocol="tcp" port="3306"  # MySQL 默认 3306，5432 为 PostgreSQL
  accept'

# 关闭不需要的端口
sudo firewall-cmd --permanent --remove-port=8080/tcp

# 开放 SSH 和 HTTP/HTTPS
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# 重新加载
sudo firewall-cmd --reload

# 验证最终结果
sudo firewall-cmd --list-all
```

---

## 实战案例：养老院系统部署全流程

### 场景描述

养老院管理系统 v2.0 开发完毕，需要部署到生产服务器（CentOS 8，IP: 192.168.1.100）。

### 完整操作流程

```bash
# ===== 第一步：代码打包 =====
# 本地发布
dotnet publish -c Release -o ./publish

# ===== 第二步：配置 SSH 免密 =====
ssh-copy-id elderlycare@192.168.1.100

# ===== 第三步：上传发布文件 =====
scp -r ./publish/* elderlycare@192.168.1.100:/opt/elderly-care/publish/

# ===== 第四步：服务器配置 systemd =====
ssh elderlycare@192.168.1.100
sudo systemctl daemon-reload
sudo systemctl restart elderly-care
sudo systemctl status elderly-care

# ===== 第五步：配置防火墙 =====
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# ===== 第六步：验证 =====
curl -s http://localhost:5000/api/health
# 返回 {"status":"Healthy"} 表示部署成功

# ===== 第七步：查看日志 =====
sudo journalctl -u elderly-care -f
# 确认无报错，养老院系统正常运行
```

---

## 常见错误与最佳实践

| # | 错误写法 | 正确写法 | 为什么错 |
|---|---------|---------|---------|
| 1 | 直接 `git push` 不先 pull | 先 `git pull --rebase` 再 push | 远程有新提交会导致 non-fast-forward 拒绝 |
| 2 | 合并冲突后 `git reset --hard` 丢弃修改 | 用 `git reflog` 找回历史提交再手动解决 | 硬重置不可逆，修改永久丢失 |
| 3 | systemd 服务启动失败不看日志 | `journalctl -u xxx -n 50` 查看具体报错 | 盲目重启无法定位根因 |
| 4 | SSH 用密码登录生产服务器 | 配置密钥认证 + 禁用密码登录 | 密码可被暴力破解，密钥更安全 |
| 5 | `.gitignore` 未配置就提交 | 项目初始化时配置 .gitignore | `bin/`/`obj/`/`.env` 等文件泄露到仓库 |
| 6 | 日志文件不轮转，磁盘写满 | 配置 logrotate 或 Serilog 按天滚动 | 磁盘满导致数据库宕机，服务全部不可用 |
| 7 | 直接 `kill -9` 杀进程 | 先 `kill`（SIGTERM），等进程优雅退出 | `kill -9` 不执行清理逻辑，可能损坏数据 |
| 8 | 文件权限 777 全开放 | 用 `chmod 755` + `chown` 设置合理权限 | 777 任何用户都能修改，安全风险极高 |

---

## 本章小结

本章围绕养老院管理系统的实际开发运维场景，系统讲解了 Git 版本控制和 Linux 运维两大核心技能。在 Git 部分，我们从工作区、暂存区、仓库、HEAD 四个核心概念出发，通过张工、李工、王工三人协作的真实场景，演示了 clone、add、commit、push、pull、merge 等命令的使用，对比了 GitFlow 和 Trunk-Based 两种分支策略，展示了合并冲突的解决方法和 Code Review 的规范流程。在 Linux 运维部分，我们覆盖了文件查看、进程管理、磁盘监控等常用命令，重点讲解了如何使用 systemd 托管 .NET 应用、配置 SSH 密钥实现安全连接、以及通过 firewall-cmd 管理防火墙规则。这些技能是养老院系统从开发到上线的必备基础。

---

## 面试题

### 面试题 1（初级 / 概念题）
**题目**：Git 的工作区、暂存区、仓库分别是什么？

**参考答案**：工作区是你编辑代码的目录（看到的文件）；暂存区（Index）是 `git add` 后的中间状态，准备提交的快照；仓库（Repository）是 `git commit` 后的永久记录。养老院场景：修改了长者护理计划（工作区）→ `git add` 标记为待提交（暂存区）→ `git commit` 保存历史记录（仓库）。

### 面试题 2（初级 / 概念题）
**题目**：git merge 和 git rebase 有什么区别？

**参考答案**：`merge` 保留分支历史，创建合并提交（非线性），适合公共分支。`rebase` 将提交"搬到"目标分支顶部（线性历史），适合本地未推送的提交。养老院场景：feature 分支开发完成后合并到 develop 用 `merge`；本地提交整理用 `rebase`。**黄金法则**：已推送到远程的提交不要 rebase。

### 面试题 3（中级 / 概念题）
**题目**：GitFlow 和 Trunk-Based 分支策略有什么区别？

**参考答案**：GitFlow 有 main/develop/feature/release/hotfix 五种分支，适合发布周期长的项目。Trunk-Based 所有人直接在 main 上开发，用 feature flag 控制功能发布，适合持续部署。养老院系统版本迭代较慢，推荐 GitFlow；如果团队成熟且有完善 CI/CD，可考虑 Trunk-Based。

### 面试题 4（初级 / 概念题）
**题目**：如何解决 Git 合并冲突？

**参考答案**：`git pull` 或 `git merge` 后出现冲突标记（`<<<<<<<`/`=======`/`>>>>>>>`），手动编辑文件选择保留哪部分，然后 `git add` + `git commit`。养老院场景：张工和李工同时修改了护理计划的同一段落，合并时需要人工判断保留谁的修改或合并两者。

### 面试题 5（中级 / 概念题）
**题目**：Code Review 时应该关注哪些要点？

**参考答案**：① 代码正确性（逻辑是否正确）；② 安全性（SQL 注入、XSS、权限检查）；③ 性能（N+1 查询、大对象分配）；④ 可读性（命名规范、注释）；⑤ 测试覆盖（是否有单元测试）。养老院场景：Review 账单计算 PR 时，重点检查金额精度（decimal vs double）、边界条件（入住当天是否计费）。

### 面试题 6（初级 / 概念题）
**题目**：.gitignore 应该忽略哪些 .NET 项目文件？

**参考答案**：`bin/`、`obj/`（编译输出）、`.vs/`（VS 配置）、`*.user`（用户设置）、`appsettings.Development.json`（本地配置）、`*.log`（日志文件）。不应该忽略：`appsettings.json`（模板配置）、`*.csproj`（项目文件）。养老院场景：`.env` 文件含数据库密码，必须加入 .gitignore。

### 面试题 7（中级 / 场景题）
**题目**：如何用 Linux 命令排查 .NET 应用的 CPU 高问题？

**参考答案**：① `top` 查看哪个进程 CPU 高（找到 dotnet 进程 PID）；② `top -Hp <PID>` 查看哪个线程；③ `dotnet-dump collect -p <PID>` 收集转储；④ `dotnet-dump analyze` 查看线程堆栈。养老院场景：账单生成接口响应慢，`top` 发现 dotnet 进程 CPU 90%，用 dump 分析发现死循环。

### 面试题 8（初级 / 概念题）
**题目**：systemctl 的常用命令有哪些？

**参考答案**：`systemctl start/stop/restart/status <服务名>` 管理服务，`systemctl enable/disable <服务名>` 设置开机自启，`journalctl -u <服务名> -f` 查看实时日志。养老院场景：养老院 API 服务挂了，`systemctl status nursinghome-api` 查看状态，`systemctl restart nursinghome-api` 重启。

### 面试题 9（中级 / 概念题）
**题目**：tail -f 和 grep 在日志排查中怎么配合使用？

**参考答案**：`tail -f /var/log/nursinghome/app.log` 实时查看日志输出，`tail -f app.log | grep ERROR` 只看错误日志，`grep -n "Exception" app.log` 搜索异常并显示行号，`grep -C 5 "错误关键词" app.log` 显示匹配行前后 5 行上下文。养老院场景：排查账单生成失败，`tail -f app.log | grep -i "bill"` 实时过滤账单相关日志。

### 面试题 10（初级 / 概念题）
**题目**：SSH 密钥认证和密码认证有什么区别？

**参考答案**：密码认证每次输入密码，易被暴力破解。密钥认证用公私钥对，私钥本地保存，公钥放服务器，更安全且免密登录。配置：`ssh-keygen -t rsa` 生成密钥，`ssh-copy-id user@server` 上传公钥。养老院场景：部署服务器用密钥认证，禁止密码登录，提高安全性。

### 面试题 11（中级 / 场景题）
**题目**：如何用 firewall-cmd 开放端口？

**参考答案**：`firewall-cmd --permanent --add-port=5000/tcp` 永久开放 5000 端口，`firewall-cmd --reload` 重新加载规则，`firewall-cmd --list-ports` 查看已开放端口。养老院场景：部署养老院 API（端口 5000）和 Redis（端口 6379），需要开放这两个端口。注意：Redis 端口只对内网开放，不对公网开放。

### 面试题 12（高级 / 设计题）
**题目**：描述养老院系统从开发到上线的完整 Git 工作流。

**参考答案**：① 从 develop 创建 feature 分支（`feature/elder-checkin`）；② 本地开发 + 测试；③ 推送 + 创建 PR；④ Code Review（至少一人审核）；⑤ 合并到 develop；⑥ CI 自动构建 + 测试；⑦ 从 develop 创建 release 分支；⑧ 测试环境验证；⑨ 合并到 main + 打 Tag；⑩ CD 自动部署到生产。紧急修复走 hotfix 分支。

---

## 下一章预告

**第 23 章：Docker 容器化、CI/CD 与生产运维**

我们已学会用 SSH 手动部署养老院系统，但手动部署存在环境不一致、回滚困难等问题。下一章将学习：
- Docker 基础（镜像/容器/网络/Volume）
- 多阶段 Dockerfile 编写（优化镜像大小）
- Docker Compose 编排（MySQL + Redis + RabbitMQ + 应用）
- GitHub Actions CI/CD 流水线（构建→测试→打镜像→部署）
- Nginx 反向代理 + HTTPS 证书配置
- 数据库备份策略（mysqldump 定时备份）
- 生产故障排查清单（CPU 高/内存泄漏/接口慢/慢查询）

---

---

## 时效性声明

本章内容基于 **.NET 5.0**、**ABP 4.4.0**、**Git 2.40+**、**Ubuntu 22.04 LTS**、**systemd 249+** 编写。Git 命令在各版本中保持兼容。Linux 命令在 CentOS/RHEL 中部分语法略有差异（如 `firewall-cmd` 替代 `ufw`）。

---

## 修订记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-07-10 | v1.0 | 初版：Git 核心概念、常用命令、分支策略、冲突解决、Code Review、Linux 命令、systemd、SSH、防火墙 |
| 2026-07-10 | v1.1 | 补全面试题（12题）、时效性声明、修订记录 |
| 2026-07-10 | v1.2 | 错误表改为四列标准格式；删除内联重复时效性声明/修订记录；下一章预告改为第23章Docker；前置知识补充第21章；.NET 6→5.0；为什么需要学→这个？ |
| 2026-07-10 | v1.3 | MySQL 端口 5432→3306 修正 |
