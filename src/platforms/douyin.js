/**
 * Douyin (抖音) platform handler
 */
import { BasePlatform } from './base.js';
import { asyncReq, getResponseStatus } from '../http/client.js';
import { abSign } from '../crypto/ab-sign.js';
import { getQualityIndex } from '../utils/index.js';
import logger from '../logger.js';

export class DouyinPlatform extends BasePlatform {
  get name() { return '抖音直播'; }
  get prefersFlv() { return true; }

  match(url) {
    return url.includes('douyin.com/');
  }

  async getStreamInfo(url, { proxyAddr = null, cookies = '', quality = 'OD' } = {}) {
    if (url.includes('v.douyin.com') || url.includes('/user/')) {
      return this._getAppStreamData(url, proxyAddr, cookies, quality);
    }
    return this._getWebStreamData(url, proxyAddr, cookies, quality);
  }

  async _getWebStreamData(url, proxyAddr, cookies, quality) {
    const headers = {
      cookie: cookies || 'ttwid=1%7C2iDIYVmjzMcpZ20fcaFde0VghXAA3NaNXE_SLR68IyE%7C1761045455%7Cab35197d5cfb21df6cbb2fa7ef1c9262206b062c315b9d04da746d0b37dfbc7d',
      referer: 'https://live.douyin.com/335354047186',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.97 Safari/537.36 Core/1.116.567.400 QQBrowser/19.7.6764.400'
    };

    try {
      const webRid = url.split('?')[0].split('live.douyin.com/').pop();
      const params = new URLSearchParams({
        aid: '6383', app_name: 'douyin_web', live_id: '1',
        device_platform: 'web', language: 'zh-CN', browser_language: 'zh-CN',
        browser_platform: 'Win32', browser_name: 'Chrome', browser_version: '116.0.0.0',
        web_rid: webRid, msToken: ''
      });

      let api = `https://live.douyin.com/webcast/room/web/enter/?${params.toString()}`;
      const aBogus = abSign(new URL(api).search.slice(1), headers['user-agent']);
      api += '&a_bogus=' + aBogus;

      const jsonStr = await asyncReq({ url: api, proxyAddr, headers });
      if (!jsonStr) throw new Error('triggered risk control');

      const jsonData = JSON.parse(jsonStr).data;
      if (!jsonData.data) throw new Error('VR live not supported');

      const roomData = jsonData.data[0];
      roomData.anchor_name = jsonData.user.nickname;

      return this._parseStreamUrl(roomData, quality, proxyAddr);
    } catch (e) {
      logger.error(`Douyin web error: ${e.message}`);
      return { anchor_name: '', is_live: false };
    }
  }

  async _getAppStreamData(url, proxyAddr, cookies, quality) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.8',
      'Referer': 'https://live.douyin.com/',
      'Cookie': cookies || 'ttwid=1%7CB1qls3GdnZhUov9o2NxOMxxYS2ff6OSvEWbv0ytbES4%7C1680522049'
    };

    try {
      // Try to get sec_user_id from short URL
      const resp = await asyncReq({ url, proxyAddr, headers, redirectUrl: true });
      const redirectUrl = resp;

      let roomId, secUserId;
      if (redirectUrl.includes('reflow/')) {
        const match = redirectUrl.match(/sec_user_id=([\w_-]+)&?/);
        if (match) {
          secUserId = match[1];
          roomId = redirectUrl.split('?')[0].split('/').pop();
        }
      }

      if (!roomId) {
        // Fallback: try web method
        return this._getWebStreamData(url, proxyAddr, cookies, quality);
      }

      const appParams = new URLSearchParams({
        verifyFp: 'verify_hwj52020_7szNlAB7_pxNY_48Vh_ALKF_GA1Uf3yteoOY',
        type_id: '0', live_id: '1', room_id: roomId,
        sec_user_id: secUserId, version_code: '99.99.99', app_id: '1128'
      });

      let api2 = `https://webcast.amemv.com/webcast/room/reflow/info/?${appParams.toString()}`;
      const aBogus = abSign(new URL(api2).search.slice(1), headers['User-Agent']);
      api2 += '&a_bogus=' + aBogus;

      const jsonStr2 = await asyncReq({ url: api2, proxyAddr, headers });
      if (!jsonStr2) throw new Error('triggered risk control');

      const jsonData2 = JSON.parse(jsonStr2).data;
      if (!jsonData2.room) throw new Error('VR live not supported');

      const roomData = jsonData2.room;
      roomData.anchor_name = roomData.owner.nickname;

      return this._parseStreamUrl(roomData, quality, proxyAddr);
    } catch (e) {
      logger.error(`Douyin app error: ${e.message}`);
      return { anchor_name: '', is_live: false };
    }
  }

  async _parseStreamUrl(jsonData, videoQuality, proxyAddr) {
    const anchorName = jsonData.anchor_name;
    const result = { anchor_name: anchorName, is_live: false };
    const status = jsonData.status ?? 4;

    if (status === 2) {
      const streamUrl = jsonData.stream_url;
      if (!streamUrl) {
        throw new Error('Stream type not supported on PC, use app share link');
      }

      const flvUrlDict = streamUrl.flv_pull_url || {};
      const m3u8UrlDict = streamUrl.hls_pull_url_map || {};
      let flvUrlList = Object.values(flvUrlDict);
      let m3u8UrlList = Object.values(m3u8UrlDict);

      while (flvUrlList.length < 5) flvUrlList.push(flvUrlList[flvUrlList.length - 1]);
      while (m3u8UrlList.length < 5) m3u8UrlList.push(m3u8UrlList[m3u8UrlList.length - 1]);

      const [qualityStr, qualityIndex] = getQualityIndex(videoQuality);
      let m3u8Url = m3u8UrlList[qualityIndex];
      let flvUrl = flvUrlList[qualityIndex];

      const ok = await getResponseStatus(m3u8Url, proxyAddr);
      if (!ok) {
        const index = qualityIndex < 4 ? qualityIndex + 1 : qualityIndex - 1;
        m3u8Url = m3u8UrlList[index];
        flvUrl = flvUrlList[index];
      }

      Object.assign(result, {
        is_live: true,
        title: jsonData.title,
        quality: qualityStr,
        m3u8_url: m3u8Url,
        flv_url: flvUrl,
        record_url: m3u8Url || flvUrl,
      });
    }
    return result;
  }
}
