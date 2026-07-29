"""
URL_config.ini / config.ini 管理服务

提供接口：
  GET  /api/config      读取 config/URL_config.ini，解析成 JSON 返回给前端
  POST /api/config      接收前端提交的完整列表，重新写回 config/URL_config.ini
  GET  /api/app-config  读取 config/config.ini，按分区解析成 JSON 返回
  POST /api/app-config  接收分区键值，原位替换值写回 config/config.ini（保留注释/结构）

URL_config.ini 约定的行格式（与主项目 main.py 保持一致）：
  [画质,]直播间URL[,主播: 名称]
  行首带 '#' 表示该行被注释（不录制），去掉 '#' 表示启用。
"""
import os
import re
import gzip
import logging
import mimetypes
import threading
from email.utils import formatdate, parsedate_to_datetime

from flask import Flask, jsonify, make_response, request

# ---------------------------------------------------------------------------
# 路径与常量
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# backend 位于 <项目根>/url_config_manager/backend，向上两级即项目根
PROJECT_ROOT = os.path.normpath(os.path.join(BASE_DIR, "..", ".."))
CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "URL_config.ini")
APP_CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "config.ini")
# 前端构建产物目录（vite build 输出到 backend/static）
STATIC_DIR = os.path.join(BASE_DIR, "static")

# 与 main.py 中保持一致，兼容带 BOM 的文件
ENCODING = "utf-8-sig"

# main.py 支持的画质枚举
QUALITIES = ("原画", "蓝光", "超清", "高清", "标清", "流畅")

# 禁用 Flask 内置静态路由（static_url_path=None），静态资源与 SPA 回退统一由下方 serve_spa 处理，
# 避免内置 /<path:filename> 静态路由抢先匹配前端路由路径（如 /url-config）导致 404。
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path=None)


# ---------------------------------------------------------------------------
# CORS：允许前端开发服务器直接访问（同时前端也配置了 vite 代理，双保险）
# ---------------------------------------------------------------------------
@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


# ---------------------------------------------------------------------------
# 解析 / 构建
# ---------------------------------------------------------------------------
def parse_content(content: str):
    """把去掉 '#' 后的正文解析成 (画质, url, 主播名)。"""
    parts = [p.strip() for p in re.split("[,，]", content) if p.strip() != ""]
    quality = ""
    url = ""
    name = ""

    idx = 0
    # 第一段如果是已知画质，则取出
    if parts and parts[0] in QUALITIES:
        quality = parts[0]
        idx = 1

    # 下一段作为 url
    if idx < len(parts):
        url = parts[idx]
        idx += 1

    # 剩余段落里查找 “主播: xxx”
    for p in parts[idx:]:
        m = re.match(r"^主播\s*[:：]\s*(.*)$", p)
        if m:
            name = m.group(1).strip()
        elif not name:
            # 兜底：没有 “主播:” 前缀时，把剩余内容当作名字
            name = p
    return quality, url, name


def parse_ini(text: str):
    """把整个文件文本解析成记录列表。空行会被忽略。"""
    items = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line == "":
            continue

        enabled = not line.startswith("#")
        content = line.lstrip("#").strip()
        if content == "":
            continue

        quality, url, name = parse_content(content)
        items.append(
            {
                "enabled": enabled,
                "quality": quality,
                "url": url,
                "name": name,
            }
        )
    return items


def build_line(item: dict) -> str:
    """把单条记录还原成文件里的一行。"""
    url = (item.get("url") or "").strip()
    name = (item.get("name") or "").strip()
    quality = (item.get("quality") or "").strip()

    core = url
    if quality:
        core = f"{quality},{core}"
    if name:
        core = f"{core},主播: {name}"

    prefix = "" if item.get("enabled") else "#"
    return prefix + core


def build_ini(items) -> str:
    lines = [build_line(it) for it in items if (it.get("url") or "").strip()]
    # 末尾保留一个换行
    return "\n".join(lines) + ("\n" if lines else "")


# ---------------------------------------------------------------------------
# config.ini 解析 / 原位更新
# ---------------------------------------------------------------------------
def parse_app_config(text: str):
    """把 config.ini 按分区解析成 [{name, items: [{key, value}]}]。

    注释行（#/;）和空行跳过；键保留原文（含括号说明）。
    """
    sections = []
    current = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line == "" or line.startswith("#") or line.startswith(";"):
            continue
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            current = {"name": m.group(1).strip(), "items": []}
            sections.append(current)
            continue
        if current is None or "=" not in line:
            continue
        key, _, value = line.partition("=")
        current["items"].append({"key": key.strip(), "value": value.strip()})
    return sections


def update_app_config(text: str, sections) -> str:
    """原位更新：只替换 'key = value' 行的值，注释/空行/未知键一律保留。"""
    # {(分区名, 键): 新值}
    new_values = {}
    for sec in sections or []:
        sec_name = (sec.get("name") or "").strip()
        for it in sec.get("items") or []:
            key = (it.get("key") or "").strip()
            if sec_name and key:
                new_values[(sec_name, key)] = str(it.get("value") if it.get("value") is not None else "").strip()

    out_lines = []
    current_section = ""
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("#") or line.startswith(";") or line == "":
            out_lines.append(raw_line)
            continue
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            current_section = m.group(1).strip()
            out_lines.append(raw_line)
            continue
        if "=" in line:
            key = line.partition("=")[0].strip()
            if (current_section, key) in new_values:
                out_lines.append(f"{key} = {new_values[(current_section, key)]}")
                continue
        out_lines.append(raw_line)
    return "\n".join(out_lines) + "\n"


# ---------------------------------------------------------------------------
# 路由
# ---------------------------------------------------------------------------
def _config_file_response(path: str, build_payload):
    """GET 配置接口的协商缓存包装：以文件 mtime+size 生成 ETag。

    文件未变时返回 304（免解析、免传输）；文件不存在时不带缓存头正常返回。
    Cache-Control 用 no-cache：浏览器可缓存但每次必须回源验证，保证拿到的永远是最新配置。
    build_payload(text) 把文件文本构造成响应 dict，仅在需要完整响应时才调用。
    """
    try:
        st = os.stat(path) if os.path.isfile(path) else None
    except OSError:
        st = None

    if st is None:
        return jsonify(build_payload(""))

    etag = _make_etag(st, False)
    if _is_not_modified(etag, st.st_mtime):
        resp = make_response("", 304)
    else:
        with open(path, "r", encoding=ENCODING, errors="ignore") as f:
            text = f.read()
        resp = make_response(jsonify(build_payload(text)))
    resp.headers["ETag"] = etag
    resp.headers["Last-Modified"] = formatdate(st.st_mtime, usegmt=True)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/api/config", methods=["GET"])
def get_config():
    try:
        return _config_file_response(
            CONFIG_PATH,
            lambda text: {"success": True, "path": CONFIG_PATH, "items": parse_ini(text)},
        )
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/config", methods=["POST", "OPTIONS"])
def save_config():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        payload = request.get_json(force=True, silent=True) or {}
        items = payload.get("items", [])
        if not isinstance(items, list):
            return jsonify({"success": False, "error": "items 必须是数组"}), 400

        text = build_ini(items)
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w", encoding=ENCODING) as f:
            f.write(text)
        return jsonify({"success": True, "count": len(parse_ini(text))})
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/app-config", methods=["GET"])
def get_app_config():
    try:
        return _config_file_response(
            APP_CONFIG_PATH,
            lambda text: {"success": True, "path": APP_CONFIG_PATH, "sections": parse_app_config(text)},
        )
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/app-config", methods=["POST", "OPTIONS"])
def save_app_config():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        payload = request.get_json(force=True, silent=True) or {}
        sections = payload.get("sections", [])
        if not isinstance(sections, list):
            return jsonify({"success": False, "error": "sections 必须是数组"}), 400

        if os.path.isfile(APP_CONFIG_PATH):
            with open(APP_CONFIG_PATH, "r", encoding=ENCODING, errors="ignore") as f:
                text = f.read()
        else:
            text = ""
        new_text = update_app_config(text, sections)
        os.makedirs(os.path.dirname(APP_CONFIG_PATH), exist_ok=True)
        with open(APP_CONFIG_PATH, "w", encoding=ENCODING) as f:
            f.write(new_text)
        count = sum(len(s.get("items") or []) for s in sections)
        return jsonify({"success": True, "count": count})
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------------------------
# 静态资源：gzip 压缩 + 协商缓存（ETag / Last-Modified / 304）
# ---------------------------------------------------------------------------
# 小于该字节数的文件压缩收益有限，直接原样返回
GZIP_MIN_SIZE = 1024
# gzip 压缩级别（6 为体积/CPU 的平衡点）
GZIP_LEVEL = 6

# 除 text/* 之外仍值得压缩的类型
_COMPRESSIBLE_MIMES = {
    "application/javascript",
    "text/javascript",
    "application/json",
    "application/manifest+json",
    "application/xml",
    "text/xml",
    "image/svg+xml",
    "application/wasm",
}

# 运行时 gzip 结果缓存：{绝对路径: ((mtime_ns, size), gzip 字节)}
_GZIP_CACHE = {}
_GZIP_CACHE_LOCK = threading.Lock()


def _guess_mimetype(path: str) -> str:
    mime, _ = mimetypes.guess_type(path)
    return mime or "application/octet-stream"


def _is_compressible(mime: str) -> bool:
    return mime.startswith("text/") or mime in _COMPRESSIBLE_MIMES


def _client_accepts_gzip() -> bool:
    return "gzip" in (request.headers.get("Accept-Encoding") or "").lower()


def _make_etag(st: os.stat_result, gzipped: bool) -> str:
    """基于 mtime + size 生成强 ETag；压缩与非压缩内容必须使用不同 ETag。"""
    return '"%x-%x%s"' % (int(st.st_mtime), st.st_size, "-gz" if gzipped else "")


def _cache_control_for(rel_path: str) -> str:
    rel = rel_path.replace("\\", "/")
    if rel.startswith("assets/"):
        # assets/ 下均为 vite 构建产物，文件名带内容 hash（内容变化必然改名），
        # 可长期强缓存；即便如此仍返回 ETag，强制刷新时可走 304
        return "public, max-age=31536000, immutable"
    # index.html 等入口文件：每次请求都回源校验（协商缓存）
    return "no-cache"


def _load_gzip_bytes(full_path: str, st: os.stat_result):
    """优先使用构建时生成的 .gz 文件；否则内存压缩并按 (mtime, size) 缓存。"""
    pre_built = full_path + ".gz"
    if os.path.isfile(pre_built):
        try:
            with open(pre_built, "rb") as f:
                return f.read()
        except OSError:
            pass

    stamp = (st.st_mtime_ns, st.st_size)
    with _GZIP_CACHE_LOCK:
        cached = _GZIP_CACHE.get(full_path)
        if cached is not None and cached[0] == stamp:
            return cached[1]
    try:
        with open(full_path, "rb") as f:
            raw = f.read()
    except OSError:
        return None
    # mtime=0：保证同一文件每次压缩输出一致，便于下游缓存
    data = gzip.compress(raw, GZIP_LEVEL, mtime=0)
    with _GZIP_CACHE_LOCK:
        _GZIP_CACHE[full_path] = (stamp, data)
    return data


def _is_not_modified(etag: str, mtime: float) -> bool:
    """按 RFC 9110：If-None-Match 优先于 If-Modified-Since。"""
    inm = request.headers.get("If-None-Match")
    if inm:
        if inm.strip() == "*":
            return True
        for tag in inm.split(","):
            tag = tag.strip()
            if tag.startswith("W/"):
                tag = tag[2:]
            if tag == etag:
                return True
        return False

    ims = request.headers.get("If-Modified-Since")
    if ims:
        try:
            since = parsedate_to_datetime(ims)
        except (TypeError, ValueError):
            return False
        if since is None:
            return False
        return int(mtime) <= int(since.timestamp())
    return False


def _send_static(rel_path: str):
    """返回 static 目录下的文件；不存在则返回 None。

    统一处理：gzip（预压缩文件优先）、ETag / Last-Modified 协商缓存、Cache-Control。
    """
    rel_path = (rel_path or "").replace("\\", "/").lstrip("/")
    root = os.path.normpath(STATIC_DIR)
    full_path = os.path.normpath(os.path.join(root, rel_path))
    # 防止 ../ 目录穿越
    if full_path != root and not full_path.startswith(root + os.sep):
        return None
    if not os.path.isfile(full_path):
        return None

    try:
        st = os.stat(full_path)
    except OSError:
        return None

    mime = _guess_mimetype(full_path)
    body = None
    gzipped = (
        _client_accepts_gzip()
        and _is_compressible(mime)
        and st.st_size >= GZIP_MIN_SIZE
    )
    if gzipped:
        body = _load_gzip_bytes(full_path, st)
        # 压缩失败或反而变大时退回原文件
        if body is None or len(body) >= st.st_size:
            gzipped = False
            body = None

    etag = _make_etag(st, gzipped)
    if _is_not_modified(etag, st.st_mtime):
        resp = make_response("", 304)
    else:
        if body is None:
            try:
                with open(full_path, "rb") as f:
                    body = f.read()
            except OSError:
                return None
        resp = make_response(body)
        resp.headers["Content-Type"] = mime
        resp.headers["Content-Length"] = str(len(body))
        if gzipped:
            resp.headers["Content-Encoding"] = "gzip"

    resp.headers["ETag"] = etag
    resp.headers["Last-Modified"] = formatdate(st.st_mtime, usegmt=True)
    resp.headers["Cache-Control"] = _cache_control_for(rel_path)
    # 同一 URL 会根据 Accept-Encoding 返回不同内容，必须声明 Vary
    resp.headers["Vary"] = "Accept-Encoding"
    resp.headers["Accept-Ranges"] = "none"
    return resp


# ---------------------------------------------------------------------------
# 前端静态页面（构建产物位于 backend/static）
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    resp = _send_static("index.html")
    if resp is None:
        return jsonify({"success": False, "error": "前端未构建：缺少 static/index.html"}), 404
    return resp


@app.route("/<path:path>")
def serve_spa(path):
    """非 /api 请求：存在对应静态文件则返回，否则回退 index.html（SPA 前端路由）。"""
    resp = _send_static(path)
    if resp is not None:
        return resp
    return index()


# ---------------------------------------------------------------------------
# 启动入口
# ---------------------------------------------------------------------------
def _serve_hypercorn(host: str, port: int, certfile: str | None, keyfile: str | None):
    """用 Hypercorn（ASGI）承载 Flask 应用，提供 HTTP/2 支持。

    - 明文监听时支持 h2c（prior-knowledge 与 Upgrade 升级），HTTP/1.1 客户端不受影响；
    - 提供证书时启用 TLS + ALPN，浏览器即可协商 h2（浏览器仅在 HTTPS 下使用 HTTP/2）。
    """
    import asyncio

    from asgiref.wsgi import WsgiToAsgi
    from hypercorn.asyncio import serve as hypercorn_serve
    from hypercorn.config import Config as HypercornConfig

    asgi_app = WsgiToAsgi(app)

    async def _asgi(scope, receive, send):
        # WsgiToAsgi 不处理 lifespan 协议，这里补齐，避免 Hypercorn 启动时告警
        if scope["type"] == "lifespan":
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        else:
            await asgi_app(scope, receive, send)

    config = HypercornConfig()
    config.bind = [f"{host}:{port}"]
    config.alpn_protocols = ["h2", "http/1.1"]
    # 关闭逐请求访问日志，并将错误日志阈值提到 WARNING（抑制启动 banner，避免干扰主程序日志）
    config.accesslog = None
    config.loglevel = "WARNING"
    if certfile and keyfile:
        config.certfile = certfile
        config.keyfile = keyfile

    async def _serve_forever():
        # 显式传入永不触发的 shutdown_trigger：默认实现会注册信号处理器，
        # 在非主线程中调用 signal.signal 会抛 ValueError
        await hypercorn_serve(_asgi, config, shutdown_trigger=asyncio.Event().wait)

    asyncio.run(_serve_forever())


def run_server(
    host: str = "0.0.0.0",
    port: int = 5000,
    certfile: str | None = None,
    keyfile: str | None = None,
) -> threading.Thread:
    """在后台守护线程中启动 Web 管理台，不阻塞主录制流程。

    优先使用 Hypercorn（支持 HTTP/2），未安装时依次退回 waitress / Werkzeug（仅 HTTP/1.1）。
    """
    def _run():
        try:
            _serve_hypercorn(host, port, certfile, keyfile)
            return
        except ImportError:
            pass
        try:
            # 生产级 WSGI 服务器：多线程、自带连接数与超时限制，且跨平台（Windows 可用）
            # 用 create_server 而非 serve()：后者会调用 logging.basicConfig() 并打印 banner，
            # 会干扰主程序既有的日志配置
            from waitress import create_server
            create_server(app, host=host, port=port, threads=8).run()
        except ImportError:
            # 兜底退回 Werkzeug 开发服务器，保证功能可用
            # 关闭 reloader（子进程模式不适合嵌入主程序），关闭 debug 减少日志
            app.run(host=host, port=port, debug=False, use_reloader=False)

    # 抑制逐请求访问日志，仅保留错误（满足“少量日志”）
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    logging.getLogger("waitress").setLevel(logging.ERROR)
    logging.getLogger("hypercorn.access").setLevel(logging.ERROR)
    logging.getLogger("hypercorn.error").setLevel(logging.ERROR)
    thread = threading.Thread(target=_run, name="url-config-manager", daemon=True)
    thread.start()
    return thread


if __name__ == "__main__":
    # 本地调试入口：直接前台运行 Hypercorn（HTTP/2）。
    # 只监听回环地址，避免暴露到局域网
    print(f"配置文件路径: {CONFIG_PATH}")
    _serve_hypercorn("127.0.0.1", 5000, None, None)
