import fs from "node:fs";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import { createAppModule } from "./app.module.js";
import { createAuthModule } from "./auth/auth.module.js";
import { CONFIG_PATH, MANAGER_DIR } from "./common/paths.js";
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
async function killStaleInstance(): Promise<void> {
  let pid: number;
  try {
    pid = Number.parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0); // 仅检测存活，进程不存在时抛错
  } catch {
    return;
  }
  try {
    // Windows 上 process.kill 为强制终止；POSIX 发送 SIGTERM 触发优雅退出。
    process.kill(pid, process.platform === "win32" ? undefined : "SIGTERM");
  } catch {
    return;
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
  // 显式传入的选项优先于从 config.js 读取的配置。
  const settings = await getServerSettings(),
    host = options.host ?? settings.host,
    port = options.port ?? settings.port;
  const tls = loadTlsOptions({
    certPath: options.certPath ?? settings.certPath,
    keyPath: options.keyPath ?? settings.keyPath,
  });
  let portCheck = await checkPortAvailable(host, port);
  if (!portCheck.ok && portCheck.reason === "EADDRINUSE") {
    console.warn(`[ConfigManager] 端口 ${port} 被占用，尝试清理残留的本服务进程...`);
    await killStaleInstance();
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
    console.warn(
      "[ConfigManager] enableHttp2=true 但未找到 TLS 证书，已回退 HTTP/1.1。",
    );
  const adapter = new FastifyAdapter({
    logger: false,
    ...(http2 ? { http2: true, https: tls! } : {}),
  });
  const app = adapter.getInstance() as FastifyInstance;
  // 鉴权钩子读取会话令牌前，必须先注册 Cookie 解析。
  await app.register(fastifyCookie);
  const auth = createAuthModule(settings, http2);
  const nestApp = await NestFactory.create(
    createAppModule(auth.AuthModule),
    adapter,
    { logger: false },
  );
  // 保护 API 路由，同时让登录页所需的静态资源可以访问。
  app.addHook("preHandler", auth.guard);
  await app.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });
  // 在 Nest 初始化 API 路由前注册前端和录制文件的静态路由。
  await registerStaticRoutes(app);
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
  } catch {}
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
  return server;
}

export { CONFIG_PATH };
