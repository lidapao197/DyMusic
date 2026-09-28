# DyMusic 抖音收藏音乐

一个本地运行的抖音收藏音乐网站：把你的抖音收藏音乐拉取到本地，在网页里浏览和播放（单歌单模式）。

## 功能

- 🎵 浏览、播放抖音收藏音乐（封面、进度条、上一首/下一首）
- 🔁 顺序播放 / 🔀 随机播放切换
- 🔊 音量调节与静音，音量自动记忆
- 🔄 手动更新歌单，新数据整体覆盖；Cookie 失效时网页弹窗粘贴新 Cookie
- 📥 导入歌单 JSON（格式同 data/music.json）
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
│   └── cookies.txt         # 抖音 cookie，原样保存（自动生成，勿提交）
└── data/
    └── music.json          # 歌单数据，单歌单整体覆盖（自动生成，勿提交）
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

1. 手动创建 `config/cookies.txt`，把抖音 cookie 粘贴进去（浏览器 F12 复制，支持 `k1=v1; k2=v2` 字符串或 JSON 格式）
2. 打开页面点「新建歌单」，自动拉取收藏音乐并保存到 `data/music.json`
3. 以后打开页面直接读 `data/music.json`，不请求抖音；点「更新」重新拉取覆盖
4. `config/cookies.txt` 不存在时，点「新建歌单」或「更新」会提示先创建文件并停止操作
5. Cookie 失效后点「更新」会提示，重新编辑 `config/cookies.txt` 再点「更新」即可

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/music` | 返回 `data/music.json` 里的歌单（不请求抖音） |
| POST | `/api/refresh` | 读取 `config/cookies.txt` 拉取收藏，整体覆盖；文件不存在则提示并停止 |
| POST | `/api/import` | 导入歌单 JSON（格式同 `data/music.json`），覆盖本地数据 |

## 注意事项

- `config/cookies.txt` 含登录凭证，已在 `.gitignore` 中忽略，请勿外传或提交
- 仅供个人学习使用

## 参考项目

- [mafqla/douyin-api](https://github.com/mafqla/douyin-api)：抖音接口签名（a_bogus）与请求封装参考
