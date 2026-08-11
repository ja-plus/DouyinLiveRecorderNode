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
 *   enableLogin  是否启用管理台登录保护；启用后必须同时配置下述账号、密码与密钥
 *   loginUsername 登录用户名
 *   loginPassword 登录密码
 *   authSecret   用于签发登录 Cookie 的高强度随机字符串（建议至少 32 个字符）
 *   authCookieMaxAgeDays Cookie 有效天数，默认 30 天
 *   recorderStatusUrl 录制器（main.js）状态服务地址，用于实时获取正在录制的主播。
 *                     微服务架构下 config-manager 通过此地址订阅 SSE 状态流；
 *                     不填则实时录制状态不可用（其余功能不受影响）。
 *   logLevel        日志级别：trace/debug/info/warn/error/fatal/silent，默认 info
 *                   控制文件和数据库流的日志级别。
 *   consoleLogLevel 控制台日志级别，留空则与 logLevel 一致。
 *                   生产环境建议设为 warn：控制台只输出警告和错误，避免大量 info 请求日志
 *                   经 pino-pretty 同步格式化导致 CPU 飙升。文件和数据库仍按 logLevel 记录完整日志。
 *   enableLog       日志持久化总开关（true/false），默认 false。
 *                   - false：仅输出控制台日志，忽略 logDir 和 sqliteLogPath
 *                   - true：按 logDir 和 sqliteLogPath 配置，同时持久化到文件和数据库
 *   logDir          日志文件目录；相对路径以项目根目录为基准，留空则不写文件。
 *                   日志以 NDJSON 追加写入 logDir/config-manager.log，建议配合 logrotate 滚动。
 *                   仅在 enableLog=true 时生效。
 *   sqliteLogPath   SQLite 日志数据库路径；相对路径以项目根目录为基准，留空则不持久化到数据库。
 *                   启用后可在管理台"系统日志"页面查询日志，支持按级别、时间、关键词过滤。
 *                   仅在 enableLog=true 时生效。
 *
 * 配置变更后，重启 pnpm run config-manager（或 bun:config-manager）生效。
 */
/** @type {import('./src/common/settings.js').ServerSettings} */
export default {
  enableHttp2: false,
  host: '0.0.0.0',
  port: 5000,
  certPath: "config/cert.pem",
  keyPath: "config/key.pem",
  enableLogin: true,
  loginUsername: 'admin',
  loginPassword: 'admin',
  authSecret: '78f654006c8e8538a7e3574679a903958ab1db99d7d67aeb46a612ce1b7b3eb7',
  authCookieMaxAgeDays: 30,
  recorderStatusUrl: 'http://0.0.0.0:5001',
  // 日志级别：trace/debug/info/warn/error/fatal/silent，默认 info
  // 控制文件和数据库流的日志级别
  logLevel: 'info',
  // 控制台日志级别：留空则与 logLevel 一致
  // 生产环境建议设为 'warn'，避免大量请求日志经 pino-pretty 同步格式化导致 CPU 飙升
  consoleLogLevel: 'info',
  // 日志持久化总开关：false 仅控制台输出，true 同时持久化到文件和数据库
  enableLog: false,
  // 日志文件目录；相对路径以项目根目录为基准，留空则不写文件
  logDir: '',
  // SQLite 日志数据库路径；相对路径以项目根目录为基准，留空则不持久化
  // 示例：'logs/config-manager.db' 或 'D:/logs/app.db'
  sqliteLogPath: 'logs/config-manager.db',
};
