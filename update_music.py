# -*- coding: utf-8 -*-
"""命令行更新音乐：读取 config/cookies.txt，拉取抖音收藏并覆盖 public/data/music.json。
不启动 Web 服务，供 start.bat 菜单「2. 更新音乐」调用。"""
import logging
import os
import sys
import time

logging.getLogger('httpx').setLevel(logging.WARNING)  # 命令行模式静默每条 HTTP 请求日志

import app as webapp
from app import (
    Request, fetch_user, fetch_all_music,
    COOKIES_PATH, _load_cookie_text, _parse_cookie, _save_cache,
)


def main():
    print('-' * 44)
    print('更新抖音收藏音乐')
    print('-' * 44)

    if not os.path.exists(COOKIES_PATH):
        print('[失败] 未找到 config/cookies.txt')
        print('       请先创建该文件，并把抖音 cookie 粘贴进去')
        return 2

    raw = _load_cookie_text()
    if not raw:
        print('[失败] config/cookies.txt 是空的，请先粘贴 cookie')
        return 2

    cookie = _parse_cookie(raw)
    if not cookie:
        print('[失败] cookie 内容无法识别，请检查后重试')
        return 3

    print('正在校验 cookie 并获取用户信息...')
    req = Request(cookie)
    user = fetch_user(req)
    if not user:
        print('[失败] cookie 无效或已失效，请重新粘贴后再更新')
        return 3
    print(f'当前账号：{user["nickname"]} (uid: {user["uid"]})')

    print('正在拉取收藏音乐（数量较多时需要一点时间）...')
    t0 = time.time()
    try:
        songs = fetch_all_music(req)
    except Exception as e:
        print(f'[失败] 拉取过程出错：{e}')
        return 4

    webapp._playlist = {
        'uid': user['uid'],
        'nickname': user['nickname'],
        'ts': time.time(),
        'data': songs,
    }
    _save_cache()
    print(f'[成功] 共 {len(songs)} 首，已覆盖保存到 public/data/music.json'
          f'（用时 {time.time() - t0:.1f} 秒）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
