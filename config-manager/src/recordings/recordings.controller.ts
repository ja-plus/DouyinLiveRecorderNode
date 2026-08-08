import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { getDownloadsDir } from "../config/config.service.js";
import { deleteRecording, listRecordings } from "./recordings.service.js";

@Controller("/api/recordings")
export class RecordingsController {
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
      return { success: true, items: listRecordings(getDownloadsDir(), name) };
    } catch (error) {
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
      const error = deleteRecording(getDownloadsDir(), value);
      return error
        ? reply
            .code(error === "文件不存在" ? 404 : 400)
            .send({ success: false, error })
        : { success: true };
    } catch (error) {
      return reply
        .code(500)
        .send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
}
