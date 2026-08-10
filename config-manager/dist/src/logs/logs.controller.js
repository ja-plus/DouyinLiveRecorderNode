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
import { Controller, Get, Delete, Query, Inject } from "@nestjs/common";
import { LOGGER_TOKEN } from "../common/logger.js";
import { LogsService } from "./logs.service.js";
let LogsController = class LogsController {
    logger;
    logsService;
    constructor(logger, logsService) {
        this.logger = logger;
        this.logsService = logsService;
    }
    query(page = "1", pageSize = "50", level, context, keyword, startTime, endTime) {
        try {
            const query = {
                page: Math.max(1, Number(page) || 1),
                pageSize: Math.min(100, Math.max(1, Number(pageSize) || 50)),
                level: level ? Number(level) : undefined,
                context: context?.trim() || undefined,
                keyword: keyword?.trim() || undefined,
                startTime: startTime?.trim() || undefined,
                endTime: endTime?.trim() || undefined,
            };
            return { success: true, data: this.logsService.query(query) };
        }
        catch (error) {
            this.logger.error({ err: error }, "日志查询接口异常");
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    getStats() {
        try {
            return { success: true, data: this.logsService.getStats() };
        }
        catch (error) {
            this.logger.error({ err: error }, "日志统计接口异常");
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    cleanup(days = "30") {
        try {
            const daysNum = Math.max(1, Number(days) || 30);
            return { success: true, data: this.logsService.cleanup(daysNum) };
        }
        catch (error) {
            this.logger.error({ err: error }, "日志清理接口异常");
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
};
__decorate([
    Get(),
    __param(0, Query("page")),
    __param(1, Query("pageSize")),
    __param(2, Query("level")),
    __param(3, Query("context")),
    __param(4, Query("keyword")),
    __param(5, Query("startTime")),
    __param(6, Query("endTime")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], LogsController.prototype, "query", null);
__decorate([
    Get("stats"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LogsController.prototype, "getStats", null);
__decorate([
    Delete(),
    __param(0, Query("days")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LogsController.prototype, "cleanup", null);
LogsController = __decorate([
    Controller("/api/logs"),
    __param(0, Inject(LOGGER_TOKEN)),
    __metadata("design:paramtypes", [Object, LogsService])
], LogsController);
export { LogsController };
