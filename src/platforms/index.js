// @ts-check
/**
 * Generic platform handler - covers multiple platforms with similar patterns
 * Includes: Bilibili, Huya, Kuaishou, Douyu, YY, and many others
 */
import { BasePlatform } from './base.js';
import { asyncReq, getResponseStatus } from '../http/client.js';
import { getQualityIndex } from '../utils/index.js';
import logger from '../logger.js';
import crypto from 'node:crypto';

/** @typedef {import('../types.js').StreamInfo} StreamInfo */
/** @typedef {import('../types.js').StreamInfoOptions} StreamInfoOptions */

/**
 * GenericPlatform 构造配置
 * @typedef {Object} GenericPlatformConfig
 * @property {string} name - 平台名
 * @property {string[]} patterns - URL 匹配关键字列表
 * @property {boolean} [requiresProxy] - 是否需要代理
 * @property {(url: string, options: StreamInfoOptions) => Promise<StreamInfo>} [handler] - 自定义获取直播信息逻辑
 */

// ============ Bilibili ============
export class BilibiliPlatform extends BasePlatform {
  get name() { return 'B站直播'; }
  /** @param {string} url */
  match(url) { return url.includes('live.bilibili.com/'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      'Referer': 'https://live.bilibili.com/',
      'Cookie': cookies || ''
    };
    try {
      const roomId = url.split('live.bilibili.com/')[1]?.split('?')[0] || '';
      // Get room info
      const infoApi = `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomId}`;
      const infoStr = await asyncReq({ url: infoApi, proxyAddr, headers });
      const infoData = JSON.parse(infoStr);
      if (infoData.code !== 0) return { anchor_name: '', is_live: false };

      const liveStatus = infoData.data.live_status;
      const title = infoData.data.title;

      // Get anchor name
      const uid = infoData.data.uid;
      const userApi = `https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${roomId}`;
      const userStr = await asyncReq({ url: userApi, proxyAddr, headers });
      const userData = JSON.parse(userStr);
      const anchorName = userData.data?.info?.uname || '';

      if (liveStatus !== 1) {
        return { anchor_name: anchorName, is_live: false };
      }

      // Get stream URL
      /** @type {Record<string, string>} */
      const qualityMap = { OD: '10000', BD: '400', UHD: '250', HD: '150', SD: '80', LD: '80' };
      const qn = qualityMap[quality] || '10000';
      const playApi = `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomId}&protocol=0,1&format=0,1,2&codec=0,1&qn=${qn}&platform=web&ptype=8`;
      const playStr = await asyncReq({ url: playApi, proxyAddr, headers });
      const playData = JSON.parse(playStr);

      let playUrl = '';
      const playUrlInfo = playData.data?.playurl_info?.playurl;
      if (playUrlInfo) {
        const streams = playUrlInfo.stream || [];
        for (const stream of streams) {
          const formats = stream.format || [];
          for (const format of formats) {
            const codecs = format.codec || [];
            if (codecs.length > 0) {
              const baseUrl = codecs[0].base_url;
              const urlInfo = codecs[0].url_info?.[0];
              if (baseUrl && urlInfo) {
                playUrl = urlInfo.host + baseUrl + urlInfo.extra;
                break;
              }
            }
          }
          if (playUrl) break;
        }
      }

      return {
        anchor_name: anchorName,
        is_live: true,
        title,
        quality,
        record_url: playUrl
      };
    } catch (e) {
      logger.error(`Bilibili error: ${e instanceof Error ? e.message : String(e)}`);
      return { anchor_name: '', is_live: false };
    }
  }
}

// ============ Huya ============
export class HuyaPlatform extends BasePlatform {
  get name() { return '虎牙直播'; }
  /** @param {string} url */
  match(url) { return url.includes('www.huya.com/'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 SamsungBrowser/14.2 Chrome/87.0.4280.141 Mobile Safari/537.36',
      'Cookie': cookies || ''
    };
    try {
      const htmlStr = await asyncReq({ url, proxyAddr, headers });
      const jsonMatch = htmlStr.match(/stream: ([\s\S]*?)\n/);
      if (!jsonMatch) return { anchor_name: '', is_live: false };

      const streamData = JSON.parse(jsonMatch[1]);
      const data = streamData.data?.[0];
      if (!data) return { anchor_name: '', is_live: false };

      const gameLiveInfo = data.gameLiveInfo;
      const anchorName = gameLiveInfo.nick || '';
      const liveTitle = gameLiveInfo.introduction || '';
      const streamInfoList = data.gameStreamInfoList;

      if (!streamInfoList || streamInfoList.length === 0) {
        return { anchor_name: anchorName, is_live: false };
      }

      const cdn = streamInfoList[0];
      const flvUrl = cdn.sFlvUrl;
      const streamName = cdn.sStreamName;
      const flvSuffix = cdn.sFlvUrlSuffix;
      const hlsUrl = cdn.sHlsUrl;
      const hlsSuffix = cdn.sHlsUrlSuffix;
      const flvAntiCode = cdn.sFlvAntiCode;

      // Generate anti code
      const newAntiCode = this._getAntiCode(flvAntiCode, streamName);
      const finalFlvUrl = `${flvUrl}/${streamName}.${flvSuffix}?${newAntiCode}&ratio=`;
      const finalM3u8Url = `${hlsUrl}/${streamName}.${hlsSuffix}?${newAntiCode}&ratio=`;

      return {
        anchor_name: anchorName,
        is_live: true,
        title: liveTitle,
        quality,
        m3u8_url: finalM3u8Url,
        flv_url: finalFlvUrl,
        record_url: finalFlvUrl || finalM3u8Url
      };
    } catch (e) {
      logger.error(`Huya error: ${e instanceof Error ? e.message : String(e)}`);
      return { anchor_name: '', is_live: false };
    }
  }

  /**
   * @param {string} oldAntiCode
   * @param {string} streamName
   * @returns {string}
   */
  _getAntiCode(oldAntiCode, streamName) {
    const paramsT = 100;
    const sdkVersion = 2403051612;
    const t13 = Date.now();
    const sdkSid = t13;
    const initUuid = (Math.floor(t13 % 1e10 * 1000) + Math.floor(1000 * Math.random())) % 4294967295;
    const uid = Math.floor(Math.random() * 10000000) + 1400000000000;
    const seqId = uid + sdkSid;
    const targetUnixTime = Math.floor((t13 + 110624) / 1000);
    const wsTime = targetUnixTime.toString(16).toLowerCase();

    const urlQuery = new URLSearchParams(oldAntiCode);
    const fm = urlQuery.get('fm') || '';
    const wsSecretPf = Buffer.from(decodeURIComponent(fm), 'base64').toString().split('_')[0];
    const ctype = urlQuery.get('ctype') || '';
    const fs = urlQuery.get('fs') || '';
    const wsSecretHash = crypto.createHash('md5').update(`${seqId}|${ctype}|${paramsT}`).digest('hex');
    const wsSecret = `${wsSecretPf}_${uid}_${streamName}_${wsSecretHash}_${wsTime}`;
    const wsSecretMd5 = crypto.createHash('md5').update(wsSecret).digest('hex');

    return `wsSecret=${wsSecretMd5}&wsTime=${wsTime}&seqid=${seqId}&ctype=${ctype}&ver=1&fs=${fs}&uuid=${initUuid}&u=${uid}&t=${paramsT}&sv=${sdkVersion}&sdk_sid=${sdkSid}&codec=264`;
  }
}

// ============ Kuaishou ============
export class KuaishouPlatform extends BasePlatform {
  get name() { return '快手直播'; }
  /** @param {string} url */
  match(url) { return url.includes('live.kuaishou.com/'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      'Cookie': cookies || 'did=web_d0f1e219a1272b3a342d70f4be68a01a',
      'Referer': url
    };
    try {
      const htmlStr = await asyncReq({ url, proxyAddr, headers });
      const jsonMatch = htmlStr.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/);
      if (!jsonMatch) {
        // Try another pattern
        const liveDataMatch = htmlStr.match(/"playUrls":\s*(\[[\s\S]*?\])/);
        if (!liveDataMatch) return { anchor_name: '', is_live: false };
      }

      // Parse page data
      const dataMatch = htmlStr.match(/"liveStream":\s*(\{[\s\S]*?"playUrls"[\s\S]*?\})\s*,\s*"/);
      if (!dataMatch) return { anchor_name: '', is_live: false };

      const anchorMatch = htmlStr.match(/"name":"([^"]+)"/);
      const anchorName = anchorMatch ? anchorMatch[1] : '';

      return { anchor_name: anchorName, is_live: true, quality, record_url: '' };
    } catch (e) {
      logger.error(`Kuaishou error: ${e instanceof Error ? e.message : String(e)}`);
      return { anchor_name: '', is_live: false };
    }
  }
}

// ============ Douyu ============
export class DouyuPlatform extends BasePlatform {
  get name() { return '斗鱼直播'; }
  /** @param {string} url */
  match(url) { return url.includes('www.douyu.com/'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      'Cookie': cookies || ''
    };
    try {
      const roomId = url.split('www.douyu.com/')[1]?.split('?')[0] || '';
      // Check live status
      const betardApi = `https://www.douyu.com/betard/${roomId}`;
      const betardStr = await asyncReq({ url: betardApi, proxyAddr, headers });
      const betardData = JSON.parse(betardStr);
      const room = betardData.room;
      const anchorName = room.nickname || '';

      if (room.show_status !== 1) {
        return { anchor_name: anchorName, is_live: false };
      }

      return {
        anchor_name: anchorName,
        is_live: true,
        title: room.room_name,
        quality,
        record_url: '' // Douyu requires JS crypto for stream URL
      };
    } catch (e) {
      logger.error(`Douyu error: ${e instanceof Error ? e.message : String(e)}`);
      return { anchor_name: '', is_live: false };
    }
  }
}

// ============ YY ============
export class YYPlatform extends BasePlatform {
  get name() { return 'YY直播'; }
  /** @param {string} url */
  match(url) { return url.includes('www.yy.com/'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      'Cookie': cookies || ''
    };
    try {
      const htmlStr = await asyncReq({ url, proxyAddr, headers });
      const jsonMatch = htmlStr.match(/window\.yywebchat\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (!jsonMatch) return { anchor_name: '', is_live: false };

      const data = JSON.parse(jsonMatch[1]);
      const anchorName = data.anchorName || '';
      const avpInfoRes = data.avp_info_res;

      if (!avpInfoRes) return { anchor_name: anchorName, is_live: false };

      const streamLineAddr = avpInfoRes.stream_line_addr;
      const cdnInfo = Object.values(streamLineAddr)[0];
      const flvUrl = cdnInfo?.cdn_info?.url || '';

      return {
        anchor_name: anchorName,
        is_live: true,
        title: data.title || '',
        quality: 'OD',
        flv_url: flvUrl,
        record_url: flvUrl
      };
    } catch (e) {
      logger.error(`YY error: ${e instanceof Error ? e.message : String(e)}`);
      return { anchor_name: '', is_live: false };
    }
  }
}

// ============ TikTok ============
export class TiktokPlatform extends BasePlatform {
  get name() { return 'TikTok直播'; }
  get requiresProxy() { return true; }
  get prefersFlv() { return true; }
  /** @param {string} url */
  match(url) { return url.includes('https://www.tiktok.com/'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    const headers = {
      referer: 'https://www.tiktok.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36',
      cookie: cookies || ''
    };
    try {
      const htmlStr = await asyncReq({ url, proxyAddr, headers, timeout: 30000 });
      const jsonMatch = htmlStr.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (!jsonMatch) return { anchor_name: '', is_live: false };

      const jsonData = JSON.parse(jsonMatch[1]);
      const liveRoom = jsonData.__DEFAULT_SCOPE__?.['webapp.live-detail'];
      if (!liveRoom) return { anchor_name: '', is_live: false };

      const userInfo = liveRoom.liveRoomUserInfo;
      const user = userInfo.user;
      const anchorName = `${user.nickname}-${user.uniqueId}`;
      const status = user.status ?? 4;

      if (status !== 2) return { anchor_name: anchorName, is_live: false };

      const streamData = JSON.parse(userInfo.liveRoom.streamData.pull_data.stream_data);
      const data = streamData.data || {};

      // Get highest quality URL
      const flvUrls = [];
      for (const key of Object.keys(data)) {
        const main = data[key]?.main;
        if (main?.flv) {
          const sdkParams = JSON.parse(main.sdk_params || '{}');
          flvUrls.push({ url: main.flv, vbitrate: sdkParams.vbitrate || 0 });
        }
      }
      flvUrls.sort((a, b) => b.vbitrate - a.vbitrate);

      const m3u8Urls = [];
      for (const key of Object.keys(data)) {
        const main = data[key]?.main;
        if (main?.hls) {
          const sdkParams = JSON.parse(main.sdk_params || '{}');
          m3u8Urls.push({ url: main.hls, vbitrate: sdkParams.vbitrate || 0 });
        }
      }
      m3u8Urls.sort((a, b) => b.vbitrate - a.vbitrate);

      const flvUrl = flvUrls[0]?.url || '';
      const m3u8Url = m3u8Urls[0]?.url || '';

      return {
        anchor_name: anchorName,
        is_live: true,
        title: userInfo.liveRoom.title,
        quality,
        m3u8_url: m3u8Url,
        flv_url: flvUrl,
        record_url: m3u8Url || flvUrl
      };
    } catch (e) {
      logger.error(`TikTok error: ${e instanceof Error ? e.message : String(e)}`);
      return { anchor_name: '', is_live: false };
    }
  }
}

// ============ Generic/Custom Stream ============
export class CustomStreamPlatform extends BasePlatform {
  get name() { return '自定义录制直播'; }
  /** @param {string} url */
  match(url) { return url.includes('.m3u8') || url.includes('.flv'); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [param1]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, { quality = 'OD' } = {}) {
    /** @type {StreamInfo} */
    const result = {
      anchor_name: `自定义录制_${crypto.randomUUID().slice(0, 8)}`,
      is_live: true,
      record_url: url
    };
    if (url.includes('.flv')) {
      result.flv_url = url;
    } else {
      result.m3u8_url = url;
    }
    return result;
  }
}

// ============ Generic platform for remaining 40+ platforms ============
export class GenericPlatform extends BasePlatform {
  /**
   * @param {import('../types.js').AppSettings} settings
   * @param {GenericPlatformConfig} platformConfig
   */
  constructor(settings, platformConfig) {
    super(settings);
    /** @type {string} */
    this._name = platformConfig.name;
    /** @type {string[]} */
    this._matchPatterns = platformConfig.patterns;
    /** @type {boolean} */
    this._requiresProxy = platformConfig.requiresProxy || false;
    /** @type {GenericPlatformConfig['handler']} */
    this._apiHandler = platformConfig.handler;
  }

  get name() { return this._name; }
  get requiresProxy() { return this._requiresProxy; }
  /** @param {string} url */
  match(url) { return this._matchPatterns.some(p => url.includes(p)); }

  /**
   * @param {string} url
   * @param {StreamInfoOptions} [options]
   * @returns {Promise<StreamInfo>}
   */
  async getStreamInfo(url, options = {}) {
    if (this._apiHandler) {
      return this._apiHandler(url, options);
    }
    return { anchor_name: '', is_live: false };
  }
}
