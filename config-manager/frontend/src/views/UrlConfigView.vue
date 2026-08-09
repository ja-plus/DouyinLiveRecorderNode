<template>
  <div class="page">
    <div class="header">
      <div class="title">URL_config.ini 管理</div>
    </div>

    <div class="sub-bar">
      <a-radio-group v-model="viewMode" type="button" size="small">
        <a-radio value="table">表格</a-radio>
        <a-radio value="panel">面板</a-radio>
      </a-radio-group>
      <div class="toolbar">
        <a-button :loading="loading" @click="load">
          <template #icon><icon-refresh /></template>
        </a-button>
        <a-button type="outline" @click="openAddModal">
          <template #icon><icon-plus /></template>
        </a-button>
        <a-button type="primary" :loading="saving" @click="save">
          <template #icon
            ><icon-save /><span v-if="dirty" class="dirty-tip"
              >●</span
            ></template
          >
        </a-button>
      </div>
    </div>

    <StkTable
      v-if="viewMode === 'table'"
      class="table"
      row-key="id"
      :theme="isDark ? 'dark' : 'light'"
      :columns="columns"
      :data-source="rows"
      :row-height="48"
      :row-class-name="rowClassName"
      no-data-full
      fixed-col-shadow
      bordered
      stripe
      virtual
      @row-order-change="onRowOrderChange"
    >
      <template #empty>
        <div>
          暂无直播间记录，<a-button
            size="small"
            type="text"
            @click="openAddModal"
            >点击新增</a-button
          >
        </div>
      </template>
    </StkTable>
    <StkTable
      v-else
      class="table panel-table"
      row-key="id"
      :theme="isDark ? 'dark' : 'light'"
      :columns="panelColumns"
      :data-source="rows"
      :row-height="120"
      no-data-full
      :row-active="false"
      :row-hover="false"
      headless
      :bordered="false"
      virtual
    >
      <template #empty>
        <div>
          暂无直播间记录，<a-button
            size="small"
            type="text"
            @click="openAddModal"
            >点击新增</a-button
          >
        </div>
      </template>
    </StkTable>
    <div class="footer-bar">
      <span
        v-if="connectionState === 'unavailable'"
        class="rec-status muted"
        >录制状态未配置</span
      >
      <span
        v-else-if="connectionState !== 'connected'"
        class="rec-status muted"
        >录制状态连接中…</span
      >
      <span v-else-if="!recorderOnline" class="rec-status muted"
        >录制器离线</span
      >
      <span v-else class="rec-status online"
        >正在录制 {{ recordingCount }} 个 · 监测 {{ monitoringCount }} 个</span
      >
      <span class="footer-bar-text"
        >共 {{ activeCount }} 条，启用 {{ enabledCount }} 条，注释
        {{ activeCount - enabledCount }} 条<span v-if="deletedCount"
          class="deleted-tip"
          >，待删除 {{ deletedCount }} 条</span
        ></span
      >
    </div>

    <!-- 新增记录弹窗 -->
    <a-modal
      v-model:visible="addModalVisible"
      title="新增直播间"
      ok-text="保存"
      cancel-text="取消"
      modal-class="add-room-modal"
      draggable
      @before-ok="handleAddOk"
      @cancel="addForm.url = ''"
    >
      <a-form :model="addForm" layout="vertical">
        <a-form-item field="url" label="直播间URL" required>
          <div class="url-field">
            <a-textarea
              v-model="addForm.url"
              placeholder="例如：https://live.douyin.com/123456789，或粘贴手机抖音分享链接"
              :auto-size="{ minRows: 3, maxRows: 6 }"
              allow-clear
              @paste="handleShareLinkPaste"
            />
            <div class="url-tip">可直接粘贴手机抖音直播分享链接，系统会自动提取 URL。</div>
          </div>
        </a-form-item>
        <a-form-item field="quality" label="画质">
          <a-select
            v-model="addForm.quality"
            :placeholder="`默认(${defaultQuality})`"
            allow-clear
          >
            <a-option v-for="q in qualityOptions" :key="q" :value="q">{{
              q
            }}</a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 已录制文件弹窗 -->
    <RecordingsModal
      v-model:visible="recordingsVisible"
      :anchor-name="recordingsAnchor"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, provide, markRaw } from "vue";
import { StkTable, type StkTableColumn } from "stk-table-vue";
import { Message } from "@arco-design/web-vue";
import http from "../http";
import { API } from "../api";
import ActionCell from "../components/ActionCell.vue";
import QualityCell from "../components/QualityCell.vue";
import RecordingStatusCell from "../components/RecordingStatusCell.vue";
import RecordingsModal from "../components/RecordingsModal.vue";
import UrlPanelCell from "../components/UrlPanelCell.vue";
import { isDark } from "../composables/useTheme";
import { useRecordingStatus } from "../composables/useRecordingStatus";
import {
  CONFIG_ACTIONS_KEY,
  QUALITY_OPTIONS,
  QUALITY_OPTIONS_KEY,
  DEFAULT_QUALITY_KEY,
  type ApiGetConfigResp,
  type ApiSaveConfigResp,
  type ConfigActions,
  type UrlRow,
} from "../types";

let uid = 1;
const rows = ref<UrlRow[]>([]);
const loading = ref(false);
const saving = ref(false);

// 画质选项与默认画质（来自后端，默认画质取自 config.ini）
const qualityOptions = ref<string[]>(QUALITY_OPTIONS);
const defaultQuality = ref("原画");

// 视图模式：表格 / 面板。移动端（≤640px）默认面板，桌面默认表格
type ViewMode = "table" | "panel";
const viewMode = ref<ViewMode>(
  typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px)").matches
    ? "panel"
    : "table",
);

// 新增弹窗状态
const addModalVisible = ref(false);
const addForm = reactive({ url: "", name: "", quality: "" });

const enabledCount = computed(
  () => rows.value.filter((r) => r.enabled && !r.deleted).length,
);
// 未置灰的行数（即保存时实际写入的条数）
const activeCount = computed(
  () => rows.value.filter((r) => !r.deleted).length,
);
// 已置灰、待保存时移除的行数
const deletedCount = computed(
  () => rows.value.filter((r) => r.deleted).length,
);

// 实时录制状态（SSE 订阅，模块级单例，首次调用即建立连接）
const {
  recordingMap,
  monitoring: monitoringCount,
  connectionState,
  recorderOnline,
} = useRecordingStatus();
const recordingCount = computed(() => recordingMap.value.size);

// 软删除行附加 className，配合 :deep 样式置灰
function rowClassName(row: UrlRow): string {
  return row.deleted ? "row-deleted" : "";
}

// 表格列定义：序号列起，最右侧为操作列（switch + 查看录制 + 删除）
const columns: StkTableColumn<UrlRow>[] = [
  {
    type: "seq",
    title: "",
    dataIndex: "" as never,
    width: 30,
    align: "center",
  },
  { title: "主播", dataIndex: "name", width: 100 },
  {
    title: "录制",
    dataIndex: "_rec" as never,
    width: 120,
    customCell: markRaw(RecordingStatusCell),
  },
  {
    title: "画质",
    dataIndex: "quality",
    width: 130,
    customCell: markRaw(QualityCell),
  },
  { title: "URL", dataIndex: "url" },
  {
    title: "操作",
    dataIndex: "_action" as never,
    align: "center",
    fixed: "right",
    width: 160,
    customCell: markRaw(ActionCell),
  },
];

// 面板模式：单列卡片，由 UrlPanelCell 渲染整行内容（headless）
const panelColumns: StkTableColumn<UrlRow>[] = [
  {
    title: "",
    dataIndex: "_panel" as never,
    width: 100,
    customCell: markRaw(UrlPanelCell),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await http.get<ApiGetConfigResp>(API.config);
    if (!data.success) throw new Error(data.error || "未知错误");
    if (Array.isArray(data.qualities) && data.qualities.length) {
      qualityOptions.value = data.qualities;
    }
    defaultQuality.value = data.defaultQuality || "原画";
    rows.value = (data.items || []).map((it) => ({
      id: uid++,
      enabled: !!it.enabled,
      quality: it.quality || "",
      url: it.url || "",
      name: it.name || "",
      deleted: false,
    }));
    savedSnapshot.value = contentSnapshot.value;
    Message.success(`已加载 ${rows.value.length} 条记录`);
  } catch (e) {
    Message.error("加载失败: " + (e as Error).message);
  } finally {
    loading.value = false;
  }
}

function openAddModal(): void {
  addForm.url = "";
  addForm.name = "";
  addForm.quality = "";
  addModalVisible.value = true;
}

function extractUrl(text: string): string {
  const url = text.match(/https?:\/\/[^\s<>，。；、]+/i)?.[0] || "";
  return url.match(/https?:\/\/webcast\.amemv\.com\/douyin\/webcast\/reflow\/[^\s/?#]+/i)?.[0] || url;
}

function handleShareLinkPaste(event: ClipboardEvent): void {
  const url = extractUrl(event.clipboardData?.getData("text") || "");
  if (!url) return;
  event.preventDefault();
  addForm.url = url;
}

// 弹窗确认：校验 URL 后把新记录插入列表顶部（仍需点页面「保存」才写入文件）
function handleAddOk(): boolean {
  const url = extractUrl(addForm.url);
  if (!url) {
    Message.warning("请填写直播间URL");
    return false; // 阻止弹窗关闭
  }
  rows.value = [
    {
      id: uid++,
      enabled: true,
      quality: addForm.quality || "",
      url,
      name: addForm.name.trim(),
      deleted: false,
    },
    ...rows.value,
  ];
  return true;
}

// 软删除：未保存前仅置灰行，保留可撤销能力，保存时才真正从列表移除
function deleteRow(id: number): void {
  const row = rows.value.find((r) => r.id === id);
  if (row) row.deleted = true;
}

// 撤销软删除：恢复行为正常状态
function undoDelete(id: number): void {
  const row = rows.value.find((r) => r.id === id);
  if (row) row.deleted = false;
}

// 拖拽排序后同步外部数据顺序（表格内部只改自己的副本）
function onRowOrderChange(
  sourceIndex: string | number,
  endIndex: string | number,
): void {
  const from = Number(sourceIndex);
  const to = Number(endIndex);
  if (Number.isNaN(from) || Number.isNaN(to)) return;
  const arr = rows.value.slice();
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  rows.value = arr;
}

// 已录制文件弹窗状态
const recordingsVisible = ref(false);
const recordingsAnchor = ref("");

function openRecordings(row: UrlRow): void {
  const name = row.name.trim();
  if (!name) {
    Message.warning("该记录暂无主播名，无法定位录制文件");
    return;
  }
  recordingsAnchor.value = name;
  recordingsVisible.value = true;
}

// 提供给单元格组件调用的操作方法
provide<ConfigActions>(CONFIG_ACTIONS_KEY, {
  deleteRow,
  undoDelete,
  openRecordings,
});
// 提供给画质单元格：可选画质列表 + 默认画质
provide(QUALITY_OPTIONS_KEY, qualityOptions);
provide(DEFAULT_QUALITY_KEY, defaultQuality);

async function save(): Promise<void> {
  const activeRows = rows.value.filter((r) => !r.deleted);
  const emptyUrl = activeRows.some((r) => !r.url.trim());
  if (emptyUrl) {
    Message.warning("存在空的直播间URL，请填写或删除后再保存");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      items: activeRows.map((r) => ({
        enabled: r.enabled,
        quality: r.quality,
        url: r.url.trim(),
        name: r.name.trim(),
      })),
    };
    const data = await http.post<ApiSaveConfigResp>(API.config, {
      body: payload,
    });
    if (!data.success) throw new Error(data.error || "未知错误");
    // 保存成功后真正移除已置灰的行
    rows.value = rows.value.filter((r) => !r.deleted);
    savedSnapshot.value = contentSnapshot.value;
    Message.success(`保存成功，共写入 ${data.count} 条记录`);
  } catch (e) {
    Message.error("保存失败: " + (e as Error).message);
  } finally {
    saving.value = false;
  }
}

// 未保存状态：当前内容与最近一次加载/保存的基线快照比较
// 快照仅包含未软删除的行（不含 checked），故置灰/撤销删除会改变脏标记，
// 撤销对未改过行的删除可让脏标记回到 false
const contentSnapshot = computed(() =>
  rows.value
    .filter((r) => !r.deleted)
    .map((r) => `${r.enabled}|${r.quality}|${r.url}|${r.name}`)
    .join("\n"),
);
const savedSnapshot = ref(contentSnapshot.value);
const dirty = computed(() => contentSnapshot.value !== savedSnapshot.value);

onMounted(load);
</script>

<style>
/* 弹窗挂在 body 下，scoped 样式作用不到，用全局样式做移动端适配 */
@media (max-width: 640px) {
  .add-room-modal {
    width: 92vw;
  }

  /* 输入框字号提到 16px，避免 iOS Safari 聚焦时自动放大页面 */
  .add-room-modal .arco-input {
    font-size: 16px;
  }
}
</style>

<style scoped>
/* flex 纵向布局：头部/工具栏固定高度，表格 flex:1 占满剩余空间 */
.page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1100px;
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

.toolbar {
  display: flex;
  gap: 12px;
}

.sub-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--color-text-3, #86909c);
  margin-bottom: 12px;
}

.footer-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--color-text-3, #86909c);
  margin-top: 12px;
}

.footer-bar-text {
  margin-left: auto;
}

.rec-status {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  white-space: nowrap;
}

.rec-status.muted {
  color: var(--color-text-3, #86909c);
}

.rec-status.online {
  color: #00b42a;
  font-weight: 600;
}

.url-field {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.url-tip {
  margin-top: 6px;
  color: var(--color-text-3, #86909c);
  font-size: 12px;
}

.dirty-tip {
  position: absolute;
  right: 4px;
  top: 0;
  color: #ff7d00;
}

.table {
  flex: 1;
  min-height: 0;
  background: var(--color-bg-2, #fff);
  border: 1px solid var(--color-border-2, #e5e6eb);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 3%);
}

/* 面板模式：单元格透明无边框，让卡片自身呈现为浮动卡片 */
.panel-table :deep(tbody tr) {
  background: transparent;
}

.panel-table :deep(td) {
  background: transparent;
}

/* 软删除行：整体置灰，文字带删除线，禁止行内交互（操作列的撤销按钮单独放行） */
:deep(tr.row-deleted) {
  opacity: 0.45;
  pointer-events: none;
  text-decoration: line-through;
  text-decoration-color: var(--color-text-4, #86909c);
}

/* 撤销按钮所在的操作列单元格需要恢复交互，否则无法点击 */
:deep(tr.row-deleted td[data-col-key="_action"]),
:deep(tr.row-deleted .action-cell) {
  pointer-events: auto;
}

.deleted-tip {
  color: #f53f3f;
  font-weight: 600;
}

/* 移动端：缩小内边距，头部/工具栏自动换行 */
@media (max-width: 640px) {
  .page {
    padding: 12px 10px;
  }

  .title {
    font-size: 17px;
  }

  .toolbar {
    gap: 8px;
  }
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

/* Firefox 回退 */
@supports not selector(::-webkit-scrollbar) {
  .table {
    scrollbar-width: thin;
    scrollbar-color: var(--color-fill-4, #c9cdd4) transparent;
  }
}
</style>
