/**
 * Record worker - Node 直录 worker 线程（实验性）
 *
 * 在独立 worker 线程内以纯字节透传方式直录 FLV 直播流（HTTP 拉流 → 写盘），
 * 不经过 ffmpeg 转封装，每路占用远低于 ffmpeg 子进程。
 * 运行在独立 V8 isolate 中：本线程崩溃/OOM 不影响主线程与其他录制任务。
 *
 * 与主线程的消息协议：
 *   worker → 主线程: { type: 'segment', file }        新建录制文件（含首个及重连后的分片）
 *                    { type: 'progress', bytes }      周期性上报累计写入字节数
 *                    { type: 'ended', reason, bytes } 录制结束原因
 *   主线程 → worker: { type: 'stop' }                 优雅停止（中断拉流并落盘收尾）
 */
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { request, Agent, ProxyAgent } from 'undici';

const {
  sourceUrl,
  saveFilePath,
  proxyAddr = null,
  headers = {},
  // 相邻两个数据块间隔超过该值视为断流（由 undici bodyTimeout 实现）
  idleTimeout = 20000,
  headersTimeout = 15000,
  // 连续失败达到该次数则认为直播已结束，worker 退出交回主线程重新探测
  maxReconnects = 3,
  reconnectDelay = 3000,
  // 单次拉流写入低于该字节数视为无效连接（如秒断的 200 空响应）
  minValidBytes = 32 * 1024
} = workerData;

let stopped = false;
let currentAbort = null;
let totalBytes = 0;

// 拉流所用 dispatcher：worker 生命周期内复用同一个，退出时随线程销毁
const dispatcher = proxyAddr
  ? new ProxyAgent({ uri: proxyAddr, connect: { rejectUnauthorized: false } })
  : new Agent({ connect: { rejectUnauthorized: false } });

parentPort.on('message', (msg) => {
  if (msg && msg.type === 'stop') {
    stopped = true;
    if (currentAbort) currentAbort.abort();
  }
});

/**
 * 重连时生成新文件名（FLV 头会随新连接重发，续写原文件会损坏容器结构）
 * xxx.flv -> xxx_part1.flv, xxx_part2.flv ...
 */
function segmentFilePath(partIndex) {
  if (partIndex === 0) return saveFilePath;
  const ext = path.extname(saveFilePath);
  const base = saveFilePath.slice(0, -ext.length);
  return `${base}_part${partIndex}${ext}`;
}

/**
 * 单次拉流写盘，返回本次写入字节数；抛错或返回后由外层决定是否重连
 */
async function recordOnce(filePath) {
  const ac = new AbortController();
  currentAbort = ac;

  const res = await request(sourceUrl, {
    method: 'GET',
    headers,
    dispatcher,
    signal: ac.signal,
    headersTimeout,
    bodyTimeout: idleTimeout
  });

  if (res.statusCode !== 200) {
    await res.body.dump();
    throw new Error(`HTTP ${res.statusCode}`);
  }

  parentPort.postMessage({ type: 'segment', file: filePath });
  const ws = fs.createWriteStream(filePath);

  // 周期性上报进度，主线程据此展示状态；worker 内不做任何格式解析
  const progressTimer = setInterval(() => {
    parentPort.postMessage({ type: 'progress', bytes: totalBytes + ws.bytesWritten });
  }, 10000);

  try {
    await pipeline(res.body, ws);
  } finally {
    clearInterval(progressTimer);
    currentAbort = null;
    totalBytes += ws.bytesWritten;
  }
  return ws.bytesWritten;
}

async function main() {
  let partIndex = 0;
  let failCount = 0;
  let reason = 'stream-ended';

  while (!stopped) {
    // 通过 totalBytes 差值统计本次写入量（recordOnce 中途抛错时也已在 finally 中累计），
    // 避免长时间正常录制后的断流被误判为无效连接
    const bytesBefore = totalBytes;
    let cleanEnd = false;
    try {
      await recordOnce(segmentFilePath(partIndex));
      // 服务端正常关闭响应流：视为直播结束（与 ffmpeg 行为一致），
      // 退出后由主循环重新探测直播状态决定是否再次录制
      cleanEnd = true;
    } catch (e) {
      if (stopped) break;
      reason = e.message || String(e);
    }
    const written = totalBytes - bytesBefore;
    // 空文件分片不占用 part 序号，下次重连覆盖写同名文件
    if (written > 0) partIndex++;

    if (stopped || cleanEnd) break;

    // 异常断流才重连：有效拉流后重置失败计数，无效/失败连接累计到上限则退出
    if (written >= minValidBytes) {
      failCount = 0;
    } else {
      failCount++;
      if (failCount >= maxReconnects) break;
    }
    await new Promise(r => setTimeout(r, reconnectDelay));
  }

  parentPort.postMessage({
    type: 'ended',
    reason: stopped ? 'stopped' : reason,
    bytes: totalBytes
  });
}

main()
  .catch((e) => {
    parentPort.postMessage({ type: 'ended', reason: `worker-error: ${e.message}`, bytes: totalBytes });
  })
  .finally(() => {
    // 关闭 dispatcher 与消息端口：message 监听会持有事件循环引用，
    // 不关闭 parentPort 的话 worker 无法自然退出
    dispatcher.close().catch(() => {});
    parentPort.close();
  });
