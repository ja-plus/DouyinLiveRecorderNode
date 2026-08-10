import { Controller, Get, Delete, Query, Inject } from "@nestjs/common";
import type { Logger } from "pino";
import { LOGGER_TOKEN } from "../common/logger.js";
import { LogsService, type LogQuery } from "./logs.service.js";

@Controller("/api/logs")
export class LogsController {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  query(
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "50",
    @Query("level") level?: string,
    @Query("context") context?: string,
    @Query("keyword") keyword?: string,
    @Query("startTime") startTime?: string,
    @Query("endTime") endTime?: string,
  ) {
    try {
      const query: LogQuery = {
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(100, Math.max(1, Number(pageSize) || 50)),
        level: level ? Number(level) : undefined,
        context: context?.trim() || undefined,
        keyword: keyword?.trim() || undefined,
        startTime: startTime?.trim() || undefined,
        endTime: endTime?.trim() || undefined,
      };

      return { success: true, data: this.logsService.query(query) };
    } catch (error) {
      this.logger.error({ err: error }, "日志查询接口异常");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("stats")
  getStats() {
    try {
      return { success: true, data: this.logsService.getStats() };
    } catch (error) {
      this.logger.error({ err: error }, "日志统计接口异常");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Delete()
  cleanup(@Query("days") days = "30") {
    try {
      const daysNum = Math.max(1, Number(days) || 30);
      return { success: true, data: this.logsService.cleanup(daysNum) };
    } catch (error) {
      this.logger.error({ err: error }, "日志清理接口异常");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
