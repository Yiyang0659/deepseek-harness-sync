@echo off
chcp 65001 >nul
title DSH Config - 拉取最新配置 (Pull)
echo ===================================================
echo   DeepSeek Harness 配置一键拉取 (Pull)
echo ===================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { & '%~dp0sync.ps1' -Pull }"
echo.
echo 按任意键退出...
pause >nul
