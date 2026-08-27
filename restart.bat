@echo off
echo Restarting DeepSeek Harness...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3080 ^| findstr LISTENING') do (
    echo Terminating PID %%a listening on 3080...
    taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak >nul
cd /d "C:\Users\wy_liuxiaoyang"
start "" "D:\wy_liuxiaoyang\Desktop\npm-global\dsh.cmd" web
echo DeepSeek Harness restarted.
