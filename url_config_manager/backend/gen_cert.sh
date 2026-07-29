#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 生成 Web 配置管理台使用的自签名 TLS 证书（certs/cert.pem + certs/key.pem）
#
# main.py 启动时若检测到 certs/ 目录下存在 cert.pem 与 key.pem，
# 会自动以 HTTPS 启动管理台（浏览器可协商 HTTP/2）。
#
# 用法：
#   ./gen_cert.sh              # 默认 CN=localhost，有效期 3650 天
#   ./gen_cert.sh my.host.lan  # 追加自定义域名/IP 到 SAN
#
# 依赖：openssl（Git Bash / Linux / macOS 自带）
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

DAYS=3650
CERTS_DIR="certs"
CERT_FILE="$CERTS_DIR/cert.pem"
KEY_FILE="$CERTS_DIR/key.pem"

# 默认 SAN 覆盖本机访问场景，支持通过参数追加额外域名或 IP
SAN="DNS:localhost,IP:127.0.0.1,IP:::1"
for host in "$@"; do
    if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        SAN="$SAN,IP:$host"
    else
        SAN="$SAN,DNS:$host"
    fi
done

if [[ -f "$CERT_FILE" || -f "$KEY_FILE" ]]; then
    read -r -p "证书文件已存在，是否覆盖？[y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "已取消"; exit 0; }
fi

mkdir -p "$CERTS_DIR"

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days "$DAYS" -nodes \
    -subj "/CN=localhost/O=DouyinLiveRecorder" \
    -addext "subjectAltName=$SAN" \
    -addext "keyUsage=digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth"

chmod 600 "$KEY_FILE" 2>/dev/null || true

echo ""
echo "生成完成："
echo "  证书: $(pwd)/$CERT_FILE"
echo "  私钥: $(pwd)/$KEY_FILE"
echo "  SAN : $SAN"
echo "重新运行 main.py 即可以 HTTPS 启动 Web 配置管理台。"
