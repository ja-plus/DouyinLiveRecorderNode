/**
 * HTTP client module - using undici for high-performance HTTP requests with proxy support
 */
import { request, Agent } from 'undici';
import { HttpsProxyAgent } from 'hpagent';
import { handleProxyAddr } from '../utils/index.js';

/**
 * Create a proxy dispatcher for undici
 */
function createProxyDispatcher(proxyAddr) {
  if (!proxyAddr) return undefined;
  const proxy = handleProxyAddr(proxyAddr);
  if (!proxy) return undefined;
  return new Agent({
    connect: {
      rejectUnauthorized: false
    }
  });
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
      maxRedirections: 10,
      headersTimeout: timeout,
      bodyTimeout: timeout,
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

    const proxy = handleProxyAddr(proxyAddr);
    if (proxy) {
      options.dispatcher = createProxyDispatcher(proxy);
    }

    const response = await request(url, options);
    const text = await response.body.text();

    if (redirectUrl) {
      return response.headers.location || url;
    }

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
      maxRedirections: 5,
      headersTimeout: timeout,
      bodyTimeout: timeout,
    };

    const proxy = handleProxyAddr(proxyAddr);
    if (proxy) {
      options.dispatcher = createProxyDispatcher(proxy);
    }

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
