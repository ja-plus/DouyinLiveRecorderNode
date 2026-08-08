<template>
  <div class="page">
    <div class="header">
      <div class="title">URL_config.ini 管理</div>
    </div>

    <div class="sub-bar">
      <div class="batch-actions">
        <a-popconfirm
          content="确认删除选中的记录？"
          type="warning"
          ok-text="删除"
          cancel-text="取消"
          @ok="deleteChecked"
        >
          <a-button size="small" status="danger" :disabled="checkedCount === 0"
            >删除</a-button
          >
        </a-popconfirm>
        <a-button
          size="small"
          type="primary"
          :disabled="checkedCount === 0"
          @click="setCheckedEnabled(true)"
          >开启</a-button
        >
        <a-button
          size="small"
          type="outline"
          :disabled="checkedCount === 0"
          @click="setCheckedEnabled(false)"
          >关闭</a-button
        >
      </div>
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
      class="table"
      row-key="id"
      :theme="isDark ? 'dark' : 'light'"
      :columns="columns"
      :data-source="rows"
      :row-height="48"
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
    <div class="footer-bar">
      <span class="footer-bar-text"
        >已选 {{ checkedCount }} 条，共 {{ rows.length }} 条，启用
        {{ enabledCount }} 条，注释 {{ rows.length - enabledCount }} 条</span
      >
    </div>

    <!-- 新增记录弹窗 -->
    <a-modal
      v-model:visible="addModalVisible"
      title="新增直播间"
      ok-text="保存"
      cancel-text="取消"
      modal-class="add-room-modal"
      @before-ok="handleAddOk"
      @cancel="addForm.url = ''"
    >
      <a-form :model="addForm" layout="vertical">
        <a-form-item field="url" label="直播间URL" required>
          <a-input
            v-model="addForm.url"
            placeholder="例如：https://live.douyin.com/123456789"
            allow-clear
            @press-enter="handleAddConfirmByEnter"
          />
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
import {
  StkTable,
  createCheckboxCell,
  type StkTableColumn,
} from "stk-table-vue";
import { Message, Checkbox } from "@arco-design/web-vue";
import http from "../http";
import { API } from "../api";
// Checkbox 在这里是手动 import（非模板中使用），ArcoResolver 不会自动引入其样式
import "@arco-design/web-vue/es/checkbox/style/css.js";
import ActionCell from "../components/ActionCell.vue";
import QualityCell from "../components/QualityCell.vue";
import RecordingsModal from "../components/RecordingsModal.vue";
import { isDark } from "../composables/useTheme";
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

// 新增弹窗状态
const addModalVisible = ref(false);
const addForm = reactive({ url: "", name: "", quality: "" });

const enabledCount = computed(() => rows.value.filter((r) => r.enabled).length);
const checkedCount = computed(() => rows.value.filter((r) => r.checked).length);

// stk-table-vue 自带的 checkbox 插件（用 arco Checkbox 渲染，选中状态存在行的 checked 字段）
const { CheckboxCell, CheckboxAllCell } = createCheckboxCell<UrlRow>({
  field: "checked",
  checkboxComponent: Checkbox,
});

// 表格列定义：首列为复选框，其次拖拽手柄，最右侧为操作列（switch + 删除）
const columns: StkTableColumn<UrlRow>[] = [
  {
    dataIndex: "checked",
    title: "",
    width: 40,
    align: "center",
    fixed: "left",
    customCell: CheckboxCell(),
    customHeaderCell: CheckboxAllCell(),
  },
  {
    type: "seq",
    title: "",
    dataIndex: "" as never,
    width: 30,
    align: "center",
  },
  { title: "主播", dataIndex: "name", width: 100 },
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
    width: 130,
    customCell: markRaw(ActionCell),
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
      checked: false,
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

// 弹窗确认：校验 URL 后把新记录插入列表顶部（仍需点页面「保存」才写入文件）
function handleAddOk(): boolean {
  const url = addForm.url.trim();
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
      checked: false,
    },
    ...rows.value,
  ];
  return true;
}

function handleAddConfirmByEnter(): void {
  if (handleAddOk()) {
    addModalVisible.value = false;
  }
}

function deleteRow(id: number): void {
  rows.value = rows.value.filter((r) => r.id !== id);
}

// 批量操作：删除/开启/关闭选中行
function deleteChecked(): void {
  const count = checkedCount.value;
  rows.value = rows.value.filter((r) => !r.checked);
  Message.success(`已删除 ${count} 条记录`);
}

function setCheckedEnabled(enabled: boolean): void {
  rows.value.forEach((r) => {
    if (r.checked) r.enabled = enabled;
  });
  Message.success(
    `已${enabled ? "开启" : "关闭"} ${checkedCount.value} 条记录`,
  );
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
provide<ConfigActions>(CONFIG_ACTIONS_KEY, { deleteRow, openRecordings });
// 提供给画质单元格：可选画质列表 + 默认画质
provide(QUALITY_OPTIONS_KEY, qualityOptions);
provide(DEFAULT_QUALITY_KEY, defaultQuality);

async function save(): Promise<void> {
  const emptyUrl = rows.value.some((r) => !r.url.trim());
  if (emptyUrl) {
    Message.warning("存在空的直播间URL，请填写或删除后再保存");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      items: rows.value.map((r) => ({
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
    savedSnapshot.value = contentSnapshot.value;
    Message.success(`保存成功，共写入 ${data.count} 条记录`);
  } catch (e) {
    Message.error("保存失败: " + (e as Error).message);
  } finally {
    saving.value = false;
  }
}

// 未保存状态：当前内容与最近一次加载/保存的基线快照比较（快照不含 checked，勾选复选框不算修改）
const contentSnapshot = computed(() =>
  rows.value
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

.batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
