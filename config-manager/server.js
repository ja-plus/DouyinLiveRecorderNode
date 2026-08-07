// @ts-check
/**
 * URL Config Manager - Fastify Web Server
 * Provides REST API for managing URL_config.ini and config.ini
 * Framework: Fastify (high-performance, HTTP/2 support, schema validation)
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @typedef {import('../src/types.js').ConfigManagerSettings} ConfigManagerSettings */

/**
 * URL_config.ini 单条监测项
 * @typedef {Object} UrlConfigItem
 * @property {boolean} enabled - 是否启用（未被 # 注释）
 * @property {string} quality - 画质（可为空，空则用默认）
 * @property {string} url - 直播地址
 * @property {string} name - 主播名（可为空）
 */

/**
 * config.ini 单个配置节
 * @typedef {Object} AppConfigSection
 * @property {string} name - 节名
 * @property {{ key: string, value: string }[]} items - 键值对列表
 */

/**
 * 录制文件条目
 * @typedef {Object} RecordingFileItem
 * @property {string} file - 相对录制根目录的路径（/ 分隔）
 * @property {string} name - 文件名
 * @property {string} ext - 扩展名（不含点）
 * @property {number} size - 字节数
 * @property {number} mtime - 修改时间戳（毫秒）
 */

/**
 * startServer 启动后挂载在实例上的访问信息
 * @typedef {Object} ConfigManagerHttpInfo
 * @property {string} host
 * @property {number} port
 * @property {string} protocol - http/https
 * @property {string} scheme - HTTP/1.1 或 HTTP/2
 * @property {string} url
 */

/** @typedef {import('fastify').FastifyInstance & { configManagerHttpInfo: ConfigManagerHttpInfo }} ManagedFastify */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'URL_config.ini');
const APP_CONFIG_PATH = path.join(CONFIG_DIR, 'config.ini');
const ENCODING = 'utf-8';
const QUALITIES = ['原画', '蓝光', '超清', '高清', '标清', '流畅'];
const VIDEO_EXTS = new Set(['.flv', '.ts', '.mp4', '.mkv', '.mp3', '.m4a']);
const OWN_CONFIG_PATH = path.join(__dirname, 'config.js');

// ============ Server Settings (from config-manager/config.js) ============
/** @type {ConfigManagerSettings} */
const DEFAULT_SETTINGS = {
  enableHttp2: false,
  host: '127.0.0.1',
  port: 5000,
  certPath: '',
  keyPath: '',
};

/** @returns {Promise<ConfigManagerSettings>} */
async function getServerSettings() {
  const cfg = { ...DEFAULT_SETTINGS };
  try {
    const fileUrl = pathToFileURL(OWN_CONFIG_PATH).href;
    const mod = await import(fileUrl + '?t=' + Date.now());
    const obj = mod?.default || {};
    if (typeof obj !== 'object') return cfg;
    if (typeof obj.enableHttp2 === 'boolean') cfg.enableHttp2 = obj.enableHttp2;
    else if (obj.enableHttp2 === '是' || obj.enableHttp2 === 'true' || obj.enableHttp2 === 1 || obj.enableHttp2 === '1') cfg.enableHttp2 = true;
    if (typeof obj.host === 'string' && obj.host.trim()) cfg.host = obj.host.trim();
    const portVal = parseInt(obj.port);
    if (!Number.isNaN(portVal) && portVal > 0 && portVal < 65536) cfg.port = portVal;
    if (typeof obj.certPath === 'string') {
      const v = obj.certPath.trim();
      if (v) cfg.certPath = path.isAbsolute(v) ? v : path.resolve(ROOT_DIR, v);
    }
    if (typeof obj.keyPath === 'string') {
      const v = obj.keyPath.trim();
      if (v) cfg.keyPath = path.isAbsolute(v) ? v : path.resolve(ROOT_DIR, v);
    }
  } catch {
    // 无配置文件或解析失败时使用默认值
  }
  return cfg;
}

/**
 * @param {{ certPath: string, keyPath: string }} param0
 * @returns {{ cert: Buffer, key: Buffer, allowHTTP1: boolean } | null}
 */
function loadTlsOptions({ certPath, keyPath }) {
  const hasCert = certPath && fs.existsSync(certPath);
  const hasKey = keyPath && fs.existsSync(keyPath);
  if (hasCert && hasKey) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      allowHTTP1: true, // ALPN 协商失败时回退 HTTP/1.1
      // 注意：不显式设置 ALPNProtocols，由 Node.js http2.createSecureServer 自动管理
      // 显式设置可能导致部分浏览器（Chrome）TLS 握手异常
    };
  }
  return null;
}

/**
 * 启动前检测 host:port 是否已被其他进程占用；若被占，返回 { ok:false, reason:'...' }
 * @param {string} host
 * @param {number} port
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
function checkPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (/** @type {NodeJS.ErrnoException} */ e) => {
      try { server.close(); } catch {}
      if (e?.code === 'EADDRINUSE') resolve({ ok: false, reason: 'EADDRINUSE' });
      else resolve({ ok: false, reason: e?.code || String(e?.message || e) });
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve({ ok: true }));
    });
  });
}

// ============ URL Config Parsing ============
/**
 * @param {string} content
 * @returns {{ quality: string, url: string, name: string }}
 */
function parseContent(content) {
  const parts = content.split(/[,，]/).map(p => p.trim()).filter(p => p !== '');
  let quality = '';
  let url = '';
  let name = '';
  let idx = 0;

  if (parts.length > 0 && QUALITIES.includes(parts[0])) {
    quality = parts[0];
    idx = 1;
  }
  if (idx < parts.length) {
    url = parts[idx];
    idx++;
  }
  for (const p of parts.slice(idx)) {
    const m = p.match(/^主播\s*[:：]\s*(.*)$/);
    if (m) {
      name = m[1].trim();
    } else if (!name) {
      name = p;
    }
  }
  return { quality, url, name };
}

/**
 * @param {string} text
 * @returns {UrlConfigItem[]}
 */
function parseIni(text) {
  /** @type {UrlConfigItem[]} */
  const items = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    const enabled = !line.startsWith('#');
    const content = line.replace(/^#+/, '').trim();
    if (content === '') continue;
    const { quality, url, name } = parseContent(content);
    items.push({ enabled, quality, url, name });
  }
  return items;
}

/**
 * @param {UrlConfigItem} item
 * @returns {string}
 */
function buildLine(item) {
  const url = (item.url || '').trim();
  const name = (item.name || '').trim();
  const quality = (item.quality || '').trim();
  let core = url;
  if (quality) core = `${quality},${core}`;
  if (name) core = `${core},主播: ${name}`;
  const prefix = item.enabled ? '' : '#';
  return prefix + core;
}

/**
 * @param {UrlConfigItem[]} items
 * @returns {string}
 */
function buildIni(items) {
  const lines = items.filter(it => (it.url || '').trim()).map(buildLine);
  return lines.join('\n') + (lines.length ? '\n' : '');
}

// ============ App Config Parsing ============
/**
 * @param {string} text
 * @returns {AppConfigSection[]}
 */
function parseAppConfig(text) {
  /** @type {AppConfigSection[]} */
  const sections = [];
  /** @type {AppConfigSection | null} */
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const m = line.match(/^\[(.+)\]$/);
    if (m) {
      current = { name: m[1].trim(), items: [] };
      sections.push(current);
      continue;
    }
    if (!current || !line.includes('=')) continue;
    const eqIdx = line.indexOf('=');
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    current.items.push({ key, value });
  }
  return sections;
}

// 从 config.ini 读取默认画质（[录制设置] -> 原画|超清|高清|标清|流畅），读取失败则回退为 原画
/** @returns {string} */
function getDefaultQuality() {
  try {
    if (fs.existsSync(APP_CONFIG_PATH)) {
      const sections = parseAppConfig(fs.readFileSync(APP_CONFIG_PATH, ENCODING));
      const sec = sections.find(s => s.name === '录制设置');
      const item = sec?.items.find(it => it.key === '原画|超清|高清|标清|流畅');
      const v = (item?.value || '').trim();
      if (QUALITIES.includes(v)) return v;
    }
  } catch {
    // 读取失败时使用兜底默认值
  }
  return '原画';
}

// 录制文件保存目录：优先 config.ini 的 [录制设置] -> 直播保存路径(不填则默认)，否则回退 ROOT_DIR/downloads
/** @returns {string} */
function getDownloadsDir() {
  try {
    if (fs.existsSync(APP_CONFIG_PATH)) {
      const sections = parseAppConfig(fs.readFileSync(APP_CONFIG_PATH, ENCODING));
      const sec = sections.find(s => s.name === '录制设置');
      const item = sec?.items.find(it => it.key === '直播保存路径(不填则默认)');
      const v = (item?.value || '').trim();
      if (v) return path.resolve(ROOT_DIR, v);
    }
  } catch {
    // 读取失败时使用兜底默认值
  }
  return path.join(ROOT_DIR, 'downloads');
}

// 递归扫描录制目录，返回属于指定主播的视频文件列表（按修改时间倒序）
// 匹配规则与录制器落盘规则对应：文件名以 `主播名_` 开头，或位于以主播名命名的文件夹内
/**
 * @param {string} anchorName
 * @returns {RecordingFileItem[]}
 */
function listRecordings(anchorName) {
  const baseDir = getDownloadsDir();
  /** @type {RecordingFileItem[]} */
  const results = [];
  if (!fs.existsSync(baseDir)) return results;

  /** @param {string} dir */
  const walk = (dir) => {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) continue;
      const relPath = path.relative(baseDir, fullPath);
      const dirSegments = relPath.split(path.sep).slice(0, -1);
      const matched = entry.name.startsWith(`${anchorName}_`) || dirSegments.includes(anchorName);
      if (!matched) continue;
      try {
        const stat = fs.statSync(fullPath);
        results.push({
          file: relPath.split(path.sep).join('/'),
          name: entry.name,
          ext: ext.slice(1),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {
        // 文件可能正在写入或已被删除，跳过
      }
    }
  };
  walk(baseDir);
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

/**
 * @param {string} text
 * @param {AppConfigSection[]} sections
 * @returns {string}
 */
function updateAppConfig(text, sections) {
  /** @type {Record<string, string>} */
  const newValues = {};
  for (const sec of sections || []) {
    const secName = (sec.name || '').trim();
    for (const it of sec.items || []) {
      const key = (it.key || '').trim();
      if (secName && key) {
        newValues[`${secName}|||${key}`] = String(it.value ?? '').trim();
      }
    }
  }

  const outLines = [];
  let currentSection = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#') || line.startsWith(';') || line === '') {
      outLines.push(rawLine);
      continue;
    }
    const m = line.match(/^\[(.+)\]$/);
    if (m) {
      currentSection = m[1].trim();
      outLines.push(rawLine);
      continue;
    }
    if (line.includes('=')) {
      const key = line.slice(0, line.indexOf('=')).trim();
      const lookupKey = `${currentSection}|||${key}`;
      if (lookupKey in newValues) {
        outLines.push(`${key} = ${newValues[lookupKey]}`);
        continue;
      }
    }
    outLines.push(rawLine);
  }
  return outLines.join('\n') + '\n';
}

// ============ Fastify Server ============
/** @type {ManagedFastify | null} */
let app = null;

/**
 * @param {{ host?: string, port?: number, http2?: boolean, certPath?: string, keyPath?: string }} [options]
 * @returns {Promise<ManagedFastify>}
 */
export async function startServer(options = {}) {
  const fileSettings = await getServerSettings();
  const finalHost = options.host ?? fileSettings.host;
  const finalPort = options.port ?? fileSettings.port;
  const wantHttp2 = options.http2 ?? fileSettings.enableHttp2;
  const certPath = options.certPath ?? fileSettings.certPath;
  const keyPath = options.keyPath ?? fileSettings.keyPath;
  const tlsOpts = loadTlsOptions({ certPath, keyPath });

  // ---------- 端口占用预检测 ----------
  const portCheck = await checkPortAvailable(finalHost, finalPort);
  if (!portCheck.ok) {
    const hint = portCheck.reason === 'EADDRINUSE'
      ? `端口 ${finalPort} 已被其他程序占用！常见占用者：AirPlay/Windows 投屏组件、旧版残留进程。请释放端口或改 config-manager/config.js 的 port 再重启。`
      : `端口检测失败(${portCheck.reason})：${finalHost}:${finalPort}`;
    throw new Error(hint);
  }

  // ---------- HTTP/2 策略 ----------
  // 浏览器端不支持明文 h2c。若用户要 HTTP/2 但没有合法 TLS 证书，
  // 安全回退到 HTTP/1.1 明文，避免浏览器访问 https:// 时触发 ERR_SSL_PROTOCOL_ERROR
  let enableHttp2 = !!wantHttp2;
  let effectiveTls = tlsOpts;
  if (wantHttp2 && !tlsOpts) {
    enableHttp2 = false;
    effectiveTls = null;
    console.warn('[ConfigManager] enableHttp2=true 但未配置/找到 TLS 证书（certPath=' + (certPath || '(空)') + ', keyPath=' + (keyPath || '(空)') + '）。为避免浏览器报 ERR_SSL_PROTOCOL_ERROR，已回退为 HTTP/1.1 明文。请运行 node config-manager/gen-cert.mjs 生成证书后重启。');
  }

  /** @type {{ logger: boolean, http2: boolean, https?: import('node:https').ServerOptions }} */
  const fastifyOpts = {
    logger: false,
    http2: enableHttp2,
  };

  if (enableHttp2 && effectiveTls) {
    fastifyOpts.https = effectiveTls;
  }

  app = /** @type {ManagedFastify} */ (/** @type {unknown} */ (Fastify(/** @type {any} */ (fastifyOpts))));

  // Register CORS
  await app.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  });

  // ============ API Routes ============

  // GET /api/config - Read URL_config.ini
  app.get('/api/config', async (request, reply) => {
    try {
      let text = '';
      if (fs.existsSync(CONFIG_PATH)) {
        text = fs.readFileSync(CONFIG_PATH, ENCODING);
      }
      return {
        success: true,
        path: CONFIG_PATH,
        items: parseIni(text),
        qualities: QUALITIES,
        defaultQuality: getDefaultQuality(),
      };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // POST /api/config - Save URL_config.ini
  app.post('/api/config', async (request, reply) => {
    try {
      const { items } = /** @type {any} */ (request.body) || {};
      if (!Array.isArray(items)) {
        reply.code(400);
        return { success: false, error: 'items 必须是数组' };
      }
      const text = buildIni(items);
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, text, ENCODING);
      return { success: true, count: parseIni(text).length };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // GET /api/app-config - Read config.ini
  app.get('/api/app-config', async (request, reply) => {
    try {
      let text = '';
      if (fs.existsSync(APP_CONFIG_PATH)) {
        text = fs.readFileSync(APP_CONFIG_PATH, ENCODING);
      }
      return { success: true, path: APP_CONFIG_PATH, sections: parseAppConfig(text) };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // POST /api/app-config - Save config.ini
  app.post('/api/app-config', async (request, reply) => {
    try {
      const { sections } = /** @type {any} */ (request.body) || {};
      if (!Array.isArray(sections)) {
        reply.code(400);
        return { success: false, error: 'sections 必须是数组' };
      }
      let text = '';
      if (fs.existsSync(APP_CONFIG_PATH)) {
        text = fs.readFileSync(APP_CONFIG_PATH, ENCODING);
      }
      const newText = updateAppConfig(text, sections);
      fs.mkdirSync(path.dirname(APP_CONFIG_PATH), { recursive: true });
      fs.writeFileSync(APP_CONFIG_PATH, newText, ENCODING);
      const count = sections.reduce((sum, s) => sum + (s.items?.length || 0), 0);
      return { success: true, count };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // GET /api/recordings?name=主播名 - 列出该主播已录制的文件
  app.get('/api/recordings', async (request, reply) => {
    try {
      const name = String(/** @type {any} */ (request.query)?.name || '').trim();
      if (!name) {
        reply.code(400);
        return { success: false, error: '缺少参数 name（主播名）' };
      }
      return { success: true, items: listRecordings(name) };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // DELETE /api/recordings - 删除指定录制文件（body: { file: 相对录制根目录的路径 }）
  app.delete('/api/recordings', async (request, reply) => {
    try {
      const file = String(/** @type {any} */ (request.body)?.file || '').trim();
      if (!file) {
        reply.code(400);
        return { success: false, error: '缺少参数 file' };
      }
      const baseDir = getDownloadsDir();
      const fullPath = path.resolve(baseDir, file);
      // 防路径穿越：必须仍位于录制根目录内，且为受支持的视频扩展名
      if (fullPath !== baseDir && !fullPath.startsWith(baseDir + path.sep)) {
        reply.code(400);
        return { success: false, error: '非法路径' };
      }
      if (!VIDEO_EXTS.has(path.extname(fullPath).toLowerCase())) {
        reply.code(400);
        return { success: false, error: '不支持的文件类型' };
      }
      if (!fs.existsSync(fullPath)) {
        reply.code(404);
        return { success: false, error: '文件不存在' };
      }
      fs.unlinkSync(fullPath);
      return { success: true };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ============ Recorded Video Streaming ============
  // 通过 fastify-static 提供录制文件访问，自带 Range 请求支持，可拖动进度播放
  const downloadsDir = getDownloadsDir();
  if (fs.existsSync(downloadsDir)) {
    await app.register(fastifyStatic, {
      root: downloadsDir,
      prefix: '/api/video/',
      decorateReply: false,
    });
  }

  // ============ Static Files (SPA) ============
  const staticDir = path.join(__dirname, 'static');
  if (fs.existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.code(404);
        return { success: false, error: 'Not found' };
      }
      const indexPath = path.join(staticDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        reply.type('text/html').send(fs.readFileSync(indexPath));
      } else {
        reply.code(404);
        return { success: false, error: '前端未构建：缺少 static/index.html' };
      }
    });
  }

  // Start listening
  await app.listen({ host: finalHost, port: finalPort });
  const protocol = (enableHttp2 && effectiveTls) ? 'https' : 'http';
  const scheme = enableHttp2 ? 'HTTP/2' : 'HTTP/1.1';
  app.configManagerHttpInfo = {
    host: finalHost,
    port: finalPort,
    protocol,
    scheme,
    url: `${protocol}://${finalHost}:${finalPort}`,
  };
  return app;
}

// ============ Standalone Entry ============
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  console.log(`配置文件路径: ${CONFIG_PATH}`);
  startServer()
    .then(server => {
      const info = server.configManagerHttpInfo;
      console.log(`Config Manager running at ${info.url} (${info.scheme}${info.protocol === 'https' ? ' + TLS' : ''})`);
    })
    .catch(e => {
      console.error(`Server error: ${e.message}`);
      process.exit(1);
    });
}
