<template>
  <div class="action-cell">
    <a-switch
      :model-value="row.enabled"
      size="small"
      @change="onToggle"
    >
      <template #checked>启用</template>
      <template #unchecked>注释</template>
    </a-switch>
    <a-popconfirm
      content="确认删除这条记录？"
      type="warning"
      position="left"
      ok-text="删除"
      cancel-text="取消"
      @ok="onDelete"
    >
      <a-button
        type="text"
        status="danger"
        size="small"
      >
        删除
      </a-button>
    </a-popconfirm>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { CONFIG_ACTIONS_KEY, type CellProps, type ConfigActions, type UrlRow } from '../types';

const props = defineProps<CellProps<UrlRow>>();

// 由 UrlConfigView 通过 provide 注入的操作方法
const actions = inject<ConfigActions>(CONFIG_ACTIONS_KEY);

function onToggle(val: string | number | boolean): void {
  // true = 移除注释（启用），false = 注释掉
  props.row.enabled = !!val;
}

function onDelete(): void {
  actions?.deleteRow(props.row.id);
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
