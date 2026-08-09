<template>
  <div class="url-panel-wrapper">
    <div class="url-panel" :class="{ deleted: row.deleted }">
      <template v-if="row.deleted">
        <div class="url-panel-head">
          <span class="url-panel-name deleted-name">{{ row.name || "(未命名)" }}</span>
        </div>
        <div class="url-panel-url" :title="row.url">{{ row.url }}</div>
        <div class="url-panel-foot">
          <span class="deleted-tip-text">待删除</span>
          <a-tooltip content="撤销删除" mini>
            <a-button type="text" size="mini" status="warning" @click="actions?.undoDelete(row.id)">
              <template #icon><icon-undo /></template>
            </a-button>
          </a-tooltip>
        </div>
      </template>
      <template v-else>
        <div class="url-panel-head">
          <span class="url-panel-name" :title="row.name">{{
            row.name || "(未命名)"
            }}</span>
          <a-switch :model-value="row.enabled" @change="onToggle">
            <template #checked>启用</template>
            <template #unchecked>注释</template>
          </a-switch>
        </div>
        <div class="url-panel-meta">
          <div class="url-panel-status">
            <template v-if="status">
              <span class="dot recording" />
              <span class="recording-text">录制中</span>
              <span class="elapsed">{{ elapsedText(status.startTime) }}</span>
            </template>
            <template v-else-if="connectionState === 'unavailable'">
              <span class="dot offline" />
              <span class="muted">未配置</span>
            </template>
            <template v-else>
              <span class="dot idle" />
              <span class="muted">空闲</span>
            </template>
          </div>
          <div class="url-panel-divider"></div>
          <div class="url-panel-url" :title="row.url">{{ row.url }}</div>
        </div>
        <div class="url-panel-foot">
          <a-select :model-value="row.quality || undefined" size="small" allow-clear style="width: 120px;"
            class="url-panel-quality" :placeholder="`默认(${defaultQuality})`" @change="onQualityChange"
            @clear="onQualityClear">
            <a-option v-for="q in qualityOptions" :key="q" :value="q">{{ q }}</a-option>
          </a-select>
          <div class="url-panel-actions">
            <a-tooltip v-if="row.name" content="查看已录制文件" mini>
              <a-button type="text" @click="actions?.openRecordings(row)">
                <template #icon><icon-video-camera /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip content="删除（保存前可撤销）" mini>
              <a-button type="text" status="danger" @click="actions?.deleteRow(row.id)">
                <template #icon><icon-delete /></template>
              </a-button>
            </a-tooltip>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue';
import { useRecordingStatus } from '../composables/useRecordingStatus';
import {
  CONFIG_ACTIONS_KEY,
  QUALITY_OPTIONS,
  QUALITY_OPTIONS_KEY,
  DEFAULT_QUALITY_KEY,
  type CellProps,
  type ConfigActions,
  type UrlRow,
} from '../types';

const props = defineProps<CellProps<UrlRow>>();

const actions = inject<ConfigActions | null>(CONFIG_ACTIONS_KEY, null);
const defaultQuality = inject<Ref<string>>(DEFAULT_QUALITY_KEY, ref('原画'));
const qualityOptions = inject<Ref<string[]>>(
  QUALITY_OPTIONS_KEY,
  ref(QUALITY_OPTIONS),
);

const { recordingMap, connectionState, elapsedText } = useRecordingStatus();
// 以 url 为主键精确匹配当前行对应的录制状态
const status = computed(() => recordingMap.value.get(props.row.url));

function onToggle(val: string | number | boolean): void {
  props.row.enabled = !!val;
}

function onQualityChange(val: unknown): void {
  props.row.quality = typeof val === 'string' ? val : '';
}

function onQualityClear(): void {
  props.row.quality = '';
}
</script>

<style scoped>
.url-panel-wrapper{
  display: flex;
  width:100%;
  max-width:100%;
}
.url-panel {
  flex:1;
  min-width: 0;
  overflow:hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  height: 90px;
  /* max-width: calc(100% - 16px); */
  /* margin: 0px 8px; */
  padding: 10px 14px;
  background: var(--color-bg-2, #fff);
  border: 1px solid var(--color-border-2, #e5e6eb);
  border-radius: 8px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 4%);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.url-panel:hover {
  border-color: var(--color-primary-light-3, rgb(var(--primary-3)));
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
}

.url-panel.deleted {
  opacity: 0.55;
  border-style: dashed;
}

.url-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
}

.url-panel-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.dot.recording {
  background: #00b42a;
  animation: pulse 1.6s infinite;
}

.dot.idle {
  background: var(--color-fill-4, #c9cdd4);
}

.dot.offline {
  background: var(--color-text-4, #86909c);
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
}

.url-panel-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-1, #1d2129);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.deleted-name {
  text-decoration: line-through;
  color: var(--color-text-3, #86909c);
}

/* 第二行：录制状态 + URL 同行，URL 截断 */
.url-panel-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.url-panel-divider {
  flex: none;
  width: 1px;
  height: 10px;
  background: var(--color-border-2, #e5e6eb);
}

.url-panel-url {
  display: block;
  font-size: 12px;
  color: var(--color-text-3, #86909c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.url-panel-meta .url-panel-url {
  flex: 1;
  min-width: 0;
}

.url-panel-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}


.url-panel-actions {
  display: flex;
  align-items: center;
  gap: 0;
}

.deleted-tip-text {
  font-size: 12px;
  color: #f53f3f;
  font-weight: 600;
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
