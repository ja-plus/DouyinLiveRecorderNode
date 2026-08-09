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
  /**
   * 软删除标记：点击删除时置为 true，行置灰并仅保留撤销按钮；
   * 保存时才真正从列表移除并写入文件。
   */
  deleted: boolean;
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
  /** 可选画质列表（由后端下发） */
  qualities?: string[];
  /** config.ini 中的默认画质 */
  defaultQuality?: string;
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
  /** 软删除：将行标记为已删除（置灰），保存时才真正移除 */
  deleteRow: (id: number) => void;
  /** 撤销软删除：将行恢复为正常状态 */
  undoDelete: (id: number) => void;
  /** 打开某主播的已录制文件弹窗 */
  openRecordings: (row: UrlRow) => void;
}

export const CONFIG_ACTIONS_KEY = 'configActions';

/** 一条已录制文件记录 */
export interface RecordingItem {
  /** 前端生成的唯一 id，仅用于 rowKey */
  id: number;
  /** 相对录制根目录的路径（/ 分隔），用于拼播放地址 */
  file: string;
  /** 文件名 */
  name: string;
  /** 扩展名（不含点），如 flv/ts/mp4 */
  ext: string;
  /** 文件大小（字节） */
  size: number;
  /** 修改时间（毫秒时间戳） */
  mtime: number;
  /** 缩略图文件名，后端尚未生成时为 null */
  thumbFile: string | null;
}

export interface ApiRecordingsResp {
  success: boolean;
  error?: string;
  items?: Omit<RecordingItem, 'id'>[];
}

/** 录像列表表格行：接口数据 + 展示用的格式化字段 */
export interface RecordingRow extends RecordingItem {
  /** 人类可读的文件大小 */
  sizeText: string;
  /** 本地时间字符串 */
  timeText: string;
}

/** 通过 provide/inject 提供给录像列表单元格的操作方法 */
export interface RecordingActions {
  play: (row: RecordingItem) => void;
  /** 下载该录制文件 */
  download: (row: RecordingItem) => void;
  /** 删除该录制文件 */
  remove: (row: RecordingItem) => void;
}

export const RECORDING_ACTIONS_KEY = 'recordingActions';

/** 画质选项（与后端 QUALITIES 保持一致，作为兜底） */
export const QUALITY_OPTIONS = ['原画', '蓝光', '超清', '高清', '标清', '流畅'];

/** provide/inject：画质选项列表（Ref<string[]>） */
export const QUALITY_OPTIONS_KEY = 'qualityOptions';

/** provide/inject：config.ini 的默认画质（Ref<string>） */
export const DEFAULT_QUALITY_KEY = 'defaultQuality';

/** 一个正在录制的主播状态（来自后端 SSE 快照） */
export interface RecordingStatusItem {
  /** 完整显示名（序号N 主播名） */
  name: string;
  /** 主播名（去掉序号前缀） */
  anchorName: string;
  /** 直播间地址，与 UrlRow.url 精确匹配 */
  url: string;
  /** 录制开始时间 ISO 串 */
  startTime: string;
  /** 画质中文 */
  quality: string;
}

/** 后端 SSE 推送的录制状态快照 */
export interface RecordingStatusSnapshot {
  recording: RecordingStatusItem[];
  monitoring: number;
  updatedAt: string;
  /** 录制器（main.js）是否在线 */
  recorderOnline: boolean;
}
