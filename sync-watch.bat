@echo off
chcp 65001 >nul
title DSH Config - 实时同步监控器
echo ===================================================
echo   DeepSeek Harness 配置实时自动同步监控器
echo ===================================================
echo 正在启动监控服务，当您修改模型、安装插件时将自动同步到 GitHub...
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-watch.ps1"
pause
