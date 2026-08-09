var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Get, HttpCode, Inject, Post, Res, } from "@nestjs/common";
import { LOGGER_TOKEN } from "../common/logger.js";
import { APP_CONFIG_PATH, CONFIG_PATH, buildIni, getDefaultQuality, parseAppConfig, parseIni, readConfig, saveConfig, updateAppConfig, } from "./config.service.js";
import { QUALITIES } from "../common/paths.js";
let ConfigController = class ConfigController {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    // 将服务层的异常统一转换为前端使用的 API 响应格式。
    failed(reply, status, error) {
        const message = error instanceof Error ? error.message : String(error);
        if (status >= 500)
            this.logger.error({ err: error }, "配置读写失败");
        else
            this.logger.warn({ message, status }, "请求参数校验失败");
        reply.code(status);
        return { success: false, error: message };
    }
    getConfig(reply) {
        try {
            // 解析 URL_config.ini 后返回结构化数据，供前端编辑。
            const text = readConfig(CONFIG_PATH);
            return {
                success: true,
                path: CONFIG_PATH,
                items: parseIni(text),
                qualities: QUALITIES,
                defaultQuality: getDefaultQuality(),
            };
        }
        catch (error) {
            return this.failed(reply, 500, error);
        }
    }
    saveUrlConfig(body, reply) {
        try {
            if (!Array.isArray(body?.items))
                return this.failed(reply, 400, "items 必须是数组");
            const text = buildIni(body.items);
            // 重新解析生成的文本，返回实际保存的有效条目数量。
            saveConfig(CONFIG_PATH, text);
            const count = parseIni(text).length;
            this.logger.info({ path: CONFIG_PATH, count }, "URL 配置已保存");
            return { success: true, count };
        }
        catch (error) {
            return this.failed(reply, 500, error);
        }
    }
    getAppConfig(reply) {
        try {
            return {
                success: true,
                path: APP_CONFIG_PATH,
                sections: parseAppConfig(readConfig(APP_CONFIG_PATH)),
            };
        }
        catch (error) {
            return this.failed(reply, 500, error);
        }
    }
    saveAppConfig(body, reply) {
        try {
            if (!Array.isArray(body?.sections))
                return this.failed(reply, 400, "sections 必须是数组");
            saveConfig(APP_CONFIG_PATH, 
            // 仅替换已知键的值，保留注释和未知的 INI 内容。
            updateAppConfig(readConfig(APP_CONFIG_PATH), body.sections));
            const count = body.sections.reduce((total, section) => total + (section.items?.length || 0), 0);
            this.logger.info({ path: APP_CONFIG_PATH, count }, "应用配置已保存");
            return { success: true, count };
        }
        catch (error) {
            return this.failed(reply, 500, error);
        }
    }
};
__decorate([
    Get("config"),
    __param(0, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "getConfig", null);
__decorate([
    Post("config"),
    HttpCode(200),
    __param(0, Body()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "saveUrlConfig", null);
__decorate([
    Get("app-config"),
    __param(0, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "getAppConfig", null);
__decorate([
    Post("app-config"),
    HttpCode(200),
    __param(0, Body()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "saveAppConfig", null);
ConfigController = __decorate([
    Controller("/api"),
    __param(0, Inject(LOGGER_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ConfigController);
export { ConfigController };
