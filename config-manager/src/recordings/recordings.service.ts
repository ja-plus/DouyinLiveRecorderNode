import fs from "node:fs";
import path from "node:path";
import { VIDEO_EXTS } from "../common/paths.js";

export type Recording = {
  file: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
};

export function listRecordings(
  baseDir: string,
  anchorName: string,
): Recording[] {
  // 递归扫描录制输出目录，因为主播文件可能位于子目录中。
  const files: Recording[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase(),
        relative = path.relative(baseDir, fullPath);
      if (
        !VIDEO_EXTS.has(ext) ||
        !(
          entry.name.startsWith(`${anchorName}_`) ||
          relative.split(path.sep).slice(0, -1).includes(anchorName)
        )
      )
        continue;
      try {
        // 使用斜杠规范化相对路径，保证各平台生成的浏览器 URL 一致。
        const stat = fs.statSync(fullPath);
        files.push({
          file: relative.split(path.sep).join("/"),
          name: entry.name,
          ext: ext.slice(1),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {}
    }
  };
  if (fs.existsSync(baseDir)) walk(baseDir);
  return files.sort((a, b) => b.mtime - a.mtime);
}

export function deleteRecording(baseDir: string, file: string): string | null {
  // 先解析并校验路径范围，防止路径穿越到下载目录之外。
  const fullPath = path.resolve(baseDir, file);
  if (fullPath === baseDir || !fullPath.startsWith(`${baseDir}${path.sep}`))
    return "非法路径";
  if (!VIDEO_EXTS.has(path.extname(fullPath).toLowerCase()))
    return "不支持的文件类型";
  if (!fs.existsSync(fullPath)) return "文件不存在";
  fs.unlinkSync(fullPath);
  return null;
}
