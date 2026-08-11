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
import { Controller, Get, Delete, Query, Inject } from "@nestjs/common";
import { LOGGER_TOKEN } from "../common/logger.js";
import { LogsService } from "./logs.service.js";
export class LogsController {
    logger;
    logsService;
    constructor(logger, logsService){
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
                endTime: endTime?.trim() || undefined
            };
            return {
                success: true,
                data: this.logsService.query(query)
            };
        } catch (error) {
            this.logger.error({
                err: error
            }, "日志查询接口异常");
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    getStats() {
        try {
            return {
                success: true,
                data: this.logsService.getStats()
            };
        } catch (error) {
            this.logger.error({
                err: error
            }, "日志统计接口异常");
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    cleanup(days = "30") {
        try {
            const daysNum = Math.max(1, Number(days) || 30);
            return {
                success: true,
                data: this.logsService.cleanup(daysNum)
            };
        } catch (error) {
            this.logger.error({
                err: error
            }, "日志清理接口异常");
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
_ts_decorate([
    Get(),
    _ts_param(0, Query("page")),
    _ts_param(1, Query("pageSize")),
    _ts_param(2, Query("level")),
    _ts_param(3, Query("context")),
    _ts_param(4, Query("keyword")),
    _ts_param(5, Query("startTime")),
    _ts_param(6, Query("endTime")),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        void 0,
        void 0,
        String,
        String,
        String,
        String,
        String
    ]),
    _ts_metadata("design:returntype", void 0)
], LogsController.prototype, "query", null);
_ts_decorate([
    Get("stats"),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", void 0)
], LogsController.prototype, "getStats", null);
_ts_decorate([
    Delete(),
    _ts_param(0, Query("days")),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        void 0
    ]),
    _ts_metadata("design:returntype", void 0)
], LogsController.prototype, "cleanup", null);
LogsController = _ts_decorate([
    Controller("/api/logs"),
    _ts_param(0, Inject(LOGGER_TOKEN)),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof Logger === "undefined" ? Object : Logger,
        typeof LogsService === "undefined" ? Object : LogsService
    ])
], LogsController);

//# sourceMappingURL=logs.controller.js.map