import { ref } from 'vue';
import { API } from '../api';
import type { RecordingStatusItem, RecordingStatusSnapshot } from '../types';

/**
 * 录制状态实时订阅（模块级单例）。
 *
 * 通过 EventSource 订阅 config-manager 的 /api/recording-status/stream，
 * config-manager 再以 SSE 中继方式从录制器（main.js）拉取状态。
 *
 * 连接策略：
 *  - 首次连接即失败（onopen 未触发）时，探测 /api/recording-status；
 *    返回 503 说明后端未配置 recorderStatusUrl，标记 unavailable 不再重连。
 *  - 曾连通后断开，5s 退避重连。
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'unavailable';

/** 以 url 为 key，便于表格行精确匹配 */
const recordingMap = ref(new Map<string, RecordingStatusItem>());
const monitoring = ref(0);
const recorderOnline = ref(false);
const connectionState = ref<ConnectionState>('disconnected');

/** 1s 跳动的「当前时间」，驱动已录时长文本刷新 */
const now = ref(Date.now());

let es: EventSource | null = null;
let everConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** 启动单例：首次调用时建立连接与计时器，之后幂等 */
function start(): void {
  if (started) return;
  started = true;
  // 1s ticker 常驻页面生命周期，驱动 elapsedText 每秒刷新
  setInterval(() => {
    now.value = Date.now();
  }, 1000);
  openEventSource();
}

function openEventSource(): void {
  if (es) return;
  connectionState.value = 'connecting';
  es = new EventSource(API.recordingStatusStream, { withCredentials: true });
  es.onopen = () => {
    everConnected = true;
    connectionState.value = 'connected';
  };
  es.onmessage = (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data) as RecordingStatusSnapshot;
      const map = new Map<string, RecordingStatusItem>();
      for (const it of data.recording) map.set(it.url, it);
      recordingMap.value = map;
      monitoring.value = data.monitoring ?? 0;
      recorderOnline.value = !!data.recorderOnline;
    } catch {
      // 解析失败忽略，等待下一条
    }
  };
  es.onerror = () => {
    if (es?.readyState === EventSource.CLOSED) {
      es?.close();
      es = null;
      if (!everConnected) {
        // 首次即失败：探测是否为 503（未配置 recorderStatusUrl）
        void probeAvailability();
      } else {
        connectionState.value = 'disconnected';
        scheduleReconnect();
      }
    }
    // readyState !== CLOSED 时浏览器会自动重连，无需手动处理
  };
}

async function probeAvailability(): Promise<void> {
  try {
    const probe = await fetch(API.recordingStatus, { credentials: 'include' });
    // 503 = 后端未配置录制器地址，属永久状态，不再重连
    if (probe.status === 503) {
      connectionState.value = 'unavailable';
      return;
    }
  } catch {
    // 网络异常或未登录，交由重连兜底
  }
  connectionState.value = 'disconnected';
  scheduleReconnect();
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openEventSource();
  }, 5000);
}

/** 把 ISO 开始时间格式化为 H:MM:SS 时长文本 */
export function elapsedText(startTime: string): string {
  const start = new Date(startTime).getTime();
  if (Number.isNaN(start)) return '';
  const elapsed = Math.max(0, Math.floor((now.value - start) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useRecordingStatus() {
  start();
  return {
    recordingMap,
    monitoring,
    recorderOnline,
    connectionState,
    now,
    elapsedText,
  };
}
