<template>
  <a-tag :color="color" size="small">{{ text }}</a-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CellProps, LogRow } from '../types';

const props = defineProps<CellProps<LogRow>>();

const LEVEL_MAP: Record<number, { color: string; text: string }> = {
  10: { color: 'gray', text: 'TRACE' },
  20: { color: 'arcoblue', text: 'DEBUG' },
  30: { color: 'green', text: 'INFO' },
  40: { color: 'orange', text: 'WARN' },
  50: { color: 'red', text: 'ERROR' },
  60: { color: 'magenta', text: 'FATAL' },
};

const color = computed(() => LEVEL_MAP[props.row.level]?.color || 'gray');
const text = computed(() => LEVEL_MAP[props.row.level]?.text || 'UNKNOWN');
</script>
