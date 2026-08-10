import fs from "node:fs";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { createAppModule } from "./app.module.js";
import { createAuthModule } from "./auth/auth.module.js";
import { CONFIG_PATH, MANAGER_DIR } from "./common/paths.js";
import { createLogger, NestPinoLogger } from "./common/logger.js";
import {
  checkPortAvailable,
  getServerSettings,
  loadTlsOptions,
} from "./common/settings.js";
import { registerStaticRoutes } from "./static/static.routes.js";

// 记录本服务进程 PID，供下次启动时清理未正常退出的残留实例。
const PID_FILE = path.join(MANAGER_DIR, ".config-manager.pid");

// 端口被占用且 PID 文件指向的进程仍存活时，判定为上次异常退出（如直接关闭
// Git Bash 窗口，node 子进程未被终止）的残留实例，终止它并重试端口检测。
// ponytail: 未校验目标进程命令行，PID 被系统复用给无关进程时存在误杀可能，
// 如需绝对安全可改为比对进程命令行（Windows: wmic/tasklist）。
async function killStaleInstance(logger: Logger): Promise<void> {
  let pid: number;
  try {
    pid = Number.parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  } catch (err) {
    // PID 文件不存在多为首次启动，属正常情况。
    logger.debug({ err }, "PID 文件读取失败（可能是首次启动）");
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0); // 仅检测存活，进程不存在时抛错
  } catch (err) {
    logger.debug({ pid, err }, "PID 对应的进程已不存在");
    return;
  }
  try {
    // Windows 上 process.kill 为强制终止；POSIX 发送 SIGTERM 触发优雅退出。
    process.kill(pid, process.platform === "win32" ? undefined : "SIGTERM");
  } catch (err) {
    logger.warn({ pid, err }, "终止残留进程失败");
  }
}

type StartOptions = {
  host?: string;
  port?: number;
  http2?: boolean;
  certPath?: string;
  keyPath?: string;
};
export type ConfigManagerServer = FastifyInstance & {
  configManagerHttpInfo: {
    host: string;
    port: number;
    protocol: string;
    scheme: string;
    url: string;
  };
};

export async function startServer(
  options: StartOptions = {},
): Promise<ConfigManagerServer> {
  // 配置加载早于 logger 创建；加载失败时返回默认值 + 错误，由此处统一记录。
  const { settings, loadError } = await getServerSettings();
  const logger = createLogger({
    level: settings.logLevel,
    consoleLevel: settings.consoleLogLevel,
    enableLog: settings.enableLog,
    logDir: settings.logDir,
    sqlitePath: settings.sqliteLogPath,
  });
  if (loadError)
    logger.warn({ err: loadError }, "config.js 加载失败，使用默认配置");
  logger.info({ configPath: CONFIG_PATH }, "配置文件路径");

  // 显式传入的选项优先于从 config.js 读取的配置。
  const host = options.host ?? settings.host,
    port = options.port ?? settings.port;
  const tls = loadTlsOptions({
    certPath: options.certPath ?? settings.certPath,
    keyPath: options.keyPath ?? settings.keyPath,
  });
  let portCheck = await checkPortAvailable(host, port);
  if (!portCheck.ok && portCheck.reason === "EADDRINUSE") {
    logger.warn({ port }, "端口被占用，尝试清理残留的本服务进程...");
    await killStaleInstance(logger);
    for (let i = 0; i < 10 && !portCheck.ok; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      portCheck = await checkPortAvailable(host, port);
    }
  }
  if (!portCheck.ok)
    throw new Error(
      portCheck.reason === "EADDRINUSE"
        ? `端口 ${port} 已被其他程序占用`
        : `端口检测失败(${portCheck.reason})：${host}:${port}`,
    );
  const http2 = (options.http2 ?? settings.enableHttp2) && !!tls;
  if ((options.http2 ?? settings.enableHttp2) && !tls)
    logger.warn(
      "enableHttp2=true 但未找到 TLS 证书，已回退 HTTP/1.1。",
    );
  const adapter = new FastifyAdapter({
    // Fastify 5 要求 pino 实例通过 loggerInstance 传递，logger 仅接受配置对象。
    loggerInstance: logger,
    ...(http2 ? { http2: true, https: tls! } : {}),
  });
  const app = adapter.getInstance() as FastifyInstance;
  // 鉴权钩子读取会话令牌前，必须先注册 Cookie 解析。
  await app.register(fastifyCookie);
  const auth = createAuthModule(settings, http2, logger);
  const nestApp = await NestFactory.create(
    createAppModule(auth.AuthModule, settings.recorderStatusUrl, logger, settings.sqliteLogPath),
    adapter,
    { logger: new NestPinoLogger(logger) },
  );
  // 静态/媒体资源请求日志降级，避免高频资源请求刷屏。
  app.addHook("onRequest", (request, _reply, done) => {
    const url = request.url.split("?")[0];
    if (
      url.startsWith("/api/video/") ||
      /\.(?:js|css|map|png|jpe?g|gif|svg|ico|woff2?|ttf|mp4|flv|ts|mkv|mp3|m4a)$/i.test(
        url,
      )
    )
      request.log.level = "warn";
    done();
  });
  // 在 body 解析完成后、鉴权前记录请求体，便于排查接口调用问题。
  // 仅对有 body 的请求记录（POST/PUT/PATCH），脱敏密码等敏感字段。
  app.addHook("preHandler", (request, _reply, done) => {
    const body = request.body;
    if (body && typeof body === "object" && Object.keys(body).length > 0) {
      const safe = { ...(body as Record<string, unknown>) };
      for (const key of [
        "password",
        "loginPassword",
        "authSecret",
        "cookie",
        "token",
      ])
        if (key in safe) safe[key] = "[REDACTED]";
      request.log.info({ body: safe }, "收到请求体");
    }
    done();
  });
  // 保护 API 路由，同时让登录页所需的静态资源可以访问。
  app.addHook("preHandler", auth.guard);
  await app.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });
  // 在 Nest 初始化 API 路由前注册前端和录制文件的静态路由。
  await registerStaticRoutes(app, logger);
  await nestApp.init();
  await app.listen({ host, port });
  // 启动成功后登记 PID，正常退出时清理；异常残留留给下次启动自动处理。
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
    process.once("exit", () => {
      try {
        fs.unlinkSync(PID_FILE);
      } catch {}
    });
  } catch (err) {
    logger.warn({ err }, "PID 文件写入失败");
  }
  const protocol = http2 ? "https" : "http";
  const server = app as ConfigManagerServer;
  // 暴露实际监听地址，供命令行入口和主程序展示。
  server.configManagerHttpInfo = {
    host,
    port,
    protocol,
    scheme: http2 ? "HTTP/2" : "HTTP/1.1",
    url: `${protocol}://${host}:${port}`,
  };
  logger.info(
    {
      url: server.configManagerHttpInfo.url,
      scheme: server.configManagerHttpInfo.scheme,
      host,
      port,
    },
    "Config Manager 已启动",
  );
  // 优雅关闭：收到信号时关闭 Nest（触发 OnModuleDestroy）与 Fastify。
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "收到退出信号，开始优雅关闭");
    try {
      await nestApp.close();
      logger.info("服务已关闭");
    } catch (err) {
      logger.error({ err }, "关闭过程出错");
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  return server;
}

export { CONFIG_PATH };
