function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    } else {
        for(var i = decorators.length - 1; i >= 0; i--){
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(metadataKey, metadataValue);
    }
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
import fs from "node:fs";
import path from "node:path";
import { Body, Controller, Delete, Get, HttpCode, Inject, Query, Res } from "@nestjs/common";
import { LOGGER_TOKEN } from "../common/logger.js";
import { getDownloadsDir } from "../config/config.service.js";
import { contentDisposition, deleteRecording, generateThumbnail, listRecordings, resolveRecordingPath } from "./recordings.service.js";
export class RecordingsController {
    logger;
    constructor(logger){
        this.logger = logger;
    }
    list(name, reply) {
        try {
            // 主播名称将列表限定为该主播对应的录制文件。
            name = String(name || "").trim();
            if (!name) return reply.code(400).send({
                success: false,
                error: "缺少参数 name（主播名）"
            });
            return {
                success: true,
                items: listRecordings(getDownloadsDir(), name, this.logger)
            };
        } catch (error) {
            this.logger.error({
                err: error,
                name
            }, "列出录制文件失败");
            return reply.code(500).send({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    download(file, reply) {
        try {
            // 校验相对路径合法性与存在性，避免路径穿越及任意文件读取。
            const value = String(file || "").trim();
            if (!value) return reply.code(400).send({
                success: false,
                error: "缺少参数 file"
            });
            const resolved = resolveRecordingPath(getDownloadsDir(), value);
            if ("error" in resolved) return reply.code(resolved.error === "文件不存在" ? 404 : 400).send({
                success: false,
                error: resolved.error
            });
            const stat = fs.statSync(resolved.fullPath);
            this.logger.info({
                file: value,
                size: stat.size
            }, "下载录制文件");
            // attachment 强制浏览器下载而非导航播放，同时给出可读文件名。
            reply.header("Content-Disposition", contentDisposition(path.basename(resolved.fullPath))).header("Content-Type", "application/octet-stream").header("Content-Length", stat.size).send(fs.createReadStream(resolved.fullPath));
        } catch (error) {
            this.logger.error({
                err: error,
                file
            }, "下载失败");
            return reply.code(500).send({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    async thumb(file, reply) {
        try {
            const value = String(file || "").trim();
            if (!value) return reply.code(400).send({
                success: false,
                error: "缺少参数 file"
            });
            // 按需生成缩略图；生成失败时返回 404，前端显示占位即可。
            const thumbPath = await generateThumbnail(getDownloadsDir(), value, this.logger);
            if (!thumbPath || !fs.existsSync(thumbPath)) return reply.code(404).send({
                success: false,
                error: "封面生成失败或文件不存在"
            });
            const stat = fs.statSync(thumbPath);
            reply.header("Content-Type", "image/jpeg").header("Content-Length", stat.size).header("Cache-Control", "public, max-age=86400").send(fs.createReadStream(thumbPath));
        } catch (error) {
            this.logger.error({
                err: error,
                file
            }, "缩略图处理失败");
            return reply.code(500).send({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    remove(file, reply) {
        try {
            const value = String(file || "").trim();
            if (!value) return reply.code(400).send({
                success: false,
                error: "缺少参数 file"
            });
            // 删除前由服务层校验相对路径是否合法。
            const error = deleteRecording(getDownloadsDir(), value, this.logger);
            return error ? reply.code(error === "文件不存在" ? 404 : 400).send({
                success: false,
                error
            }) : {
                success: true
            };
        } catch (error) {
            this.logger.error({
                err: error,
                file
            }, "删除失败");
            return reply.code(500).send({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
_ts_decorate([
    Get(),
    _ts_param(0, Query("name")),
    _ts_param(1, Res({
        passthrough: true
    })),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object,
        typeof FastifyReply === "undefined" ? Object : FastifyReply
    ]),
    _ts_metadata("design:returntype", void 0)
], RecordingsController.prototype, "list", null);
_ts_decorate([
    Get("download"),
    _ts_param(0, Query("file")),
    _ts_param(1, Res()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object,
        typeof FastifyReply === "undefined" ? Object : FastifyReply
    ]),
    _ts_metadata("design:returntype", void 0)
], RecordingsController.prototype, "download", null);
_ts_decorate([
    Get("thumb"),
    _ts_param(0, Query("file")),
    _ts_param(1, Res()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object,
        typeof FastifyReply === "undefined" ? Object : FastifyReply
    ]),
    _ts_metadata("design:returntype", Promise)
], RecordingsController.prototype, "thumb", null);
_ts_decorate([
    Delete(),
    HttpCode(200),
    _ts_param(0, Body("file")),
    _ts_param(1, Res({
        passthrough: true
    })),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object,
        typeof FastifyReply === "undefined" ? Object : FastifyReply
    ]),
    _ts_metadata("design:returntype", void 0)
], RecordingsController.prototype, "remove", null);
RecordingsController = _ts_decorate([
    Controller("/api/recordings"),
    _ts_param(0, Inject(LOGGER_TOKEN)),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof Logger === "undefined" ? Object : Logger
    ])
], RecordingsController);

//# sourceMappingURL=recordings.controller.js.map