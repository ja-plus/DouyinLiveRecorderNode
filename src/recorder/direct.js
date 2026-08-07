// @ts-check
/**
 * Direct recording runner - Node 直录模式（实验性）的主线程调度器
 *
 * 每路直录对应一个 worker 线程（独立 V8 isolate），JS 异常与内存超限
 * 均被隔离在 worker 内，不影响主线程与其他录制任务。
 * 返回值与 runRecording 保持一致：{ code, stopped, files }
 */
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../logger.js';
import { printColored, Color } from '../utils/color.js';
import { handleProxyAddr } from '../utils/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'record-worker.js');

const DIRECT_USER_AGENT = 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/87.0.4280.141 Mobile Safari/537.36';

/**
 * Run direct recording in a worker thread
 * @param {object} params
 * @param {string} params.sourceUrl - 直播源地址（FLV）
 * @param {string} params.saveFilePath - 保存文件路径（.flv）
 * @param {string|null} [params.proxyAddr] - 代理地址
 * @param {Record<string, string>} [params.headers] - 额外请求头（如 referer/origin）
 * @param {string} params.recordName - 录制名（日志用）
 * @param {import('../types.js').StopChecker} [params.onStop] - 每秒轮询，返回 true 时优雅停止
 * @returns {Promise<import('../types.js').DirectRecordingResult>}
 */
export function runDirectRecording({ sourceUrl, saveFilePath, proxyAddr = null, headers = {}, recordName, onStop }) {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: {
        sourceUrl,
        saveFilePath,
        proxyAddr: handleProxyAddr(proxyAddr),
        headers: { 'user-agent': DIRECT_USER_AGENT, ...headers }
      },
      // 限制单路 worker 堆内存，异常膨胀时仅终止该路录制
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 }
    });

    let stopped = false;
    let endedReason = '';
    /** @type {ReturnType<typeof setTimeout> | null} */
    let endedTimer = null;
    /** @type {string[]} */
    const files = [];

    const checkInterval = setInterval(() => {
      if (onStop && onStop()) {
        stopped = true;
        clearInterval(checkInterval);
        worker.postMessage({ type: 'stop' });
        // 兜底：worker 未在超时内自行退出则强制终止
        setTimeout(() => worker.terminate().catch(() => {}), 10000);
      }
    }, 1000);

    worker.on('message', (msg) => {
      if (!msg) return;
      if (msg.type === 'segment') {
        files.push(msg.file);
        if (files.length > 1) {
          logger.warn(`${recordName} 直录断流重连，新建分片: ${path.basename(msg.file)}`);
        }
      } else if (msg.type === 'ended') {
        endedReason = msg.reason || '';
        // 兜底：worker 报告结束后若未能自然退出（如残留句柄）则强制终止
        endedTimer = setTimeout(() => worker.terminate().catch(() => {}), 5000);
      }
    });

    worker.on('error', (err) => {
      // worker 内未捕获异常/OOM 到达此处，仅影响本路录制
      logger.error(`${recordName} 直录worker异常: ${err instanceof Error ? err.message : String(err)}`);
    });

    worker.on('exit', (code) => {
      clearInterval(checkInterval);
      if (endedTimer) clearTimeout(endedTimer);
      const stopTime = new Date().toLocaleString('zh-CN');
      if (stopped) {
        printColored(`[${recordName}]录制时已被注释,本条线程将会退出`, Color.YELLOW);
      } else if (code === 0) {
        console.log(`\n${recordName} ${stopTime} 直播录制完成（直录模式${endedReason ? `: ${endedReason}` : ''}）\n`);
      } else {
        printColored(`\n${recordName} ${stopTime} 直录出错,退出码: ${code} ${endedReason}\n`, Color.RED);
      }
      resolve({ code, stopped, files });
    });
  });
}
