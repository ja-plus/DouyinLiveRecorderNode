function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    } else {
        for(var i = decorators.length - 1; i >= 0; i--){
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import fs from "node:fs";
import path from "node:path";
import { Global, Module } from "@nestjs/common";
import pino from "pino";
import pretty from "pino-pretty";
import { ROOT_DIR } from "./paths.js";
import { SqliteLogStream } from "./sqlite-log-stream.js";
/** 全局可注入的 pino Logger 令牌 */ export const LOGGER_TOKEN = Symbol("config-manager/LOGGER");
/** 合法日志级别集合，供 settings 校验复用 */ export const ALLOWED_LEVELS = new Set([
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "silent"
]);
/**
 * 创建共享的 pino Logger 实例。
 *
 * 控制台使用 pino-pretty 同步流（非 transport worker，兼容 bun）；
 * 配置 logDir 时用 pino.multistream 同步追加写入 NDJSON 文件。
 * 序列化在 multistream 分发前完成，故控制台 pretty 与文件 JSON 收到同一份脱敏数据。
 */ export function createLogger(options = {}) {
    const level = ALLOWED_LEVELS.has(options.level || "") ? options.level : "info";
    // silent 级别不创建流，直接返回静默 logger。
    if (level === "silent") return pino({
        level: "silent"
    });
    // 控制台级别：独立于 level，可设更高以减少 pino-pretty 同步格式化的 CPU 开销。
    // 默认与 level 一致；生产环境建议设为 warn，仅输出警告和错误到控制台。
    const consoleLevel = ALLOWED_LEVELS.has(options.consoleLevel || "") ? options.consoleLevel : level;
    // 请求日志序列化：脱敏 Cookie / Authorization，保留 method/url。
    // 不在此处记录 req.body：Fastify 在 onRequest 阶段记录请求日志时 body 尚未解析，
    // 请求体改由 main.ts 的 preHandler 钩子单独记录（此时 body 已可用）。
    const serializers = {
        req (req) {
            const headers = {
                ...req.headers || {}
            };
            if (headers.cookie) headers.cookie = "[REDACTED]";
            if (headers.authorization) headers.authorization = "[REDACTED]";
            return {
                method: req.method,
                url: req.url,
                headers
            };
        },
        res (res) {
            return {
                statusCode: res.statusCode
            };
        }
    };
    const streams = [
        {
            // 控制台流使用独立的 consoleLevel，可高于 level 以减少格式化开销
            level: consoleLevel,
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
                destination: process.stdout
            })
        }
    ];
    // enableLog 为总开关：false 时跳过文件和 SQLite 持久化，仅保留控制台输出。
    // 这样用户可通过一个开关快速关闭持久化，而不必清空 logDir / sqliteLogPath。
    const enableLog = options.enableLog === true;
    const logDir = (options.logDir || "").trim();
    if (enableLog && logDir) {
        const dir = path.isAbsolute(logDir) ? logDir : path.resolve(ROOT_DIR, logDir);
        fs.mkdirSync(dir, {
            recursive: true
        });
        const file = path.join(dir, options.logFile || "config-manager.log");
        streams.push({
            level,
            stream: fs.createWriteStream(file, {
                flags: "a"
            })
        });
    }
    // SQLite 持久化流：将日志写入数据库，支持结构化查询
    const sqlitePath = (options.sqlitePath || "").trim();
    if (enableLog && sqlitePath) {
        const dbFile = path.isAbsolute(sqlitePath) ? sqlitePath : path.resolve(ROOT_DIR, sqlitePath);
        const dbDir = path.dirname(dbFile);
        fs.mkdirSync(dbDir, {
            recursive: true
        });
        streams.push({
            level,
            stream: new SqliteLogStream(dbFile)
        });
    }
    return pino({
        level,
        base: {
            service: "config-manager"
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers
    }, pino.multistream(streams));
}
/**
 * NestJS 框架日志桥接：把 LoggerService 调用映射到 pino。
 * 仅作 NestJS useLogger 桥接，业务代码请直接注入 LOGGER_TOKEN。
 */ export class NestPinoLogger {
    logger;
    constructor(logger){
        this.logger = logger;
    }
    log(message, context) {
        this.logger.info({
            context
        }, this.fmt(message));
    }
    error(message, ...optionalParams) {
        // NestJS error 可能以 (message, trace, context) 或 (message, context) 调用
        let trace;
        let context;
        if (typeof optionalParams[0] === "string") trace = optionalParams[0];
        const last = optionalParams[optionalParams.length - 1];
        if (typeof last === "string" && last !== trace) context = last;
        this.logger.error({
            context,
            trace
        }, this.fmt(message));
    }
    warn(message, context) {
        this.logger.warn({
            context
        }, this.fmt(message));
    }
    debug(message, context) {
        this.logger.debug({
            context
        }, this.fmt(message));
    }
    verbose(message, context) {
        this.logger.trace({
            context
        }, this.fmt(message));
    }
    fatal(message, context) {
        this.logger.fatal({
            context
        }, this.fmt(message));
    }
    fmt(m) {
        if (typeof m === "string") return m;
        if (m instanceof Error) return m.message;
        try {
            return JSON.stringify(m);
        } catch  {
            return String(m);
        }
    }
}
export class LoggerModule {
    static forRoot(logger) {
        return {
            module: LoggerModule,
            providers: [
                {
                    provide: LOGGER_TOKEN,
                    useValue: logger
                }
            ],
            exports: [
                LOGGER_TOKEN
            ]
        };
    }
}
LoggerModule = _ts_decorate([
    Global(),
    Module({})
], LoggerModule);

//# sourceMappingURL=logger.js.map