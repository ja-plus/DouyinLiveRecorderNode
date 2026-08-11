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
import { Injectable } from "@nestjs/common";
export class RecordingStatusService {
    recorderStatusUrl;
    logger;
    browserClients = new Set();
    currentSnapshot = null;
    reconnectTimer = null;
    controller = null;
    aborted = false;
    constructor(recorderStatusUrl, logger){
        this.recorderStatusUrl = recorderStatusUrl;
        this.logger = logger;
    }
    onModuleInit() {
        // 仅在配置了录制器地址时建立连接；未配置则该功能静默不可用。
        if (this.recorderStatusUrl) {
            this.logger.info({
                url: this.recorderStatusUrl
            }, "连接录制器状态流");
            this.connectToRecorder();
        } else {
            this.logger.info("未配置 recorderStatusUrl，录制状态功能不可用");
        }
    }
    onModuleDestroy() {
        this.logger.info({
            clients: this.browserClients.size
        }, "录制状态服务关闭，断开浏览器连接");
        this.aborted = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.controller?.abort();
        // 主动关闭所有浏览器 SSE 连接，避免句柄泄漏。
        for (const client of this.browserClients){
            try {
                client.raw.end();
            } catch (err) {
                this.logger.debug({
                    err
                }, "关闭浏览器 SSE 连接失败");
            }
        }
        this.browserClients.clear();
    }
    /** 是否可用（已配置录制器地址） */ isAvailable() {
        return !!this.recorderStatusUrl;
    }
    /** 获取当前缓存的快照（供非 SSE 接口一次性返回） */ getSnapshot() {
        return this.currentSnapshot;
    }
    /** 注册一个浏览器 SSE 客户端，并立即下发当前快照 */ addClient(reply) {
        this.browserClients.add(reply);
        this.logger.debug({
            clients: this.browserClients.size
        }, "SSE 客户端已连接");
        if (this.currentSnapshot) this.send(reply, this.currentSnapshot);
    }
    /** 移除一个浏览器 SSE 客户端 */ removeClient(reply) {
        this.browserClients.delete(reply);
        this.logger.debug({
            clients: this.browserClients.size
        }, "SSE 客户端已断开");
    }
    /** 连接录制器 SSE 状态流 */ async connectToRecorder() {
        if (this.aborted) return;
        this.controller = new AbortController();
        const url = `${this.recorderStatusUrl}/recording-status/stream`;
        try {
            const resp = await fetch(url, {
                headers: {
                    Accept: "text/event-stream"
                },
                signal: this.controller.signal
            });
            if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
            this.logger.info({
                url
            }, "录制器状态流已连接");
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for(;;){
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {
                    stream: true
                });
                // SSE 事件以空行分隔，逐条解析
                let idx;
                while((idx = buffer.indexOf("\n\n")) >= 0){
                    const chunk = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    this.handleSseChunk(chunk);
                }
            }
            // 流正常结束（录制器关闭连接）→ 标记离线并重连
            this.markOffline();
        } catch (err) {
            // 连接失败/中断；销毁中则不再重连
            if (this.aborted) return;
            this.logger.warn({
                err
            }, "录制器状态流连接失败/中断，5s 后重连");
            this.markOffline();
        }
        if (!this.aborted) {
            this.reconnectTimer = setTimeout(()=>{
                this.reconnectTimer = null;
                void this.connectToRecorder();
            }, 5000);
        }
    }
    /**
   * 解析一段 SSE chunk，根据 event: 字段区分消息类型：
   * - 默认（无 event: 行）：录制状态快照
   * - name-update：主播名更新（录制器回写名称后推送）
   */ handleSseChunk(chunk) {
        let eventType = "message";
        const dataLines = [];
        for (const line of chunk.split("\n")){
            if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
            }
        }
        if (!dataLines.length) return; // 忽略心跳注释（: ping）等
        try {
            const data = dataLines.join("\n");
            if (eventType === "name-update") {
                // 主播名更新：中继给所有浏览器客户端
                const update = JSON.parse(data);
                this.broadcastNameUpdate(update);
            } else {
                // 默认：录制状态快照
                const snapshot = JSON.parse(data);
                this.currentSnapshot = {
                    ...snapshot,
                    recorderOnline: true
                };
                this.broadcast(this.currentSnapshot);
            }
        } catch (err) {
            this.logger.warn({
                chunk: chunk.slice(0, 200),
                err
            }, "SSE 数据解析失败，已跳过");
        }
    }
    /** 录制器离线：清空录制列表并通知浏览器 */ markOffline() {
        const prev = this.currentSnapshot;
        const offline = {
            recording: [],
            monitoring: prev?.monitoring ?? 0,
            updatedAt: new Date().toISOString(),
            recorderOnline: false
        };
        // 仅在状态确实由在线变离线时广播，避免重复下发
        if (prev?.recorderOnline !== false) {
            this.currentSnapshot = offline;
            this.broadcast(offline);
            this.logger.warn("录制器离线，已通知浏览器");
        } else {
            this.currentSnapshot = offline;
        }
    }
    broadcast(snapshot) {
        for (const client of this.browserClients)this.send(client, snapshot);
    }
    send(reply, snapshot) {
        try {
            reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
        } catch (err) {
            // 写入失败（客户端已断开）时记录，close 事件会清理
            this.logger.debug({
                err
            }, "SSE 写入失败，客户端可能已断开");
        }
    }
    /** 向所有浏览器客户端中继主播名更新（SSE 命名事件） */ broadcastNameUpdate(update) {
        if (this.browserClients.size === 0) return;
        const payload = `event: name-update\ndata: ${JSON.stringify(update)}\n\n`;
        for (const client of this.browserClients){
            try {
                client.raw.write(payload);
            } catch (err) {
                this.logger.debug({
                    err
                }, "名称更新 SSE 写入失败，客户端可能已断开");
            }
        }
    }
}
RecordingStatusService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        typeof Logger === "undefined" ? Object : Logger
    ])
], RecordingStatusService);

//# sourceMappingURL=recording-status.service.js.map