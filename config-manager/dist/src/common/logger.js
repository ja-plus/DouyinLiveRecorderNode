var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LoggerModule_1;
import fs from "node:fs";
import path from "node:path";
import { Global, Module, } from "@nestjs/common";
import pino from "pino";
import pretty from "pino-pretty";
import { ROOT_DIR } from "./paths.js";
/** 全局可注入的 pino Logger 令牌 */
export const LOGGER_TOKEN = Symbol("config-manager/LOGGER");
/** 合法日志级别集合，供 settings 校验复用 */
export const ALLOWED_LEVELS = new Set([
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "silent",
]);
/**
 * 创建共享的 pino Logger 实例。
 *
 * 控制台使用 pino-pretty 同步流（非 transport worker，兼容 bun）；
 * 配置 logDir 时用 pino.multistream 同步追加写入 NDJSON 文件。
 * 序列化在 multistream 分发前完成，故控制台 pretty 与文件 JSON 收到同一份脱敏数据。
 */
export function createLogger(options = {}) {
    const level = (ALLOWED_LEVELS.has(options.level || "") ? options.level : "info");
    // silent 级别不创建流，直接返回静默 logger。
    if (level === "silent")
        return pino({ level: "silent" });
    // 请求日志序列化：脱敏 Cookie / Authorization，保留 method/url
    const serializers = {
        req(req) {
            const headers = { ...(req.headers || {}) };
            if (headers.cookie)
                headers.cookie = "[REDACTED]";
            if (headers.authorization)
                headers.authorization = "[REDACTED]";
            return { method: req.method, url: req.url, headers };
        },
        res(res) {
            return { statusCode: res.statusCode };
        },
    };
    const streams = [
        {
            level: level,
            stream: pretty({
                // colorize 由 pino-pretty 自动检测（isColorSupported）：TTY 终端启用颜色，
                // 管道/文件重定向时禁用，避免 ANSI 转义码残留。
                translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
                ignore: "pid,hostname",
                singleLine: true,
                // 必须用 process.stdout（stream）而非 fd 1（数字）：
                // pino-pretty 检测到 destination 是 stream 时直接调用 stream.write()，
                // 经过 Node.js TTY 的 Unicode 编码处理（Windows 上用 WriteConsoleW 输出 UTF-16）。
                // 若传 fd 1，pino-pretty 改用 SonicBoom 的 fs.writeSync(1, buf) 直接写字节，
                // 绕过 Node.js 编码处理，Windows 控制台按 GBK 解码 UTF-8 → 中文乱码。
                destination: process.stdout,
            }),
        },
    ];
    const logDir = (options.logDir || "").trim();
    if (logDir) {
        const dir = path.isAbsolute(logDir)
            ? logDir
            : path.resolve(ROOT_DIR, logDir);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, options.logFile || "config-manager.log");
        streams.push({
            level,
            stream: fs.createWriteStream(file, { flags: "a" }),
        });
    }
    return pino({
        level,
        base: { service: "config-manager" },
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers,
    }, pino.multistream(streams));
}
/**
 * NestJS 框架日志桥接：把 LoggerService 调用映射到 pino。
 * 仅作 NestJS useLogger 桥接，业务代码请直接注入 LOGGER_TOKEN。
 */
export class NestPinoLogger {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    log(message, context) {
        this.logger.info({ context }, this.fmt(message));
    }
    error(message, ...optionalParams) {
        // NestJS error 可能以 (message, trace, context) 或 (message, context) 调用
        let trace;
        let context;
        if (typeof optionalParams[0] === "string")
            trace = optionalParams[0];
        const last = optionalParams[optionalParams.length - 1];
        if (typeof last === "string" && last !== trace)
            context = last;
        this.logger.error({ context, trace }, this.fmt(message));
    }
    warn(message, context) {
        this.logger.warn({ context }, this.fmt(message));
    }
    debug(message, context) {
        this.logger.debug({ context }, this.fmt(message));
    }
    verbose(message, context) {
        this.logger.trace({ context }, this.fmt(message));
    }
    fatal(message, context) {
        this.logger.fatal({ context }, this.fmt(message));
    }
    fmt(m) {
        if (typeof m === "string")
            return m;
        if (m instanceof Error)
            return m.message;
        try {
            return JSON.stringify(m);
        }
        catch {
            return String(m);
        }
    }
}
/**
 * 全局日志模块：使 LOGGER_TOKEN 在所有模块可注入。
 * pino 实例在启动早期创建后通过 forRoot 注入容器。
 */
let LoggerModule = LoggerModule_1 = class LoggerModule {
    static forRoot(logger) {
        return {
            module: LoggerModule_1,
            providers: [{ provide: LOGGER_TOKEN, useValue: logger }],
            exports: [LOGGER_TOKEN],
        };
    }
};
LoggerModule = LoggerModule_1 = __decorate([
    Global(),
    Module({})
], LoggerModule);
export { LoggerModule };
