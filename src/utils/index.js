// @ts-check
/**
 * Common utility functions
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Remove emojis from text
 * @param {string} text
 * @param {string} [replaceText]
 * @returns {string}
 */
export function removeEmojis(text, replaceText = '') {
  const emojiPattern = /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}]+/gu;
  return text.replace(emojiPattern, replaceText);
}

/**
 * Calculate MD5 hash of a file
 * @param {string} filePath
 * @returns {string}
 */
export function checkMd5(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Convert dict to cookie string
 * @param {Record<string, string>} cookiesDict
 * @returns {string}
 */
export function dictToCookieStr(cookiesDict) {
  return Object.entries(cookiesDict).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Get all file paths in a directory recursively
 * @param {string} directory
 * @returns {string[]}
 */
export function getFilePaths(directory) {
  /** @type {string[]} */
  const filePaths = [];
  /** @param {string} dir */
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        filePaths.push(fullPath);
      }
    }
  }
  if (fs.existsSync(directory)) {
    walk(directory);
  }
  return filePaths;
}

/**
 * Remove duplicate lines from a file
 * @param {string} filePath
 * @returns {void}
 */
export function removeDuplicateLines(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const unique = [...new Set(lines.map(l => l.trim()))];
  fs.writeFileSync(filePath, unique.join('\n') + '\n', 'utf-8');
}

/**
 * Check disk free space in GB
 * @param {string} _filePath
 * @param {boolean} [_show]
 * @returns {number}
 */
export function checkDiskCapacity(_filePath, _show = false) {
  // Node.js doesn't have a built-in disk usage API
  // Return a safe default; actual implementation would use platform-specific calls
  return 100.0;
}

/**
 * Handle proxy address format
 * @param {string | null | undefined} proxyAddr
 * @returns {string | null}
 */
export function handleProxyAddr(proxyAddr) {
  if (proxyAddr) {
    if (!proxyAddr.startsWith('http')) {
      proxyAddr = 'http://' + proxyAddr;
    }
    return proxyAddr;
  }
  return null;
}

/**
 * Generate random string
 * @param {number} length
 * @returns {string}
 */
export function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Parse JSONP to JSON
 * @param {string} jsonpStr
 * @returns {any}
 */
export function jsonpToJson(jsonpStr) {
  const match = jsonpStr.match(/(\w+)\((.*)\);?$/s);
  if (match) {
    return JSON.parse(match[2]);
  }
  throw new Error('No JSON data found in JSONP response.');
}

/**
 * Get query parameters from URL
 * @overload
 * @param {string} url
 * @returns {Record<string, string[]>}
 */
/**
 * @overload
 * @param {string} url
 * @param {string} paramName
 * @returns {string[]}
 */
/**
 * @param {string} url
 * @param {string | null} [paramName]
 * @returns {Record<string, string[]> | string[]}
 */
export function getQueryParams(url, paramName = null) {
  const urlObj = new URL(url, 'http://localhost');
  if (paramName === null) {
    /** @type {Record<string, string[]>} */
    const params = {};
    for (const [key, value] of urlObj.searchParams) {
      if (!params[key]) params[key] = [];
      params[key].push(value);
    }
    return params;
  }
  return urlObj.searchParams.getAll(paramName);
}

/**
 * Replace URL in file
 * @param {string} filePath
 * @param {string} oldStr
 * @param {string} newStr
 * @returns {void}
 */
export function replaceUrl(filePath, oldStr, newStr) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Sleep helper
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean name - remove special characters
 */
const RSTR = /[\/\\:*?"<>|&#.。,， ~！· ]/g;
/**
 * @param {string} inputText
 * @param {boolean} [cleanEmoji]
 * @returns {string}
 */
export function cleanName(inputText, cleanEmoji = true) {
  let cleaned = inputText.trim().replace(RSTR, '_').replace(/^_+|_+$/g, '');
  cleaned = cleaned.replace('（', '(').replace('）', ')');
  if (cleanEmoji) {
    cleaned = removeEmojis(cleaned, '_').replace(/^_+|_+$/g, '');
  }
  return cleaned || '空白昵称';
}

/**
 * Quality code mapping
 */
/** @type {Record<string, string>} */
const QUALITY_MAPPING = {
  '原画': 'OD',
  '蓝光': 'BD',
  '超清': 'UHD',
  '高清': 'HD',
  '标清': 'SD',
  '流畅': 'LD'
};

/**
 * @param {string} qn
 * @returns {string}
 */
export function getQualityCode(qn) {
  return QUALITY_MAPPING[qn] || 'OD';
}

/**
 * Quality index mapping
 */
/** @type {Record<string, number>} */
const QUALITY_INDEX = { OD: 0, BD: 0, UHD: 1, HD: 2, SD: 3, LD: 4 };

/**
 * @param {string | number | null | undefined} quality
 * @returns {[string, number]}
 */
export function getQualityIndex(quality) {
  if (!quality) return ['OD', 0];
  let qualityStr = String(quality).toUpperCase();
  if (/^\d$/.test(qualityStr)) {
    const keys = Object.keys(QUALITY_INDEX);
    qualityStr = keys[parseInt(qualityStr[0])] || 'OD';
  }
  return [qualityStr, QUALITY_INDEX[qualityStr] ?? 0];
}
