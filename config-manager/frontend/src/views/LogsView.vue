<template>
  <div class="page">
    <div class="header">
      <div class="title">系统日志</div>
      <a-space wrap>
        <a-button :loading="loading" @click="fetchLogs">
          <template #icon><icon-refresh /></template>
        </a-button>
        <a-popconfirm
          content="确定要清理旧日志吗？此操作不可恢复。"
          @ok="handleCleanup"
        >
          <a-button status="warning" :loading="cleaning">
            <template #icon><icon-delete /></template>
            清理日志
          </a-button>
        </a-popconfirm>
      </a-space>
    </div>

    <div class="stats-bar" v-if="stats">
      <a-space wrap>
        <a-tag color="arcoblue">总条数: {{ stats.total }}</a-tag>
        <a-tag v-if="stats.oldestTime">最早: {{ formatTime(stats.oldestTime) }}</a-tag>
        <a-tag v-if="stats.newestTime">最新: {{ formatTime(stats.newestTime) }}</a-tag>
      </a-space>
    </div>

    <div class="filter-bar">
      <a-space wrap>
        <a-select
          v-model="filters.level"
          placeholder="日志级别"
          allow-clear
          style="width: 130px"
          @change="handleSearch"
        >
          <a-option :value="10">TRACE</a-option>
          <a-option :value="20">DEBUG</a-option>
          <a-option :value="30">INFO</a-option>
          <a-option :value="40">WARN</a-option>
          <a-option :value="50">ERROR</a-option>
          <a-option :value="60">FATAL</a-option>
        </a-select>
        <a-input
          v-model="filters.context"
          placeholder="上下文"
          allow-clear
          style="width: 140px"
          @press-enter="handleSearch"
          @clear="handleSearch"
        />
        <a-input
          v-model="filters.keyword"
          placeholder="关键词搜索"
          allow-clear
          style="width: 200px"
          @press-enter="handleSearch"
          @clear="handleSearch"
        />
        <a-range-picker
          v-model="filters.timeRange"
          show-time
          style="width: 360px"
          @change="handleSearch"
        />
        <a-button type="primary" @click="handleSearch">查询</a-button>
        <a-button @click="handleReset">重置</a-button>
      </a-space>
    </div>

    <StkTable
      class="table"
      row-key="id"
      :theme="isDark ? 'dark' : 'light'"
      :columns="columns"
      :data-source="logs"
      :row-height="44"
      no-data-full
      fixed-col-shadow
      bordered
      stripe
      virtual
    >
      <template #empty>
        <div>{{ loading ? '加载中…' : '暂无日志' }}</div>
      </template>
    </StkTable>

    <div class="footer-bar">
      <span class="footer-bar-text">共 {{ pagination.total }} 条</span>
      <a-pagination
        v-model:current="pagination.current"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-size-options="[20, 50, 100]"
        show-total
        show-page-size
        @change="fetchLogs"
        @page-size-change="handlePageSizeChange"
      />
    </div>

    <a-modal
      v-model:visible="detailVisible"
      title="日志详情"
      :footer="false"
      :width="720"
    >
      <pre class="log-detail">{{ detailText }}</pre>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, markRaw, onMounted, provide } from 'vue';
import { StkTable, type StkTableColumn } from 'stk-table-vue';
import { Message } from '@arco-design/web-vue';
import http from '../http';
import { isDark } from '../composables/useTheme';
import LogLevelCell from '../components/LogLevelCell.vue';
import LogActionCell from '../components/LogActionCell.vue';
import { LOG_ACTIONS_KEY, type LogItem, type LogRow, type LogActions } from '../types';

const loading = ref(false);
const cleaning = ref(false);
const logs = ref<LogRow[]>([]);
const detailVisible = ref(false);
const detailText = ref('');

interface LogStats {
  total: number;
  oldestTime: string | null;
  newestTime: string | null;
}
const stats = ref<LogStats | null>(null);

const filters = reactive({
  level: undefined as number | undefined,
  context: '',
  keyword: '',
  timeRange: [] as string[],
});

const pagination = reactive({
  current: 1,
  pageSize: 50,
  total: 0,
});

// stk-table 列定义：级别和操作列用自定义组件渲染
const columns: StkTableColumn<LogRow>[] = [
  {
    title: '时间',
    dataIndex: 'timeText',
    width: 180,
  },
  {
    title: '级别',
    dataIndex: 'level',
    width: 90,
    align: 'center',
    customCell: markRaw(LogLevelCell),
  },
  {
    title: '上下文',
    dataIndex: 'contextText',
    width: 140,
  },
  {
    title: '消息',
    dataIndex: 'msg',
    minWidth: 300,
  },
  {
    title: '操作',
    dataIndex: '_action' as never,
    width: 80,
    align: 'center',
    fixed: 'right',
    customCell: markRaw(LogActionCell),
  },
];

const formatTime = (time: string): string => {
  try {
    return new Date(time).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return time;
  }
};

async function fetchLogs(): Promise<void> {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('page', String(pagination.current));
    params.append('pageSize', String(pagination.pageSize));
    if (filters.level !== undefined) params.append('level', String(filters.level));
    if (filters.context) params.append('context', filters.context);
    if (filters.keyword) params.append('keyword', filters.keyword);
    if (filters.timeRange.length === 2) {
      params.append('startTime', filters.timeRange[0]);
      params.append('endTime', filters.timeRange[1]);
    }
    const res = await http.get<{ success: boolean; data?: { items: LogItem[]; total: number }; error?: string }>(
      `/api/logs?${params.toString()}`,
    );
    if (res.success && res.data) {
      // 预处理格式化字段，供 stk-table 直接渲染
      logs.value = res.data.items.map((it) => ({
        ...it,
        timeText: formatTime(it.time),
        contextText: it.context || '-',
      }));
      pagination.total = res.data.total;
    }
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchStats(): Promise<void> {
  try {
    const res = await http.get<{ success: boolean; data?: LogStats; error?: string }>('/api/logs/stats');
    if (res.success && res.data) {
      stats.value = res.data;
    }
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function handleCleanup(): Promise<void> {
  cleaning.value = true;
  try {
    const res = await http.del<{ success: boolean; data?: { deleted: number; remaining: number }; error?: string }>(
      '/api/logs?days=30',
    );
    if (res.success && res.data) {
      Message.success(`已清理 ${res.data.deleted} 条日志，剩余 ${res.data.remaining} 条`);
      await fetchStats();
      await fetchLogs();
    } else {
      Message.error(res.error || '清理失败');
    }
  } catch (err) {
    Message.error('清理失败: ' + (err as Error).message);
  } finally {
    cleaning.value = false;
  }
}

function handleSearch(): void {
  pagination.current = 1;
  fetchLogs();
}

function handleReset(): void {
  filters.level = undefined;
  filters.context = '';
  filters.keyword = '';
  filters.timeRange = [];
  pagination.current = 1;
  fetchLogs();
}

function handlePageSizeChange(size: number): void {
  pagination.pageSize = size;
  pagination.current = 1;
  fetchLogs();
}

/** 供 LogActionCell 通过 inject 调用的详情查看 */
function showDetail(row: LogRow): void {
  try {
    detailText.value = JSON.stringify(JSON.parse(row.raw), null, 2);
  } catch {
    detailText.value = row.raw;
  }
  detailVisible.value = true;
}

provide<LogActions>(LOG_ACTIONS_KEY, { showDetail });

onMounted(() => {
  fetchLogs();
  fetchStats();
});
</script>

<style scoped>
.page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px;
  box-sizing: border-box;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.title {
  font-size: 22px;
  font-weight: 650;
  color: var(--color-text-1, #1d2129);
}

.stats-bar {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--color-fill-2, #f7f8fa);
  border-radius: 6px;
}

.filter-bar {
  margin-bottom: 12px;
}

.table {
  flex: 1;
  min-height: 0;
  background: var(--color-bg-2, #fff);
  border: 1px solid var(--color-border-2, #e5e6eb);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 3%);
}

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 12px;
}

.footer-bar-text {
  font-size: 13px;
  color: var(--color-text-3, #86909c);
}

.log-detail {
  max-height: 500px;
  overflow: auto;
  background: var(--color-fill-2);
  padding: 12px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

/* stk-table 滚动条美化 */
.table::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.table::-webkit-scrollbar-track {
  background: transparent;
}
.table::-webkit-scrollbar-thumb {
  background-color: var(--color-fill-4, #c9cdd4);
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.table::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-4, #86909c);
}
.table::-webkit-scrollbar-corner {
  background: transparent;
}
@supports not selector(::-webkit-scrollbar) {
  .table {
    scrollbar-width: thin;
    scrollbar-color: var(--color-fill-4, #c9cdd4) transparent;
  }
}

@media (max-width: 640px) {
  .page {
    padding: 12px 10px;
  }
  .title {
    font-size: 17px;
  }
}
</style>
