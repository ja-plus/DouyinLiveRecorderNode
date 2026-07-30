/**
 * Configuration manager - reads and writes INI config files
 */
import fs from 'node:fs';
import path from 'node:path';
import ini from 'ini';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');
export const CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.ini');
export const URL_CONFIG_FILE = path.join(CONFIG_DIR, 'URL_config.ini');
export const DEFAULT_PATH = path.join(ROOT_DIR, 'downloads');
export const BACKUP_DIR = path.join(ROOT_DIR, 'backup_config');

const TEXT_ENCODING = 'utf-8';

/**
 * Read a config value from INI file
 */
export function readConfigValue(configObj, section, key, defaultValue) {
  if (!configObj[section]) {
    configObj[section] = {};
  }
  if (configObj[section][key] !== undefined) {
    return configObj[section][key];
  }
  configObj[section][key] = String(defaultValue);
  return defaultValue;
}

/**
 * Load config from file
 */
export function loadConfig(filePath = CONFIG_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', TEXT_ENCODING);
  }
  // Python 端以 utf-8-sig 写入，需去除 BOM，否则 [section] 无法被识别为节名
  const content = fs.readFileSync(filePath, TEXT_ENCODING).replace(/^\uFEFF/, '');
  return ini.parse(content);
}

/**
 * Save config to file
 */
export function saveConfig(configObj, filePath = CONFIG_FILE) {
  const content = ini.stringify(configObj);
  fs.writeFileSync(filePath, content, TEXT_ENCODING);
}

/**
 * Update a single config value
 */
export function updateConfig(filePath, section, key, newValue) {
  const config = loadConfig(filePath);
  if (!config[section]) {
    config[section] = {};
  }
  config[section][key] = newValue;
  saveConfig(config, filePath);
}

/**
 * Parse boolean from Chinese yes/no
 */
export function parseBool(value, defaultVal = false) {
  const options = { '是': true, '否': false };
  return options[value] ?? defaultVal;
}

/**
 * Update file content - replace old string with new string
 */
export function updateFile(filePath, oldStr, newStr, startStr = null) {
  if (oldStr === newStr && !startStr) return oldStr;
  if (!fs.existsSync(filePath)) return oldStr;

  const content = fs.readFileSync(filePath, TEXT_ENCODING);
  const lines = content.split('\n');
  const fileData = [];

  for (let line of lines) {
    if (line.includes(oldStr)) {
      line = line.replace(oldStr, newStr);
      if (startStr) {
        line = startStr + line;
      }
    }
    if (!fileData.includes(line)) {
      fileData.push(line);
    }
  }

  fs.writeFileSync(filePath, fileData.join('\n'), TEXT_ENCODING);
  return newStr;
}

/**
 * Delete a line from file
 */
export function deleteLine(filePath, delLine, deleteAll = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, TEXT_ENCODING);
  const lines = content.split('\n');
  const result = [];
  let skipLine = false;

  for (const line of lines) {
    if (line.includes(delLine)) {
      if (deleteAll || !skipLine) {
        skipLine = true;
        continue;
      }
    } else {
      skipLine = false;
    }
    result.push(line);
  }

  fs.writeFileSync(filePath, result.join('\n'), TEXT_ENCODING);
}

/**
 * Backup file with timestamp
 */
export function backupFile(filePath, backupDirPath = BACKUP_DIR, limitCounts = 6) {
  try {
    fs.mkdirSync(backupDirPath, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = path.basename(filePath);
    const backupPath = path.join(backupDirPath, `${baseName}_${timestamp}`);
    fs.copyFileSync(filePath, backupPath);

    // Keep only limited backups
    const files = fs.readdirSync(backupDirPath)
      .filter(f => f.startsWith(baseName))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(backupDirPath, a));
        const statB = fs.statSync(path.join(backupDirPath, b));
        return statA.mtimeMs - statB.mtimeMs;
      });

    while (files.length > limitCounts) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(backupDirPath, oldest));
    }
  } catch (e) {
    console.error(`备份配置文件 ${filePath} 失败：${e.message}`);
  }
}

/**
 * Load all application settings from config
 */
export function loadAppSettings() {
  const config = loadConfig();

  const settings = {
    language: readConfigValue(config, '录制设置', 'language(zh_cn/en)', 'zh_cn'),
    skipProxyCheck: parseBool(readConfigValue(config, '录制设置', '是否跳过代理检测(是/否)', '否')),
    videoSavePath: readConfigValue(config, '录制设置', '直播保存路径(不填则默认)', ''),
    folderByAuthor: parseBool(readConfigValue(config, '录制设置', '保存文件夹是否以作者区分', '是'), true),
    folderByTime: parseBool(readConfigValue(config, '录制设置', '保存文件夹是否以时间区分', '否')),
    folderByTitle: parseBool(readConfigValue(config, '录制设置', '保存文件夹是否以标题区分', '否')),
    filenameByTitle: parseBool(readConfigValue(config, '录制设置', '保存文件名是否包含标题', '否')),
    cleanEmoji: parseBool(readConfigValue(config, '录制设置', '是否去除名称中的表情符号', '是'), true),
    videoSaveType: readConfigValue(config, '录制设置', '视频保存格式ts|mkv|flv|mp4|mp3音频|m4a音频', 'ts'),
    videoRecordQuality: readConfigValue(config, '录制设置', '原画|超清|高清|标清|流畅', '原画'),
    useProxy: parseBool(readConfigValue(config, '录制设置', '是否使用代理ip(是/否)', '是'), true),
    proxyAddr: readConfigValue(config, '录制设置', '代理地址', ''),
    maxRequest: parseInt(readConfigValue(config, '录制设置', '同一时间访问网络的线程数', '3')),
    delayDefault: parseInt(readConfigValue(config, '录制设置', '循环时间(秒)', '300')),
    localDelayDefault: parseInt(readConfigValue(config, '录制设置', '排队读取网址时间(秒)', '0')),
    loopTime: parseBool(readConfigValue(config, '录制设置', '是否显示循环秒数', '否')),
    showUrl: parseBool(readConfigValue(config, '录制设置', '是否显示直播源地址', '否')),
    splitVideoByTime: parseBool(readConfigValue(config, '录制设置', '分段录制是否开启', '是'), true),
    // 实验性：FLV 流不经 ffmpeg，由 worker 线程 HTTP 拉流直接落盘（默认关闭，走 ffmpeg）
    directRecordFlv: parseBool(readConfigValue(config, '录制设置', '启用node直录flv(实验性)(是/否)', '否')),
    enableHttpsRecording: parseBool(readConfigValue(config, '录制设置', '是否强制启用https录制', '否')),
    diskSpaceLimit: parseFloat(readConfigValue(config, '录制设置', '录制空间剩余阈值(gb)', '1.0')),
    splitTime: String(readConfigValue(config, '录制设置', '视频分段时间(秒)', '1800')),
    convertsToMp4: parseBool(readConfigValue(config, '录制设置', '录制完成后自动转为mp4格式', '是'), true),
    convertsToH264: parseBool(readConfigValue(config, '录制设置', 'mp4格式重新编码为h264', '否')),
    deleteOriginFile: parseBool(readConfigValue(config, '录制设置', '追加格式后删除原文件', '是'), true),
    createTimeFile: parseBool(readConfigValue(config, '录制设置', '生成时间字幕文件', '否')),
    isRunScript: parseBool(readConfigValue(config, '录制设置', '是否录制完成后执行自定义脚本', '否')),
    customScript: readConfigValue(config, '录制设置', '自定义脚本执行命令', ''),
    enableProxyPlatform: readConfigValue(config, '录制设置', '使用代理录制的平台(逗号分隔)',
      'tiktok, sooplive, pandalive, winktv, flextv, popkontv, twitch, liveme, showroom, chzzk, shopee, shp, youtu'),
    extraEnableProxy: readConfigValue(config, '录制设置', '额外使用代理录制的平台(逗号分隔)', ''),
  };

  // Push settings
  settings.push = {
    liveStatusPush: readConfigValue(config, '推送配置', '直播状态推送渠道', ''),
    dingtalkApiUrl: readConfigValue(config, '推送配置', '钉钉推送接口链接', ''),
    xizhiApiUrl: readConfigValue(config, '推送配置', '微信推送接口链接', ''),
    barkMsgApi: readConfigValue(config, '推送配置', 'bark推送接口链接', ''),
    barkMsgLevel: readConfigValue(config, '推送配置', 'bark推送中断级别', 'active'),
    barkMsgRing: readConfigValue(config, '推送配置', 'bark推送铃声', 'bell'),
    dingtalkPhoneNum: readConfigValue(config, '推送配置', '钉钉通知@对象(填手机号)', ''),
    dingtalkIsAtall: parseBool(readConfigValue(config, '推送配置', '钉钉通知@全体(是/否)', '否')),
    tgToken: readConfigValue(config, '推送配置', 'tgapi令牌', ''),
    tgChatId: readConfigValue(config, '推送配置', 'tg聊天id(个人或者群组id)', ''),
    emailHost: readConfigValue(config, '推送配置', 'SMTP邮件服务器', ''),
    openSmtpSsl: parseBool(readConfigValue(config, '推送配置', '是否使用SMTP服务SSL加密(是/否)', '是'), true),
    smtpPort: readConfigValue(config, '推送配置', 'SMTP邮件服务器端口', ''),
    loginEmail: readConfigValue(config, '推送配置', '邮箱登录账号', ''),
    emailPassword: readConfigValue(config, '推送配置', '发件人密码(授权码)', ''),
    senderEmail: readConfigValue(config, '推送配置', '发件人邮箱', ''),
    senderName: readConfigValue(config, '推送配置', '发件人显示昵称', ''),
    toEmail: readConfigValue(config, '推送配置', '收件人邮箱', ''),
    ntfyApi: readConfigValue(config, '推送配置', 'ntfy推送地址', ''),
    ntfyTags: readConfigValue(config, '推送配置', 'ntfy推送标签', 'tada'),
    ntfyEmail: readConfigValue(config, '推送配置', 'ntfy推送邮箱', ''),
    pushplusToken: readConfigValue(config, '推送配置', 'pushplus推送token', ''),
    pushMessageTitle: readConfigValue(config, '推送配置', '自定义推送标题', '直播间状态更新通知'),
    beginPushMessageText: readConfigValue(config, '推送配置', '自定义开播推送内容', ''),
    overPushMessageText: readConfigValue(config, '推送配置', '自定义关播推送内容', ''),
    disableRecord: parseBool(readConfigValue(config, '推送配置', '只推送通知不录制(是/否)', '否')),
    pushCheckSeconds: parseInt(readConfigValue(config, '推送配置', '直播推送检测频率(秒)', '1800')),
    beginShowPush: parseBool(readConfigValue(config, '推送配置', '开播推送开启(是/否)', '是'), true),
    overShowPush: parseBool(readConfigValue(config, '推送配置', '关播推送开启(是/否)', '否')),
  };

  // Cookies
  settings.cookies = {
    douyin: readConfigValue(config, 'Cookie', '抖音cookie', ''),
    kuaishou: readConfigValue(config, 'Cookie', '快手cookie', ''),
    tiktok: readConfigValue(config, 'Cookie', 'tiktok_cookie', ''),
    huya: readConfigValue(config, 'Cookie', '虎牙cookie', ''),
    douyu: readConfigValue(config, 'Cookie', '斗鱼cookie', ''),
    yy: readConfigValue(config, 'Cookie', 'yy_cookie', ''),
    bilibili: readConfigValue(config, 'Cookie', 'b站cookie', ''),
    xiaohongshu: readConfigValue(config, 'Cookie', '小红书cookie', ''),
    bigo: readConfigValue(config, 'Cookie', 'bigo_cookie', ''),
    blued: readConfigValue(config, 'Cookie', 'blued_cookie', ''),
    sooplive: readConfigValue(config, 'Cookie', 'sooplive_cookie', ''),
    netease: readConfigValue(config, 'Cookie', 'netease_cookie', ''),
    qiandurebo: readConfigValue(config, 'Cookie', '千度热播_cookie', ''),
    pandatv: readConfigValue(config, 'Cookie', 'pandatv_cookie', ''),
    maoerfm: readConfigValue(config, 'Cookie', '猫耳fm_cookie', ''),
    winktv: readConfigValue(config, 'Cookie', 'winktv_cookie', ''),
    flextv: readConfigValue(config, 'Cookie', 'flextv_cookie', ''),
    look: readConfigValue(config, 'Cookie', 'look_cookie', ''),
    twitcasting: readConfigValue(config, 'Cookie', 'twitcasting_cookie', ''),
    baidu: readConfigValue(config, 'Cookie', 'baidu_cookie', ''),
    weibo: readConfigValue(config, 'Cookie', 'weibo_cookie', ''),
    kugou: readConfigValue(config, 'Cookie', 'kugou_cookie', ''),
    twitch: readConfigValue(config, 'Cookie', 'twitch_cookie', ''),
    liveme: readConfigValue(config, 'Cookie', 'liveme_cookie', ''),
    huajiao: readConfigValue(config, 'Cookie', 'huajiao_cookie', ''),
    liuxing: readConfigValue(config, 'Cookie', 'liuxing_cookie', ''),
    showroom: readConfigValue(config, 'Cookie', 'showroom_cookie', ''),
    acfun: readConfigValue(config, 'Cookie', 'acfun_cookie', ''),
    changliao: readConfigValue(config, 'Cookie', 'changliao_cookie', ''),
    yinbo: readConfigValue(config, 'Cookie', 'yinbo_cookie', ''),
    yingke: readConfigValue(config, 'Cookie', 'yingke_cookie', ''),
    zhihu: readConfigValue(config, 'Cookie', 'zhihu_cookie', ''),
    chzzk: readConfigValue(config, 'Cookie', 'chzzk_cookie', ''),
    haixiu: readConfigValue(config, 'Cookie', 'haixiu_cookie', ''),
    vvxqiu: readConfigValue(config, 'Cookie', 'vvxqiu_cookie', ''),
    yiqilive: readConfigValue(config, 'Cookie', '17live_cookie', ''),
    langlive: readConfigValue(config, 'Cookie', 'langlive_cookie', ''),
    pplive: readConfigValue(config, 'Cookie', 'pplive_cookie', ''),
    sixRoom: readConfigValue(config, 'Cookie', '6room_cookie', ''),
    lehaitv: readConfigValue(config, 'Cookie', 'lehaitv_cookie', ''),
    huamao: readConfigValue(config, 'Cookie', 'huamao_cookie', ''),
    shopee: readConfigValue(config, 'Cookie', 'shopee_cookie', ''),
    youtube: readConfigValue(config, 'Cookie', 'youtube_cookie', ''),
    taobao: readConfigValue(config, 'Cookie', 'taobao_cookie', ''),
    jd: readConfigValue(config, 'Cookie', 'jd_cookie', ''),
    faceit: readConfigValue(config, 'Cookie', 'faceit_cookie', ''),
    migu: readConfigValue(config, 'Cookie', 'migu_cookie', ''),
    lianjie: readConfigValue(config, 'Cookie', 'lianjie_cookie', ''),
    laixiu: readConfigValue(config, 'Cookie', 'laixiu_cookie', ''),
    picarto: readConfigValue(config, 'Cookie', 'picarto_cookie', ''),
  };

  // Accounts
  settings.accounts = {
    soopliveUsername: readConfigValue(config, '账号密码', 'sooplive账号', ''),
    sooplivePassword: readConfigValue(config, '账号密码', 'sooplive密码', ''),
    flextvUsername: readConfigValue(config, '账号密码', 'flextv账号', ''),
    flextvPassword: readConfigValue(config, '账号密码', 'flextv密码', ''),
    popkontvUsername: readConfigValue(config, '账号密码', 'popkontv账号', ''),
    popkontvPartnerCode: readConfigValue(config, '账号密码', 'partner_code', 'P-00001'),
    popkontvPassword: readConfigValue(config, '账号密码', 'popkontv密码', ''),
    twitcastingAccountType: readConfigValue(config, '账号密码', 'twitcasting账号类型', 'normal'),
    twitcastingUsername: readConfigValue(config, '账号密码', 'twitcasting账号', ''),
    twitcastingPassword: readConfigValue(config, '账号密码', 'twitcasting密码', ''),
  };

  // Authorization
  settings.auth = {
    popkontvToken: readConfigValue(config, 'Authorization', 'popkontv_token', ''),
  };

  // Normalize video save type
  const validTypes = ['FLV', 'MKV', 'TS', 'MP4', 'MP3音频', 'M4A音频', 'MP3', 'M4A'];
  if (settings.videoSaveType && validTypes.includes(settings.videoSaveType.toUpperCase())) {
    settings.videoSaveType = settings.videoSaveType.toUpperCase();
  } else {
    settings.videoSaveType = 'TS';
  }

  // Proxy settings
  settings.proxyAddr = settings.useProxy ? (settings.proxyAddr || null) : null;
  settings.enableProxyPlatformList = settings.enableProxyPlatform
    ? settings.enableProxyPlatform.replace('，', ',').split(',').map(s => s.trim())
    : [];
  settings.extraEnableProxyPlatformList = settings.extraEnableProxy
    ? settings.extraEnableProxy.replace('，', ',').split(',').map(s => s.trim())
    : [];

  // 仅当补充了缺失配置项时才回写文件（主循环会周期性重新加载配置）
  const newContent = ini.stringify(config);
  const oldContent = fs.existsSync(CONFIG_FILE)
    ? fs.readFileSync(CONFIG_FILE, TEXT_ENCODING).replace(/^\uFEFF/, '')
    : null;
  if (oldContent !== newContent) {
    fs.writeFileSync(CONFIG_FILE, newContent, TEXT_ENCODING);
  }

  return settings;
}
