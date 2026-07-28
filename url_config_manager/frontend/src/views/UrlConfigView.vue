<template>
  <div class="page">
    <div class="header">
      <div class="title">URL_config.ini 管理</div>
      <div class="toolbar">
        <a-button :loading="loading" @click="load">
          <template #icon><icon-refresh /></template>
          重新加载
        </a-button>
        <a-button type="outline" @click="openAddModal">
          <template #icon><icon-plus /></template>
          新增
        </a-button>
        <a-button type="primary" :loading="saving" @click="save">
          <template #icon><icon-save /></template>
          保存
        </a-button>
      </div>
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
            >删除选中</a-button
          >
        </a-popconfirm>
        <a-button
          size="small"
          :disabled="checkedCount === 0"
          @click="setCheckedEnabled(true)"
          >开启选中</a-button
        >
        <a-button
          size="small"
          :disabled="checkedCount === 0"
          @click="setCheckedEnabled(false)"
          >关闭选中</a-button
        >
      </div>
      <span
        >已选 {{ checkedCount }} 条，共 {{ rows.length }} 条，启用
        {{ enabledCount }} 条，注释 {{ rows.length - enabledCount }} 条</span
      >
      <span v-if="dirty" class="dirty-tip">● 有未保存的修改</span>
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
          暂无直播间记录，<a-button size="small" type="text" @click="openAddModal">点击新增</a-button>
        </div>
      </template>
    </StkTable>

    <!-- 新增记录弹窗 -->
    <a-modal
      v-model:visible="addModalVisible"
      title="新增直播间"
      ok-text="保存"
      cancel-text="取消"
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
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  onMounted,
  provide,
  watch,
  markRaw,
} from "vue";
import {
  StkTable,
  createCheckboxCell,
  type StkTableColumn,
} from "stk-table-vue";
import { Message, Checkbox } from "@arco-design/web-vue";
// Checkbox 在这里是手动 import（非模板中使用），ArcoResolver 不会自动引入其样式
import "@arco-design/web-vue/es/checkbox/style/css.js";
import ActionCell from "../components/ActionCell.vue";
import { isDark } from "../composables/useTheme";
import {
  CONFIG_ACTIONS_KEY,
  type ApiGetConfigResp,
  type ApiSaveConfigResp,
  type ConfigActions,
  type UrlRow,
} from "../types";

const API = "/api/config";

let uid = 1;
const rows = ref<UrlRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);

// 新增弹窗状态
const addModalVisible = ref(false);
const addForm = reactive({ url: "", name: "" });

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
    type: "dragRow",
    key: "dragRow",
    title: "",
    dataIndex: "" as never,
    width: 40,
    align: "center",
  },
  {
    type: "seq",
    title: "",
    dataIndex: "" as never,
    width: 30,
    align: "center",
  },
  { title: "主播名称", dataIndex: "name", width: 100 },
  { title: "直播间URL", dataIndex: "url", minWidth: 300 },
  {
    title: "操作",
    dataIndex: "_action" as never,
    align: "center",
    fixed: "right",
    width: 150,
    customCell: markRaw(ActionCell),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await fetch(API);
    const data: ApiGetConfigResp = await res.json();
    if (!data.success) throw new Error(data.error || "未知错误");
    rows.value = (data.items || []).map((it) => ({
      id: uid++,
      enabled: !!it.enabled,
      quality: it.quality || "",
      url: it.url || "",
      name: it.name || "",
      checked: false,
    }));
    dirty.value = false;
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
      quality: "",
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
// 注：v1.0.1 类型声明为 string，但运行时实际 emit 的是行索引数字
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

// 提供给单元格组件调用的操作方法
provide<ConfigActions>(CONFIG_ACTIONS_KEY, { deleteRow });

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
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data: ApiSaveConfigResp = await res.json();
    if (!data.success) throw new Error(data.error || "未知错误");
    dirty.value = false;
    Message.success(`保存成功，共写入 ${data.count} 条记录`);
  } catch (e) {
    Message.error("保存失败: " + (e as Error).message);
  } finally {
    saving.value = false;
  }
}

// 监听数据变化，标记未保存状态（快照不含 checked，勾选复选框不算修改）
const contentSnapshot = computed(() =>
  rows.value
    .map((r) => `${r.enabled}|${r.quality}|${r.url}|${r.name}`)
    .join("\n"),
);
watch(contentSnapshot, () => {
  if (!loading.value) dirty.value = true;
});

onMounted(load);
</script>

<style scoped>
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 20px;
  box-sizing: border-box;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-1, #1d2129);
}

.toolbar {
  display: flex;
  gap: 12px;
}

.sub-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--color-text-3, #86909c);
  margin-bottom: 12px;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

.dirty-tip {
  color: #ff7d00;
}

.table {
  height: calc(100vh - 220px);
  background: var(--color-bg-2, #fff);
  border-radius: 6px;
}

/* stk-table 滚动条美化（.stk-table 根元素即滚动容器）：
   细圆角滑块 + 透明轨道，颜色用 arco 变量，暗色下自动适配 */
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
  /* 透明边框 + padding-box 裁剪，让滑块与轨道之间留出间隙，视觉上更纤细 */
  border: 2px solid transparent;
  background-clip: padding-box;
}

.table::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-4, #86909c);
}

.table::-webkit-scrollbar-corner {
  background: transparent;
}

/* Firefox 回退（不支持 ::-webkit-scrollbar 时生效，避免覆盖 Chromium 的自定义样式） */
@supports not selector(::-webkit-scrollbar) {
  .table {
    scrollbar-width: thin;
    scrollbar-color: var(--color-fill-4, #c9cdd4) transparent;
  }
}
</style>
