@echo off
chcp 65001 >nul
title DyMusic 抖音收藏音乐
cd /d "%~dp0"

echo.
echo   [DyMusic] 抖音收藏音乐
echo   ----------------------------------------
echo.

REM 检查 Python 是否安装
where python >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 Python，请先安装 Python 3 并勾选 "Add to PATH"
  echo          下载地址: https://www.python.org/downloads/
  echo.
  pause
  exit /b 1
)

REM 检查 9002 端口是否已被占用
netstat -ano | findstr ":9002 " | findstr LISTENING >nul
if not errorlevel 1 (
  echo   [提示] 9002 端口已被占用，服务可能已经在运行。
  choice /c YN /n /m "   直接打开浏览器请按 Y，退出请按 N: "
  if errorlevel 2 exit /b 0
  start "" http://127.0.0.1:9002
  exit /b 0
)

echo   正在启动服务，就绪后浏览器会自动打开...
echo   关闭此窗口即可停止服务
echo.

python app.py

echo.
echo   服务已退出，按任意键关闭窗口...
pause >nul
