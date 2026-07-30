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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'URL_config.ini');
const APP_CONFIG_PATH = path.join(CONFIG_DIR, 'config.ini');
const ENCODING = 'utf-8';
const QUALITIES = ['原画', '蓝光', '超清', '高清', '标清', '流畅'];
const VIDEO_EXTS = new Set(['.flv', '.ts', '.mp4', '.mkv', '.mp3', '.m4a']);

// ============ URL Config Parsing ============
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

function parseIni(text) {
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

function buildIni(items) {
  const lines = items.filter(it => (it.url || '').trim()).map(buildLine);
  return lines.join('\n') + (lines.length ? '\n' : '');
}

// ============ App Config Parsing ============
function parseAppConfig(text) {
  const sections = [];
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
function listRecordings(anchorName) {
  const baseDir = getDownloadsDir();
  const results = [];
  if (!fs.existsSync(baseDir)) return results;

  const walk = (dir) => {
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

function updateAppConfig(text, sections) {
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
let app = null;

export async function startServer({ host = '0.0.0.0', port = 5000 } = {}) {
  app = Fastify({
    logger: false,
    http2: false,
  });

  // Register CORS
  await app.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
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
      return { success: false, error: e.message };
    }
  });

  // POST /api/config - Save URL_config.ini
  app.post('/api/config', async (request, reply) => {
    try {
      const { items } = request.body || {};
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
      return { success: false, error: e.message };
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
      return { success: false, error: e.message };
    }
  });

  // POST /api/app-config - Save config.ini
  app.post('/api/app-config', async (request, reply) => {
    try {
      const { sections } = request.body || {};
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
      return { success: false, error: e.message };
    }
  });

  // GET /api/recordings?name=主播名 - 列出该主播已录制的文件
  app.get('/api/recordings', async (request, reply) => {
    try {
      const name = String(request.query?.name || '').trim();
      if (!name) {
        reply.code(400);
        return { success: false, error: '缺少参数 name（主播名）' };
      }
      return { success: true, items: listRecordings(name) };
    } catch (e) {
      reply.code(500);
      return { success: false, error: e.message };
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
  await app.listen({ host, port });
  return app;
}

// ============ Standalone Entry ============
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  console.log(`配置文件路径: ${CONFIG_PATH}`);
  startServer({ host: '127.0.0.1', port: 5000 })
    .then(() => console.log('Config Manager running at http://127.0.0.1:5000'))
    .catch(e => {
      console.error(`Server error: ${e.message}`);
      process.exit(1);
    });
}
