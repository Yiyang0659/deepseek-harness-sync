@echo off
timeout /t 2 /nobreak >nul
taskkill /F /PID 28752
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3080 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul
cd /d "C:\Users\wy_liuxiaoyang"
start "" "D:\wy_liuxiaoyang\Desktop\npm-global\dsh.cmd" web
