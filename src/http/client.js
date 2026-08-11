// @ts-check
/**
 * HTTP client module - using undici for high-performance HTTP requests with proxy support
 */
import { request, Agent, ProxyAgent, interceptors } from 'undici';
import { handleProxyAddr } from '../utils/index.js';
import logger from '../logger.js';

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

// Bun 内置的 undici 兼容层不完整（缺 Agent.compose / body.dump 等），
// 但 Bun.fetch 原生支持 proxy、tls、redirect 等选项，比 undici 兼容层更合适。
// 因此 Node 走 undici.request + compose 拦截器路径（asyncReqWithCompose），
// Bun 走 Bun.fetch 原生路径（asyncReqBunFetch）。
// 两个运行时各自独立实现，由 SUPPORTS_COMPOSE 在入口处分发。
const SUPPORTS_COMPOSE = typeof Agent.prototype.compose === 'function';
const DEFAULT_MAX_REDIRECTS = 10;

/**
 * 读取响应头中的 Location 值（兼容数组/字符串两种形态）
 * @param {string[] | string | undefined} location
 * @returns {string | null}
 */
function readLocationHeader(location) {
  if (!location) return null;
  if (Array.isArray(location)) return location[0] || null;
  return typeof location === 'string' ? location : null;
}

/**
 * 丢弃响应体以释放连接（keep-alive 复用，仅 Node 路径使用）。
 * 优先用 undici 的 body.dump() 高效丢弃；不存在时回退到 text() 读取后丢弃。
 * @param {{ dump?: () => Promise<void>, text: () => Promise<string> } | undefined} body
 * @returns {Promise<void>}
 */
async function dumpBody(body) {
  if (!body) return;
  if (typeof body.dump === 'function') {
    await body.dump();
    return;
  }
  try { await body.text(); } catch { /* ignore */ }
}

/**
 * 从 set-cookie 头解析出 name->value 字典
 * @param {string[] | string} setCookies
 * @returns {Record<string, string>}
 */
function parseSetCookies(setCookies) {
  /** @type {Record<string, string>} */
  const cookies = {};
  for (const cookie of (Array.isArray(setCookies) ? setCookies : [setCookies])) {
    const [pair] = cookie.split(';');
    const [name, ...valueParts] = pair.split('=');
    if (name) cookies[name.trim()] = valueParts.join('=').trim();
  }
  return cookies;
}

// ============ Node 路径：compose 拦截器自动跟随重定向 ============

/**
 * 创建带 redirect 拦截器的 dispatcher（仅 Node 下可用）。
 * undici v7 移除了 request() 的 maxRedirections 选项，需通过 compose 拦截器实现重定向跟随。
 * @param {string | null | undefined} proxyAddr
 * @param {number} maxRedirections
 * @returns {import('undici').Dispatcher}
 */
function createDispatcherWithRedirect(proxyAddr, maxRedirections) {
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
 * Node 路径请求实现：dispatcher 自带 redirect 拦截器，无需手动处理 3xx。
 * @param {HttpRequestOptions} opts
 * @returns {Promise<string>}
 */
async function asyncReqWithCompose({
  url,
  proxyAddr = null,
  headers = {},
  method = 'GET',
  body = null,
  json = null,
  timeout = 20000,
  redirectUrl = false,
  returnCookies = false
}) {
  const maxRedirects = redirectUrl ? 0 : DEFAULT_MAX_REDIRECTS;
  try {
    /** @type {{ url: string, method: string, headers: Record<string, string>, headersTimeout: number, bodyTimeout: number, dispatcher: import('undici').Dispatcher, body?: string }} */
    const options = {
      url,
      method,
      headers: { ...headers },
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: createDispatcherWithRedirect(proxyAddr, maxRedirects),
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
      await dumpBody(response.body);
      const location = readLocationHeader(response.headers.location);
      return location || url;
    }

    const text = await response.body.text();

    if (returnCookies) {
      const setCookies = response.headers['set-cookie'] || [];
      return /** @type {any} */ ({ text, cookies: parseSetCookies(setCookies) });
    }

    return text;
  } catch (e) {
    const errMsg = e instanceof Error ? (e.message || String(e)) : String(e);
    logger.error(`HTTP 请求失败 ${url}: ${errMsg}`);
    return '';
  }
}

// ============ Bun 路径：Bun.fetch 原生请求 ============

/**
 * Bun 路径请求实现：基于 Bun.fetch。
 * Bun.fetch 原生支持 proxy（per-request 代理）、tls（跳过证书校验）、redirect（自动/手动跟随），
 * 无需 undici Agent/compose/body.dump 等不完整的兼容层。
 *
 * 注意：proxy 和 tls 选项是 Bun 特有的，Node 全局 fetch 不支持（Node 走 undici dispatcher 路径）。
 * @param {HttpRequestOptions} opts
 * @returns {Promise<string>}
 */
async function asyncReqBunFetch({
  url,
  proxyAddr = null,
  headers = {},
  method = 'GET',
  body = null,
  json = null,
  timeout = 20000,
  redirectUrl = false,
  returnCookies = false
}) {
  const proxy = handleProxyAddr(proxyAddr);
  // Bun.fetch 选项：proxy/tls 是 Bun 特有扩展，标准 Fetch API 类型里没有，用 any 绕过类型检查
  /** @type {any} */
  const opts = {
    method,
    headers: { ...headers },
    // redirectUrl=true 时不跟随（取 Location）；否则自动跟随（Bun 默认最多 20 次）
    redirect: redirectUrl ? 'manual' : 'follow',
    // 对应 undici AGENT_OPTIONS.connect.rejectUnauthorized: false
    tls: { rejectUnauthorized: false },
  };
  if (proxy) opts.proxy = proxy;

  if (body) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!opts.headers['content-type']) {
      opts.headers['content-type'] = 'application/x-www-form-urlencoded';
    }
  }
  if (json) {
    opts.body = JSON.stringify(json);
    opts.headers['content-type'] = 'application/json';
  }

  // 超时：AbortController（Fetch API 标准方式，对应 undici 的 headersTimeout/bodyTimeout）
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  opts.signal = ctrl.signal;

  try {
    const response = await fetch(url, opts);

    if (redirectUrl) {
      // 不跟随重定向，返回 Location（消费 body 释放连接）
      const location = response.headers.get('location');
      try { await response.text(); } catch { /* ignore */ }
      return location || url;
    }

    const text = await response.text();

    if (returnCookies) {
      // Fetch API 用 getSetCookie() 获取所有 set-cookie 头（返回数组）
      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
      return /** @type {any} */ ({ text, cookies: parseSetCookies(setCookies) });
    }

    return text;
  } catch (e) {
    const errMsg = e instanceof Error ? (e.message || String(e)) : String(e);
    logger.error(`HTTP 请求失败 ${url}: ${errMsg}`);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// ============ 统一入口：按运行时分发到对应实现 ============

/**
 * Async HTTP request
 * @param {HttpRequestOptions} options
 * @returns {Promise<string>} returnCookies 为 true 时实际返回 { text, cookies } 对象（仅内部兼容保留）
 */
export function asyncReq(options) {
  return SUPPORTS_COMPOSE
    ? asyncReqWithCompose(options)
    : asyncReqBunFetch(options);
}

/**
 * Check if URL responds with 200（Node 路径：dispatcher 自带 redirect 拦截器自动跟随）
 * @param {string} url
 * @param {string | null} proxyAddr
 * @param {Record<string, string>} headers
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
async function getResponseStatusCompose(url, proxyAddr, headers, timeout) {
  try {
    /** @type {{ url: string, method: string, headers: Record<string, string>, headersTimeout: number, bodyTimeout: number, dispatcher: import('undici').Dispatcher }} */
    const options = {
      url,
      method: 'HEAD',
      headers,
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: createDispatcherWithRedirect(proxyAddr, 5),
    };

    const response = await request(url, /** @type {any} */ (options));
    await dumpBody(response.body);
    return response.statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Check if URL responds with 200（Bun 路径：Bun.fetch 自动跟随重定向）
 * @param {string} url
 * @param {string | null} proxyAddr
 * @param {Record<string, string>} headers
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
async function getResponseStatusBunFetch(url, proxyAddr, headers, timeout) {
  const proxy = handleProxyAddr(proxyAddr);
  /** @type {any} */
  const opts = {
    method: 'HEAD',
    headers,
    redirect: 'follow',
    tls: { rejectUnauthorized: false },
  };
  if (proxy) opts.proxy = proxy;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  opts.signal = ctrl.signal;

  try {
    const response = await fetch(url, opts);
    // 消费 body 释放连接（HEAD 响应通常无 body，text() 返回空串）
    try { await response.text(); } catch { /* ignore */ }
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
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
export function getResponseStatus(url, proxyAddr = null, headers = {}, timeout = 10000) {
  return SUPPORTS_COMPOSE
    ? getResponseStatusCompose(url, proxyAddr, headers, timeout)
    : getResponseStatusBunFetch(url, proxyAddr, headers, timeout);
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
