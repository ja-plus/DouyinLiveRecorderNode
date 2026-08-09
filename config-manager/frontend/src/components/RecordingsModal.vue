<template>
  <a-modal
    :visible="visible"
    :title="`已录制文件 - ${anchorName}`"
    :footer="false"
    modal-class="recordings-modal"
    draggable
    unmount-on-close
    @update:visible="onVisibleChange"
    @close="onListClose"
  >
    <a-spin :loading="loading" class="rec-spin">
      <div class="rec-table-wrap">
        <StkTable
          class="rec-table"
          row-key="id"
          :theme="isDark ? 'dark' : 'light'"
          :columns="columns"
          :data-source="items"
          :row-height="108"
          no-data-full
          :row-active="false"
          :row-hover="false"
          headless
          bordered
          stripe
          virtual
        >
          <template #empty>
            <div>未找到该主播的录制文件</div>
          </template>
        </StkTable>
      </div>
    </a-spin>
  </a-modal>

  <!-- 播放器弹窗 -->
  <a-modal
    v-model:visible="playerVisible"
    :title="playing?.name || '播放'"
    :footer="false"
    modal-class="player-modal"
    draggable
    unmount-on-close
    @close="stopPlay"
  >
    <video ref="videoRef" class="player-video" controls autoplay playsinline />
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, provide, markRaw } from "vue";
import { StkTable, type StkTableColumn } from "stk-table-vue";
import { Message } from "@arco-design/web-vue";
import http from "../http";
import { API } from "../api";
import RecordingPanelCell from "./RecordingPanelCell.vue";
import { isDark } from "../composables/useTheme";
import {
  RECORDING_ACTIONS_KEY,
  type ApiRecordingsResp,
  type RecordingActions,
  type RecordingItem,
  type RecordingRow,
} from "../types";

const props = defineProps<{ visible: boolean; anchorName: string }>();
const emit = defineEmits<{ (e: "update:visible", v: boolean): void }>();

const items = ref<RecordingRow[]>([]);
const loading = ref(false);

const columns: StkTableColumn<RecordingRow>[] = [
  {
    title: "",
    dataIndex: "id" as never,
    customCell: markRaw(RecordingPanelCell),
  },
];

watch(
  () => props.visible,
  (v) => {
    if (v) load();
  },
);

function onVisibleChange(v: boolean): void {
  emit("update:visible", v);
}

function onListClose(): void {
  stopPlay();
  playerVisible.value = false;
}

async function load(): Promise<void> {
  loading.value = true;
  items.value = [];
  try {
    const data = await http.get<ApiRecordingsResp>(API.recordings, {
      params: { name: props.anchorName },
    });
    if (!data.success) throw new Error(data.error || "未知错误");
    let id = 1;
    items.value = (data.items || []).map((it) => ({
      id: id++,
      ...it,
      sizeText: formatSize(it.size),
      timeText: new Date(it.mtime).toLocaleString("zh-CN"),
    }));
  } catch (e) {
    Message.error("加载录制文件失败: " + (e as Error).message);
  } finally {
    loading.value = false;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i]}`;
}

// ==== 播放 ====
const playerVisible = ref(false);
const playing = ref<RecordingItem | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

// mpegts.js Player 的最小接口（避免对其内部类型的强依赖）
interface MsePlayer {
  attachMediaElement(el: HTMLMediaElement): void;
  load(): void;
  play(): Promise<void> | void;
  destroy(): void;
}
let player: MsePlayer | null = null;

async function play(row: RecordingItem): Promise<void> {
  playing.value = row;
  playerVisible.value = true;
  await nextTick();
  const el = videoRef.value;
  if (!el) return;
  destroyPlayer();

  const url = API.video(row.file);
  if (row.ext === "flv" || row.ext === "ts") {
    // FLV/TS 浏览器无法原生播放，用 mpegts.js 走 MSE 转封装
    const mpegts = (await import("mpegts.js")).default;
    if (!mpegts.isSupported()) {
      Message.error("当前浏览器不支持 MSE，无法播放 FLV/TS 文件");
      return;
    }
    player = mpegts.createPlayer({
      type: row.ext === "flv" ? "flv" : "mpegts",
      url,
      isLive: false,
    }) as unknown as MsePlayer;
    player.attachMediaElement(el);
    player.load();
    void player.play();
  } else {
    el.src = url;
    void el.play().catch(() => undefined);
  }
}

function destroyPlayer(): void {
  if (player) {
    try {
      player.destroy();
    } catch {
      // ignore
    }
    player = null;
  }
}

function stopPlay(): void {
  destroyPlayer();
  playing.value = null;
}

// ==== 下载 ====
function download(row: RecordingItem): void {
  // 同源请求会自动携带鉴权 Cookie；用临时 <a download> 触发浏览器下载，
  // 由后端的 Content-Disposition: attachment 决定保存文件名。
  const a = document.createElement("a");
  a.href = API.recordingDownload(row.file);
  a.download = row.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ==== 删除 ====
async function remove(row: RecordingItem): Promise<void> {
  try {
    const data = await http.del<{ success?: boolean; error?: string }>(API.recordings, {
      body: { file: row.file },
    });
    if (!data.success) throw new Error(data.error || "未知错误");
    items.value = items.value.filter((it) => it.id !== row.id);
    Message.success("已删除: " + row.name);
  } catch (e) {
    Message.error("删除失败: " + (e as Error).message);
  }
}

provide<RecordingActions>(RECORDING_ACTIONS_KEY, { play, download, remove });
</script>

<style>
/* 弹窗挂在 body 下，scoped 样式作用不到 */
.arco-modal.recordings-modal {
  width: 480px;
  max-width: 94vw;
}

.arco-modal.player-modal {
  width: 820px;
  max-width: 96vw;
}
</style>

<style scoped>
.rec-spin {
  display: block;
  width: 100%;
}

.rec-table-wrap {
  height: 55vh;
}

.rec-table {
  height: 100%;
  background: var(--color-bg-2, #fff);
  border-radius: 6px;
}

.rec-table :deep(.stk-table-main) {
  border-spacing: 0 8px;
}

.rec-table :deep(tbody tr) {
  background: transparent;
}

.rec-table :deep(td) {
  border: none;
  padding: 0;
  background: transparent;
}

.player-video {
  display: block;
  width: 100%;
  max-height: 70vh;
  background: #000;
  border-radius: 4px;
}
</style>
