/**
 * Self-signed TLS certificate generator — zero external dependencies, no openssl required.
 * Produces PEM-encoded RSA-2048 private key + X.509 certificate.
 * Subjects: CN=<hostname>; SAN: DNS:<hostname>, DNS:localhost, IP:127.0.0.1, IP:::1
 * Usage:
 *   node config-manager/gen-cert.mjs                    # write to ./config/cert.pem + ./config/key.pem
 *   node config-manager/gen-cert.mjs myhost.local 825d  # custom CN + validity days
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const OWN_CONFIG_PATH = path.join(__dirname, 'config.js');

// ---------- minimal DER / ASN.1 encoder ----------
const DER = {
  tag(t, v) {
    return Buffer.concat([Buffer.from([t]), DER.len(v.length), v]);
  },
  len(n) {
    if (n < 0x80) return Buffer.from([n]);
    const b = [];
    let x = n;
    while (x > 0) { b.unshift(x & 0xff); x >>>= 8; }
    return Buffer.from([0x80 | b.length, ...b]);
  },
  seq(...parts) { return DER.tag(0x30, Buffer.concat(parts)); },
  set(...parts) { return DER.tag(0x31, Buffer.concat(parts)); },
  int(n) {
    if (typeof n === 'bigint') {
      const b = [];
      let x = n;
      if (x === 0n) return DER.tag(0x02, Buffer.from([0]));
      while (x > 0n) { b.unshift(Number(x & 0xffn)); x >>= 8n; }
      if (b[0] & 0x80) b.unshift(0);
      return DER.tag(0x02, Buffer.from(b));
    }
    if (n < 128 && n >= 0) return DER.tag(0x02, Buffer.from([n]));
    const hex = n.toString(16).padStart(n.toString(16).length + (n.toString(16).length % 2), '0');
    const bytes = Buffer.from(hex, 'hex');
    if (bytes[0] & 0x80) return DER.tag(0x02, Buffer.concat([Buffer.from([0]), bytes]));
    return DER.tag(0x02, bytes);
  },
  uintBytes(buf) {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const stripped = b[0] === 0 ? b.subarray(b.findIndex(v => v !== 0)) : b;
    const final = stripped[0] & 0x80 ? Buffer.concat([Buffer.from([0]), stripped]) : stripped;
    return DER.tag(0x02, final);
  },
  octetString(buf) { return DER.tag(0x04, Buffer.from(buf)); },
  bitString(buf, unused = 0) { return DER.tag(0x03, Buffer.concat([Buffer.from([unused]), Buffer.from(buf)])); },
  utf8(s) { return DER.tag(0x0c, Buffer.from(s, 'utf8')); },
  ia5(s) { return DER.tag(0x16, Buffer.from(s, 'ascii')); },
  printable(s) { return DER.tag(0x13, Buffer.from(s, 'ascii')); },
  oid(s) {
    const parts = s.split('.').map(Number);
    const bytes = [40 * parts[0] + parts[1]];
    for (let i = 2; i < parts.length; i++) {
      let v = parts[i];
      if (v < 128) { bytes.push(v); continue; }
      const sub = [];
      while (v > 0) { sub.unshift((v & 0x7f) | 0x80); v >>>= 7; }
      sub[sub.length - 1] &= 0x7f;
      bytes.push(...sub);
    }
    return DER.tag(0x06, Buffer.from(bytes));
  },
  null_() { return DER.tag(0x05, Buffer.alloc(0)); },
  ctx(tag, buf, constructed = true) {
    return DER.tag(0x80 | tag | (constructed ? 0x20 : 0x00), Buffer.from(buf));
  },
  bool(v) { return DER.tag(0x01, Buffer.from([v ? 0xff : 0])); },
};

// ---------- helpers ----------
function utcTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = String(d.getUTCFullYear()).slice(-2);
  const s = `${y}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return DER.tag(0x17, Buffer.from(s, 'ascii'));
}

function rsaPublicKeySpki(modulusBuf, exponentBuf) {
  const rsaPub = DER.seq(DER.uintBytes(modulusBuf), DER.uintBytes(exponentBuf));
  const algId = DER.seq(DER.oid('1.2.840.113549.1.1.1'), DER.null_());
  return DER.seq(algId, DER.bitString(rsaPub));
}

function rsaPssSignatureNull() {
  // AlgorithmIdentifier for sha256WithRSAEncryption
  return DER.seq(DER.oid('1.2.840.113549.1.1.11'), DER.null_());
}

function buildName(attrs) {
  const seqParts = [];
  for (const [oidStr, value] of attrs) {
    const valNode =
      oidStr === '2.5.4.6' ? DER.printable(value) :
      DER.utf8(value);
    const attr = DER.seq(DER.oid(oidStr), valNode);
    seqParts.push(DER.set(attr));
  }
  return DER.seq(...seqParts);
}

const EXT_KEY_USAGE_SERVER_AUTH = '1.3.6.1.5.5.7.3.1';
const EXT_KEY_USAGE_CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';

function subjectKeyExtension(pubkeySpkiBytes) {
  const digest = crypto.createHash('sha1').update(pubkeySpkiBytes).digest();
  return DER.octetString(digest);
}

function basicConstraintsExtension(isCA = false, pathLen = null) {
  const parts = [];
  if (isCA) parts.push(DER.bool(true));
  if (isCA && pathLen != null) parts.push(DER.int(pathLen));
  const inner = DER.seq(...parts);
  return DER.octetString(inner);
}

function keyUsageExtension(flags) {
  // flags: bit array positions { digitalSignature:0, nonRepudiation:1, keyEncipherment:2, dataEncipherment:3, keyAgreement:4, keyCertSign:5, cRLSign:6 }
  let bits = 0;
  for (const f of flags) bits |= (1 << f);
  let highBit = 0;
  for (let i = 0; i < 8; i++) if (bits & (1 << i)) highBit = i;
  const byteCount = Math.floor(highBit / 8) + 1;
  const bytes = [];
  for (let i = 0; i < byteCount; i++) bytes.push((bits >> (i * 8)) & 0xff);
  bytes.reverse();
  const unused = (byteCount * 8) - (highBit + 1);
  const bitStr = DER.tag(0x03, Buffer.concat([Buffer.from([unused]), Buffer.from(bytes)]));
  return DER.octetString(bitStr);
}

function extendedKeyUsageExtension(oids) {
  const seq = DER.seq(...oids.map(o => DER.oid(o)));
  return DER.octetString(seq);
}

function subjectAltNameExtension(sans) {
  // sans: [{type:'dns', value:'a'}, {type:'ip', value:'127.0.0.1'}, ...]
  const names = [];
  for (const s of sans) {
    if (s.type === 'dns') names.push(DER.ctx(2, Buffer.from(s.value, 'ascii'), false));
    else if (s.type === 'ip') {
      if (s.value.includes(':')) {
        // IPv6: 16 raw bytes
        const parts = s.value.split(':');
        // expand ::
        const emptyIdx = parts.indexOf('');
        if (emptyIdx !== -1) {
          const before = parts.slice(0, emptyIdx);
          const after = parts.slice(emptyIdx + 1);
          const miss = 8 - before.length - after.length;
          parts.splice(emptyIdx, 1, ...Array(miss).fill('0'));
        }
        const buf = Buffer.alloc(16);
        for (let i = 0; i < 8; i++) {
          const n = parseInt(parts[i] || '0', 16);
          buf.writeUInt16BE(n, i * 2);
        }
        names.push(DER.ctx(7, buf, false));
      } else {
        const octets = s.value.split('.').map(Number);
        names.push(DER.ctx(7, Buffer.from(octets), false));
      }
    }
  }
  const inner = DER.seq(...names);
  return DER.octetString(inner);
}

function extension(oid, valueBytes, critical = false) {
  const parts = [DER.oid(oid)];
  if (critical) parts.push(DER.bool(true));
  parts.push(valueBytes);
  return DER.seq(...parts);
}

function extensionsBlock(extList) {
  return DER.ctx(3, DER.seq(...extList));
}

// ---------- cert generation ----------
async function generate({ commonName = 'localhost', days = 825 }) {
  const sans = [
    { type: 'dns', value: commonName },
    { type: 'dns', value: 'localhost' },
    { type: 'ip', value: '127.0.0.1' },
    { type: 'ip', value: '::1' },
  ];
  if (commonName !== 'localhost' && !sans.some(s => s.value === commonName)) {
    sans.unshift({ type: 'dns', value: commonName });
  }

  const alg = 'rsa';
  const modulusLength = 2048;
  const { privateKey, publicKey } = crypto.generateKeyPairSync(alg, {
    modulusLength,
    publicExponent: 0x10001,
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'jwk' },
  });

  // jwk gives us n (modulus base64url) and e (exponent)
  const modBuf = Buffer.from(publicKey.n.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - publicKey.n.length % 4) % 4), 'base64');
  const expBuf = Buffer.from(publicKey.e.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - publicKey.e.length % 4) % 4), 'base64');
  const spki = rsaPublicKeySpki(modBuf, expBuf);

  const signerPriv = crypto.createPrivateKey({ key: privateKey, format: 'pem', type: 'pkcs8' });
  const signerPubDer = crypto.createPublicKey(signerPriv).export({ format: 'der', type: 'spki' });

  const notBefore = new Date(Date.now() - 60 * 1000);
  const notAfter = new Date(Date.now() + days * 24 * 3600 * 1000);
  const validity = DER.seq(utcTime(notBefore), utcTime(notAfter));

  const subjectAttrs = [
    ['2.5.4.6', 'CN'],
    ['2.5.4.10', 'LiveRecorder'],
    ['2.5.4.11', 'ConfigManager'],
    ['2.5.4.3', commonName],
  ];
  const subject = buildName(subjectAttrs);
  const issuer = subject; // self-signed

  const serialBytes = crypto.randomBytes(16);
  serialBytes[0] &= 0x7f; // non-negative
  const serial = DER.uintBytes(serialBytes);

  const version = DER.ctx(0, DER.int(2)); // v3

  const skid = subjectKeyExtension(signerPubDer);

  // RFC 5280 4.2.1.1 AuthorityKeyIdentifier ::= SEQUENCE { keyIdentifier [0] IMPLICIT KeyIdentifier OPTIONAL, ... }
  // extnValue is OCTET STRING wrapping the DER SEQUENCE (no extra context tag)
  const akiSeq = DER.seq(
    DER.ctx(0, crypto.createHash('sha1').update(signerPubDer).digest(), false),
  );
  const akiWrapped = DER.octetString(akiSeq);

  const basicC = basicConstraintsExtension(false);  // 终端实体证书 CA:false（Chrome 拒绝 CA:true 的服务器证书）
  const ku = keyUsageExtension([0, 2]); // digitalSignature + keyEncipherment (TLS server needs these)
  const eku = extendedKeyUsageExtension([EXT_KEY_USAGE_SERVER_AUTH, EXT_KEY_USAGE_CLIENT_AUTH]);
  const san = subjectAltNameExtension(sans);

  const exts = extensionsBlock([
    extension('2.5.29.14', skid),                 // subjectKeyIdentifier
    extension('2.5.29.35', akiWrapped),           // authorityKeyIdentifier
    extension('2.5.29.19', basicC, true),         // basicConstraints CA:false critical
    extension('2.5.29.15', ku, true),             // keyUsage critical
    extension('2.5.29.37', eku),                  // extKeyUsage serverAuth+clientAuth
    extension('2.5.29.17', san),                  // subjectAltName
  ]);

  const tbs = DER.seq(
    version,
    serial,
    rsaPssSignatureNull(),
    issuer,
    validity,
    subject,
    spki,
    exts,
  );

  const signature = crypto.sign('sha256WithRSAEncryption', tbs, signerPriv);
  const certDer = DER.seq(
    tbs,
    rsaPssSignatureNull(),
    DER.bitString(signature),
  );

  const certPem =
    '-----BEGIN CERTIFICATE-----\n' +
    certDer.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----\n';

  return { privateKeyPem: privateKey, certPem };
}

// ---------- CLI entry ----------
function tryGetHostname() {
  try { return os.hostname() || 'localhost'; } catch { return 'localhost'; }
}

const cnArg = process.argv[2]?.trim();
const daysArg = parseInt(process.argv[3]);
const commonName = cnArg || tryGetHostname();
const days = Number.isFinite(daysArg) && daysArg > 0 && daysArg <= 825 ? daysArg : 825;

const outCert = path.join(CONFIG_DIR, 'cert.pem');
const outKey = path.join(CONFIG_DIR, 'key.pem');

console.log(`Generating self-signed certificate (RSA-2048, SHA-256)...`);
console.log(`  CN       : ${commonName}`);
console.log(`  SANs     : DNS:${commonName}, DNS:localhost, IP:127.0.0.1, IP:::1`);
console.log(`  Valid for: ${days} days`);
console.log(`  Cert file: ${outCert}`);
console.log(`  Key  file: ${outKey}`);

const { certPem, privateKeyPem } = await generate({ commonName, days });
fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.writeFileSync(outCert, certPem);
fs.chmodSync(outCert, 0o644);
fs.writeFileSync(outKey, privateKeyPem);
fs.chmodSync(outKey, 0o600);

// Optional: write config-manager/config.js (best-effort, preserve comments / formatting where possible)
try {
  // cert.pem / key.pem 已放在 ROOT/config/ 下，对项目根相对路径为 config/cert.pem / config/key.pem
  const certRel = path.relative(ROOT_DIR, outCert).split(path.sep).join('/');
  const keyRel  = path.relative(ROOT_DIR, outKey).split(path.sep).join('/');
  if (fs.existsSync(OWN_CONFIG_PATH)) {
    let text = fs.readFileSync(OWN_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
    const updates = [
      ['enableHttp2', 'true'],
      ['certPath',    JSON.stringify(certRel)],
      ['keyPath',     JSON.stringify(keyRel)],
    ];
    for (const [k, v] of updates) {
      const re = new RegExp('(^\\s*' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*)([^,\\n\\r]+?)(,?\\s*$)', 'm');
      if (re.test(text)) {
        text = text.replace(re, (m, pre, _old, post) => pre + v + post);
      } else {
        // insert before closing brace of export default { ... }
        const idx = text.lastIndexOf('}');
        if (idx !== -1) {
          const indentMatch = text.slice(0, idx).match(/\r?\n([ \t]*)$/);
          const indent = indentMatch ? indentMatch[1] : '';
          const before = text.slice(0, idx).replace(/[ \t]*$/, '');
          const comma = /,\s*$/.test(before) ? '' : ',';
          text = before + comma + '\n' + indent + `  ${k}: ${v},` + '\n' + indent + text.slice(idx);
        } else {
          text = text + `\nexport default { ${k}: ${v} };\n`;
        }
      }
    }
    fs.writeFileSync(OWN_CONFIG_PATH, text, 'utf8');
    console.log(`  config-manager/config.js: enableHttp2=true + certPath=${certRel}, keyPath=${keyRel}`);
  } else {
    // Create a fresh config-manager/config.js
    const content = `/**
 * Config Manager 独立配置
 * 注意：此文件仅用于 config-manager (Web 配置管理台)。
 * 不要与主程序 src/config/ 或 config/config.ini 的全局录制配置混淆。
 *
 * 字段说明：
 *   enableHttp2  是否启用 HTTP/2（true/false）
 *                - 如果同时提供了 certPath + keyPath，启用 "https + h2"
 *                - 如果未提供证书，则启用 "h2c 明文模式"
 *   host         Web 管理台绑定地址：'127.0.0.1'(本机) / '0.0.0.0'(对外)
 *   port         Web 管理台监听端口
 *   certPath     TLS 证书 PEM 路径（相对项目根 / 或绝对路径）
 *   keyPath      TLS 私钥 PEM 路径
 */
export default {
  enableHttp2: true,
  host: '127.0.0.1',
  port: 5000,
  certPath: ${JSON.stringify(certRel)},
  keyPath:  ${JSON.stringify(keyRel)},
};
`;
    fs.writeFileSync(OWN_CONFIG_PATH, content, 'utf8');
    console.log(`  created config-manager/config.js with cert/key paths.`);
  }
} catch (e) {
  console.warn(`  (Optional) Failed to update config-manager/config.js: ${e.message}`);
}

console.log('Done.');
console.log('');
console.log('Next steps:');
console.log('  1. Trust this cert (one-time):');
console.log('       Windows:  certutil -addstore -user Root "' + outCert.replace(/\\/g, '\\\\') + '"');
console.log('       macOS:    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain config/cert.pem');
console.log('       Linux:    sudo cp config/cert.pem /usr/local/share/ca-certificates/live-recorder.crt && sudo update-ca-certificates');
console.log('  2. Restart app: npm start   OR   node config-manager/server.js');
console.log('  3. Visit: https://localhost:5000/');
