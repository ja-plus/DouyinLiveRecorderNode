<template>
  <div class="recording-panel" @click="actions?.play(row)">
    <div class="rec-panel-thumb">
      <img
        v-if="thumbLoaded && thumbUrl"
        :src="thumbUrl"
        class="rec-thumb-img"
        alt="封面"
        @load="thumbLoaded = true"
        @error="onThumbError"
      />
      <div v-else class="rec-thumb-placeholder">
        <icon-video-camera />
      </div>
      <div class="rec-thumb-play">
        <icon-play-arrow class="rec-thumb-play-icon" />
      </div>
    </div>
    <div class="rec-panel-main">
      <div class="rec-panel-name" :title="row.name">{{ row.name }}</div>
      <div class="rec-panel-meta">
        <span class="rec-panel-size">{{ row.sizeText }}</span>
        <span class="rec-panel-divider" />
        <span class="rec-panel-time">{{ row.timeText }}</span>
      </div>
      <div class="rec-panel-actions" @click.stop>
        <a-tooltip content="下载" mini>
          <a-button type="text" size="mini" @click="actions?.download(row)">
            <template #icon><icon-download /></template>
          </a-button>
        </a-tooltip>
        <a-popconfirm
          content="确定删除该录制文件？删除后不可恢复"
          type="warning"
          position="top"
          @ok="actions?.remove(row)"
        >
          <a-button type="text" size="mini" status="danger">
            <template #icon><icon-delete /></template>
          </a-button>
        </a-popconfirm>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject } from 'vue';
import { API } from '../api';
import {
  RECORDING_ACTIONS_KEY,
  type CellProps,
  type RecordingActions,
  type RecordingRow,
} from '../types';

const props = defineProps<CellProps<RecordingRow>>();

const actions = inject<RecordingActions | null>(RECORDING_ACTIONS_KEY, null);

const thumbLoaded = ref(true);
const thumbUrl = computed(() => API.recordingThumb(props.row.file));

function onThumbError() {
  thumbLoaded.value = false;
}
</script>

<style scoped>
.recording-panel {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 92px;
  padding: 12px 14px;
  margin: 0 8px;
  background: var(--color-bg-2, #fff);
  border: 1px solid var(--color-border-2, #e5e6eb);
  border-radius: 8px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 4%);
  transition: box-shadow 0.2s, border-color 0.2s;
  cursor: pointer;
}

.recording-panel:hover {
  border-color: var(--color-primary-light-3, rgb(var(--primary-3)));
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
}

.rec-panel-thumb {
  position: relative;
  flex-shrink: 0;
  width: 120px;
  height: 68px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-fill-2, #f2f3f5);
}

.rec-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rec-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3, #86909c);
  font-size: 24px;
}

.rec-thumb-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 18%);
}

.rec-thumb-play-icon {
  color: #fff;
  font-size: 24px;
  padding: 6px;
  border-radius: 50%;
  background: rgb(0 0 0 / 35%);
}

.rec-panel-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.rec-panel-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-1, #1d2129);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rec-panel-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-3, #86909c);
}

.rec-panel-divider {
  width: 1px;
  height: 10px;
  background: var(--color-border-2, #e5e6eb);
}

.rec-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
}
</style>
