# DyMusic 抖音收藏音乐

一个本地运行的抖音收藏音乐网站：把你的抖音收藏音乐拉取到本地，在网页里浏览和播放，支持多个抖音账号（每个账号一张歌单）。

## 功能

- 🎵 浏览、播放抖音收藏音乐（封面、进度条、上一首/下一首）
- 🔁 顺序播放 / 🔀 随机播放切换
- 🔊 音量调节与静音，音量自动记忆
- 👤 多账号支持：每个用户一张歌单，按 uid 独立存储
- 🔄 手动更新歌单；Cookie 失效时网页弹窗粘贴新 Cookie
- 🗑 删除本地歌单
- 📱 响应式布局，适配手机端
- 🔒 数据全部保存在本地，无云端依赖

## 技术栈

- 后端：Python + Flask + httpx + PyExecJS（调用 Node 执行抖音签名 JS）
- 前端：原生 HTML / CSS / JavaScript，无构建步骤
- 存储：本地 JSON 文件

## 目录结构

```
DyMusic/
├── app.py                  # Flask 服务：页面托管 + 三个 API 接口
├── requester.py            # 抖音请求封装：cookie、a_bogus 签名、翻页拉取
├── requirements.txt        # Python 依赖
├── start.bat               # Windows 一键启动脚本（自动打开浏览器）
├── lib/
│   └── douyin.js           # 抖音 a_bogus 签名算法（由 PyExecJS 调用）
├── public/                 # 前端静态文件
│   ├── index.html
│   ├── css/style.css
│   └── js/index.js
├── config/
│   └── cookies.json        # 各账号 cookie，按 uid 存储（自动生成，勿提交）
└── cache/
    └── music.json          # 歌单本地缓存（自动生成，勿提交）
```

## 环境要求

- Python 3.8+
- Node.js（PyExecJS 运行签名脚本依赖，命令行能执行 `node` 即可）

## 启动方法

### Windows（推荐）

双击 `start.bat`，服务启动后会自动打开浏览器：

- 本机访问：http://127.0.0.1:9002
- 同一局域网手机/设备访问：http://你的电脑IP:9002
- 关闭命令行窗口即停止服务

### 手动启动

首次使用先安装依赖（只需一次）：

```powershell
pip install -r requirements.txt
```

启动服务：

```powershell
python app.py
```

然后浏览器打开 http://127.0.0.1:9002

## 使用说明

1. 打开页面后点「+ 新建歌单」
2. 从浏览器登录抖音，复制 Cookie（支持 JSON 或 `k1=v1; k2=v2` 字符串），粘贴到弹窗
3. 后端自动校验 Cookie、识别账号并拉取该账号的收藏音乐
4. 以后打开页面直接读本地缓存，不请求抖音；点「更新」才重新拉取
5. Cookie 失效后点「更新」会提示，按提示粘贴新 Cookie 即可

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/music` | 返回本地缓存的全部歌单（不请求抖音） |
| POST | `/api/refresh` | 按 uid 更新指定歌单（body: `{"uid": "..."}`） |
| POST | `/api/cookie` | 校验并保存粘贴的 Cookie（body: `{"cookie": "...", "uid": "可选"}`） |
| POST | `/api/delete` | 删除本地歌单（body: `{"uid": "..."}`） |

## 注意事项

- `config/cookies.json` 含登录凭证，已在 `.gitignore` 中忽略，请勿外传或提交
- 仅供个人学习使用

## 参考项目

- [mafqla/douyin-api](https://github.com/mafqla/douyin-api)：抖音接口签名（a_bogus）与请求封装参考
