// @ts-check
/**
 * HTTP client module - using undici for high-performance HTTP requests with proxy support
 */
import { request, Agent, ProxyAgent, interceptors } from 'undici';
import { handleProxyAddr } from '../utils/index.js';

/**
 * asyncReq 请求参数
 * @typedef {Object} HttpRequestOptions
 * @property {string} url
 * @property {string | null} [proxyAddr]
 * @property {Record<string, string>} [headers]
 * @property {string} [method]
 * @property {string | Object | null} [body]
 * @property {Object | null} [json]
 * @property {number} [timeout]
 * @property {boolean} [redirectUrl] - 为 true 时不跟随重定向，直接返回 location 地址
 * @property {boolean} [returnCookies] - 为 true 时返回 { text, cookies }
 * @property {boolean} [verify]
 */

// dispatcher 按 代理地址+重定向次数 缓存复用，避免每次请求都新建 Agent
// 导致 TCP/TLS 重复握手以及 socket 句柄持续累积
/** @type {Map<string, import('undici').Dispatcher>} */
const dispatcherCache = new Map();

const AGENT_OPTIONS = {
  connect: { rejectUnauthorized: false },
  connections: 16,
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 120000
};

/**
 * Create a dispatcher for undici.
 * undici v7 移除了 request() 的 maxRedirections 选项，需通过 redirect 拦截器实现重定向跟随
 * @param {string | null | undefined} proxyAddr
 * @param {number} [maxRedirections]
 * @returns {import('undici').Dispatcher}
 */
function createDispatcher(proxyAddr, maxRedirections = 10) {
  const proxy = handleProxyAddr(proxyAddr);
  const cacheKey = `${proxy || ''}|${maxRedirections}`;
  const cached = dispatcherCache.get(cacheKey);
  if (cached) return cached;

  const agent = proxy
    ? new ProxyAgent({ uri: proxy, ...AGENT_OPTIONS })
    : new Agent(AGENT_OPTIONS);
  const dispatcher = maxRedirections > 0
    ? agent.compose(interceptors.redirect({ maxRedirections }))
    : agent;

  dispatcherCache.set(cacheKey, dispatcher);
  return dispatcher;
}

/**
 * Async HTTP request
 * @param {HttpRequestOptions} options
 * @returns {Promise<string>} returnCookies 为 true 时实际返回 { text, cookies } 对象（仅内部兼容保留）
 */
export async function asyncReq({
  url,
  proxyAddr = null,
  headers = {},
  method = 'GET',
  body = null,
  json = null,
  timeout = 20000,
  redirectUrl = false,
  returnCookies = false,
  verify = false
}) {
  try {
    // 运行时 options 会连同 url 一起传给 undici.request()
    /** @type {{ url: string, method: string, headers: Record<string, string>, headersTimeout: number, bodyTimeout: number, dispatcher: import('undici').Dispatcher, body?: string }} */
    const options = {
      url,
      method,
      headers: { ...headers },
      headersTimeout: timeout,
      bodyTimeout: timeout,
      // 取跳转地址时不跟随重定向，直接读取 location 头
      dispatcher: createDispatcher(proxyAddr, redirectUrl ? 0 : 10),
    };

    if (body) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!options.headers['content-type']) {
        options.headers['content-type'] = 'application/x-www-form-urlencoded';
      }
    }
    if (json) {
      options.body = JSON.stringify(json);
      options.headers['content-type'] = 'application/json';
    }

    const response = await request(url, /** @type {any} */ (options));

    if (redirectUrl) {
      await response.body.dump();
      const location = response.headers.location;
      return (Array.isArray(location) ? location[0] : location) || url;
    }

    const text = await response.body.text();

    if (returnCookies) {
      const setCookies = response.headers['set-cookie'] || [];
      /** @type {Record<string, string>} */
      const cookies = {};
      for (const cookie of (Array.isArray(setCookies) ? setCookies : [setCookies])) {
        const [pair] = cookie.split(';');
        const [name, ...valueParts] = pair.split('=');
        if (name) cookies[name.trim()] = valueParts.join('=').trim();
      }
      return /** @type {any} */ ({ text, cookies });
    }

    return text;
  } catch (e) {
    return e instanceof Error ? String(e.message || e) : String(e);
  }
}

/**
 * Check if URL responds with 200
 * @param {string} url
 * @param {string | null} [proxyAddr]
 * @param {Record<string, string>} [headers]
 * @param {number} [timeout]
 * @returns {Promise<boolean>}
 */
export async function getResponseStatus(url, proxyAddr = null, headers = {}, timeout = 10000) {
  try {
    /** @type {{ url: string, method: string, headers: Record<string, string>, headersTimeout: number, bodyTimeout: number, dispatcher: import('undici').Dispatcher }} */
    const options = {
      url,
      method: 'HEAD',
      headers,
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: createDispatcher(proxyAddr, 5),
    };

    const response = await request(url, /** @type {any} */ (options));
    await response.body.dump();
    return response.statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Simple GET request returning text
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @param {string | null} [proxyAddr]
 * @param {number} [timeout]
 * @returns {Promise<string>}
 */
export async function simpleGet(url, headers = {}, proxyAddr = null, timeout = 15000) {
  return asyncReq({ url, headers, proxyAddr, timeout });
}

/**
 * POST request with JSON body
 * @param {string} url
 * @param {Object} data
 * @param {Record<string, string>} [headers]
 * @param {string | null} [proxyAddr]
 * @param {number} [timeout]
 * @returns {Promise<string>}
 */
export async function postJson(url, data, headers = {}, proxyAddr = null, timeout = 15000) {
  return asyncReq({ url, method: 'POST', json: data, headers, proxyAddr, timeout });
}
