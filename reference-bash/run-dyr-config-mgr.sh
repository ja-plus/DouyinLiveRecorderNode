#!/bin/bash
# 运行 DouyinLiveRecorderNode 的启动脚本
# 临时将本目录下的 node 加入 PATH，无需修改系统环境变量
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 临时加入 PATH（仅对本脚本及子进程生效）
export PATH="$SCRIPT_DIR/node-v24.18.0-linux-arm64/bin:$SCRIPT_DIR/ffmpeg-master-latest-linuxarm64-gpl/bin:$PATH"

echo "PATH 已更新:"
echo "  node:  $(which node)"
echo "  ffmpeg: $(which ffmpeg)"
echo ""

# 运行 main.js
cd "$SCRIPT_DIR/DouyinLiveRecorderNode"

npm run config-manager

