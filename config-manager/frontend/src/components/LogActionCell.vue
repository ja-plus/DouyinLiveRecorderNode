<template>
  <a-button type="text" size="mini" @click="onClick">
    <template #icon><icon-eye /></template>
  </a-button>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import type { CellProps, LogActions, LogRow } from '../types';
import { LOG_ACTIONS_KEY } from '../types';

const props = defineProps<CellProps<LogRow>>();
const actions = inject<LogActions>(LOG_ACTIONS_KEY);

function onClick(): void {
  actions?.showDetail(props.row);
}
</script>
