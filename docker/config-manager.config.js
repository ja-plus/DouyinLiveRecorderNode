// @ts-check
/**
 * Docker 环境专用 config-manager 配置
 *
 * 与本地 config-manager/config.js 的区别：
 *   - recorderStatusUrl 使用 Docker 服务名 "recorder" 而非 0.0.0.0
 *   - host 固定 0.0.0.0 以便从容器外部访问
 *
 * 此文件在 docker-compose.yml 中通过 volume 挂载覆盖 config-manager/config.js
 * 修改后重启 config-manager 容器即可生效：docker compose restart config-manager
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
  // Docker 内部网络：recorder 是录制器服务名，5001 是状态服务端口
  recorderStatusUrl: 'http://recorder:5001',
  logLevel: 'info',
  consoleLogLevel: 'warn',
  enableLog: true,
  logDir: '',
  sqliteLogPath: 'logs/config-manager.db',
};
