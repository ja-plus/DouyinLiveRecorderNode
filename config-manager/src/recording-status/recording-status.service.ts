import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { Logger } from "pino";

/** 单个正在录制的主播状态 */
export type RecordingStatusItem = {
  /** 完整显示名（序号N 主播名） */
  name: string;
  /** 主播名（去掉序号前缀） */
  anchorName: string;
  /** 直播间地址，与 URL 配置行精确匹配 */
  url: string;
  /** 录制开始时间 ISO 串 */
  startTime: string;
  /** 画质中文 */
  quality: string;
};

/** 录制器下发的原始快照 */
export type RecordingSnapshot = {
  recording: RecordingStatusItem[];
  monitoring: number;
  updatedAt: string;
};

/** 推给浏览器的快照，额外带录制器在线标记 */
export type BrowserSnapshot = RecordingSnapshot & { recorderOnline: boolean };

/** 录制器回写主播名后推送的名称更新 */
export type NameUpdate = {
  url: string;
  name: string;
};

/**
 * 录制状态中继服务：
 * 1. 作为 SSE 客户端连接录制器（main.js）的 /recording-status/stream
 * 2. 解析状态流，缓存最新快照
 * 3. 作为 SSE 服务端，向所有浏览器客户端广播
 *
 * 录制器离线时自动退避重连，并向浏览器下发离线状态。
 */
@Injectable()
export class RecordingStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly recorderStatusUrl: string;
  private readonly logger: Logger;
  private readonly browserClients = new Set<FastifyReply>();
  private currentSnapshot: BrowserSnapshot | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private aborted = false;

  constructor(recorderStatusUrl: string, logger: Logger) {
    this.recorderStatusUrl = recorderStatusUrl;
    this.logger = logger;
  }

  onModuleInit(): void {
    // 仅在配置了录制器地址时建立连接；未配置则该功能静默不可用。
    if (this.recorderStatusUrl) {
      this.logger.info(
        { url: this.recorderStatusUrl },
        "连接录制器状态流",
      );
      this.connectToRecorder();
    } else {
      this.logger.info(
        "未配置 recorderStatusUrl，录制状态功能不可用",
      );
    }
  }

  onModuleDestroy(): void {
    this.logger.info(
      { clients: this.browserClients.size },
      "录制状态服务关闭，断开浏览器连接",
    );
    this.aborted = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.controller?.abort();
    // 主动关闭所有浏览器 SSE 连接，避免句柄泄漏。
    for (const client of this.browserClients) {
      try {
        client.raw.end();
      } catch (err) {
        this.logger.debug({ err }, "关闭浏览器 SSE 连接失败");
      }
    }
    this.browserClients.clear();
  }

  /** 是否可用（已配置录制器地址） */
  isAvailable(): boolean {
    return !!this.recorderStatusUrl;
  }

  /** 获取当前缓存的快照（供非 SSE 接口一次性返回） */
  getSnapshot(): BrowserSnapshot | null {
    return this.currentSnapshot;
  }

  /** 注册一个浏览器 SSE 客户端，并立即下发当前快照 */
  addClient(reply: FastifyReply): void {
    this.browserClients.add(reply);
    this.logger.debug(
      { clients: this.browserClients.size },
      "SSE 客户端已连接",
    );
    if (this.currentSnapshot) this.send(reply, this.currentSnapshot);
  }

  /** 移除一个浏览器 SSE 客户端 */
  removeClient(reply: FastifyReply): void {
    this.browserClients.delete(reply);
    this.logger.debug(
      { clients: this.browserClients.size },
      "SSE 客户端已断开",
    );
  }

  /** 连接录制器 SSE 状态流 */
  private async connectToRecorder(): Promise<void> {
    if (this.aborted) return;
    this.controller = new AbortController();
    const url = `${this.recorderStatusUrl}/recording-status/stream`;
    try {
      const resp = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: this.controller.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      this.logger.info({ url }, "录制器状态流已连接");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 事件以空行分隔，逐条解析
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
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
      this.logger.warn(
        { err },
        "录制器状态流连接失败/中断，5s 后重连",
      );
      this.markOffline();
    }
    if (!this.aborted) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        void this.connectToRecorder();
      }, 5000);
    }
  }

  /**
   * 解析一段 SSE chunk，根据 event: 字段区分消息类型：
   * - 默认（无 event: 行）：录制状态快照
   * - name-update：主播名更新（录制器回写名称后推送）
   */
  private handleSseChunk(chunk: string): void {
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
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
        const update = JSON.parse(data) as NameUpdate;
        this.broadcastNameUpdate(update);
      } else {
        // 默认：录制状态快照
        const snapshot = JSON.parse(data) as RecordingSnapshot;
        this.currentSnapshot = { ...snapshot, recorderOnline: true };
        this.broadcast(this.currentSnapshot);
      }
    } catch (err) {
      this.logger.warn(
        { chunk: chunk.slice(0, 200), err },
        "SSE 数据解析失败，已跳过",
      );
    }
  }

  /** 录制器离线：清空录制列表并通知浏览器 */
  private markOffline(): void {
    const prev = this.currentSnapshot;
    const offline: BrowserSnapshot = {
      recording: [],
      monitoring: prev?.monitoring ?? 0,
      updatedAt: new Date().toISOString(),
      recorderOnline: false,
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

  private broadcast(snapshot: BrowserSnapshot): void {
    for (const client of this.browserClients) this.send(client, snapshot);
  }

  private send(reply: FastifyReply, snapshot: BrowserSnapshot): void {
    try {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    } catch (err) {
      // 写入失败（客户端已断开）时记录，close 事件会清理
      this.logger.debug({ err }, "SSE 写入失败，客户端可能已断开");
    }
  }

  /** 向所有浏览器客户端中继主播名更新（SSE 命名事件） */
  private broadcastNameUpdate(update: NameUpdate): void {
    if (this.browserClients.size === 0) return;
    const payload = `event: name-update\ndata: ${JSON.stringify(update)}\n\n`;
    for (const client of this.browserClients) {
      try {
        client.raw.write(payload);
      } catch (err) {
        this.logger.debug({ err }, "名称更新 SSE 写入失败，客户端可能已断开");
      }
    }
  }
}
