import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OWN_CONFIG_PATH, ROOT_DIR } from "./paths.js";

export type ServerSettings = {
  /** 是否启用 HTTP/2；未提供证书时走 h2c 明文模式 */
  enableHttp2: boolean;
  /** Web 管理台绑定地址（如 127.0.0.1 / 0.0.0.0 / ::） */
  host: string;
  /** Web 管理台监听端口 (1-65535) */
  port: number;
  /** TLS 证书 PEM 路径；相对路径以项目根目录为基准 */
  certPath: string;
  /** TLS 私钥 PEM 路径；相对路径以项目根目录为基准 */
  keyPath: string;
  /** 是否启用管理台登录保护 */
  enableLogin: boolean;
  /** 登录用户名 */
  loginUsername: string;
  /** 登录密码 */
  loginPassword: string;
  /** 用于签发登录 Cookie 的高强度随机字符串（建议至少 32 个字符） */
  authSecret: string;
  /** Cookie 有效天数，默认 30 天 */
  authCookieMaxAgeDays: number;
};
export const DEFAULT_SETTINGS: ServerSettings = {
  enableHttp2: false,
  host: "127.0.0.1",
  port: 5000,
  certPath: "",
  keyPath: "",
  enableLogin: false,
  loginUsername: "",
  loginPassword: "",
  authSecret: "",
  authCookieMaxAgeDays: 30,
};

export async function getServerSettings(): Promise<ServerSettings> {
  // config.js 缺失或格式异常时保留默认值，确保管理服务仍能启动。
  const settings = { ...DEFAULT_SETTINGS };
  try {
    // 追加时间戳绕过 ESM 缓存，在启动时读取最新配置。
    const config: Record<string, unknown> =
      (await import(`${pathToFileURL(OWN_CONFIG_PATH).href}?t=${Date.now()}`))
        .default || {};
    if (!config || typeof config !== "object") return settings;
    if (typeof config.enableHttp2 === "boolean")
      settings.enableHttp2 = config.enableHttp2;
    else if (["是", "true", 1, "1"].includes(config.enableHttp2 as never))
      settings.enableHttp2 = true;
    if (typeof config.host === "string" && config.host.trim())
      settings.host = config.host.trim();
    const port = Number.parseInt(String(config.port));
    if (Number.isInteger(port) && port > 0 && port < 65536)
      settings.port = port;
    for (const key of ["certPath", "keyPath"] as const)
      if (typeof config[key] === "string" && config[key].trim())
        settings[key] = path.isAbsolute(config[key])
          ? config[key]
          : path.resolve(ROOT_DIR, config[key]);
    for (const key of ["loginUsername", "loginPassword", "authSecret"] as const)
      if (typeof config[key] === "string") settings[key] = config[key];
    if (typeof config.enableLogin === "boolean")
      settings.enableLogin = config.enableLogin;
    else if (["true", 1, "1"].includes(config.enableLogin as never))
      settings.enableLogin = true;
    const days = Number(config.authCookieMaxAgeDays);
    if (Number.isFinite(days) && days > 0 && days <= 3650)
      settings.authCookieMaxAgeDays = days;
  } catch {}
  return settings;
}

export function loadTlsOptions({
  certPath,
  keyPath,
}: Pick<ServerSettings, "certPath" | "keyPath">) {
  // 证书和私钥文件均存在时才启用 TLS。
  return certPath &&
    keyPath &&
    fs.existsSync(certPath) &&
    fs.existsSync(keyPath)
    ? {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        allowHTTP1: true,
      }
    : null;
}

export function checkPortAvailable(
  host: string,
  port: number,
): Promise<{ ok: boolean; reason?: string }> {
  // 短暂绑定目标地址检测端口冲突，随后立即释放。
  return new Promise((resolve) => {
    const server = net.createServer().unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      try {
        server.close();
      } catch {}
      resolve({ ok: false, reason: error.code || error.message });
    });
    server.listen({ host, port, exclusive: true }, () =>
      server.close(() => resolve({ ok: true })),
    );
  });
}
