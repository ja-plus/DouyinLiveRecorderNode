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
      } catch(e) {
        console.error(e);
      }
    }
  };
  if (fs.existsSync(baseDir)) walk(baseDir);
  return files.sort((a, b) => b.mtime - a.mtime);
}

export type ResolvedRecording = { fullPath: string };
export type ResolveFailure = { error: string };

export function resolveRecordingPath(
  baseDir: string,
  file: string,
): ResolvedRecording | ResolveFailure {
  // 先解析并校验路径范围，防止路径穿越到下载目录之外。
  const fullPath = path.resolve(baseDir, file);
  if (fullPath === baseDir || !fullPath.startsWith(`${baseDir}${path.sep}`))
    return { error: "非法路径" };
  if (!VIDEO_EXTS.has(path.extname(fullPath).toLowerCase()))
    return { error: "不支持的文件类型" };
  if (!fs.existsSync(fullPath)) return { error: "文件不存在" };
  return { fullPath };
}

export function deleteRecording(baseDir: string, file: string): string | null {
  // 复用路径解析逻辑，保证删除与下载的校验口径一致。
  const resolved = resolveRecordingPath(baseDir, file);
  if ("error" in resolved) return resolved.error;
  fs.unlinkSync(resolved.fullPath);
  return null;
}

export function contentDisposition(filename: string): string {
  // RFC 5987：filename* 给出现代浏览器的 UTF-8 编码文件名，
  // filename 作为不支持 filename* 的旧客户端的 ASCII 兜底。
  const encoded = encodeURIComponent(filename)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
