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
