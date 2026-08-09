import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Logger } from "pino";
import { VIDEO_EXTS } from "../common/paths.js";

const execFileAsync = promisify(execFile);

export type Recording = {
  file: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  /** 缩略图文件名（不含路径），不存在时为 null */
  thumbFile: string | null;
};

export function getThumbsDir(baseDir: string): string {
  return path.join(baseDir, ".thumbs");
}

export function thumbFileName(fileRel: string): string {
  // 用相对路径的短 hash 作为缩略图文件名，避免原文件名过长或含特殊字符。
  const hash = crypto
    .createHash("sha256")
    .update(fileRel.split(path.sep).join("/"))
    .digest("hex")
    .slice(0, 16);
  return `${hash}.jpg`;
}

export function getThumbPath(baseDir: string, fileRel: string): string {
  return path.join(getThumbsDir(baseDir), thumbFileName(fileRel));
}

export function hasThumbnail(baseDir: string, fileRel: string): boolean {
  return fs.existsSync(getThumbPath(baseDir, fileRel));
}

export function deleteThumbnail(
  baseDir: string,
  fileRel: string,
  logger: Logger,
): void {
  const thumbPath = getThumbPath(baseDir, fileRel);
  if (fs.existsSync(thumbPath)) {
    try {
      fs.unlinkSync(thumbPath);
    } catch (err) {
      // 缩略图删除失败不影响主流程。
      logger.debug({ err, file: fileRel }, "缩略图删除失败");
    }
  }
}

export async function generateThumbnail(
  baseDir: string,
  fileRel: string,
  logger: Logger,
): Promise<string | null> {
  // 优先读取已生成的缩略图，避免重复调用 ffmpeg。
  const thumbPath = getThumbPath(baseDir, fileRel);
  if (fs.existsSync(thumbPath)) return thumbPath;

  const resolved = resolveRecordingPath(baseDir, fileRel);
  if ("error" in resolved) return null;

  const thumbsDir = getThumbsDir(baseDir);
  fs.mkdirSync(thumbsDir, { recursive: true });

  try {
    // 截取第 1 秒画面，缩放到宽度 240px，质量 2（ffmpeg qscale，数值越小质量越高）。
    await execFileAsync("ffmpeg", [
      "-ss",
      "00:00:01",
      "-i",
      resolved.fullPath,
      "-vf",
      "scale=240:-1",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      thumbPath,
    ]);
    if (fs.existsSync(thumbPath)) {
      logger.info({ file: fileRel }, "缩略图已生成");
      return thumbPath;
    }
    return null;
  } catch (err) {
    logger.warn({ err, file: fileRel }, "ffmpeg 缩略图生成失败");
    return null;
  }
}

function cleanupOrphanThumbs(
  baseDir: string,
  expectedNames: Set<string>,
  logger: Logger,
): void {
  const thumbsDir = getThumbsDir(baseDir);
  if (!fs.existsSync(thumbsDir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(thumbsDir, { withFileTypes: true });
  } catch (err) {
    logger.warn({ dir: thumbsDir, err }, "缩略图目录读取失败");
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".jpg")
      continue;
    if (expectedNames.has(entry.name)) continue;
    try {
      fs.unlinkSync(path.join(thumbsDir, entry.name));
    } catch (err) {
      // 清理失败不阻塞列表返回。
      logger.debug({ file: entry.name, err }, "孤儿缩略图删除失败");
    }
  }
}

export function listRecordings(
  baseDir: string,
  anchorName: string,
  logger: Logger,
): Recording[] {
  // 递归扫描录制输出目录，因为主播文件可能位于子目录中。
  const files: Recording[] = [];
  const expectedThumbNames = new Set<string>();
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      logger.warn({ dir, err }, "目录读取失败，已跳过");
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过缩略图目录，避免把封面图当成视频列出来。
        if (path.relative(baseDir, fullPath) === ".thumbs") continue;
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
        const fileRel = relative.split(path.sep).join("/");
        const thumbName = thumbFileName(fileRel);
        if (hasThumbnail(baseDir, fileRel)) expectedThumbNames.add(thumbName);
        files.push({
          file: fileRel,
          name: entry.name,
          ext: ext.slice(1),
          size: stat.size,
          mtime: stat.mtimeMs,
          thumbFile: hasThumbnail(baseDir, fileRel) ? thumbName : null,
        });
      } catch (err) {
        logger.error({ err, file: fullPath }, "stat 失败，已跳过该文件");
      }
    }
  };
  if (fs.existsSync(baseDir)) walk(baseDir);
  cleanupOrphanThumbs(baseDir, expectedThumbNames, logger);
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

export function deleteRecording(
  baseDir: string,
  file: string,
  logger: Logger,
): string | null {
  // 复用路径解析逻辑，保证删除与下载的校验口径一致。
  const resolved = resolveRecordingPath(baseDir, file);
  if ("error" in resolved) return resolved.error;
  fs.unlinkSync(resolved.fullPath);
  // 删除视频后同步清理对应封面，避免留下孤儿缩略图。
  deleteThumbnail(baseDir, file.split(path.sep).join("/"), logger);
  logger.info({ file }, "录制文件已删除");
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
