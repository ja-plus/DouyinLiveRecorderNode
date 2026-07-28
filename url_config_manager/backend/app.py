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
import logging
import threading

from flask import Flask, jsonify, request, send_from_directory

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
@app.route("/api/config", methods=["GET"])
def get_config():
    try:
        if os.path.isfile(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding=ENCODING, errors="ignore") as f:
                text = f.read()
        else:
            text = ""
        items = parse_ini(text)
        return jsonify({"success": True, "path": CONFIG_PATH, "items": items})
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
        if os.path.isfile(APP_CONFIG_PATH):
            with open(APP_CONFIG_PATH, "r", encoding=ENCODING, errors="ignore") as f:
                text = f.read()
        else:
            text = ""
        sections = parse_app_config(text)
        return jsonify({"success": True, "path": APP_CONFIG_PATH, "sections": sections})
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
# 前端静态页面（构建产物位于 backend/static）
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:path>")
def serve_spa(path):
    """非 /api 请求：存在对应静态文件则返回，否则回退 index.html（SPA 前端路由）。"""
    full = os.path.join(STATIC_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


# ---------------------------------------------------------------------------
# 启动入口
# ---------------------------------------------------------------------------
def run_server(host: str = "0.0.0.0", port: int = 5000) -> threading.Thread:
    """在后台守护线程中启动 Web 管理台，不阻塞主录制流程。"""
    def _run():
        # 关闭 reloader（子进程模式不适合嵌入主程序），关闭 debug 减少日志
        app.run(host=host, port=port, debug=False, use_reloader=False)

    # 抑制 werkzeug 逐请求访问日志，仅保留错误（满足“少量日志”）
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    thread = threading.Thread(target=_run, name="url-config-manager", daemon=True)
    thread.start()
    return thread


if __name__ == "__main__":
    print(f"配置文件路径: {CONFIG_PATH}")
    app.run(host="0.0.0.0", port=5000, debug=True)
