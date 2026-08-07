<template>
  <div class="action-cell">
    <a-switch
      :model-value="row.enabled"
      @change="onToggle"
    >
      <template #checked>启用</template>
      <template #unchecked>注释</template>
    </a-switch>
    <a-tooltip content="查看已录制文件">
      <a-button type="text" @click="actions?.openRecordings(row)">
        <template #icon><icon-video-camera /></template>
      </a-button>
    </a-tooltip>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import {
  CONFIG_ACTIONS_KEY,
  type CellProps,
  type ConfigActions,
  type UrlRow,
} from '../types';

const props = defineProps<CellProps<UrlRow>>();

const actions = inject<ConfigActions | null>(CONFIG_ACTIONS_KEY, null);

function onToggle(val: string | number | boolean): void {
  // true = 移除注释（启用），false = 注释掉
  props.row.enabled = !!val;
}
</script>

<style scoped>
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
}
</style>
