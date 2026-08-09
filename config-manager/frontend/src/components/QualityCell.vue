<template>
  <div class="quality-cell">
    <a-select
      :model-value="row.quality || undefined"
      size="small"
      allow-clear
      :disabled="row.deleted"
      :placeholder="`默认(${defaultQuality})`"
      @change="onChange"
      @clear="onClear"
    >
      <a-option v-for="q in qualityOptions" :key="q" :value="q">{{ q }}</a-option>
    </a-select>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, type Ref } from 'vue';
import {
  type CellProps,
  type UrlRow,
  QUALITY_OPTIONS,
  QUALITY_OPTIONS_KEY,
  DEFAULT_QUALITY_KEY,
} from '../types';

const props = defineProps<CellProps<UrlRow>>();

// 画质为空时表示使用 config.ini 中的默认画质，占位符提示当前默认值
const defaultQuality = inject<Ref<string>>(DEFAULT_QUALITY_KEY, ref('原画'));
const qualityOptions = inject<Ref<string[]>>(QUALITY_OPTIONS_KEY, ref(QUALITY_OPTIONS));

function onChange(val: unknown): void {
  props.row.quality = typeof val === 'string' ? val : '';
}

function onClear(): void {
  props.row.quality = '';
}
</script>

<style scoped>
.quality-cell {
  display: flex;
  align-items: center;
  height: 100%;
}
</style>
