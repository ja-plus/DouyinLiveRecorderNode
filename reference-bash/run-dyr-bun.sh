#!/bin/bash
# 运行 DouyinLiveRecorderNode 的启动脚本
# 临时将本目录下的 bun 和 ffmpeg 加入 PATH，无需修改系统环境变量

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 临时加入 PATH（仅对本脚本及子进程生效）
export PATH="$SCRIPT_DIR/bun-linux-aarch64:$SCRIPT_DIR/ffmpeg-master-latest-linuxarm64-gpl/bin:$PATH"

echo "PATH 已更新:"
echo "  bun:  $(which bun)"
echo "  ffmpeg: $(which ffmpeg)"
echo ""



# 运行 main.js
cd "$SCRIPT_DIR/DouyinLiveRecorderNode"

echo "bun install"
bun install --registry=https://registry.npmmirror.com

exec bun run bun:start
