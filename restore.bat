@echo off
chcp 65001 >nul
title DSH Config - 一键恢复环境与插件
echo ===================================================
echo   DeepSeek Harness 一键恢复环境与插件
echo ===================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1"
echo.
echo 按任意键退出...
pause >nul
