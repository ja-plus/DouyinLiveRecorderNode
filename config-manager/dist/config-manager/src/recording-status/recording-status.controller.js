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
function _ts_metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(metadataKey, metadataValue);
    }
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
import { Controller, Get, HttpException, HttpStatus, Res } from "@nestjs/common";
import { RecordingStatusService } from "./recording-status.service.js";
export class RecordingStatusController {
    service;
    constructor(service){
        this.service = service;
    }
    stream(reply) {
        // 未配置录制器地址时直接返回 503，前端据此显示「录制器未运行」。
        if (!this.service.isAvailable()) {
            throw new HttpException({
                success: false,
                error: "未配置录制器状态服务地址（recorderStatusUrl）"
            }, HttpStatus.SERVICE_UNAVAILABLE);
        }
        // hijack 后由 raw 流接管响应，Fastify 不再介入发送生命周期。
        reply.hijack();
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            // 禁用 Nginx 等反向代理缓冲，确保实时推送不被攒批。
            "X-Accel-Buffering": "no"
        });
        this.service.addClient(reply);
        // 客户端断开时清理，避免向已关闭的连接写入。
        reply.raw.on("close", ()=>this.service.removeClient(reply));
    }
    status() {
        if (!this.service.isAvailable()) {
            throw new HttpException({
                success: false,
                error: "未配置录制器状态服务地址（recorderStatusUrl）"
            }, HttpStatus.SERVICE_UNAVAILABLE);
        }
        const snapshot = this.service.getSnapshot();
        return {
            success: true,
            ...snapshot ?? {
                recording: [],
                monitoring: 0,
                recorderOnline: false
            }
        };
    }
}
_ts_decorate([
    Get("stream"),
    _ts_param(0, Res()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof FastifyReply === "undefined" ? Object : FastifyReply
    ]),
    _ts_metadata("design:returntype", void 0)
], RecordingStatusController.prototype, "stream", null);
_ts_decorate([
    Get(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], RecordingStatusController.prototype, "status", null);
RecordingStatusController = _ts_decorate([
    Controller("/api/recording-status"),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof RecordingStatusService === "undefined" ? Object : RecordingStatusService
    ])
], RecordingStatusController);

//# sourceMappingURL=recording-status.controller.js.map