/**
 * Proxy detector module
 */
import { execSync } from 'node:child_process';
import os from 'node:os';
import logger from '../logger.js';

export class ProxyDetector {
  constructor() {
    this.isWindows = os.platform() === 'win32';
  }

  isProxyEnabled() {
    if (this.isWindows) {
      return this._isProxyEnabledWindows();
    }
    return this._isProxyEnabledLinux();
  }

  getProxyInfo() {
    if (this.isWindows) {
      return this._getProxyInfoWindows();
    }
    return this._getProxyInfoLinux();
  }

  _isProxyEnabledWindows() {
    try {
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
        { encoding: 'utf-8', windowsHide: true }
      );
      return result.includes('0x1');
    } catch {
      return false;
    }
  }

  _getProxyInfoWindows() {
    if (!this._isProxyEnabledWindows()) return { ip: '', port: '' };
    try {
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
        { encoding: 'utf-8', windowsHide: true }
      );
      const match = result.match(/ProxyServer\s+REG_SZ\s+(.+)/);
      if (match) {
        const [ip, port] = match[1].trim().split(':');
        return { ip: ip || '', port: port || '' };
      }
    } catch (e) {
      logger.warn('No proxy information found: ' + e.message);
    }
    return { ip: '', port: '' };
  }

  _isProxyEnabledLinux() {
    const proxies = this._getProxyInfoLinux();
    return !!(proxies.ip && proxies.port);
  }

  _getProxyInfoLinux() {
    const httpProxy = process.env.http_proxy || process.env.HTTP_PROXY || '';
    const httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY || '';
    const proxy = httpProxy || httpsProxy;
    if (proxy) {
      try {
        const url = new URL(proxy);
        return { ip: url.hostname, port: url.port };
      } catch {
        const parts = proxy.replace(/^https?:\/\//, '').split(':');
        return { ip: parts[0] || '', port: parts[1] || '' };
      }
    }
    return { ip: '', port: '' };
  }
}
