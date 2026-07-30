/**
 * Logger module - using pino for high-performance logging
 */
import pino from 'pino';
import pretty from 'pino-pretty';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

fs.mkdirSync(LOGS_DIR, { recursive: true });

// Windows 控制台默认代码页为 GBK(936)，切换为 UTF-8 避免中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

// pino-pretty 以进程内流方式输出到 process.stdout（走 Node TTY 层），
// 避免 pino.transport 工作线程直写 fd 1 导致 Windows 控制台中文乱码
const prettyStream = pretty({
  destination: process.stdout,
  colorize: process.stdout.isTTY,
  translateTime: 'yyyy-mm-dd HH:MM:ss.l',
  ignore: 'pid,hostname'
});

// 控制台默认 info 级别，减少 pretty 格式化的 CPU 开销；
// 排查问题时可通过 LOG_LEVEL=debug 环境变量打开，文件日志仍保留 debug 全量
const consoleLevel = process.env.LOG_LEVEL || 'info';

const streams = [
  { level: consoleLevel, stream: prettyStream },
  { level: 'debug', stream: pino.destination({ dest: path.join(LOGS_DIR, 'streamget.log'), mkdir: true }) },
  { level: 'info', stream: pino.destination({ dest: path.join(LOGS_DIR, 'PlayURL.log'), mkdir: true }) }
];

export const logger = pino({ level: 'debug' }, pino.multistream(streams));
export default logger;
