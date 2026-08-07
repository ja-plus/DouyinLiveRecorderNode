// @ts-check
/**
 * Config Manager 独立配置
 * 注意：此文件仅用于 config-manager (Web 配置管理台)，
 * 不要与主程序 src/config/ 或 config/config.ini 的全局录制配置混淆。
 *
 * 字段说明：
 *   enableHttp2  是否启用 HTTP/2（true/false）
 *                - 如果同时提供了 certPath + keyPath，启用 "https + h2"（浏览器可直接访问）
 *                - 如果未提供证书，则启用 "h2c 明文模式"（仅部分命令行工具如 curl --http2-prior-knowledge 可用）
 *   host         Web 管理台绑定地址。建议：
 *                - '127.0.0.1'       本机访问（默认，更安全）
 *                - '0.0.0.0'         对外暴露（局域网/公网访问时使用，建议同时开启 HTTPS 并配置防火墙）
 *                - '::'              对外暴露（IPv6 + IPv4 双栈，需 Node >= 18）
 *   port         Web 管理台监听端口 (1-65535)
 *   certPath     TLS 证书 PEM 路径；相对路径以项目根目录 (DouyinLiveRecorderNode) 为基准，也可写绝对路径
 *   keyPath      TLS 私钥 PEM 路径；同上
 *
 * 配置变更后，重启 npm start / node config-manager/server.js 生效。
 */
/** @type {import('../src/types.js').ConfigManagerSettings} */
export default {
  enableHttp2: false,
  host: '0.0.0.0',
  port: 5000,
  certPath: "config/cert.pem",
  keyPath: "config/key.pem",
  // certPath: './server.crt',
  // keyPath: './server.key'
};
