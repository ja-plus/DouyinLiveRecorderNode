/**
 * Platform base class - all platform handlers extend this
 */
export class BasePlatform {
  constructor(settings) {
    this.settings = settings;
  }

  /**
   * Check if this platform handles the given URL
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    return false;
  }

  /**
   * Get platform name
   * @returns {string}
   */
  get name() {
    return '未知平台';
  }

  /**
   * Get stream info for the given URL
   * @param {string} url
   * @param {object} options - { proxyAddr, cookies, quality }
   * @returns {Promise<object>} - { anchor_name, is_live, title, record_url, flv_url, m3u8_url, quality }
   */
  async getStreamInfo(url, options = {}) {
    return { anchor_name: '', is_live: false };
  }

  /**
   * Whether this platform requires proxy
   */
  get requiresProxy() {
    return false;
  }

  /**
   * Whether this platform prefers FLV format
   */
  get prefersFlv() {
    return false;
  }
}
