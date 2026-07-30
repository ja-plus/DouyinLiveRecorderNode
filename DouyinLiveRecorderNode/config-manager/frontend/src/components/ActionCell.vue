<template>
  <div class="action-cell">
    <a-switch
      :model-value="row.enabled"
      @change="onToggle"
    >
      <template #checked>启用</template>
      <template #unchecked>注释</template>
    </a-switch>
  </div>
</template>

<script setup lang="ts">
import { type CellProps, type UrlRow } from '../types';

const props = defineProps<CellProps<UrlRow>>();

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
  gap: 12px;
  height: 100%;
}
</style>
