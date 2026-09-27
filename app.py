# -*- coding: utf-8 -*-
"""
抖音收藏音乐 - 独立网站服务
- 托管 public/ 静态页面
- GET  /api/music   返回本地缓存的全部用户歌单（不请求抖音）
- POST /api/refresh 按 uid 更新对应歌单（请求抖音，需该用户的 cookie）
- POST /api/cookie   粘贴并校验 cookie，按 uid 保存到 config/cookies.json
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
CACHE_PATH = os.path.join(BASE_DIR, 'cache', 'music.json')
COOKIES_PATH = os.path.join(BASE_DIR, 'config', 'cookies.json')

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'public'), static_url_path='')


# ---------- 歌单缓存：每个用户一份，永久有效，手动更新 ----------
# 结构：[{'uid': '...', 'nickname': '...', 'ts': 123.0, 'data': [...]}]
_cache = []


def _load_cache():
    try:
        with open(CACHE_PATH, 'r', encoding='utf-8') as f:
            loaded = json.load(f)
    except Exception:
        return
    if isinstance(loaded, list):
        _cache.extend(loaded)
    elif isinstance(loaded, dict) and isinstance(loaded.get('users'), dict):
        # 兼容旧的 {'users': {uid: {...}}} 格式
        for uid, u in loaded['users'].items():
            _cache.append({'uid': uid, 'nickname': u.get('nickname', ''),
                           'ts': u.get('ts', 0), 'data': u.get('data')})


def _save_cache():
    try:
        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        with open(CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump(_cache, f, ensure_ascii=False)
    except Exception:
        pass


def _find_slot(uid: str, create: bool = False):
    for item in _cache:
        if item.get('uid') == uid:
            return item
    if create:
        slot = {'uid': uid, 'nickname': '', 'ts': 0, 'data': None}
        _cache.append(slot)
        return slot
    return None


_load_cache()


# ---------- cookie：按 uid 存 ----------
def _load_cookies() -> dict:
    try:
        with open(COOKIES_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_cookie(uid: str, cookie: dict):
    cookies = _load_cookies()
    cookies[uid] = cookie
    os.makedirs(os.path.dirname(COOKIES_PATH), exist_ok=True)
    with open(COOKIES_PATH, 'w', encoding='utf-8') as f:
        json.dump(cookies, f, ensure_ascii=False)


def _get_cookie(uid: str):
    """按 uid 取 cookie，没有返回 None"""
    return _load_cookies().get(uid)


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
    """返回本地缓存的全部歌单，不请求抖音"""
    playlists = [{
        'uid': u['uid'],
        'nickname': u['nickname'],
        'ts': u['ts'],
        'count': len(u['data'] or []),
        'list': u['data'] or [],
    } for u in _cache]
    return jsonify({'code': 0, 'playlists': playlists})


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """按 uid 更新歌单：用该用户的 cookie 重新拉取收藏"""
    uid = str((request.get_json(silent=True) or {}).get('uid', ''))
    if not uid:
        return jsonify({'code': -1, 'msg': '缺少 uid'}), 400
    cookie = _get_cookie(uid)
    if not cookie:
        return jsonify({'code': 2, 'msg': '缺少该用户的 cookie，请粘贴补充'}), 400
    req = Request(cookie)
    u = fetch_user(req)
    if not u:
        return jsonify({'code': 3, 'msg': 'cookie 已失效，请重新粘贴'}), 400
    if u['uid'] != uid:
        return jsonify({'code': 4, 'msg': f"cookie 属于「{u['nickname']}」，与该歌单用户不符"}), 400
    try:
        data = fetch_all_music(req)
    except Exception as e:
        return jsonify({'code': -1, 'msg': str(e)}), 500
    slot = _find_slot(uid, create=True)
    slot.update({'nickname': u['nickname'] or slot['nickname'], 'data': data, 'ts': time.time()})
    _save_cache()
    return jsonify({'code': 0, 'uid': uid, 'count': len(data), 'nickname': slot['nickname']})


@app.route('/api/cookie', methods=['POST'])
def api_cookie():
    """粘贴 cookie：调接口校验有效性后按 uid 保存。可选传 uid（须与 cookie 对应用户一致）"""
    body = request.get_json(silent=True) or {}
    cookie = _parse_cookie(body.get('cookie', ''))
    if not cookie:
        return jsonify({'code': -1, 'msg': 'cookie 格式不对，支持 JSON 对象或浏览器复制的 cookie 字符串'}), 400
    u = fetch_user(Request(cookie))
    if not u:
        return jsonify({'code': 3, 'msg': 'cookie 无效或已失效'}), 400
    want_uid = str(body.get('uid', ''))
    if want_uid and u['uid'] != want_uid:
        return jsonify({'code': 4, 'msg': f"cookie 属于「{u['nickname']}」，与当前歌单用户不符"}), 400
    _save_cookie(u['uid'], cookie)
    return jsonify({'code': 0, 'uid': u['uid'], 'nickname': u['nickname']})


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


@app.route('/api/delete', methods=['POST'])
def api_delete():
    """按 uid 删除本地缓存的歌单（cookie 保留，可再次粘贴/更新恢复）"""
    uid = str((request.get_json(silent=True) or {}).get('uid', ''))
    if not uid:
        return jsonify({'code': -1, 'msg': '缺少 uid'}), 400
    before = len(_cache)
    _cache[:] = [u for u in _cache if u.get('uid') != uid]
    if len(_cache) == before:
        return jsonify({'code': 1, 'msg': '歌单不存在'}), 404
    _save_cache()
    return jsonify({'code': 0, 'uid': uid})


@app.after_request
def _access_log(resp):
    """简洁请求日志：[时:分:秒] METHOD /path -> 状态码"""
    print(f'[{time.strftime("%H:%M:%S")}] {request.method} {request.path} -> {resp.status_code}',
          flush=True)
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
    print()
    print('  DyMusic 抖音收藏音乐')
    print('  ' + '-' * 44)
    print(f'  本机访问 : http://127.0.0.1:{port}')
    print(f'  局域网   : http://{_lan_ip()}:{port}')
    print('  停止服务 : 直接关闭窗口，或按 Ctrl+C')
    print('  ' + '-' * 44)
    print()
    try:
        import flask.cli
        flask.cli.show_server_banner = lambda *a, **k: None  # 去掉 "Serving Flask app" 英文横幅
        threading.Thread(target=_open_browser_when_ready, args=(port,), daemon=True).start()
        app.run(host='0.0.0.0', port=port)
    except KeyboardInterrupt:
        print('\n  服务已停止，再见')
