<template>
  <div class="recording-panel">
    <div class="rec-panel-main">
      <div class="rec-panel-name" :title="row.name">{{ row.name }}</div>
      <div class="rec-panel-meta">
        <span class="rec-panel-size">{{ row.sizeText }}</span>
        <span class="rec-panel-divider" />
        <span class="rec-panel-time">{{ row.timeText }}</span>
      </div>
    </div>
    <div class="rec-panel-actions">
      <a-tooltip content="观看" mini>
        <a-button type="text" size="small" @click="actions?.play(row)">
          <template #icon><icon-play-arrow /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip content="下载" mini>
        <a-button type="text" size="small" @click="actions?.download(row)">
          <template #icon><icon-download /></template>
        </a-button>
      </a-tooltip>
      <a-popconfirm
        content="确定删除该录制文件？删除后不可恢复"
        type="warning"
        position="left"
        @ok="actions?.remove(row)"
      >
        <a-button type="text" size="small" status="danger">
          <template #icon><icon-delete /></template>
        </a-button>
      </a-popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import {
  RECORDING_ACTIONS_KEY,
  type CellProps,
  type RecordingActions,
  type RecordingRow,
} from '../types';

defineProps<CellProps<RecordingRow>>();

const actions = inject<RecordingActions | null>(RECORDING_ACTIONS_KEY, null);
</script>

<style scoped>
.recording-panel {
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
}

.recording-panel:hover {
  border-color: var(--color-primary-light-3, rgb(var(--primary-3)));
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-panel-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-3, #86909c);
}

.rec-panel-divider {
  width: 1px;
  height: 10px;
  background: var(--color-border-2, #e5e6eb);
}

.rec-panel-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
