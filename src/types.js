/*
 * Shared JSDoc type definitions (no runtime code)
 * 供 checkJs 类型检查使用，各模块通过
 * `/** @typedef {import('../types.js').Xxx} Xxx *\/` 引入
 */

/**
 * 平台 getStreamInfo 返回的直播流信息
 * @typedef {Object} StreamInfo
 * @property {string} anchor_name - 主播昵称（获取失败时为空字符串）
 * @property {boolean} is_live - 是否正在直播
 * @property {string} [title] - 直播间标题
 * @property {string} [quality] - 实际画质档位（OD/BD/UHD/HD/SD/LD）
 * @property {string} [flv_url] - FLV 直播源地址
 * @property {string} [m3u8_url] - HLS 直播源地址
 * @property {string} [record_url] - 推荐录制源地址
 */

/**
 * 平台 getStreamInfo 的可选参数
 * @typedef {Object} StreamInfoOptions
 * @property {string|null} [proxyAddr] - 代理地址
 * @property {string} [cookies] - 平台 cookie
 * @property {string} [quality] - 期望画质档位（OD/BD/UHD/HD/SD/LD）
 */

/**
 * URL_config.ini 解析出的监测条目：[画质, 直播地址, 主播名备注]
 * @typedef {[string, string, string]} UrlTuple
 */

/**
 * ini 解析结果（节名 -> 键值对）
 * @typedef {Record<string, any>} IniConfig
 */

/**
 * 推送配置（对应 config.ini 的 [推送配置]）
 * @typedef {Object} PushSettings
 * @property {string} liveStatusPush - 推送渠道（微信/钉钉/邮箱/TG/BARK/NTFY/PUSHPLUS 组合）
 * @property {string} dingtalkApiUrl
 * @property {string} xizhiApiUrl
 * @property {string} barkMsgApi
 * @property {string} barkMsgLevel
 * @property {string} barkMsgRing
 * @property {string} dingtalkPhoneNum
 * @property {boolean} dingtalkIsAtall
 * @property {string} tgToken
 * @property {string} tgChatId
 * @property {string} emailHost
 * @property {boolean} openSmtpSsl
 * @property {string} smtpPort
 * @property {string} loginEmail
 * @property {string} emailPassword
 * @property {string} senderEmail
 * @property {string} senderName
 * @property {string} toEmail
 * @property {string} ntfyApi
 * @property {string} ntfyTags
 * @property {string} ntfyEmail
 * @property {string} pushplusToken
 * @property {string} pushMessageTitle
 * @property {string} beginPushMessageText
 * @property {string} overPushMessageText
 * @property {boolean} disableRecord - 只推送通知不录制
 * @property {number} pushCheckSeconds
 * @property {boolean} beginShowPush
 * @property {boolean} overShowPush
 */

/**
 * 各平台 Cookie 配置（对应 config.ini 的 [Cookie]）
 * @typedef {Object<string, string>} CookiesMap
 */

/**
 * 全局应用配置（loadAppSettings 返回值）
 * @typedef {Object} AppSettings
 * @property {string} language
 * @property {boolean} skipProxyCheck
 * @property {string} videoSavePath
 * @property {boolean} folderByAuthor
 * @property {boolean} folderByTime
 * @property {boolean} folderByTitle
 * @property {boolean} filenameByTitle
 * @property {boolean} cleanEmoji
 * @property {string} videoSaveType - TS/FLV/MKV/MP4/MP3/M4A
 * @property {string} videoRecordQuality - 原画/蓝光/超清/高清/标清/流畅
 * @property {boolean} useProxy
 * @property {string|null} proxyAddr
 * @property {number} maxRequest
 * @property {number} delayDefault
 * @property {number} localDelayDefault
 * @property {boolean} loopTime
 * @property {boolean} showUrl
 * @property {boolean} splitVideoByTime
 * @property {boolean} directRecordFlv
 * @property {boolean} enableHttpsRecording
 * @property {number} diskSpaceLimit
 * @property {string} splitTime
 * @property {boolean} convertsToMp4
 * @property {boolean} convertsToH264
 * @property {boolean} deleteOriginFile
 * @property {boolean} createTimeFile
 * @property {boolean} isRunScript
 * @property {string} customScript
 * @property {string} enableProxyPlatform
 * @property {string} extraEnableProxy
 * @property {PushSettings} push
 * @property {CookiesMap} cookies
 * @property {Record<string, string>} accounts
 * @property {Record<string, string>} auth
 * @property {string[]} enableProxyPlatformList
 * @property {string[]} extraEnableProxyPlatformList
 */

/**
 * ffmpeg 录制结果（runRecording）
 * @typedef {Object} RecordingResult
 * @property {number|null} code - 进程退出码
 * @property {boolean} stopped - 是否被主动停止（URL 注释/删除或程序退出）
 * @property {string[]} [files] - 直录模式下的分片文件列表（仅 runDirectRecording 返回）
 */

/**
 * Node 直录结果（runDirectRecording），在 RecordingResult 基础上带分片文件列表
 * @typedef {RecordingResult & { files: string[] }} DirectRecordingResult
 */

/**
 * 录制停止检测回调：返回 true 表示应停止录制
 * @typedef {() => boolean} StopChecker
 */

export {};
