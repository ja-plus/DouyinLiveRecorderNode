# ============================================================
#  LiveRecorder-node Dockerfile
#  多阶段构建：builder 编译 TypeScript + 前端，runtime 精简运行时
# ============================================================

# ---- Stage 1: Builder ----
FROM node:22-slim AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

# 先复制 lockfile 和 package.json，利用 Docker 层缓存
COPY package.json pnpm-lock.yaml ./

# 安装全部依赖（含 devDependencies，用于构建）
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建 config-manager TypeScript → dist/
RUN pnpm build:config-manager

# 构建前端 → config-manager/static/
RUN pnpm build:config-manager-frontend

# 清理 devDependencies，仅保留生产依赖
RUN pnpm prune --prod

# ---- Stage 2: Runtime ----
FROM node:22-slim AS runtime

# 安装 ffmpeg（录制必需）+ curl（健康检查）
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从 builder 复制生产依赖
COPY --from=builder /app/node_modules ./node_modules

# 从 builder 复制构建产物
COPY --from=builder /app/config-manager/dist ./config-manager/dist
COPY --from=builder /app/config-manager/static ./config-manager/static

# 复制源码与配置
COPY --from=builder /app/package.json ./
COPY --from=builder /app/main.js ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config
COPY --from=builder /app/config-manager/config.js ./config-manager/config.js
COPY --from=builder /app/config-manager/gen-cert.mjs ./config-manager/gen-cert.mjs

# 创建数据目录
RUN mkdir -p /app/downloads /app/logs /app/backup_config

# 环境变量
ENV NODE_ENV=production \
    TZ=Asia/Shanghai

# 默认启动录制器；config-manager 服务在 docker-compose 中通过 command 覆盖
CMD ["node", "--max-semi-space-size=4", "--max-old-space-size=256", "main.js"]
