# -*- coding: utf-8 -*-
"""
抖音收藏音乐 - 独立网站服务
- 托管 public/ 静态页面
- GET  /api/music   返回 public/data/music.json 里的歌单（不请求抖音）
- POST /api/refresh 读取 config/cookies.txt（需手动创建）拉取收藏，整体覆盖
"""
import json
import logging
import os
import socket
import threading
import time
import webbrowser

from flask import Flask, jsonify, request

from requester import Request

# 关掉 werkzeug 自带的开发服务器 WARNING 和逐条英文请求日志，改用下面的简洁日志
logging.getLogger('werkzeug').setLevel(logging.ERROR)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, 'public', 'data', 'music.json')
COOKIES_PATH = os.path.join(BASE_DIR, 'config', 'cookies.txt')
LOG_PATH = os.path.join(BASE_DIR, 'logs', 'dymusic.log')

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'public'), static_url_path='')


# ---------- 日志：控制台 + logs/dymusic.log 双写 ----------
os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
_console_fmt = logging.Formatter('[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
_file_fmt = logging.Formatter('[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logging.basicConfig(level=logging.INFO)
for _h in (logging.StreamHandler(), logging.FileHandler(LOG_PATH, 'a', encoding='utf-8')):
    _h.setFormatter(_console_fmt if isinstance(_h, logging.StreamHandler) else _file_fmt)
    logging.getLogger().addHandler(_h)


# ---------- 歌单数据：单歌单，有新数据整体覆盖 ----------
# 结构：{'uid': '...', 'nickname': '...', 'ts': 123.0, 'data': [...]}
_playlist = None


def _load_cache():
    global _playlist
    try:
        with open(DATA_PATH, 'r', encoding='utf-8') as f:
            loaded = json.load(f)
    except Exception:
        return
    if isinstance(loaded, dict) and isinstance(loaded.get('data'), list):
        _playlist = loaded
    elif isinstance(loaded, list):
        # 兼容旧的多歌单数组：取最近更新的一份
        items = [u for u in loaded if isinstance(u, dict) and isinstance(u.get('data'), list)]
        if items:
            _playlist = max(items, key=lambda u: u.get('ts') or 0)


def _save_cache():
    try:
        os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
        with open(DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(_playlist, f, ensure_ascii=False)
    except Exception:
        pass


_load_cache()


# ---------- cookie：从 config/cookies.txt 读取（文件需手动创建） ----------
def _load_cookie_text() -> str:
    try:
        with open(COOKIES_PATH, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception:
        return ''


# ---------- 抖音接口 ----------
def fetch_user(req: Request) -> dict:
    """获取 cookie 对应用户 {uid, nickname}，失败返回空 dict"""
    try:
        res = req.getJSON('/aweme/v1/web/user/profile/self/', {})
    except Exception:
        return {}
    if not res or res.get('status_code') != 0:
        return {}
    u = res.get('user_info') or res.get('user') or {}
    uid = u.get('uid') or u.get('sec_uid') or ''
    nickname = u.get('nickname') or res.get('nickname') or ''
    return {'uid': str(uid), 'nickname': nickname} if uid else {}


def fetch_all_music(req: Request):
    """翻页拉取全部收藏音乐，返回精简字段列表"""
    all_music, cursor = [], '0'
    while True:
        res = req.getJSON('/aweme/v1/web/music/listcollection/', {'count': '18', 'cursor': cursor})
        if not res or res.get('status_code') != 0:
            raise RuntimeError(f"抖音接口返回异常: {res.get('status_msg') if res else '空响应'}")
        for m in res.get('mc_list') or []:
            cover = (m.get('cover_medium') or {}).get('url_list') or []
            play = (m.get('play_url') or {}).get('url_list') or []
            all_music.append({
                'id': m.get('id_str'),
                'title': m.get('title'),
                'author': m.get('author'),
                'duration': m.get('duration'),  # 秒
                'cover': cover[0] if cover else '',
                'play': play[0] if play else '',
            })
        if not res.get('has_more'):
            break
        cursor = str(res.get('cursor'))
        time.sleep(0.5)
    return all_music


# ---------- 路由 ----------
@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/music')
def api_music():
    """返回 public/data/music.json 里的歌单，不请求抖音"""
    slots = [_playlist] if _playlist else []
    playlists = [{
        'uid': u.get('uid', ''),
        'nickname': u['nickname'],
        'ts': u['ts'],
        'count': len(u['data'] or []),
        'list': u['data'] or [],
    } for u in slots]
    return jsonify({'code': 0, 'playlists': playlists})


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """读取 config/cookies.txt 拉取收藏，整体覆盖 public/data/music.json。
    文件不存在时提示先创建，停止操作"""
    global _playlist
    if not os.path.exists(COOKIES_PATH):
        return jsonify({'code': 2, 'msg': '请先在 config 文件夹下创建 cookies.txt，并粘贴抖音 cookie 内容'}), 400
    raw = _load_cookie_text()
    if not raw:
        return jsonify({'code': 2, 'msg': '缺少 cookie，请先粘贴'}), 400
    cookie = _parse_cookie(raw)
    if not cookie:
        return jsonify({'code': 3, 'msg': 'cookie 已失效，请重新粘贴'}), 400
    req = Request(cookie)
    u = fetch_user(req)
    if not u:
        return jsonify({'code': 3, 'msg': 'cookie 已失效，请重新粘贴'}), 400
    try:
        data = fetch_all_music(req)
    except Exception as e:
        return jsonify({'code': -1, 'msg': str(e)}), 500
    old_nick = (_playlist or {}).get('nickname', '')
    _playlist = {'uid': u['uid'], 'nickname': u['nickname'] or old_nick,
                 'ts': time.time(), 'data': data}
    _save_cache()
    return jsonify({'code': 0, 'count': len(data), 'nickname': _playlist['nickname']})


def _parse_cookie(text: str):
    """支持粘贴 JSON 对象或浏览器 cookie 字符串（k1=v1; k2=v2）"""
    text = (text or '').strip()
    if not text:
        return None
    if text.startswith('{'):
        try:
            d = json.loads(text)
            return d if isinstance(d, dict) and d else None
        except Exception:
            return None
    d = {}
    for part in text.split(';'):
        if '=' in part:
            k, v = part.split('=', 1)
            d[k.strip()] = v.strip()
    return d or None


@app.after_request
def _access_log(resp):
    """简洁请求日志：同时写控制台和 logs/dymusic.log"""
    logging.info(f'{request.method} {request.path} -> {resp.status_code}')
    return resp


def _lan_ip() -> str:
    """获取本机局域网 IP"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def _open_browser_when_ready(port: int):
    """后台等待端口就绪后用默认浏览器打开，不弹额外窗口"""
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                break
        except OSError:
            time.sleep(0.3)
    else:
        return
    webbrowser.open(f'http://127.0.0.1:{port}')


if __name__ == '__main__':
    port = 9002
    logging.info('')
    logging.info('DyMusic 抖音收藏音乐')
    logging.info('-' * 44)
    logging.info(f'本机访问 : http://127.0.0.1:{port}')
    logging.info(f'局域网   : http://{_lan_ip()}:{port}')
    logging.info(f'日志文件 : {LOG_PATH}')
    logging.info('停止服务 : 直接关闭窗口，或按 Ctrl+C')
    logging.info('-' * 44)
    try:
        import flask.cli
        flask.cli.show_server_banner = lambda *a, **k: None  # 去掉 "Serving Flask app" 英文横幅
        threading.Thread(target=_open_browser_when_ready, args=(port,), daemon=True).start()
        app.run(host='0.0.0.0', port=port)
    except KeyboardInterrupt:
        logging.info('服务已停止，再见')
