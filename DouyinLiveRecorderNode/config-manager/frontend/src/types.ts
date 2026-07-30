import type { StkTableColumn } from 'stk-table-vue';

/** URL_config.ini 中的一条记录 */
export interface UrlRow {
  /** 前端生成的唯一 id，仅用于 rowKey/删除定位 */
  id: number;
  /** true = 未注释（录制），false = 被 # 注释 */
  enabled: boolean;
  /** 画质前缀（原画/蓝光/…），可为空 */
  quality: string;
  url: string;
  name: string;
  /** 复选框选中状态（仅前端批量操作用，不参与保存） */
  checked: boolean;
}

/** 后端 GET /api/config 返回的单条记录 */
export interface ApiConfigItem {
  enabled: boolean;
  quality: string;
  url: string;
  name: string;
}

export interface ApiGetConfigResp {
  success: boolean;
  error?: string;
  path?: string;
  items?: ApiConfigItem[];
}

export interface ApiSaveConfigResp {
  success: boolean;
  error?: string;
  count?: number;
}

/** config.ini 中的一个配置项 */
export interface AppConfigItem {
  key: string;
  value: string;
}

/** config.ini 中的一个分区 */
export interface AppConfigSection {
  name: string;
  items: AppConfigItem[];
}

export interface ApiGetAppConfigResp {
  success: boolean;
  error?: string;
  path?: string;
  sections?: AppConfigSection[];
}

/** stk-table-vue 传给自定义单元格的 props（子集） */
export interface CellProps<T extends object> {
  row: T;
  col: StkTableColumn<T>;
  cellValue?: unknown;
  rowIndex?: number;
}

/** 通过 provide/inject 提供给单元格组件的操作方法 */
export interface ConfigActions {
  deleteRow: (id: number) => void;
}

export const CONFIG_ACTIONS_KEY = 'configActions';
