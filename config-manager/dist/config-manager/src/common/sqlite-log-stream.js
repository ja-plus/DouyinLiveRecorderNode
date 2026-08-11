import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
/**
 * 基于 node:sqlite（Node.js 22 内置）的日志持久化流。
 *
 * 与 sql.js（全量内存加载）不同，node:sqlite 是真正的文件级 SQLite：
 * - 写入按页增量落盘，不会全量重写文件
 * - 内存仅缓存活跃页，数据量增长不会导致内存膨胀
 * - 同步 API，配合 Writable 的 _write 回调天然契合
 *
 * 需要以 --experimental-sqlite 标志启动 Node 进程。
 */ export class SqliteLogStream extends Writable {
    db;
    insertStmt;
    buffer = [];
    flushTimer = null;
    flushInterval = 1000;
    bufferSize = 100;
    constructor(dbPath){
        // 非 objectMode：pino 将日志序列化为 JSON 字符串后写入，_write 收到的是字符串/Buffer
        super();
        // 确保目录存在
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {
                recursive: true
            });
        }
        // 打开文件级 SQLite，自动创建
        this.db = new DatabaseSync(dbPath);
        // WAL 模式：写入不阻塞读取，提升并发；checkpoint 时再合并回主文件
        this.db.exec("PRAGMA journal_mode = WAL");
        // NORMAL 同步级别：崩溃时可能丢失最后几条日志，但写入性能远优于 FULL
        this.db.exec("PRAGMA synchronous = NORMAL");
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT NOT NULL,
        level INTEGER NOT NULL,
        msg TEXT NOT NULL,
        context TEXT,
        raw TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
        this.db.exec("CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time DESC)");
        this.db.exec("CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)");
        this.db.exec("CREATE INDEX IF NOT EXISTS idx_logs_context ON logs(context)");
        // 预编译插入语句，循环复用
        this.insertStmt = this.db.prepare("INSERT INTO logs (time, level, msg, context, raw) VALUES (?, ?, ?, ?, ?)");
        this.startFlushTimer();
    }
    startFlushTimer() {
        this.flushTimer = setInterval(()=>this.flush(), this.flushInterval);
        // 不阻止进程退出
        this.flushTimer.unref?.();
    }
    _write(chunk, encoding, callback) {
        try {
            // pino 写入的是 JSON 字符串，需要先解析为对象
            const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            const entry = JSON.parse(str);
            // 兜底必填字段，避免 undefined 无法绑定到 SQLite 参数
            if (entry.time == null) entry.time = new Date().toISOString();
            if (entry.level == null) entry.level = 30; // info
            if (entry.msg == null) entry.msg = "";
            this.buffer.push(entry);
            if (this.buffer.length >= this.bufferSize) {
                this.flush();
            }
            callback();
        } catch (err) {
            callback(err instanceof Error ? err : new Error(String(err)));
        }
    }
    flush() {
        if (this.buffer.length === 0) return;
        const entries = this.buffer.splice(0, this.buffer.length);
        try {
            this.db.exec("BEGIN TRANSACTION");
            for (const entry of entries){
                this.insertStmt.run(entry.time, entry.level, entry.msg, entry.context ?? null, JSON.stringify(entry));
            }
            this.db.exec("COMMIT");
        } catch (err) {
            try {
                this.db.exec("ROLLBACK");
            } catch  {}
            // 错误打到 stderr，避免日志流自循环
            console.error("Failed to flush logs to SQLite:", err);
        }
    }
    close() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.flush();
        // StatementSync 没有 finalize 方法，随 db.close() 自动释放
        try {
            this.db.close();
        } catch  {}
    }
}

//# sourceMappingURL=sqlite-log-stream.js.map