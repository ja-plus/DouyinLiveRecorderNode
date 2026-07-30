/**
 * Recorder module - handles ffmpeg-based recording
 */
import { spawn, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import logger from '../logger.js';
import { sleep, getFilePaths } from '../utils/index.js';
import { printColored, Color } from '../utils/color.js';

/**
 * Check if ffmpeg is available
 */
export function checkFfmpeg() {
  return new Promise((resolve) => {
    try {
      const proc = spawn('ffmpeg', ['-version'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      proc.stdout.on('data', (d) => { output += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) {
          const lines = output.split('\n');
          console.log(lines[0]);
          if (lines[1]) console.log(lines[1]);
          resolve(true);
        } else {
          resolve(false);
        }
      });
      proc.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Build ffmpeg command for recording
 */
export function buildFfmpegCommand({
  sourceUrl, saveFilePath, proxyAddr = null, platform = '',
  splitVideoByTime = false, splitTime = '1800', videoSaveType = 'TS',
  recordUrl = '', enableHttps = false, isOverseas = false
}) {
  const userAgent = 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/87.0.4280.141 Mobile Safari/537.36';

  // 直播流格式明确，探测缓存无需过大，降低 probesize/analyzeduration 可减少
  // 每路 ffmpeg 启动时的内存占用并加快出画
  let rwTimeout = '15000000';
  let analyzeduration = '2000000';
  let probesize = '1000000';
  let bufsize = '8000k';
  let maxMuxingQueueSize = '1024';

  if (isOverseas) {
    rwTimeout = '50000000';
    analyzeduration = '4000000';
    probesize = '2000000';
    bufsize = '15000k';
    maxMuxingQueueSize = '2048';
  }

  // 录制实时直播流不使用 -re（按帧率节流仅适用于推流本地文件场景，
  // 对直播输入只会引入额外缓冲与节流开销）
  const cmd = [
    'ffmpeg', '-y',
    '-rw_timeout', rwTimeout,
    '-loglevel', 'error',
    '-hide_banner',
    '-user_agent', userAgent,
    '-protocol_whitelist', 'rtmp,crypto,file,http,https,tcp,tls,udp,rtp,httpproxy',
    '-thread_queue_size', '1024',
    '-analyzeduration', analyzeduration,
    '-probesize', probesize,
    '-fflags', '+discardcorrupt',
    '-i', sourceUrl,
    '-bufsize', bufsize,
    '-sn', '-dn',
    '-reconnect_delay_max', '60',
    '-reconnect_streamed', '-reconnect_at_eof',
    '-max_muxing_queue_size', maxMuxingQueueSize,
    '-correct_ts_overflow', '1',
    '-avoid_negative_ts', '1'
  ];

  // Add headers for specific platforms（插入到 -i 之前才能作为输入选项生效）
  const recordHeaders = getRecordHeaders(platform, recordUrl);
  if (recordHeaders) {
    cmd.splice(cmd.indexOf('-i'), 0, '-headers', recordHeaders);
  }

  // Add proxy
  if (proxyAddr) {
    cmd.splice(1, 0, '-http_proxy', proxyAddr);
  }

  // Add output format options
  const outputCmd = getOutputCommand(videoSaveType, splitVideoByTime, splitTime, saveFilePath);
  cmd.push(...outputCmd);

  return cmd;
}

function getOutputCommand(saveType, splitByTime, splitTime, savePath) {
  switch (saveType) {
    case 'FLV':
      if (splitByTime) {
        return ['-map', '0', '-c:v', 'copy', '-c:a', 'copy', '-bsf:a', 'aac_adtstoasc',
          '-f', 'segment', '-segment_time', splitTime, '-segment_format', 'flv',
          '-reset_timestamps', '1', savePath];
      }
      return ['-map', '0', '-c:v', 'copy', '-c:a', 'copy', '-bsf:a', 'aac_adtstoasc', '-f', 'flv', savePath];

    case 'MKV':
      if (splitByTime) {
        return ['-flags', 'global_header', '-c:v', 'copy', '-c:a', 'aac', '-map', '0',
          '-f', 'segment', '-segment_time', splitTime, '-segment_format', 'matroska',
          '-reset_timestamps', '1', savePath];
      }
      return ['-flags', 'global_header', '-map', '0', '-c:v', 'copy', '-c:a', 'copy', '-f', 'matroska', savePath];

    case 'MP4':
      if (splitByTime) {
        return ['-c:v', 'copy', '-c:a', 'aac', '-map', '0',
          '-f', 'segment', '-segment_time', splitTime, '-segment_format', 'mp4',
          '-reset_timestamps', '1', '-movflags', '+frag_keyframe+empty_moov', savePath];
      }
      return ['-map', '0', '-c:v', 'copy', '-c:a', 'copy', '-f', 'mp4', savePath];

    case 'MP3':
    case 'MP3音频':
      if (splitByTime) {
        return ['-map', '0:a', '-c:a', 'libmp3lame', '-ab', '320k',
          '-f', 'segment', '-segment_time', splitTime, '-reset_timestamps', '1', savePath];
      }
      return ['-map', '0:a', '-c:a', 'libmp3lame', '-ab', '320k', savePath];

    case 'M4A':
    case 'M4A音频':
      if (splitByTime) {
        return ['-map', '0:a', '-c:a', 'aac', '-bsf:a', 'aac_adtstoasc', '-ab', '320k',
          '-f', 'segment', '-segment_time', splitTime, '-segment_format', 'mpegts',
          '-reset_timestamps', '1', savePath];
      }
      return ['-map', '0:a', '-c:a', 'aac', '-bsf:a', 'aac_adtstoasc', '-ab', '320k',
        '-movflags', '+faststart', savePath];

    case 'TS':
    default:
      if (splitByTime) {
        return ['-c:v', 'copy', '-c:a', 'copy', '-map', '0',
          '-f', 'segment', '-segment_time', splitTime, '-segment_format', 'mpegts',
          '-reset_timestamps', '1', savePath];
      }
      return ['-c:v', 'copy', '-c:a', 'copy', '-map', '0', '-f', 'mpegts', savePath];
  }
}

/**
 * Get record headers for specific platforms
 */
function getRecordHeaders(platform, liveUrl) {
  const liveDomain = liveUrl.split('/').slice(0, 3).join('/');
  const headers = {
    'PandaTV': 'origin:https://www.pandalive.co.kr',
    'WinkTV': 'origin:https://www.winktv.co.kr',
    'PopkonTV': 'origin:https://www.popkontv.com',
    'FlexTV': 'origin:https://www.flextv.co.kr',
    '千度热播': 'referer:https://qiandurebo.com',
    '17Live': 'referer:https://17.live/en/live/6302408',
    '浪Live': 'referer:https://www.lang.live',
    'shopee': `origin:${liveDomain}`,
    'Blued直播': 'referer:https://app.blued.cn'
  };
  return headers[platform] || null;
}

/**
 * Run ffmpeg recording process
 * Returns a promise that resolves when recording stops
 */
export function runRecording(ffmpegCommand, { recordName, recordUrl, onStop }) {
  return new Promise((resolve) => {
    // stdout/stderr 不消费时必须 ignore：pipe 缓冲区被 ffmpeg 日志写满后
    // 会阻塞 ffmpeg 导致录制假死；stdin 保留用于发送 'q' 优雅停止
    const proc = spawn(ffmpegCommand[0], ffmpegCommand.slice(1), {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true
    });

    let stopped = false;

    const checkInterval = setInterval(() => {
      if (onStop && onStop()) {
        stopped = true;
        clearInterval(checkInterval);
        // Send 'q' to gracefully stop ffmpeg
        if (proc.stdin) {
          proc.stdin.write('q');
          proc.stdin.end();
        }
        setTimeout(() => {
          try { proc.kill('SIGINT'); } catch {}
        }, 3000);
      }
    }, 1000);

    proc.on('close', (code) => {
      clearInterval(checkInterval);
      const stopTime = new Date().toLocaleString('zh-CN');
      if (code === 0 && !stopped) {
        console.log(`\n${recordName} ${stopTime} 直播录制完成\n`);
      } else if (stopped) {
        printColored(`[${recordName}]录制时已被注释,本条线程将会退出`, Color.YELLOW);
      } else {
        printColored(`\n${recordName} ${stopTime} 直播录制出错,返回码: ${code}\n`, Color.RED);
      }
      resolve({ code, stopped });
    });

    proc.on('error', (err) => {
      clearInterval(checkInterval);
      logger.error(`ffmpeg spawn error: ${err.message}`);
      resolve({ code: -1, stopped: false });
    });
  });
}

/**
 * Convert TS to MP4
 */
export function convertsMp4(filePath, deleteOriginal = true, toH264 = false) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      resolve(false);
      return;
    }

    const outputPath = filePath.replace(/\.[^.]+$/, '.mp4');
    let cmd;
    if (toH264) {
      cmd = `ffmpeg -i "${filePath}" -c:v libx264 -preset veryfast -crf 23 -vf format=yuv420p -c:a copy -f mp4 "${outputPath}"`;
    } else {
      cmd = `ffmpeg -i "${filePath}" -c:v copy -c:a copy -f mp4 "${outputPath}"`;
    }

    exec(cmd, { windowsHide: true }, (error) => {
      if (error) {
        logger.error(`MP4 conversion error: ${error.message}`);
        resolve(false);
      } else {
        if (deleteOriginal) {
          setTimeout(() => {
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
          }, 1000);
        }
        resolve(true);
      }
    });
  });
}

/**
 * Segment video
 */
export function segmentVideo(inputPath, outputPath, format, segmentTime, deleteOriginal = true) {
  return new Promise((resolve) => {
    if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size === 0) {
      resolve(false);
      return;
    }

    const cmd = `ffmpeg -i "${inputPath}" -c:v copy -c:a copy -map 0 -f segment -segment_time ${segmentTime} -segment_format ${format} -reset_timestamps 1 -movflags +frag_keyframe+empty_moov "${outputPath}"`;

    exec(cmd, { windowsHide: true }, (error) => {
      if (error) {
        logger.error(`Segment error: ${error.message}`);
        resolve(false);
      } else {
        if (deleteOriginal) {
          setTimeout(() => {
            try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
          }, 1000);
        }
        resolve(true);
      }
    });
  });
}
