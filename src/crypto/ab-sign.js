/**
 * A-Bogus signature algorithm for Douyin
 * Ported from Python implementation
 */
import crypto from 'node:crypto';

function rc4Encrypt(plaintext, key) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }

  let i = 0; j = 0;
  const result = [];
  for (const char of plaintext) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    const t = (s[i] + s[j]) % 256;
    result.push(String.fromCharCode(s[t] ^ char.charCodeAt(0)));
  }
  return result.join('');
}

function leftRotate(x, n) {
  n %= 32;
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function getTJ(j) {
  if (j < 16) return 2043430169;
  if (j < 64) return 2055708042;
  throw new Error('invalid j');
}

function ffJ(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  return ((x & y) | (x & z) | (y & z)) >>> 0;
}

function ggJ(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  return ((x & y) | (~x & z)) >>> 0;
}

class SM3 {
  constructor() {
    this.reg = [];
    this.chunk = [];
    this.size = 0;
    this.reset();
  }

  reset() {
    this.reg = [1937774191, 1226093241, 388252375, 3666478592, 2842636476, 372324522, 3817729613, 2969243214];
    this.chunk = [];
    this.size = 0;
  }

  write(data) {
    let a;
    if (typeof data === 'string') {
      a = [...Buffer.from(data, 'utf-8')];
    } else {
      a = data;
    }
    this.size += a.length;
    let f = 64 - this.chunk.length;
    if (a.length < f) {
      this.chunk.push(...a);
    } else {
      this.chunk.push(...a.slice(0, f));
      while (this.chunk.length >= 64) {
        this._compress(this.chunk);
        if (f < a.length) {
          this.chunk = a.slice(f, Math.min(f + 64, a.length));
        } else {
          this.chunk = [];
        }
        f += 64;
      }
    }
  }

  _fill() {
    const bitLength = 8 * this.size;
    this.chunk.push(0x80);
    let paddingPos = this.chunk.length % 64;
    if (64 - paddingPos < 8) paddingPos -= 64;
    while (paddingPos < 56) {
      this.chunk.push(0);
      paddingPos++;
    }
    const highBits = Math.floor(bitLength / 4294967296);
    for (let i = 0; i < 4; i++) this.chunk.push((highBits >>> (8 * (3 - i))) & 0xFF);
    for (let i = 0; i < 4; i++) this.chunk.push((bitLength >>> (8 * (3 - i))) & 0xFF);
  }

  _compress(data) {
    if (data.length < 64) throw new Error('compress error');
    const w = new Array(132).fill(0);
    for (let t = 0; t < 16; t++) {
      w[t] = ((data[4 * t] << 24) | (data[4 * t + 1] << 16) | (data[4 * t + 2] << 8) | data[4 * t + 3]) >>> 0;
    }
    for (let j = 16; j < 68; j++) {
      let a = w[j - 16] ^ w[j - 9] ^ leftRotate(w[j - 3], 15);
      a = (a ^ leftRotate(a, 15) ^ leftRotate(a, 23)) >>> 0;
      w[j] = (a ^ leftRotate(w[j - 13], 7) ^ w[j - 6]) >>> 0;
    }
    for (let j = 0; j < 64; j++) w[j + 68] = (w[j] ^ w[j + 4]) >>> 0;

    let [a, b, c, d, e, f, g, h] = this.reg;
    for (let j = 0; j < 64; j++) {
      const ss1 = leftRotate((leftRotate(a, 12) + e + leftRotate(getTJ(j), j)) >>> 0, 7);
      const ss2 = (ss1 ^ leftRotate(a, 12)) >>> 0;
      const tt1 = (ffJ(j, a, b, c) + d + ss2 + w[j + 68]) >>> 0;
      const tt2 = (ggJ(j, e, f, g) + h + ss1 + w[j]) >>> 0;
      d = c; c = leftRotate(b, 9); b = a; a = tt1;
      h = g; g = leftRotate(f, 19); f = e;
      e = (tt2 ^ leftRotate(tt2, 9) ^ leftRotate(tt2, 17)) >>> 0;
    }
    this.reg[0] = (this.reg[0] ^ a) >>> 0;
    this.reg[1] = (this.reg[1] ^ b) >>> 0;
    this.reg[2] = (this.reg[2] ^ c) >>> 0;
    this.reg[3] = (this.reg[3] ^ d) >>> 0;
    this.reg[4] = (this.reg[4] ^ e) >>> 0;
    this.reg[5] = (this.reg[5] ^ f) >>> 0;
    this.reg[6] = (this.reg[6] ^ g) >>> 0;
    this.reg[7] = (this.reg[7] ^ h) >>> 0;
  }

  sum(data = null, outputFormat = null) {
    if (data !== null) {
      this.reset();
      this.write(data);
    }
    this._fill();
    for (let f = 0; f < this.chunk.length; f += 64) {
      this._compress(this.chunk.slice(f, f + 64));
    }
    let result;
    if (outputFormat === 'hex') {
      result = this.reg.map(v => v.toString(16).padStart(8, '0')).join('');
    } else {
      result = [];
      for (let f = 0; f < 8; f++) {
        const c = this.reg[f];
        result.push((c >>> 24) & 0xFF, (c >>> 16) & 0xFF, (c >>> 8) & 0xFF, c & 0xFF);
      }
    }
    this.reset();
    return result;
  }
}

const ENCODING_TABLES = {
  s0: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
  s1: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
  s2: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
  s3: 'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe',
  s4: 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe'
};

function getLongInt(roundNum, longStr) {
  roundNum *= 3;
  const c1 = roundNum < longStr.length ? longStr.charCodeAt(roundNum) : 0;
  const c2 = roundNum + 1 < longStr.length ? longStr.charCodeAt(roundNum + 1) : 0;
  const c3 = roundNum + 2 < longStr.length ? longStr.charCodeAt(roundNum + 2) : 0;
  return (c1 << 16) | (c2 << 8) | c3;
}

function resultEncrypt(longStr, num) {
  const table = ENCODING_TABLES[num];
  const masks = [16515072, 258048, 4032, 63];
  const shifts = [18, 12, 6, 0];
  let result = '';
  let roundNum = 0;
  let longInt = getLongInt(0, longStr);
  const totalChars = Math.ceil(longStr.length / 3 * 4);

  for (let i = 0; i < totalChars; i++) {
    if (Math.floor(i / 4) !== roundNum) {
      roundNum++;
      longInt = getLongInt(roundNum, longStr);
    }
    const index = i % 4;
    const charIndex = (longInt & masks[index]) >>> shifts[index];
    result += table[charIndex];
  }
  return result;
}

function generRandom(randomNum, option) {
  const byte1 = randomNum & 255;
  const byte2 = (randomNum >> 8) & 255;
  return [
    (byte1 & 170) | (option[0] & 85),
    (byte1 & 85) | (option[0] & 170),
    (byte2 & 170) | (option[1] & 85),
    (byte2 & 85) | (option[1] & 170),
  ];
}

function generateRandomStr() {
  const randomValues = [0.123456789, 0.987654321, 0.555555555];
  const randomBytes = [];
  randomBytes.push(...generRandom(Math.floor(randomValues[0] * 10000), [3, 45]));
  randomBytes.push(...generRandom(Math.floor(randomValues[1] * 10000), [1, 0]));
  randomBytes.push(...generRandom(Math.floor(randomValues[2] * 10000), [1, 5]));
  return randomBytes.map(b => String.fromCharCode(b)).join('');
}

function generateRc4BbStr(urlSearchParams, userAgent, windowEnvStr, suffix = 'cus', args = [0, 1, 14]) {
  const sm3 = new SM3();
  const startTime = Date.now();

  const urlSearchParamsList = sm3.sum(sm3.sum(urlSearchParams + suffix));
  const cus = sm3.sum(sm3.sum(suffix));
  const uaKey = String.fromCharCode(0) + String.fromCharCode(1) + String.fromCharCode(14);
  const ua = sm3.sum(resultEncrypt(rc4Encrypt(userAgent, uaKey), 's3'));

  const endTime = startTime + 100;
  const b = {};
  b[8] = 3; b[10] = endTime;
  b[15] = { aid: 6383, pageId: 110624, boe: false, ddrt: 7, paths: { include: Array(7).fill({}), exclude: [] }, track: { mode: 0, delay: 300, paths: [] }, dump: true, rpU: 'hwj' };
  b[16] = startTime; b[18] = 44; b[19] = [1, 0, 1, 5];

  const splitToBytes = (num) => [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255];

  const stb = splitToBytes(b[16]);
  b[20] = stb[0]; b[21] = stb[1]; b[22] = stb[2]; b[23] = stb[3];
  b[24] = Math.floor(b[16] / 256 / 256 / 256 / 256) & 255;
  b[25] = Math.floor(b[16] / 256 / 256 / 256 / 256 / 256) & 255;

  const a0b = splitToBytes(args[0]);
  b[26] = a0b[0]; b[27] = a0b[1]; b[28] = a0b[2]; b[29] = a0b[3];
  b[30] = Math.floor(args[1] / 256) & 255; b[31] = args[1] % 256;
  const a1b = splitToBytes(args[1]);
  b[32] = a1b[0]; b[33] = a1b[1];
  const a2b = splitToBytes(args[2]);
  b[34] = a2b[0]; b[35] = a2b[1]; b[36] = a2b[2]; b[37] = a2b[3];

  b[38] = urlSearchParamsList[21]; b[39] = urlSearchParamsList[22];
  b[40] = cus[21]; b[41] = cus[22];
  b[42] = ua[23]; b[43] = ua[24];

  const etb = splitToBytes(b[10]);
  b[44] = etb[0]; b[45] = etb[1]; b[46] = etb[2]; b[47] = etb[3];
  b[48] = b[8];
  b[49] = Math.floor(b[10] / 256 / 256 / 256 / 256) & 255;
  b[50] = Math.floor(b[10] / 256 / 256 / 256 / 256 / 256) & 255;

  b[51] = b[15].pageId;
  const pib = splitToBytes(b[15].pageId);
  b[52] = pib[0]; b[53] = pib[1]; b[54] = pib[2]; b[55] = pib[3];
  b[56] = b[15].aid; b[57] = b[15].aid & 255;
  b[58] = (b[15].aid >> 8) & 255; b[59] = (b[15].aid >> 16) & 255; b[60] = (b[15].aid >> 24) & 255;

  const windowEnvList = [...windowEnvStr].map(c => c.charCodeAt(0));
  b[64] = windowEnvList.length; b[65] = b[64] & 255; b[66] = (b[64] >> 8) & 255;
  b[69] = 0; b[70] = 0; b[71] = 0;

  b[72] = b[18] ^ b[20] ^ b[26] ^ b[30] ^ b[38] ^ b[40] ^ b[42] ^ b[21] ^ b[27] ^ b[31] ^
    b[35] ^ b[39] ^ b[41] ^ b[43] ^ b[22] ^ b[28] ^ b[32] ^ b[36] ^ b[23] ^ b[29] ^
    b[33] ^ b[37] ^ b[44] ^ b[45] ^ b[46] ^ b[47] ^ b[48] ^ b[49] ^ b[50] ^ b[24] ^
    b[25] ^ b[52] ^ b[53] ^ b[54] ^ b[55] ^ b[57] ^ b[58] ^ b[59] ^ b[60] ^ b[65] ^
    b[66] ^ b[70] ^ b[71];

  const bb = [
    b[18], b[20], b[52], b[26], b[30], b[34], b[58], b[38], b[40], b[53], b[42], b[21],
    b[27], b[54], b[55], b[31], b[35], b[57], b[39], b[41], b[43], b[22], b[28], b[32],
    b[60], b[36], b[23], b[29], b[33], b[37], b[44], b[45], b[59], b[46], b[47], b[48],
    b[49], b[50], b[24], b[25], b[65], b[66], b[70], b[71]
  ];
  bb.push(...windowEnvList);
  bb.push(b[72]);

  return rc4Encrypt(bb.map(byte => String.fromCharCode(byte)).join(''), String.fromCharCode(121));
}

export function abSign(urlSearchParams, userAgent) {
  const windowEnvStr = '1920|1080|1920|1040|0|30|0|0|1872|92|1920|1040|1857|92|1|24|Win32';
  return resultEncrypt(
    generateRandomStr() + generateRc4BbStr(urlSearchParams, userAgent, windowEnvStr),
    's4'
  ) + '=';
}
