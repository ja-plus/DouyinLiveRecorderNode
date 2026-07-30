/**
 * HTTP client module - using undici for high-performance HTTP requests with proxy support
 */
import { request, Agent, ProxyAgent, interceptors } from 'undici';
import { handleProxyAddr } from '../utils/index.js';

// dispatcher 按 代理地址+重定向次数 缓存复用，避免每次请求都新建 Agent
// 导致 TCP/TLS 重复握手以及 socket 句柄持续累积
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
    const options = {
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

    const response = await request(url, options);

    if (redirectUrl) {
      await response.body.dump();
      const location = response.headers.location;
      return (Array.isArray(location) ? location[0] : location) || url;
    }

    const text = await response.body.text();

    if (returnCookies) {
      const setCookies = response.headers['set-cookie'] || [];
      const cookies = {};
      for (const cookie of (Array.isArray(setCookies) ? setCookies : [setCookies])) {
        const [pair] = cookie.split(';');
        const [name, ...valueParts] = pair.split('=');
        if (name) cookies[name.trim()] = valueParts.join('=').trim();
      }
      return { text, cookies };
    }

    return text;
  } catch (e) {
    return String(e.message || e);
  }
}

/**
 * Check if URL responds with 200
 */
export async function getResponseStatus(url, proxyAddr = null, headers = {}, timeout = 10000) {
  try {
    const options = {
      method: 'HEAD',
      headers,
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: createDispatcher(proxyAddr, 5),
    };

    const response = await request(url, options);
    await response.body.dump();
    return response.statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Simple GET request returning text
 */
export async function simpleGet(url, headers = {}, proxyAddr = null, timeout = 15000) {
  return asyncReq({ url, headers, proxyAddr, timeout });
}

/**
 * POST request with JSON body
 */
export async function postJson(url, data, headers = {}, proxyAddr = null, timeout = 15000) {
  return asyncReq({ url, method: 'POST', json: data, headers, proxyAddr, timeout });
}
