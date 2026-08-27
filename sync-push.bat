@echo off
chcp 65001 >nul
title DSH Config - 立即上传配置 (Push)
echo ===================================================
echo   DeepSeek Harness 配置一键上传 (Push)
echo ===================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { & '%~dp0sync.ps1' -Push }"
echo.
echo 按任意键退出...
pause >nul
