import fs from "node:fs";
import path from "node:path";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { Logger } from "pino";
import { LOGGER_TOKEN } from "../common/logger.js";
import { getDownloadsDir } from "../config/config.service.js";
import {
  contentDisposition,
  deleteRecording,
  generateThumbnail,
  getThumbPath,
  listRecordings,
  resolveRecordingPath,
} from "./recordings.service.js";

@Controller("/api/recordings")
export class RecordingsController {
  constructor(@Inject(LOGGER_TOKEN) private readonly logger: Logger) {}

  @Get()
  list(
    @Query("name") name: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      // 主播名称将列表限定为该主播对应的录制文件。
      name = String(name || "").trim();
      if (!name)
        return reply
          .code(400)
          .send({ success: false, error: "缺少参数 name（主播名）" });
      return {
        success: true,
        items: listRecordings(getDownloadsDir(), name, this.logger),
      };
    } catch (error) {
      this.logger.error({ err: error, name }, "列出录制文件失败");
      return reply
        .code(500)
        .send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }

  @Get("download")
  download(
    @Query("file") file: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    try {
      // 校验相对路径合法性与存在性，避免路径穿越及任意文件读取。
      const value = String(file || "").trim();
      if (!value)
        return reply.code(400).send({ success: false, error: "缺少参数 file" });
      const resolved = resolveRecordingPath(getDownloadsDir(), value);
      if ("error" in resolved)
        return reply
          .code(resolved.error === "文件不存在" ? 404 : 400)
          .send({ success: false, error: resolved.error });
      const stat = fs.statSync(resolved.fullPath);
      this.logger.info({ file: value, size: stat.size }, "下载录制文件");
      // attachment 强制浏览器下载而非导航播放，同时给出可读文件名。
      reply
        .header(
          "Content-Disposition",
          contentDisposition(path.basename(resolved.fullPath)),
        )
        .header("Content-Type", "application/octet-stream")
        .header("Content-Length", stat.size)
        .send(fs.createReadStream(resolved.fullPath));
    } catch (error) {
      this.logger.error({ err: error, file }, "下载失败");
      return reply
        .code(500)
        .send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }

  @Get("thumb")
  async thumb(
    @Query("file") file: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    try {
      const value = String(file || "").trim();
      if (!value)
        return reply.code(400).send({ success: false, error: "缺少参数 file" });
      // 按需生成缩略图；生成失败时返回 404，前端显示占位即可。
      const thumbPath = await generateThumbnail(
        getDownloadsDir(),
        value,
        this.logger,
      );
      if (!thumbPath || !fs.existsSync(thumbPath))
        return reply
          .code(404)
          .send({ success: false, error: "封面生成失败或文件不存在" });
      const stat = fs.statSync(thumbPath);
      reply
        .header("Content-Type", "image/jpeg")
        .header("Content-Length", stat.size)
        .header("Cache-Control", "public, max-age=86400")
        .send(fs.createReadStream(thumbPath));
    } catch (error) {
      this.logger.error({ err: error, file }, "缩略图处理失败");
      return reply
        .code(500)
        .send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }

  @Delete()
  @HttpCode(200)
  remove(
    @Body("file") file: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      const value = String(file || "").trim();
      if (!value)
        return reply.code(400).send({ success: false, error: "缺少参数 file" });
      // 删除前由服务层校验相对路径是否合法。
      const error = deleteRecording(getDownloadsDir(), value, this.logger);
      return error
        ? reply
            .code(error === "文件不存在" ? 404 : 400)
            .send({ success: false, error })
        : { success: true };
    } catch (error) {
      this.logger.error({ err: error, file }, "删除失败");
      return reply
        .code(500)
        .send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
}
