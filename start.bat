@echo off
chcp 65001 >nul
title DyMusic 抖音收藏音乐
cd /d "%~dp0"

:menu
cls
echo.
echo   ========================================
echo     DyMusic 抖音收藏音乐
echo   ========================================
echo.
echo     [1] 启动服务
echo     [2] 更新音乐
echo     [3] 提交到 GitHub
echo.
echo     [0] 退出
echo.
set choice=
set /p choice=  请选择:
if "%choice%"=="" exit /b 0
if "%choice%"=="1" goto start
if "%choice%"=="2" goto update
if "%choice%"=="3" goto push
if "%choice%"=="0" exit /b 0
goto menu

REM ============ 1. 启动服务 ============
:start
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 未检测到 Python，请先安装 Python 3 并勾选 "Add to PATH"
  echo          下载地址: https://www.python.org/downloads/
  echo.
  pause
  goto menu
)
netstat -ano | findstr ":9002 " | findstr LISTENING >nul
if not errorlevel 1 (
  echo.
  echo   [提示] 9002 端口已被占用，服务可能已经在运行。
  choice /c YN /n /m "   直接打开浏览器请按 Y，返回菜单请按 N: "
  if errorlevel 2 goto menu
  start "" http://127.0.0.1:9002
  goto menu
)
cls
echo.
echo   正在启动服务，就绪后浏览器会自动打开...
echo   关闭此窗口或按 Ctrl+C 可停止服务并返回菜单
echo.
python app.py
echo.
echo   服务已退出，按任意键返回菜单...
pause >nul
goto menu

REM ============ 2. 更新音乐 ============
:update
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 未检测到 Python，请先安装 Python 3 并勾选 "Add to PATH"
  echo.
  pause
  goto menu
)
cls
echo.
python update_music.py < nul
echo.
echo   按任意键返回菜单...
pause >nul
goto menu

REM ============ 3. 提交到 GitHub ============
:push
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 未检测到 Git，请先安装: https://git-scm.com/downloads
  echo.
  pause
  goto menu
)
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 当前目录不是 Git 仓库
  echo.
  pause
  goto menu
)
cls
echo.
echo   当前改动：
echo   ----------------------------------------
git status --short
echo   ----------------------------------------
echo.
set msg=
set /p msg=  提交说明（直接回车使用默认说明）:
if "%msg%"=="" set msg=更新歌单数据 %date% %time%
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%msg%"
  if errorlevel 1 (
    echo.
    echo   [失败] 提交失败，请查看上方信息
    pause
    goto menu
  )
  echo.
  echo   正在推送到 GitHub...
  git push
  if errorlevel 1 (
    echo.
    echo   [失败] 推送失败，请检查网络或仓库配置
    pause
    goto menu
  )
  echo.
  echo   [成功] 已提交并推送到 GitHub
) else (
  echo.
  echo   没有需要提交的改动
)
echo.
echo   按任意键返回菜单...
pause >nul
goto menu
