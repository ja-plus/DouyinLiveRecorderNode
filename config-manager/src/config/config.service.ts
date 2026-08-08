import fs from "node:fs";
import path from "node:path";
import {
  APP_CONFIG_PATH,
  CONFIG_PATH,
  ENCODING,
  QUALITIES,
  ROOT_DIR,
} from "../common/paths.js";

export type ConfigItem = {
  enabled: boolean;
  quality: string;
  url: string;
  name: string;
};
export type AppSection = {
  name: string;
  items: { key: string; value: string }[];
};

export function parseIni(text: string): ConfigItem[] {
  // 行首 # 表示禁用该 URL，但仍保留它以便之后重新启用。
  return text.split("\n").flatMap((raw) => {
    const line = raw.trim();
    if (!line) return [];
    const enabled = !line.startsWith("#"),
      parts = line
        .replace(/^#+/, "")
        .trim()
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean);
    let quality = "",
      name = "",
      index = 0;
    if (QUALITIES.includes(parts[0])) quality = parts[index++];
    const url = parts[index++] || "";
    for (const part of parts.slice(index)) {
      const match = part.match(/^主播\s*[:：]\s*(.*)$/);
      if (match) name = match[1].trim();
      else if (!name) name = part;
    }
    return [{ enabled, quality, url, name }];
  });
}

export function buildIni(items: Partial<ConfigItem>[]) {
  // 忽略空 URL，避免将无效条目写入配置文件。
  const lines = items
    .filter((item) => item?.url?.trim())
    .map((item) => {
      const core = [
        item.quality?.trim(),
        item.url!.trim(),
        item.name?.trim() && `主播: ${item.name.trim()}`,
      ]
        .filter(Boolean)
        .join(",");
      return item.enabled ? core : `#${core}`;
    });
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function parseAppConfig(text: string): AppSection[] {
  // 按 INI 的节和键结构解析，供设置编辑器使用。
  const sections: AppSection[] = [];
  let current: AppSection | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || /^[#;]/.test(line)) continue;
    const section = line.match(/^\[(.+)\]$/);
    if (section) {
      current = { name: section[1].trim(), items: [] };
      sections.push(current);
      continue;
    }
    if (!current || !line.includes("=")) continue;
    const index = line.indexOf("=");
    current.items.push({
      key: line.slice(0, index).trim(),
      value: line.slice(index + 1).trim(),
    });
  }
  return sections;
}

export function updateAppConfig(
  text: string,
  sections: { name?: string; items?: { key?: string; value?: unknown }[] }[],
) {
  // 按节和键索引提交值，以单次遍历更新原始文件。
  const values = new Map(
    sections.flatMap((section) =>
      (section.items || []).map((item) => [
        `${section.name?.trim()}|||${item.key?.trim()}`,
        String(item.value ?? "").trim(),
      ]),
    ),
  );
  let section = "";
  return `${text
    .split("\n")
    .map((raw) => {
      const line = raw.trim(),
        match = line.match(/^\[(.+)\]$/);
      if (match) {
        section = match[1].trim();
        return raw;
      }
      if (!line.includes("=") || /^[#;]/.test(line)) return raw;
      const key = line.slice(0, line.indexOf("=")).trim(),
        value = values.get(`${section}|||${key}`);
      return value === undefined ? raw : `${key} = ${value}`;
    })
    .join("\n")}\n`;
}

export const readConfig = (file: string) =>
  fs.existsSync(file) ? fs.readFileSync(file, ENCODING) : "";
export const saveConfig = (file: string, text: string) => {
  // 首次写入时创建配置目录。
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, ENCODING);
};
export function getDefaultQuality() {
  const item = parseAppConfig(readConfig(APP_CONFIG_PATH))
    .find((section) => section.name === "录制设置")
    ?.items.find((value) => value.key === "原画|超清|高清|标清|流畅");
  return QUALITIES.includes(item?.value || "") ? item!.value : "原画";
}
export function getDownloadsDir(): string {
  // 使用录制器配置的输出目录，未配置时回退到 downloads/。
  const item = parseAppConfig(readConfig(APP_CONFIG_PATH))
    .find((section) => section.name === "录制设置")
    ?.items.find((value) => value.key === "直播保存路径(不填则默认)");
  return item?.value
    ? path.resolve(ROOT_DIR, item.value)
    : path.join(ROOT_DIR, "downloads");
}
export { APP_CONFIG_PATH, CONFIG_PATH };
