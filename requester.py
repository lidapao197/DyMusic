# -*- coding: utf-8 -*-
"""
抖音请求封装（独立版）
- cookie 读取自 web/config/cookie.json
- a_bogus 签名使用 web/lib/douyin.js
"""
import json
import os
import random
import re
import subprocess
from functools import partial
from urllib.parse import quote

import httpx

# execjs 在 Windows 下需要指定编码，否则读 JS 可能乱码
subprocess.Popen = partial(subprocess.Popen, encoding="utf-8")
import execjs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COOKIE_PATH = os.path.join(BASE_DIR, 'config', 'cookie.json')
SIGN_JS_PATH = os.path.join(BASE_DIR, 'lib', 'douyin.js')


def load_cookie() -> dict:
    with open(COOKIE_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


class Request(object):
    HOST = 'https://www.douyin.com'
    PARAMS = {
        'device_platform': 'webapp',
        'aid': '6383',
        'channel': 'channel_pc_web',
        'update_version_code': '170400',
        'pc_client_type': '1',  # Windows
        'version_code': '190500',
        'version_name': '19.5.0',
        'cookie_enabled': 'true',
        'screen_width': '2560',
        'screen_height': '1440',
        'browser_language': 'zh-CN',
        'browser_platform': 'Win32',
        'browser_name': 'Chrome',
        'browser_version': '126.0.0.0',
        'browser_online': 'true',
        'engine_name': 'Blink',
        'engine_version': '126.0.0.0',
        'os_name': 'Windows',
        'os_version': '10',
        'cpu_core_num': '24',
        'device_memory': '8',
        'platform': 'PC',
        'downlink': '10',
        'effective_type': '4g',
        'round_trip_time': '50',
    }
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "sec-ch-ua-platform": "Windows",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "referer": "https://www.douyin.com/?recommend=1",
        "priority": "u=1, i",
        "pragma": "no-cache",
        "cache-control": "no-cache",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "accept": "application/json, text/plain, */*",
        "dnt": "1",
    }
    SIGN = execjs.compile(open(SIGN_JS_PATH, 'r', encoding='utf-8').read())
    WEBID = ''
    client = httpx.Client(proxies=None, timeout=30.0, verify=False, follow_redirects=True)

    def __init__(self, cookie: dict = None):
        self.COOKIES = cookie if cookie is not None else load_cookie()

    def get_sign(self, params: dict) -> str:
        query = '&'.join([f'{k}={quote(str(v))}' for k, v in params.items()])
        return self.SIGN.call('sign_datail', query, self.HEADERS.get("User-Agent"))

    def get_params(self, params: dict) -> dict:
        params.update(self.PARAMS)
        params['msToken'] = self.COOKIES.get('msToken') or self._random_ms_token()
        params['screen_width'] = self.COOKIES.get('dy_swidth', 2560)
        params['screen_height'] = self.COOKIES.get('dy_sheight', 1440)
        params['cpu_core_num'] = self.COOKIES.get('device_web_cpu_core', 24)
        params['device_memory'] = self.COOKIES.get('device_web_memory_size', 8)
        fp = self.COOKIES.get('s_v_web_id')
        if fp:
            params['verifyFp'] = fp
            params['fp'] = fp
        params['webid'] = self.get_webid()
        return params

    @staticmethod
    def _random_ms_token(length=120):
        base = 'ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789='
        return ''.join(random.choice(base) for _ in range(length))

    def get_webid(self):
        if not self.WEBID:
            text = self.getHTML('https://www.douyin.com/?recommend=1')
            match = re.search(r'\\"user_unique_id\\":\\"(\d+)\\"', text)
            if match:
                self.WEBID = match.group(1)
        return self.WEBID

    def getHTML(self, url) -> str:
        headers = self.HEADERS.copy()
        headers['sec-fetch-dest'] = 'document'
        response = self.client.get(url, headers=headers, cookies=self.COOKIES)
        if response.status_code != 200:
            return ''
        return response.text

    def getJSON(self, uri: str, params: dict):
        url = f'{self.HOST}{uri}'
        params = self.get_params(params)
        params['a_bogus'] = self.get_sign(params)
        # 收藏音乐接口要求 referer 为对应页面
        if uri == '/aweme/v1/web/music/listcollection/':
            self.HEADERS['referer'] = 'https://www.douyin.com/user/self?from_tab_name=main&showSubTab=music&showTab=favorite_collection'
        response = self.client.get(url, params=params, headers=self.HEADERS, cookies=self.COOKIES)
        if response.status_code != 200 or response.text == '':
            return {}
        return response.json()
