# 🎮 Tetris Game

[![Build · Push · Deploy](https://github.com/zkj0407/tetris-game/actions/workflows/build-deploy.yml/badge.svg)](https://github.com/zkj0407/tetris-game/actions/workflows/build-deploy.yml)
[![Docker Image](https://ghcr-badge.egpl.dev/zkj0407/tetris-game/latest_tag?label=image)](https://github.com/zkj0407/tetris-game/pkgs/container/tetris-game)

经典俄罗斯方块游戏，基于原生 HTML/CSS/JavaScript 开发，支持 Docker 一键部署。

**在线体验：** [http://114.132.242.105](http://114.132.242.105)

---

## 功能特性

- 标准 SRS 旋转系统（踢墙修正）
- 暂存（Hold）/ 下一个预览（Next）
- 自适应移动端触控操作
- 等级递增，速度随分数提升
- 最高分本地持久化

---

## 快速开始

### 方式一：Docker 一键运行

```bash
docker run -d -p 80:80 --name tetris-game --restart always \
  ghcr.io/zkj0407/tetris-game:latest
```

访问 [http://localhost](http://localhost) 即可游玩。

### 方式二：docker-compose

```bash
# 克隆项目
git clone https://github.com/zkj0407/tetris-game.git
cd tetris-game

# 启动
docker compose up -d

# 停止
docker compose down
```

### 方式三：本地直接运行

由于使用 ES 模块，需通过 HTTP 服务器运行（不能直接双击 index.html）：

```bash
# Python
python3 -m http.server 8080

# Node.js (需安装 serve)
npx serve .
```

访问 [http://localhost:8080](http://localhost:8080)

---

## 操作说明

| 按键 | 操作 |
|------|------|
| `← →` | 左右移动 |
| `↑` | 旋转 |
| `↓` | 加速下落 |
| `Space` | 硬降（直接落底） |
| `C` | 暂存当前方块 |
| `P` | 暂停 / 继续 |

移动端支持触摸按钮和滑动手势。

---

## 部署到云服务器

### 自动部署（推荐）

推送代码到 `main` 分支后，GitHub Actions 将自动：
1. 构建 amd64 + arm64 多架构镜像并推送到 GHCR
2. 导出两个架构的离线 `.tar` 镜像包（可在 Actions 页面下载）
3. SSH 连接云服务器，拉取最新镜像并重启容器

**首次使用前，需在 GitHub 仓库添加以下 Secrets：**

进入 `Settings → Secrets and Variables → Actions → New repository secret`

| Secret 名称 | 值 |
|------------|-----|
| `SERVER_HOST` | `114.132.242.105` |
| `SERVER_USER` | `ubuntu` |
| `SERVER_PASSWORD` | 服务器登录密码 |

### 手动触发部署

在 GitHub Actions 页面点击 **Run workflow**，可手动触发一次完整的构建和部署。

### 腾讯云安全组配置

确保腾讯云控制台的安全组已放行以下端口（入站规则）：

| 协议 | 端口 | 来源 |
|------|------|------|
| TCP | 80 | 0.0.0.0/0 |

---

## 离线镜像使用

每次工作流运行后，会在 Actions 的 Artifacts 区域生成：
- `tetris-image-amd64.tar` — 适用于 x86_64 服务器/PC
- `tetris-image-arm64.tar` — 适用于 树莓派 / Apple Silicon / ARM 服务器

**加载并运行：**

```bash
# 加载镜像
docker load -i tetris-image-amd64.tar

# 运行容器（映射到 80 端口）
docker run -d -p 80:80 --name tetris-game --restart always tetris-game:amd64
```

---

## 项目结构

```
tetris-game/
├── index.html              # 主页面
├── style.css               # 样式
├── src/
│   ├── main.js             # 入口，DOM 绑定
│   ├── game.js             # 游戏主循环与状态机
│   ├── board.js            # 棋盘逻辑、碰撞检测、消行
│   ├── tetromino.js        # 方块形状、颜色、随机包
│   ├── renderer.js         # Canvas 渲染
│   └── input.js            # 键盘 / 触控输入
├── Dockerfile              # nginx:alpine 镜像构建
├── nginx.conf              # Nginx 静态服务配置
├── docker-compose.yml      # 服务器一键部署配置
└── .github/
    └── workflows/
        └── build-deploy.yml  # CI/CD 工作流
```

---

## TODO

- [ ] 添加背景音乐与音效
- [ ] 多主题皮肤（暗色 / 亮色 / 霓虹）
- [ ] 排行榜（本地存储 Top 10）
- [ ] 双人对战模式（WebSocket）
- [ ] Progressive Web App（PWA）离线支持
- [ ] 国际化（中/英）语言切换
- [ ] 自定义按键绑定
- [ ] 游戏录像回放功能
- [ ] CI 自动构建后发布 GitHub Release（附带离线镜像）
- [x] Docker 多架构镜像构建（amd64 / arm64）
- [x] GitHub Actions 自动部署到腾讯云服务器
- [x] 离线镜像包导出与下载
