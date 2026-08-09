import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { RecordingStatusService } from "./recording-status.service.js";

/**
 * 录制状态接口：
 * - GET /api/recording-status        一次性返回当前快照（JSON）
 * - GET /api/recording-status/stream SSE 实时推送（浏览器 EventSource 订阅）
 */
@Controller("/api/recording-status")
export class RecordingStatusController {
  constructor(private readonly service: RecordingStatusService) {}

  @Get("stream")
  stream(@Res() reply: FastifyReply): void {
    // 未配置录制器地址时直接返回 503，前端据此显示「录制器未运行」。
    if (!this.service.isAvailable()) {
      throw new HttpException(
        { success: false, error: "未配置录制器状态服务地址（recorderStatusUrl）" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    // hijack 后由 raw 流接管响应，Fastify 不再介入发送生命周期。
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // 禁用 Nginx 等反向代理缓冲，确保实时推送不被攒批。
      "X-Accel-Buffering": "no",
    });
    this.service.addClient(reply);
    // 客户端断开时清理，避免向已关闭的连接写入。
    reply.raw.on("close", () => this.service.removeClient(reply));
  }

  @Get()
  status(): unknown {
    if (!this.service.isAvailable()) {
      throw new HttpException(
        { success: false, error: "未配置录制器状态服务地址（recorderStatusUrl）" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const snapshot = this.service.getSnapshot();
    return {
      success: true,
      ...(snapshot ?? { recording: [], monitoring: 0, recorderOnline: false }),
    };
  }
}
