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
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Injectable, Inject } from "@nestjs/common";
import { LOGGER_TOKEN } from "../common/logger.js";
/**
 * 日志查询服务。
 *
 * 基于 node:sqlite（Node.js 22 内置）的文件级 SQLite：
 * - 连接常驻，按页缓存，不会把整个数据库读入内存
 * - 与 SqliteLogStream 共享同一个 .db 文件（WAL 模式支持读写并发）
 * - 同步 API，NestJS 控制器中直接返回结果
 *
 * 需要以 --experimental-sqlite 标志启动 Node 进程。
 */
let LogsService = class LogsService {
    logger;
    dbPath;
    db = null;
    constructor(logger, dbPath) {
        this.logger = logger;
        this.dbPath = dbPath;
        try {
            if (!fs.existsSync(this.dbPath)) {
                this.logger.warn({ dbPath: this.dbPath }, "日志数据库不存在，查询功能暂不可用；待有日志写入后自动创建");
                return;
            }
            // 只读模式打开，避免查询时意外写入
            this.db = new DatabaseSync(this.dbPath, { readOnly: true });
            this.logger.info({ dbPath: this.dbPath }, "日志数据库已加载（只读）");
        }
        catch (err) {
            this.logger.error({ err, dbPath: this.dbPath }, "日志数据库初始化失败");
        }
    }
    query(params) {
        if (!this.db) {
            return { items: [], total: 0 };
        }
        const conditions = [];
        const values = [];
        if (params.level !== undefined) {
            conditions.push("level = ?");
            values.push(params.level);
        }
        if (params.context) {
            conditions.push("context = ?");
            values.push(params.context);
        }
        if (params.keyword) {
            conditions.push("msg LIKE ?");
            values.push(`%${params.keyword}%`);
        }
        if (params.startTime) {
            conditions.push("time >= ?");
            values.push(params.startTime);
        }
        if (params.endTime) {
            conditions.push("time <= ?");
            values.push(params.endTime);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const offset = (params.page - 1) * params.pageSize;
        try {
            // 每次按当前 where 重新编译，避免参数个数变化导致的语句缓存失效
            const totalRow = this.db
                .prepare(`SELECT COUNT(*) as count FROM logs ${where}`)
                .get(...values);
            const total = totalRow?.count ?? 0;
            const rows = this.db
                .prepare(`SELECT id, time, level, msg, context, raw FROM logs ${where} ORDER BY time DESC LIMIT ? OFFSET ?`)
                .all(...values, params.pageSize, offset);
            return { items: rows, total };
        }
        catch (err) {
            this.logger.error({ err, params }, "日志查询失败");
            return { items: [], total: 0 };
        }
    }
    /**
     * 清理指定天数之前的日志。
     * @param days 保留天数，删除该天数之前的所有日志
     * @returns 清理结果：删除条数和剩余条数
     */
    cleanup(days) {
        if (!this.db) {
            return { deleted: 0, remaining: 0 };
        }
        try {
            // 计算截止时间：当前时间减去 days 天
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const cutoffTime = cutoffDate.toISOString();
            // 先获取删除前的总数
            const beforeCount = this.db
                .prepare("SELECT COUNT(*) as count FROM logs")
                .get();
            // 删除指定天数之前的日志
            this.db
                .prepare("DELETE FROM logs WHERE time < ?")
                .run(cutoffTime);
            // 获取删除后的总数
            const afterCount = this.db
                .prepare("SELECT COUNT(*) as count FROM logs")
                .get();
            const deleted = (beforeCount?.count ?? 0) - (afterCount?.count ?? 0);
            this.logger.info({ days, cutoffTime, deleted, remaining: afterCount?.count ?? 0 }, "日志清理完成");
            return { deleted, remaining: afterCount?.count ?? 0 };
        }
        catch (err) {
            this.logger.error({ err, days }, "日志清理失败");
            return { deleted: 0, remaining: 0 };
        }
    }
    /**
     * 获取日志统计信息。
     * @returns 总条数、最早日志时间、最晚日志时间
     */
    getStats() {
        if (!this.db) {
            return { total: 0, oldestTime: null, newestTime: null };
        }
        try {
            const row = this.db
                .prepare("SELECT COUNT(*) as total, MIN(time) as oldest, MAX(time) as newest FROM logs")
                .get();
            return {
                total: row?.total ?? 0,
                oldestTime: row?.oldest ?? null,
                newestTime: row?.newest ?? null,
            };
        }
        catch (err) {
            this.logger.error({ err }, "日志统计查询失败");
            return { total: 0, oldestTime: null, newestTime: null };
        }
    }
    onModuleDestroy() {
        // StatementSync 没有 finalize 方法，随 db.close() 自动释放
        try {
            this.db?.close();
        }
        catch { }
        this.db = null;
    }
};
LogsService = __decorate([
    Injectable(),
    __param(0, Inject(LOGGER_TOKEN)),
    __metadata("design:paramtypes", [Object, String])
], LogsService);
export { LogsService };
