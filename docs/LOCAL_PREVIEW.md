# 本地预览指南

本文档说明如何在本地启动教程网站进行预览。

---

## 环境要求

| 项目 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Python | 3.10+ | 3.14 |
| pip | 22.0+ | 最新 |
| 操作系统 | Windows / macOS / Linux | 均可 |

---

## 方案一：Windows 本地运行（推荐）

### 第 1 步：安装 Python 3

如果你的 Windows 上 `python --version` 显示 `2.7.x`，需要先安装 Python 3：

```powershell
# 方法 A：从微软商店安装（最快）
winget install Python.Python.3.14

# 方法 B：从官网下载
# https://www.python.org/downloads/
# 安装时勾选 "Add Python to PATH"
```

安装完成后**关闭并重新打开 PowerShell**，验证：

```powershell
python --version
# 应显示 Python 3.14.x（不是 2.7.x）
```

### 第 2 步：安装 MkDocs 和 Material 主题

```powershell
pip install mkdocs mkdocs-material
```

验证安装：

```powershell
mkdocs --version
# 应显示 mkdocs, version 1.6.x
```

### 第 3 步：启动本地预览

```powershell
cd E:\github\ai-llm-tutorial
mkdocs serve
```

浏览器打开 http://127.0.0.1:8000 即可预览。

### 第 4 步：停止预览

在 PowerShell 窗口按 `Ctrl + C`。

---

## 方案二：WSL 中运行

适用于 Windows 上 Python 环境配置困难的情况。

### 第 1 步：进入项目目录

```bash
cd /mnt/e/github/ai-llm-tutorial
```

### 第 2 步：创建虚拟环境并安装依赖

```bash
# 创建虚拟环境
uv venv .venv

# 激活虚拟环境
source .venv/bin/activate

# 安装 MkDocs 和 Material 主题
uv pip install mkdocs mkdocs-material
```

> 如果 `uv` 未安装，先执行：`curl -LsSf https://astral.sh/uv/install.sh | sh`

### 第 3 步：启动本地预览

```bash
mkdocs serve -a 0.0.0.0:8000
```

在 Windows 浏览器中打开 http://127.0.0.1:8000 即可预览。

### 第 4 步：停止预览

按 `Ctrl + C`。

---

## 方案三：Docker 运行

如果你安装了 Docker Desktop：

```powershell
cd E:\github\ai-llm-tutorial

# 一行命令启动
docker run --rm -it -p 8000:8000 -v "%cd%":/docs squidfunk/mkdocs-material
```

浏览器打开 http://127.0.0.1:8000。

---

## 构建静态网站

如果不需要实时预览，只想生成静态 HTML 文件：

```bash
# 构建（输出到 site/ 目录）
mkdocs build

# 构建后的文件在 site/ 目录下
# 可以直接用浏览器打开 site/index.html
# 或部署到任何静态文件服务器
```

---

## 常见问题

### Q: `mkdocs` 命令找不到

```powershell
# 确认 Python 版本
python --version

# 重新安装
pip install mkdocs mkdocs-material

# 如果 pip 也找不到
python -m pip install mkdocs mkdocs-material
```

### Q: 构建报错 `zh-Hans.html not found`

检查 `mkdocs.yml` 中的语言配置：

```yaml
theme:
  language: zh    # 用 zh，不要用 zh-Hans
```

### Q: 构建报错 `theme 'material' does not appear to have a configuration file`

mkdocs-material 安装不完整，重新安装：

```bash
pip install --force-reinstall mkdocs-material
```

### Q: 端口 8000 被占用

```bash
# 使用其他端口
mkdocs serve -a 0.0.0.0:8001
# 浏览器打开 http://127.0.0.1:8001
```

### Q: 修改文件后页面没有刷新

MkDocs 支持热重载，保存文件后浏览器会自动刷新。如果没有：

```bash
# 重启服务
Ctrl + C
mkdocs serve
```

---

## 项目结构说明

```
ai-llm-tutorial/
├── mkdocs.yml                     # MkDocs 配置文件
├── docs/                          # Markdown 源文件
│   ├── index.md                   # 首页
│   ├── interview-questions.md     # 面试题汇总
│   ├── assets/                    # 静态资源（CSS、图片）
│   └── 第01章_*.md ~ 第17章_*.md  # 17 章内容
├── site/                          # 构建产物（自动生成，不提交到 Git）
├── .github/workflows/deploy.yml   # GitHub Actions 自动部署
├── .gitignore
└── README.md
```

---

## 部署到 GitHub Pages

```powershell
# 1. 提交代码
git add .
git commit -m "feat: 更新教程内容"
git push

# 2. GitHub Actions 会自动构建并部署到 gh-pages 分支
# 3. 访问 https://huanghhcri.github.io/ai-llm-tutorial/
```

首次部署需要在 GitHub 仓库设置中启用 Pages：

1. 进入仓库 → **Settings** → **Pages**
2. Source 选择 **Deploy from a branch**
3. Branch 选择 **gh-pages** / **root**
4. 保存，等待 2-3 分钟
