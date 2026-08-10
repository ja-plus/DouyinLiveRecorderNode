import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ALLOWED_LEVELS } from "./logger.js";
import { OWN_CONFIG_PATH, ROOT_DIR } from "./paths.js";
export const DEFAULT_SETTINGS = {
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
    recorderStatusUrl: "",
    logLevel: "info",
    consoleLogLevel: "",
    enableLog: false,
    logDir: "",
    sqliteLogPath: "",
};
export async function getServerSettings() {
    // config.js 缺失或格式异常时保留默认值，确保管理服务仍能启动。
    const settings = { ...DEFAULT_SETTINGS };
    try {
        // 追加时间戳绕过 ESM 缓存，在启动时读取最新配置。
        const config = (await import(`${pathToFileURL(OWN_CONFIG_PATH).href}?t=${Date.now()}`))
            .default || {};
        if (!config || typeof config !== "object")
            return { settings };
        if (typeof config.enableHttp2 === "boolean")
            settings.enableHttp2 = config.enableHttp2;
        else if (["是", "true", 1, "1"].includes(config.enableHttp2))
            settings.enableHttp2 = true;
        if (typeof config.host === "string" && config.host.trim())
            settings.host = config.host.trim();
        const port = Number.parseInt(String(config.port));
        if (Number.isInteger(port) && port > 0 && port < 65536)
            settings.port = port;
        for (const key of ["certPath", "keyPath"])
            if (typeof config[key] === "string" && config[key].trim())
                settings[key] = path.isAbsolute(config[key])
                    ? config[key]
                    : path.resolve(ROOT_DIR, config[key]);
        for (const key of ["loginUsername", "loginPassword", "authSecret"])
            if (typeof config[key] === "string")
                settings[key] = config[key];
        if (typeof config.enableLogin === "boolean")
            settings.enableLogin = config.enableLogin;
        else if (["true", 1, "1"].includes(config.enableLogin))
            settings.enableLogin = true;
        const days = Number(config.authCookieMaxAgeDays);
        if (Number.isFinite(days) && days > 0 && days <= 3650)
            settings.authCookieMaxAgeDays = days;
        if (typeof config.recorderStatusUrl === "string" && config.recorderStatusUrl.trim())
            // 去掉末尾斜杠，避免拼路径时出现双斜杠。
            settings.recorderStatusUrl = config.recorderStatusUrl.trim().replace(/\/+$/, "");
        if (typeof config.logLevel === "string" &&
            ALLOWED_LEVELS.has(config.logLevel))
            settings.logLevel = config.logLevel;
        if (typeof config.consoleLogLevel === "string" &&
            ALLOWED_LEVELS.has(config.consoleLogLevel))
            settings.consoleLogLevel = config.consoleLogLevel;
        if (typeof config.enableLog === "boolean")
            settings.enableLog = config.enableLog;
        else if (["是", "true", 1, "1"].includes(config.enableLog))
            settings.enableLog = true;
        if (typeof config.logDir === "string" && config.logDir.trim())
            settings.logDir = path.isAbsolute(config.logDir)
                ? config.logDir.trim()
                : path.resolve(ROOT_DIR, config.logDir.trim());
        if (typeof config.sqliteLogPath === "string" && config.sqliteLogPath.trim())
            settings.sqliteLogPath = path.isAbsolute(config.sqliteLogPath)
                ? config.sqliteLogPath.trim()
                : path.resolve(ROOT_DIR, config.sqliteLogPath.trim());
    }
    catch (error) {
        // 配置加载失败时返回默认值 + 错误信息，由调用方记录日志后继续启动。
        return { settings, loadError: error };
    }
    return { settings };
}
export function loadTlsOptions({ certPath, keyPath, }) {
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
export function checkPortAvailable(host, port) {
    // 短暂绑定目标地址检测端口冲突，随后立即释放。
    return new Promise((resolve) => {
        const server = net.createServer().unref();
        server.once("error", (error) => {
            try {
                server.close();
            }
            catch { }
            resolve({ ok: false, reason: error.code || error.message });
        });
        server.listen({ host, port, exclusive: true }, () => server.close(() => resolve({ ok: true })));
    });
}
