# DouyinLiveRecorder （含 Web 配置管理台）

> 本仓库 Fork 自 [**ihmily/DouyinLiveRecorder**](https://github.com/ihmily/DouyinLiveRecorder)，在保留原项目全部录制能力的基础上，**新增了一个可视化的 Web 配置管理台**，用于图形化管理 `URL_config.ini`（直播间列表）和 `config.ini`（系统配置）。

---

## ✨ 本项目新增内容：Web 配置管理台

原项目的配置需要手动编辑 `config/URL_config.ini` 和 `config/config.ini` 两个文本文件，容易出错。本项目在 `url_config_manager/` 目录下新增了一套**前后端分离**的 Web 管理界面，让配置可视化、更易维护。

### 运行截图

**直播间管理**

![直播间管理](url_config_manager/screenshots/url-config.png)

**系统配置**

![系统配置](url_config_manager/screenshots/app-config.png)

### 功能特性

**直播间管理（`URL_config.ini`）**
- 表格化展示所有直播间记录，读取文件自动解析为结构化数据
- 每行一个开关：打开 = 启用录制，关闭 = 注释该行（`#`），与原项目的注释语义一致
- 支持新增（弹窗填写 URL）、删除（二次确认）、拖拽排序、复选框批量启用/关闭/删除
- 所有改动先在前端暂存，点「保存」才写回文件

**系统配置（`config.ini`）**
- 按分区（录制设置 / 推送配置 / Cookie / Authorization / 账号密码）分 Tab 展示
- 根据配置项类型自动选用控件：开关（是/否）、下拉（画质/格式/语言）、数字输入、密码框、Cookie 多行文本等
- 保存时**原位更新**——只替换对应值，完整保留原文件的注释、空行与结构，不影响 `main.py` 读取

**其他**
- 跟随操作系统自动切换亮色 / 暗色主题
- 顶栏导航布局，方便后续扩展更多管理页面

### 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python + Flask（读取/写回 ini 文件，提供 REST 接口） |
| 前端 | Vue 3 + TypeScript + Vite + Vue Router |
| UI | Arco Design Vue（按需引入） + [stk-table-vue](https://github.com/xyy94813/stk-table-vue)（高性能表格） |

---

## 🚀 快速开始（Web 管理台）

> 前提：已按原项目说明准备好 Python 环境，并在 `config/` 下存在 `URL_config.ini` 与 `config.ini`。

### 方式一：uv 一键启动（推荐）

项目使用 [uv](https://docs.astral.sh/uv/) 管理依赖（已提供 `pyproject.toml` + `uv.lock`），无需手动创建虚拟环境、无需 `pip install`，uv 会自动完成环境创建与依赖安装：

```bash
# 安装 uv（仅首次）
# Windows：powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
# Linux/macOS：curl -LsSf https://astral.sh/uv/install.sh | sh

# 启动（首次运行会自动创建 .venv 并按 uv.lock 安装全部依赖）
uv run main.py
```

前端构建产物已输出到 `url_config_manager/backend/static/`，Flask 会直接提供这些静态页面，因此**无需单独启动前端服务**。启动后会输出一行日志 `Web 配置管理台已启动: http://127.0.0.1:5000`，浏览器访问该地址即可使用（管理台在后台守护线程运行，不影响录制主流程）。

### 方式二：pip + python 传统方式

```bash
pip install -r requirements.txt
python main.py
```

> 若修改了前端代码，需重新构建以更新 `backend/static/`：
>
> ```bash
> cd url_config_manager/frontend
> npm install
> npm run build     # 先执行 vue-tsc 类型检查再打包，产物输出到 ../backend/static（含 .gz 预压缩文件）
> ```

### 方式三：前后端分离开发模式

适合需要调试前端、使用 Vite 热更新的场景：

```bash
# 终端 1：后端
cd url_config_manager/backend
uv run app.py            # http://127.0.0.1:5000（也可用 python app.py）

# 终端 2：前端开发服务器
cd url_config_manager/frontend
npm install
npm run dev              # http://localhost:5173（/api 已代理到后端）
```

### 后端接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/config` | 读取 `URL_config.ini`，解析为 JSON |
| POST | `/api/config` | 写回 `URL_config.ini` |
| GET | `/api/app-config` | 读取 `config.ini`，按分区解析为 JSON |
| POST | `/api/app-config` | 原位写回 `config.ini` |

---

## 📁 目录结构（新增部分）

```
url_config_manager/
├── backend/
│   ├── app.py            # Flask 服务：读写配置 + 提供静态页面 + run_server()
│   ├── requirements.txt
│   └── static/           # 前端构建产物（vite build 输出，随 Flask 一起提供）
├── frontend/
│   ├── src/
│   │   ├── App.vue                 # 顶栏布局 + 路由出口
│   │   ├── main.ts
│   │   ├── router/index.ts         # 路由（直播间管理 / 系统配置）
│   │   ├── types.ts                # 共享类型定义
│   │   ├── composables/useTheme.ts # 跟随系统的亮/暗色主题
│   │   ├── views/
│   │   │   ├── UrlConfigView.vue    # 直播间管理页（表格）
│   │   │   └── AppConfigView.vue    # 系统配置页（表单）
│   │   └── components/
│   │       └── ActionCell.vue       # 表格操作列（开关 + 删除）
│   ├── package.json
│   └── vite.config.ts
└── screenshots/          # README 截图
```

---

## 📄 License

本项目遵循原项目的开源协议，详见 [LICENSE](LICENSE)。原始录制功能版权归 [ihmily/DouyinLiveRecorder](https://github.com/ihmily/DouyinLiveRecorder) 所有。
