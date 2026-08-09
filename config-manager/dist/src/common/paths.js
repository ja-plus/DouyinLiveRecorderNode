import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// 源码 (src/common) 与编译产物 (dist/src/common) 层级不同，
// 向上查找含 config.js 的目录（仅存在于 config-manager/），避免依赖固定层级与工作目录。
let dir = path.dirname(fileURLToPath(import.meta.url));
while (!fs.existsSync(path.join(dir, "config.js"))) {
    const parent = path.resolve(dir, "..");
    if (parent === dir)
        throw new Error("无法定位 config-manager 目录");
    dir = parent;
}
export const MANAGER_DIR = dir;
export const ROOT_DIR = path.resolve(MANAGER_DIR, "..");
export const CONFIG_DIR = path.join(ROOT_DIR, "config");
export const CONFIG_PATH = path.join(CONFIG_DIR, "URL_config.ini");
export const APP_CONFIG_PATH = path.join(CONFIG_DIR, "config.ini");
export const STATIC_DIR = path.join(MANAGER_DIR, "static");
export const OWN_CONFIG_PATH = path.join(MANAGER_DIR, "config.js");
export const ENCODING = "utf-8";
export const QUALITIES = ["原画", "蓝光", "超清", "高清", "标清", "流畅"];
// 录制列表和删除接口只处理这些媒体文件类型。
export const VIDEO_EXTS = new Set([".flv", ".ts", ".mp4", ".mkv", ".mp3", ".m4a",]);
