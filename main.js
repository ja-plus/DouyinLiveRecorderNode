// @ts-check
/**
 * LiveRecorder-node - Main entry point
 * Node.js implementation of DouyinLiveRecorder
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { loadAppSettings, URL_CONFIG_FILE, CONFIG_FILE, DEFAULT_PATH, BACKUP_DIR, backupFile, updateFile, deleteLine } from './src/config/index.js';
import { removeDuplicateLines, cleanName, getQualityCode, sleep, checkDiskCapacity, getQueryParams } from './src/utils/index.js';
import { printColored, Color } from './src/utils/color.js';
import { ProxyDetector } from './src/utils/proxy.js';
import { checkFfmpeg, buildFfmpegCommand, runRecording, convertsMp4 } from './src/recorder/index.js';
import { runDirectRecording } from './src/recorder/direct.js';
import { pushMessage } from './src/push/index.js';
import { DouyinPlatform } from './src/platforms/douyin.js';
import { BilibiliPlatform, HuyaPlatform, KuaishouPlatform, DouyuPlatform, YYPlatform, TiktokPlatform, CustomStreamPlatform } from './src/platforms/index.js';
import logger from './src/logger.js';

/** @typedef {import('./src/types.js').AppSettings} AppSettings */
/** @typedef {import('./src/types.js').StreamInfo} StreamInfo */
/** @typedef {import('./src/types.js').UrlTuple} UrlTuple */
/** @typedef {import('./src/types.js').RecordingResult} RecordingResult */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = 'v4.0.7-node';

// ============ Global State ============
/** @type {Set<string>} */
const recording = new Set();
/** @type {Record<string, [Date, string]>} */
const recordingTimeList = {};
/** @type {Record<string, string>} recordName -> recordUrl，用于状态快照按 URL 匹配 */
const recordingUrls = {};
/** @type {string[]} */
const runningList = [];
let errorCount = 0;
let monitoring = 0;
let exitRecording = false;

// 录制状态总线：每次 recording 集合变更时 emit('change', snapshot)，
// 由本进程的 HTTP 状态服务（/recording-status/stream）转成 SSE 推给 config-manager。
const recordingStateBus = new EventEmitter();
recordingStateBus.setMaxListeners(0); // SSE 客户端数不定，取消上限

/**
 * 生成当前录制状态快照，供 config-manager 实时展示。
 * @typedef {Object} RecordingStatusItem
 * @property {string} name - 完整显示名（序号N 主播名）
 * @property {string} anchorName - 主播名（去掉序号前缀）
 * @property {string} url - 直播间地址，用于与配置行精确匹配
 * @property {string} startTime - 录制开始时间 ISO 串
 * @property {string} quality - 画质中文
 * @returns {{ recording: RecordingStatusItem[], monitoring: number, updatedAt: string }}
 */
function getRecordingSnapshot() {
  /** @type {RecordingStatusItem[]} */
  const items = [];
  for (const recordName of recording) {
    const [startTime, quality] = recordingTimeList[recordName] || [new Date(), ''];
    items.push({
      name: recordName,
      anchorName: recordName.replace(/^序号\d+\s*/, ''),
      url: recordingUrls[recordName] || '',
      startTime: startTime instanceof Date ? startTime.toISOString() : new Date().toISOString(),
      quality: quality || '',
    });
  }
  return { recording: items, monitoring, updatedAt: new Date().toISOString() };
}

/** recording 集合变更后调用，向所有 SSE 客户端推送最新快照。 */
function emitRecordingState() {
  recordingStateBus.emit('change', getRecordingSnapshot());
}
// 每路录制线程逐秒轮询查询 URL 状态，使用 Set 保证 O(1) 查找，
// 避免监控路数多时每秒重复线性扫描数组
/** @type {Set<string>} */
let urlComments = new Set();
/** @type {Set<string>} */
let urlFileList = new Set();
let firstStart = true;

// ============ Platform Registry ============
/** @type {import('./src/platforms/base.js').BasePlatform[]} */
let platforms = [];
/** @type {AppSettings} */
let settings = /** @type {any} */ ({});

function initPlatforms() {
  platforms = [
    new DouyinPlatform(settings),
    new TiktokPlatform(settings),
    new KuaishouPlatform(settings),
    new HuyaPlatform(settings),
    new DouyuPlatform(settings),
    new YYPlatform(settings),
    new BilibiliPlatform(settings),
    new CustomStreamPlatform(settings),
  ];
}

/**
 * @param {string} url
 * @returns {import('./src/platforms/base.js').BasePlatform | null}
 */
function findPlatform(url) {
  return platforms.find(p => p.match(url)) || null;
}

// ============ Display Info ============
/** @returns {Promise<void>} */
async function displayInfo() {
  await sleep(5000);
  while (true) {
    try {
      await sleep(5000);
      // 与 Python 版一致：每轮先清屏后原地刷新状态，避免状态信息每10秒滚动输出一次
      if (process.stdout.isTTY) console.clear();
      const now = new Date().toLocaleTimeString('zh-CN');
      let info = `\r共监测${monitoring}个直播中 | 线程数: ${settings.maxRequest} | 代理: ${settings.useProxy ? '是' : '否'} | `;
      info += `分段: ${settings.splitVideoByTime ? settings.splitTime + '秒' : '否'} | `;
      info += `质量: ${settings.videoRecordQuality} | 格式: ${settings.videoSaveType} | 错误: ${errorCount} | ${now}`;
      process.stdout.write(info + '\n');

      if (recording.size === 0) {
        await sleep(5000);
        if (monitoring === 0) {
          console.log('\r没有正在监测和录制的直播');
        } else {
          console.log(`\r没有正在录制的直播 循环监测间隔时间：${settings.delayDefault}秒`);
        }
      } else {
        console.log('x'.repeat(60));
        console.log(`正在录制${recording.size}个直播: `);
        for (const name of recording) {
          const [rt, qa] = recordingTimeList[name] || [new Date(), ''];
          const elapsed = Math.floor((Date.now() - rt.getTime()) / 1000);
          const h = Math.floor(elapsed / 3600);
          const m = Math.floor((elapsed % 3600) / 60);
          const s = elapsed % 60;
          console.log(`${name}[${qa}] 正在录制中 ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        }
        console.log('x'.repeat(60));
      }
    } catch (e) {
      logger.error(`Display error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ============ Core Recording Loop ============
/**
 * @param {UrlTuple} urlData - [画质, 直播地址, 主播名备注]
 * @param {number} countVariable - 监测序号
 * @returns {Promise<void>}
 */
async function startRecord(urlData, countVariable) {
  let nameWrittenBack = false;
  while (true) {
    try {
      let recordFinished = false;
      let startPushed = false;
      let countTime = Date.now();
      const [recordQualityZh, recordUrl, anchorNameConfig] = urlData;
      const recordQuality = getQualityCode(recordQualityZh);
      let recordName = `序号${countVariable}`;
      let proxyAddress = settings.proxyAddr;
      let platformName = '未知平台';

      // Determine proxy
      if (settings.proxyAddr) {
        proxyAddress = null;
        for (const pt of settings.enableProxyPlatformList) {
          if (pt && pt.trim() && recordUrl.includes(pt.trim())) {
            proxyAddress = settings.proxyAddr;
            break;
          }
        }
      }
      if (!proxyAddress && settings.extraEnableProxyPlatformList.length > 0) {
        for (const pt of settings.extraEnableProxyPlatformList) {
          if (pt && pt.trim() && recordUrl.includes(pt.trim())) {
            proxyAddress = settings.proxyAddr || null;
          }
        }
      }

      while (true) {
        try {
          // 每次检测前先响应 URL_config.ini 的变化（被注释或被删除则退出本线程）
          if (urlComments.has(recordUrl) || !urlFileList.has(recordUrl)) {
            printColored(`[${recordName}]已被注释或删除,本条线程将会退出`, Color.YELLOW);
            clearRecordInfo(recordName, recordUrl);
            return;
          }
          if (exitRecording) return;

          const platform = findPlatform(recordUrl);
          if (!platform) {
            logger.error(`${recordUrl} 未知平台直播地址`);
            return;
          }
          platformName = platform.name;

          // Check proxy requirement
          if (platform.requiresProxy && !proxyAddress && !globalProxy) {
            logger.error(`错误信息: 网络异常，请检查网络是否能正常访问${platformName}平台`);
            await sleep(settings.delayDefault * 1000);
            continue;
          }

          // Get cookies for this platform
          const cookies = getCookiesForPlatform(platformName);

          // Get stream info
          const portInfo = await platform.getStreamInfo(recordUrl, {
            proxyAddr: proxyAddress,
            cookies,
            quality: recordQuality
          });

          let anchorName = anchorNameConfig;
          if (anchorName && anchorName.includes('主播:')) {
            const parts = anchorName.split('主播:');
            anchorName = parts.length > 1 && parts[1].trim() ? parts[1].trim() : (portInfo.anchor_name || '');
          } else {
            anchorName = portInfo.anchor_name || '';
          }

          if (!portInfo.anchor_name) {
            console.log(`序号${countVariable} 网址内容获取失败,进行重试中...`);
            errorCount++;
          } else {
            anchorName = cleanName(anchorName, settings.cleanEmoji);
            recordName = `序号${countVariable} ${anchorName}`;

            if (recordUrl && urlComments.has(recordUrl)) {
              console.log(`[${anchorName}]已被注释,本条线程将会退出`);
              clearRecordInfo(recordName, recordUrl);
              return;
            }

            // 首次获取到主播名后回写到 URL_config.ini（与 Python 版行为一致）
            if (!anchorNameConfig && !nameWrittenBack && anchorName) {
              updateFile(URL_CONFIG_FILE, recordUrl, `${recordUrl},主播: ${anchorName}`);
              nameWrittenBack = true;
            }

            const pushAt = new Date().toLocaleString('zh-CN');

            if (!portInfo.is_live) {
              process.stdout.write(`\r${recordName} 等待直播... \n`);
              if (startPushed && settings.push.overShowPush) {
                let pushContent = settings.push.overPushMessageText || '直播间状态更新：[直播间名称] 直播已结束！时间：[时间]';
                pushContent = pushContent.replace('[直播间名称]', recordName).replace('[时间]', pushAt);
                pushMessage(recordName, recordUrl, pushContent.replace(/\\n/g, '\n'), settings.push).catch(() => {});
              }
              startPushed = false;
            } else {
              console.log(`\r${recordName} 正在直播中...`);

              if (settings.push.liveStatusPush && !startPushed && settings.push.beginShowPush) {
                let pushContent = settings.push.beginPushMessageText || '直播间状态更新：[直播间名称] 正在直播中，时间：[时间]';
                pushContent = pushContent.replace('[直播间名称]', recordName).replace('[时间]', pushAt);
                pushMessage(recordName, recordUrl, pushContent.replace(/\\n/g, '\n'), settings.push).catch(() => {});
                startPushed = true;
              }

              if (settings.push.disableRecord) {
                await sleep(settings.push.pushCheckSeconds * 1000);
                continue;
              }

              // Select source URL
              let realUrl = selectSourceUrl(recordUrl, portInfo);
              if (!realUrl) {
                await sleep(settings.delayDefault * 1000);
                continue;
              }

              // Build save path
              const now = formatDateTime(new Date());
              let fullPath = `${settings.videoSavePath || DEFAULT_PATH}/${platformName}`;
              const liveTitle = portInfo.title ? cleanName(portInfo.title, settings.cleanEmoji) : '';
              const titleInName = (liveTitle && settings.filenameByTitle) ? liveTitle + '_' : '';

              if (settings.folderByAuthor) fullPath += `/${anchorName}`;
              if (settings.folderByTime) fullPath += `/${now.slice(0, 10)}`;
              fs.mkdirSync(fullPath, { recursive: true });

              // HTTPS enforcement
              if (platformName !== '自定义录制直播' && settings.enableHttpsRecording && realUrl.startsWith('http://')) {
                realUrl = realUrl.replace('http://', 'https://');
              }

              // Determine save type
              let recordSaveType = settings.videoSaveType;
              const isAudioOnly = ['猫耳FM直播', 'Look直播'].includes(platformName);
              if (isAudioOnly || recordSaveType.includes('MP3') || recordSaveType.includes('M4A')) {
                recordSaveType = recordSaveType.includes('M4A') ? 'M4A' : 'MP3';
              }

              // Node 直录模式（实验性）：仅 FLV 直连流且无需分段/音频提取时启用，
              // 其余情况一律回退旧的 ffmpeg 方式
              const isAudioSave = recordSaveType === 'MP3' || recordSaveType === 'M4A';
              const isFlvStream = /\.flv($|\?)/.test(realUrl);
              const useDirectRecord = settings.directRecordFlv && isFlvStream && !isAudioSave && !settings.splitVideoByTime;
              if (settings.directRecordFlv && isFlvStream && !isAudioSave && settings.splitVideoByTime) {
                logger.info(`${recordName} 分段录制已开启，直录模式暂不支持分段，本次回退ffmpeg录制`);
              }

              // Build filename（直录模式不经转封装，固定以原始 flv 容器落盘）
              const ext = useDirectRecord ? 'flv' : getExtension(recordSaveType);
              const nameFormat = settings.splitVideoByTime ? '_%03d' : '';
              const filename = `${anchorName}_${titleInName}${now}${nameFormat}.${ext}`;
              const saveFilePath = `${fullPath}/${filename}`;

              console.log(`\r${anchorName} 准备开始录制视频: ${fullPath}/${filename}`);

              // Log URL if enabled
              if (settings.showUrl) {
                logger.info(`${platformName} | ${anchorName} | 直播源地址: ${realUrl}`);
              }

              // Build and run recording (Node 直录 worker 或 ffmpeg 子进程)
              /** @returns {boolean} */
              const stopCheck = () => urlComments.has(recordUrl) || !urlFileList.has(recordUrl) || exitRecording;

              recording.add(recordName);
              recordingTimeList[recordName] = [new Date(), recordQualityZh];
              recordingUrls[recordName] = recordUrl;
              emitRecordingState();

              /** @type {RecordingResult} */
              let recordResult;
              if (useDirectRecord) {
                console.log(`\r${recordName} 使用Node直录模式(实验性)录制FLV流`);
                recordResult = await runDirectRecording({
                  sourceUrl: realUrl,
                  saveFilePath,
                  proxyAddr: proxyAddress,
                  recordName,
                  onStop: stopCheck
                });
              } else {
                const isOverseas = settings.enableProxyPlatformList.some(p => p && recordUrl.includes(p.trim()));
                const ffmpegCmd = buildFfmpegCommand({
                  sourceUrl: realUrl,
                  saveFilePath,
                  proxyAddr: proxyAddress,
                  platform: platformName,
                  splitVideoByTime: settings.splitVideoByTime,
                  splitTime: settings.splitTime,
                  videoSaveType: recordSaveType,
                  recordUrl,
                  enableHttps: settings.enableHttpsRecording,
                  isOverseas
                });
                recordResult = await runRecording(ffmpegCmd, { recordName, recordUrl, onStop: stopCheck });
              }
              const { stopped } = recordResult;

              recording.delete(recordName);
              emitRecordingState();

              if (stopped) {
                clearRecordInfo(recordName, recordUrl);
                return;
              }

              // Post-recording conversion（直录产出为 flv，除用户明确选择 FLV 格式外均转 MP4）
              const needConvert = useDirectRecord
                ? (settings.convertsToMp4 && recordSaveType !== 'FLV')
                : (settings.convertsToMp4 && recordSaveType === 'TS');
              if (needConvert) {
                const convertFiles = useDirectRecord && recordResult.files?.length ? recordResult.files : [saveFilePath];
                for (const f of convertFiles) {
                  convertsMp4(f, settings.deleteOriginFile, settings.convertsToH264).catch(() => {});
                }
              }

              recordFinished = true;
              countTime = Date.now();
            }
          }
        } catch (e) {
          logger.error(`Recording error: ${e instanceof Error ? e.message : String(e)}`);
          errorCount++;
        }

        // Wait before next check
        let waitTime = settings.delayDefault + Math.floor(Math.random() * 11) - 5;
        if (waitTime < 0) waitTime = 0;
        if (errorCount > 20) {
          waitTime += 60;
          printColored('\r瞬时错误太多,延迟加60秒', Color.YELLOW);
        }
        if (recordFinished && (Date.now() - countTime) < 60000) {
          waitTime = 30;
        }
        recordFinished = false;

        // 逐秒等待，期间发现 URL 被注释/删除或程序退出时立即中断等待
        for (let x = waitTime; x > 0; x--) {
          if (urlComments.has(recordUrl) || !urlFileList.has(recordUrl) || exitRecording) break;
          if (settings.loopTime) process.stdout.write(`\r循环等待${x}秒 `);
          await sleep(1000);
        }
        if (settings.loopTime) console.log();
      }
    } catch (e) {
      logger.error(`startRecord error: ${e instanceof Error ? e.message : String(e)}`);
      errorCount++;
      await sleep(2000);
    }
  }
}

// ============ Helper Functions ============
let globalProxy = false;

// 与 Python 版 clear_record_info 对应：线程退出时清理监测状态，使取消注释后能重新监测
/**
 * @param {string} recordName
 * @param {string} recordUrl
 */
function clearRecordInfo(recordName, recordUrl) {
  const wasRecording = recording.delete(recordName);
  if (wasRecording) emitRecordingState();
  if (urlComments.has(recordUrl) || !urlFileList.has(recordUrl)) {
    const idx = runningList.indexOf(recordUrl);
    if (idx > -1) {
      runningList.splice(idx, 1);
      monitoring--;
      printColored(`[${recordName}]已经从录制列表中移除\n`, Color.YELLOW);
    }
  }
}

/**
 * @param {string} platformName
 * @returns {string}
 */
function getCookiesForPlatform(platformName) {
  /** @type {Record<string, string>} */
  const map = {
    '抖音直播': settings.cookies.douyin,
    'TikTok直播': settings.cookies.tiktok,
    '快手直播': settings.cookies.kuaishou,
    '虎牙直播': settings.cookies.huya,
    '斗鱼直播': settings.cookies.douyu,
    'YY直播': settings.cookies.yy,
    'B站直播': settings.cookies.bilibili,
  };
  return map[platformName] || '';
}

/**
 * @param {string} link
 * @param {StreamInfo} streamInfo
 * @returns {string}
 */
function selectSourceUrl(link, streamInfo) {
  const isFlvPreferred = link.includes('douyin') || link.includes('tiktok');
  if (isFlvPreferred && streamInfo.flv_url) {
    const codec = getQueryParams(streamInfo.flv_url, 'codec');
    if (codec && codec[0] === 'h265') {
      logger.warn('FLV not supported for h265, use HLS');
    } else {
      return streamInfo.flv_url;
    }
  }
  return streamInfo.record_url || streamInfo.m3u8_url || streamInfo.flv_url || '';
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d}_${h}-${mi}-${s}`;
}

/**
 * @param {string} saveType
 * @returns {string}
 */
function getExtension(saveType) {
  /** @type {Record<string, string>} */
  const map = { TS: 'ts', FLV: 'flv', MKV: 'mkv', MP4: 'mp4', MP3: 'mp3', M4A: 'm4a', 'MP3音频': 'mp3', 'M4A音频': 'm4a' };
  return map[saveType] || 'ts';
}

// ============ URL Config Parsing ============
/** @returns {UrlTuple[]} */
function parseUrlConfig() {
  /** @type {UrlTuple[]} */
  const urlTuplesList = [];

  if (!fs.existsSync(URL_CONFIG_FILE)) return urlTuplesList;

  urlComments = new Set();
  urlFileList = new Set();
  const content = fs.readFileSync(URL_CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n');
  const urlLineList = new Set();

  for (const originLine of lines) {
    let line = originLine.trim();
    if (line.length < 18) continue;

    const isCommentLine = line.startsWith('#');
    if (isCommentLine) line = line.replace(/^#+/, '');

    let splitLine;
    if (/[,，]/.test(line)) {
      splitLine = line.split(/[,，]/);
    } else {
      splitLine = [line, ''];
    }

    let quality, url, name;
    if (splitLine.length === 1) {
      url = splitLine[0]; quality = settings.videoRecordQuality; name = '';
    } else if (splitLine.length === 2) {
      if (containsUrl(splitLine[0])) {
        quality = settings.videoRecordQuality; url = splitLine[0]; name = splitLine[1];
      } else {
        quality = splitLine[0]; url = splitLine[1]; name = '';
      }
    } else {
      [quality, url, name] = splitLine;
    }

    if (!['原画', '蓝光', '超清', '高清', '标清', '流畅'].includes(quality)) quality = '原画';
    if (!url) continue;
    // 移动端分享文案中只保留抖音短链，避免将整段文案作为请求地址。
    url = url.match(/(?:https?:\/\/)?v\.douyin\.com\/[^\s/?#]+\/?|https?:\/\/webcast\.amemv\.com\/douyin\/webcast\/reflow\/[^\s/?#]+/i)?.[0] || url;
    if (urlLineList.has(url)) continue;
    urlLineList.add(url);

    if (!url.includes('://')) url = 'https://' + url;

    urlFileList.add(url);
    if (isCommentLine) {
      urlComments.add(url);
    } else {
      urlTuplesList.push([quality, url, name]);
    }
  }
  return urlTuplesList;
}

/**
 * @param {string} str
 * @returns {boolean}
 */
function containsUrl(str) {
  return /(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:\d+)?(\/.*)?/.test(str);
}

// ============ Recording Status Server ============
// 以独立微服务方式向 config-manager 暴露实时录制状态。
// config-manager 后端通过 /recording-status/stream（SSE）订阅并中继给浏览器。
// 注意：config-manager 不再由本进程嵌入启动，需独立运行 pnpm run config-manager。
/** @type {import('http').Server | null}  */
let statusServer = null;
/** @returns {Promise<void>} */
async function startStatusServer() {
  const host = settings.statusServerHost || '127.0.0.1';
  const port = settings.statusServerPort || 5001;
  statusServer = http.createServer((req, res) => {
    // 仅暴露状态查询，其余路径一律 404，避免被当作通用 HTTP 服务滥用。
    if (req.url === '/recording-status') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(getRecordingSnapshot()));
      return;
    }
    if (req.url === '/recording-status/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // 连接建立即下发当前快照，避免订阅方等待下一次变更才拿到状态。
      res.write(`data: ${JSON.stringify(getRecordingSnapshot())}\n\n`);
      /** @param {{recording: unknown[], monitoring: number, updatedAt: string}} snap */
      const send = (snap) => res.write(`data: ${JSON.stringify(snap)}\n\n`);
      recordingStateBus.on('change', send);
      // 心跳：防止代理/负载均衡因长时间无数据而掐断连接。
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        recordingStateBus.off('change', send);
        clearInterval(heartbeat);
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
  return new Promise((resolve) => {
    statusServer?.listen(port, host, () => {
      console.log(`录制状态服务已启动: http://${host}:${port} （config-manager 通过此地址订阅实时状态）`);
      resolve();
    });
    statusServer?.on('error', (e) => {
      console.log(`录制状态服务启动失败（不影响录制）: ${e instanceof Error ? e.message : String(e)}`);
      resolve();
    });
  });
}

// ============ Main ============
/** @returns {Promise<void>} */
async function main() {
  console.log('-----------------------------------------------------');
  console.log('|              LiveRecorder-node                    |');
  console.log('-----------------------------------------------------');
  console.log(`版本号: ${VERSION}`);
  console.log('GitHub: https://github.com/ihmily/DouyinLiveRecorder');
  console.log('.....................................................');

  // Check ffmpeg
  const ffmpegOk = await checkFfmpeg();
  if (!ffmpegOk) {
    logger.error('缺少ffmpeg无法进行录制，程序退出');
    process.exit(1);
  }

  // Ensure directories
  fs.mkdirSync(DEFAULT_PATH, { recursive: true });
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });

  // Load settings
  settings = loadAppSettings();
  initPlatforms();

  // Remove duplicate lines
  removeDuplicateLines(URL_CONFIG_FILE);

  // Proxy detection
  if (settings.skipProxyCheck) {
    globalProxy = true;
  } else {
    try {
      console.log('系统代理检测中，请耐心等待...');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      await fetch('https://www.google.com/', { signal: controller.signal });
      clearTimeout(timeout);
      globalProxy = true;
      console.log('\r全局/规则网络代理已开启√');
      const pd = new ProxyDetector();
      if (pd.isProxyEnabled()) {
        const info = pd.getProxyInfo();
        console.log(`System Proxy: http://${info.ip}:${info.port}`);
      }
    } catch {
      printColored('INFO：未检测到全局/规则网络代理，请检查代理配置（若无需录制海外直播请忽略此条提示）', Color.YELLOW);
    }
  }

  // Start status server (config-manager 现作为独立服务运行，不再嵌入)
  await startStatusServer();

  // Start display thread
  displayInfo().catch(() => {});

  // Main loop
  while (true) {
    try {
      // 与 Python 版一致：每轮循环重新加载 config.ini，使循环时间等配置修改实时生效
      Object.assign(settings, loadAppSettings());
      const urlTuples = parseUrlConfig();
      monitoring = runningList.length;

      if (urlTuples.length > 0) {
        for (const urlTuple of urlTuples) {
          if (!runningList.includes(urlTuple[1])) {
            monitoring++;
            console.log(`\r${firstStart ? '传入' : '新增'}地址: ${urlTuple[1]}`);
            startRecord(urlTuple, monitoring).catch(e => logger.error(`Thread error: ${e.message}`));
            runningList.push(urlTuple[1]);
            await sleep(settings.localDelayDefault * 1000);
          }
        }
      }
      firstStart = false;
    } catch (e) {
      logger.error(`Main loop error: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(3000);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n正在退出...');
  exitRecording = true;
  statusServer?.close();
  setTimeout(() => process.exit(0), 3000);
});

process.on('SIGTERM', () => {
  exitRecording = true;
  process.exit(0);
});

main().catch(e => {
  logger.error(`Fatal error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
