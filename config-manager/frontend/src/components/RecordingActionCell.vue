<template>
  <div class="rec-action-cell">
    <a-tooltip content="观看">
      <a-button type="text" @click="actions?.play(row)">
        <template #icon><icon-play-arrow /></template>
      </a-button>
    </a-tooltip>
    <a-tooltip content="下载">
      <a-button type="text" @click="actions?.download(row)">
        <template #icon><icon-download /></template>
      </a-button>
    </a-tooltip>
    <a-popconfirm content="确定删除该录制文件？删除后不可恢复" @ok="actions?.remove(row)">
      <a-button type="text" status="danger">
        <template #icon><icon-delete /></template>
      </a-button>
    </a-popconfirm>
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
.rec-action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
}
</style>
