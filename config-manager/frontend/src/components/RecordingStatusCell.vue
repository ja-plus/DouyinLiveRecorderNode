<template>
  <div class="status-cell">
    <template v-if="item">
      <span class="dot recording" />
      <span class="text recording-text">录制中</span>
      <span class="elapsed">{{ elapsedText(item.startTime) }}</span>
    </template>
    <template v-else-if="connectionState === 'unavailable'">
      <a-tooltip content="config-manager 未配置 recorderStatusUrl，无法获取实时状态">
        <span class="text muted">未配置</span>
      </a-tooltip>
    </template>
    <template v-else-if="!recorderOnline">
      <span class="dot offline" />
      <span class="text muted">空闲</span>
    </template>
    <template v-else>
      <span class="dot idle" />
      <span class="text muted">空闲</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRecordingStatus } from '../composables/useRecordingStatus';
import type { CellProps, UrlRow } from '../types';

const props = defineProps<CellProps<UrlRow>>();
const { recordingMap, recorderOnline, connectionState, elapsedText } =
  useRecordingStatus();

// 以 url 为主键精确匹配当前行对应的录制状态
const item = computed(() => recordingMap.value.get(props.row.url));
</script>

<style scoped>
.status-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  font-size: 12px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.dot.recording {
  background: #00b42a;
  box-shadow: 0 0 0 0 rgb(0 180 42 / 50%);
  animation: pulse 1.6s infinite;
}

.dot.offline {
  background: var(--color-text-4, #86909c);
}

.dot.idle {
  background: var(--color-fill-4, #c9cdd4);
}

.text {
  white-space: nowrap;
}

.recording-text {
  color: #00b42a;
  font-weight: 600;
}

.muted {
  color: var(--color-text-3, #86909c);
}

.elapsed {
  color: var(--color-text-3, #86909c);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(0 180 42 / 50%);
  }
  70% {
    box-shadow: 0 0 0 6px rgb(0 180 42 / 0%);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(0 180 42 / 0%);
  }
}
</style>
