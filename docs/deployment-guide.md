# 部署全流程操作文档

> 本文档记录了将 Tetris Game 从本地项目发布为可公网访问的 Web 服务的完整操作步骤，并附带关键知识点说明。

---

## 目录

1. [项目概述](#1-项目概述)
2. [Docker 容器化](#2-docker-容器化)
3. [CI/CD 工作流设计](#3-cicd-工作流设计)
4. [云服务器部署](#4-云服务器部署)
5. [踩坑与修复记录](#5-踩坑与修复记录)
6. [响应式适配](#6-响应式适配)
7. [知识点速查](#7-知识点速查)

---

## 1. 项目概述

### 项目结构

```
tetris-game/
├── index.html              # 主页面入口
├── style.css               # 样式
├── src/
│   ├── main.js             # 入口，DOM 绑定 + canvas 自适应
│   ├── game.js             # 游戏状态机与主循环
│   ├── board.js            # 棋盘逻辑
│   ├── tetromino.js        # 方块定义
│   ├── renderer.js         # Canvas 渲染
│   └── input.js            # 键盘/触控输入
├── Dockerfile              # 镜像构建配置
├── nginx.conf              # Nginx 静态服务配置
├── docker-compose.yml      # 服务编排配置
└── .github/
    └── workflows/
        └── build-deploy.yml  # CI/CD 自动化工作流
```

### 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | 原生 HTML5 + CSS3 + ES Modules |
| 容器 | Docker (nginx:alpine) |
| 镜像仓库 | GitHub Container Registry (GHCR) |
| CI/CD | GitHub Actions |
| 云服务器 | 腾讯云 Ubuntu |
| 反向代理 | Nginx |

---

## 2. Docker 容器化

### 2.1 Dockerfile

```dockerfile
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY index.html  /usr/share/nginx/html/
COPY style.css   /usr/share/nginx/html/
COPY src/        /usr/share/nginx/html/src/
COPY nginx.conf  /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
```

**知识点：**

- `FROM nginx:alpine`：使用 Alpine Linux 版的 Nginx 基础镜像，体积极小（约 25MB），适合静态网站托管。
- `EXPOSE 80`：声明容器监听 80 端口，这只是文档性声明，实际端口映射在 `docker run -p` 或 `docker-compose` 中定义。
- `HEALTHCHECK`：容器健康检查，Docker 会定期执行该命令，失败超过 `retries` 次后将容器标记为 `unhealthy`。

### 2.2 nginx.conf

```nginx
server {
    listen 80;
    root   /usr/share/nginx/html;

    gzip on;
    gzip_types text/plain text/css application/javascript;

    location ~* \.js$ {
        add_header Content-Type "application/javascript; charset=utf-8";
    }

    location ~* \.(css|js|png|jpg)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }
}
```

**知识点：**

- **gzip 压缩**：减少传输体积，通常可压缩 60–80% 的文本内容，显著提升加载速度。
- **MIME 类型**：浏览器对 ES Modules 有严格的 MIME 检查，`.js` 文件必须返回 `application/javascript`，否则浏览器会拒绝执行。
- **Cache-Control**：`immutable` 告诉浏览器该资源内容不会变化，可以无需条件请求直接使用缓存，大幅提升二次访问速度。

### 2.3 docker-compose.yml

```yaml
services:
  tetris:
    image: ghcr.io/zkj0407/tetris-game:latest
    container_name: tetris-game
    ports:
      - "80:80"
    restart: always
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

**知识点：**

- `restart: always`：容器异常退出或服务器重启后自动重新启动容器，保证服务高可用。
- `ports: "80:80"`：格式为 `宿主机端口:容器端口`，将宿主机的 80 端口映射到容器内的 80 端口。
- `start_period`：容器启动后给予 10 秒的宽限期，宽限期内的健康检查失败不计入 retries。

---

## 3. CI/CD 工作流设计

### 3.1 工作流触发条件

```yaml
on:
  push:
    branches: [main]       # 推送到 main 分支时自动触发
  workflow_dispatch:        # 支持在 Actions 页面手动触发
    inputs:
      deploy:
        type: boolean
        default: true
```

### 3.2 三个并行/串行 Job

```
push to main
    │
    ▼
[Job 1] build-and-push          ← 构建 amd64+arm64 镜像推送到 GHCR
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
[Job 2] export-offline-images   [Job 3] deploy-to-server
  导出 .tar 离线包上传到 Artifacts    SSH 登录服务器，拉取镜像重启容器
```

### 3.3 多架构构建

```yaml
- name: Set up QEMU
  uses: docker/setup-qemu-action@v3      # 模拟 ARM 指令集

- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3   # 跨平台构建器

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64   # 同时构建两种架构
    push: true
```

**知识点：**

- **QEMU**：一个开源处理器模拟器。GitHub Actions 的 Runner 是 x86_64 机器，通过 QEMU 可以模拟 ARM 指令集，从而在 x86 机器上构建 ARM 镜像。
- **Docker Buildx**：Docker 的扩展构建工具，支持多平台同时构建，并可将不同架构的镜像打包为一个 **Manifest List**（多架构镜像索引），用户 `docker pull` 时会自动下载匹配本机架构的版本。
- **GHCR (GitHub Container Registry)**：GitHub 提供的免费容器镜像仓库，公开仓库无存储费用，使用仓库内置的 `GITHUB_TOKEN` 即可认证，无需额外账号。

### 3.4 镜像缓存加速

```yaml
cache-from: type=gha    # 从 GitHub Actions 缓存读取构建层
cache-to: type=gha,mode=max   # 将构建层写入缓存
```

**知识点：** Docker 构建利用分层缓存机制，如果某一层的指令和上下文没有变化，可以直接复用已有层而无需重新构建。`type=gha` 将缓存存储在 GitHub Actions 的内置缓存服务中（免费，最大 10GB）。

### 3.5 离线镜像包导出

```yaml
- name: Build single-arch image for export
  uses: docker/build-push-action@v5
  with:
    load: true          # 将镜像加载到 Runner 本地 Docker
    tags: tetris-game:amd64

- name: Export image to tar
  run: docker save tetris-game:amd64 -o tetris-image-amd64.tar

- name: Upload artifact
  uses: actions/upload-artifact@v4
  with:
    name: tetris-image-amd64
    path: tetris-image-amd64.tar
    retention-days: 30
```

**知识点：**

- `docker save`：将镜像导出为 `.tar` 文件，包含所有层数据，可在离线环境通过 `docker load` 导入。
- `actions/upload-artifact`：将工作流产出物（文件）上传到 GitHub，可在 Actions 运行记录页面下载，保留 30 天。

---

## 4. 云服务器部署

### 4.1 GitHub Secrets 配置

在 GitHub 仓库 `Settings → Secrets and Variables → Actions` 中添加：

| Secret 名称 | 说明 |
|------------|------|
| `SERVER_HOST` | 服务器公网 IP |
| `SERVER_USER` | SSH 用户名 |
| `SERVER_PASSWORD` | SSH 登录密码 |

**知识点：** GitHub Secrets 是加密存储的环境变量，工作流运行时以 `${{ secrets.NAME }}` 引用。Secrets 的值在日志中会被自动脱敏替换为 `***`，即使意外打印也不会泄露。

### 4.2 SSH 自动部署

```yaml
- name: Deploy via SSH
  uses: appleboy/ssh-action@v1.0.3
  with:
    host:     ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    password: ${{ secrets.SERVER_PASSWORD }}
    script: |
      sudo docker pull ghcr.io/zkj0407/tetris-game:latest
      sudo docker compose down --remove-orphans || true
      sudo docker compose up -d
      sudo docker image prune -f
```

**知识点：**

- `appleboy/ssh-action`：一个封装了 SSH 客户端的 GitHub Action，支持密码和密钥两种认证方式，可在 CI 流程中远程执行任意 shell 命令。
- `docker image prune -f`：清理所有悬空镜像（没有被任何容器引用的旧镜像层），释放磁盘空间。

### 4.3 腾讯云安全组

需在腾讯云控制台手动放行入站端口：

| 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|
| TCP | 80 | 0.0.0.0/0 | HTTP 访问 |
| TCP | 22 | 0.0.0.0/0 | SSH 登录（建议限制来源 IP） |

**知识点：** 安全组是云服务器的虚拟防火墙，工作在网络层，在流量到达服务器操作系统之前进行过滤。即使服务器内的 Docker 容器已正常运行，如果安全组未放行对应端口，外部流量也无法到达。

---

## 5. 踩坑与修复记录

### 5.1 缺少 Server Host（missing server host）

**现象：** Deploy 步骤报错 `Error: missing server host`

**原因：** GitHub Secrets 未配置，`${{ secrets.SERVER_HOST }}` 展开为空字符串，`appleboy/ssh-action` 检测到空主机名报错。

**修复：** 在 SSH 步骤前增加 Secret 校验步骤，明确提示哪个 Secret 未配置：

```yaml
- name: Verify deployment secrets are configured
  env:
    SERVER_HOST:     ${{ secrets.SERVER_HOST }}
  run: |
    [ -z "$SERVER_HOST" ] && echo "❌ Missing: SERVER_HOST" && exit 1
    echo "✅ All secrets configured."
```

---

### 5.2 Docker 权限不足（permission denied）

**现象：** `docker pull` 报错 `permission denied while trying to connect to the Docker daemon socket`

**原因：** SSH 登录的 `ubuntu` 用户不在 `docker` 用户组内，无法直接访问 `/var/run/docker.sock`。

**修复：** 所有 `docker` 命令前加 `sudo`：

```bash
sudo docker pull ghcr.io/zkj0407/tetris-game:latest
sudo docker compose up -d
```

**知识点：** Docker 守护进程（dockerd）以 root 身份运行，其 socket 文件 `/var/run/docker.sock` 默认仅 root 和 `docker` 组可读写。常见解决方案有两种：
1. `sudo docker`（临时方案，简单直接）
2. `sudo usermod -aG docker $USER`（永久方案，将用户加入 docker 组，需重新登录生效）

---

### 5.3 docker-compose 下载卡死

**现象：** 工作流卡在 `Installing docker-compose plugin...`，curl 速度显示为 0

**原因：** 腾讯云（中国大陆）服务器访问 `github.com/docker/compose/releases` 下载二进制文件速度极慢甚至超时。同时，检测逻辑只检查 V2（`docker compose`），忽略了服务器上已安装的 V1（`docker-compose`）。

**修复：** 兼容 V1 和 V2，优先使用已有版本，均无则通过 apt 安装（走 Docker 官方源，在国内较快）：

```bash
if sudo docker compose version &>/dev/null 2>&1; then
  DC="sudo docker compose"          # V2 插件版
elif command -v docker-compose &>/dev/null; then
  DC="sudo docker-compose"          # V1 独立版
else
  sudo apt-get install -y docker-compose-plugin   # 兜底安装
  DC="sudo docker compose"
fi

$DC down --remove-orphans || true
$DC up -d
```

**知识点：**

| 版本 | 命令格式 | 安装方式 | 配置文件 |
|------|---------|---------|---------|
| V1 | `docker-compose up` | pip / 独立二进制 | `docker-compose.yml` |
| V2 | `docker compose up` | Docker 插件 | `compose.yml` 或 `docker-compose.yml` |

---

## 6. 响应式适配

### 6.1 问题分析

原始代码中 canvas 尺寸硬编码在 HTML 属性中（`width="300" height="600"`），CSS 使用固定 `--cell-size: 30px`，导致：
- 手机屏幕溢出，需要横向滚动
- 大屏幕留有大量空白，游戏区域偏小

### 6.2 解决方案

**核心思路：** 以视口尺寸为输入，动态计算最优 cell 大小，再反推 canvas 尺寸。

```javascript
function resizeCanvases(gameCanvas, nextCanvas, holdCanvas) {
  const COLS = 10, ROWS = 20;
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;

  // 布局参数与 CSS 断点对齐
  const isMobile = vw <= 600;
  const panelW   = isMobile ? 80 : 130;   // 与 CSS --panel-width 一致
  const gap      = isMobile ? 10 : 16;    // 与 CSS --layout-gap 一致

  // 扣除两侧面板和间距后的可用宽度
  const reservedW = panelW * 2 + gap * 2 + 32;
  // 扣除标题、padding、移动端按钮后的可用高度
  const reservedH = (isMobile ? 48 : 56) + 24 + gap + (isMobile ? 146 : 0);

  const cellByW = Math.floor((vw - reservedW) / COLS);  // 宽度约束下的 cell
  const cellByH = Math.floor((vh - reservedH) / ROWS);  // 高度约束下的 cell
  const cell    = Math.max(14, Math.min(cellByW, cellByH, 40));  // 取最小值并钳制

  gameCanvas.width  = cell * COLS;   // 10 列
  gameCanvas.height = cell * ROWS;   // 20 行
}
```

**知识点：**

- `window.visualViewport.height`：移动端浏览器有动态工具栏（地址栏会随滚动收起），`window.innerHeight` 可能包含工具栏高度，`visualViewport.height` 才是真正可用的可视高度，使用 `??` 做降级处理。
- `Math.min(cellByW, cellByH, 40)`：同时满足宽度和高度约束，取最小值确保 canvas 不超出任何一个维度。最大值 40 防止在超大屏幕上格子过大。
- `Math.max(14, ...)`：最小保证 14px，低于此值格子太小影响游戏体验。

### 6.3 Renderer 动态 cell

```javascript
// 旧代码（constructor 中固定）：
this.cell = gameCanvas.width / COLS;

// 新代码（每帧重新计算）：
render(state) {
  this.cell = this.gc.width / COLS;  // canvas resize 后自动生效
  ...
}
```

### 6.4 CSS 布局变量化

```css
:root {
  --panel-width: 130px;
  --layout-gap: 16px;
}

@media (max-width: 600px) {
  :root { --panel-width: 80px; --layout-gap: 10px; }
}

@media (max-width: 400px) {
  :root { --panel-width: 64px; --layout-gap: 8px; }
}

.panel { width: var(--panel-width); }
.main  { gap:   var(--layout-gap);  }
```

**知识点：** CSS 自定义属性（CSS Variables）可以在媒体查询中被覆盖，所有引用该变量的属性会自动级联更新，避免在多处重复写相同的断点值。

---

## 7. 知识点速查

### Docker 常用命令

```bash
# 构建镜像
docker build -t my-app:latest .

# 运行容器
docker run -d -p 80:80 --name my-app --restart always my-app:latest

# 查看运行中的容器
docker ps

# 查看容器日志
docker logs -f my-app

# 进入容器 shell
docker exec -it my-app sh

# 导出镜像
docker save my-app:latest -o my-app.tar

# 导入镜像
docker load -i my-app.tar

# 清理悬空镜像
docker image prune -f
```

### GitHub Actions 核心概念

| 概念 | 说明 |
|------|------|
| **Workflow** | 整个 CI/CD 流程，定义在 `.github/workflows/*.yml` |
| **Job** | 工作流中的一个任务，默认并行运行，可通过 `needs` 设置依赖 |
| **Step** | Job 中的一个步骤，顺序执行 |
| **Action** | 可复用的步骤模块，如 `actions/checkout@v4` |
| **Runner** | 执行 Job 的虚拟机，`ubuntu-latest` 为 GitHub 提供的免费 Runner |
| **Secret** | 加密的环境变量，在日志中自动脱敏 |
| **Artifact** | 工作流产物，可供下载或在 Job 间传递文件 |

### 多架构镜像原理

```
docker buildx build --platform linux/amd64,linux/arm64
        │
        ├── 构建 linux/amd64 镜像层
        └── 构建 linux/arm64 镜像层（通过 QEMU 模拟）
                │
                ▼
        Manifest List（镜像索引）
        ghcr.io/zkj0407/tetris-game:latest
                │
                ├── → linux/amd64 digest: sha256:abc...
                └── → linux/arm64 digest: sha256:def...

docker pull（x86 机器）→ 自动选择 amd64 版本
docker pull（ARM 机器）→ 自动选择 arm64 版本
```
