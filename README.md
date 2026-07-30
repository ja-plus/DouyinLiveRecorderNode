# DouyinLiveRecorderNode

基于 Node.js 实现的直播录制工具，源于 [ihmily/DouyinLiveRecorder](https://github.com/ihmily/DouyinLiveRecorder) 的 Node.js 移植版本。支持多平台直播的循环监测与自动录制，并内置 Web 配置管理台。

## 功能特性

- 🎥 多路直播同时监测与录制，开播自动录制、关播自动停止
- 📺 支持多平台：抖音、TikTok、快手、虎牙、斗鱼、YY、B站、自定义直播流
- 🎬 多种保存格式：TS / MKV / FLV / MP4 / MP3音频 / M4A音频
- ✂️ 支持按时长分段录制，录制完成后可自动转 MP4（可选重编码 H264）
- ⚡ 实验性 Node 直录模式：FLV 直连流不经 ffmpeg 直接落盘
- 🔔 开播/关播消息推送：钉钉、微信、Bark、Telegram、SMTP 邮件、ntfy、pushplus
- 🌐 支持代理录制海外平台（TikTok 等），自动检测系统代理
- 🖥️ 内置 Web 配置管理台（Vue 3 + Fastify），可在线管理录制地址与配置
- 🔄 配置热更新：`config.ini` 与 `URL_config.ini` 修改实时生效，无需重启

## 环境要求

- [Node.js](https://nodejs.org/) >= 18.0.0
- [FFmpeg](https://ffmpeg.org/download.html)（需加入系统 PATH，录制依赖）

## 快速开始

### 1. 安装依赖

```bash
npm install
# 或
pnpm install
```

### 2. 添加录制地址

编辑 `config/URL_config.ini`，每行一个直播间地址，格式如下：

```ini
# 直接填地址（默认使用 config.ini 中的画质）
https://live.douyin.com/123456789

# 指定画质,地址
超清,https://live.douyin.com/123456789

# 画质,地址,备注（主播名会在首次录制时自动回写）
原画,https://live.douyin.com/123456789,主播: 某某

# 行首加 # 可临时停止监测该地址
#https://live.douyin.com/123456789
```

支持的画质：`原画`、`蓝光`、`超清`、`高清`、`标清`、`流畅`。

### 3. 启动

```bash
npm start
```

启动后会自动开启循环监测，主播开播即自动录制。录制文件默认保存在 `downloads/` 目录下，按平台/主播分类存放。

## Web 配置管理台

程序启动时会自动运行 Web 配置管理台，访问地址：

```
http://127.0.0.1:5000
```

可在线完成：

- 录制地址的增删改、注释/取消注释
- `config.ini` 各项配置的可视化编辑
- 查看与回放已录制的视频

也可以单独启动管理台（不启动录制）：

```bash
npm run config-manager
```

## 配置说明

主配置文件为 `config/config.ini`，常用配置项：

| 配置项 | 说明 |
| --- | --- |
| 直播保存路径 | 不填默认为 `downloads/` |
| 视频保存格式 | ts / mkv / flv / mp4 / mp3音频 / m4a音频 |
| 原画\|超清\|高清\|标清\|流畅 | 默认录制画质 |
| 循环时间(秒) | 直播状态检测间隔 |
| 分段录制是否开启 / 视频分段时间(秒) | 按时长切分录制文件 |
| 录制完成后自动转为mp4格式 | TS 录制完成后自动转封装 |
| 代理地址 / 使用代理录制的平台 | 海外平台（如 TikTok）需配置代理 |
| 启用node直录flv(实验性) | FLV 直连流跳过 ffmpeg 直接落盘 |
| [推送配置] | 钉钉 / 微信 / Bark / TG / 邮件 / ntfy / pushplus 推送 |
| [Cookie] | 各平台 Cookie，部分平台录制需要配置 |

配置修改后即时生效，无需重启程序。

## 项目结构

```
├── main.js                 # 主入口：监测循环与录制调度
├── config/
│   ├── config.ini          # 主配置文件
│   └── URL_config.ini      # 录制地址列表
├── src/
│   ├── platforms/          # 各平台直播源解析
│   ├── recorder/           # ffmpeg 录制 / Node 直录
│   ├── push/               # 消息推送
│   ├── crypto/             # 签名算法
│   ├── http/               # HTTP 客户端
│   ├── config/             # 配置加载
│   └── utils/              # 工具函数
├── config-manager/         # Web 配置管理台（Fastify + Vue 3）
├── downloads/              # 录制文件输出目录
└── logs/                   # 日志目录
```

## 免责声明

本项目仅供学习交流使用，请勿用于任何商业或违法用途。录制内容的版权归原作者/平台所有，使用本工具产生的一切后果由使用者自行承担。

## 致谢

- 原项目：[ihmily/DouyinLiveRecorder](https://github.com/ihmily/DouyinLiveRecorder)

## License

[MIT](LICENSE)
