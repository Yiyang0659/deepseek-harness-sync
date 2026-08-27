$ErrorActionPreference = 'Continue'
$log = 'C:\Users\wy_liuxiaoyang\.dsh\git-sync\boot-verify.log'
function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding utf8 }

# 延迟执行：等待 AI 会话的最终消息先送达浏览器
Start-Sleep -Seconds 15
Log '--- 自动重启开始 ---'

# 1. 终止占用 3080 的旧 DSH 实例
Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Log "终止旧实例 PID=$_"; taskkill /F /PID $_ 2>$null | Out-Null }
Start-Sleep -Seconds 3

# 2. 以隐藏窗口启动新实例
Set-Location C:\Users\wy_liuxiaoyang
Log '正在启动 dsh web ...'
Start-Process -FilePath 'D:\wy_liuxiaoyang\Desktop\npm-global\dsh.cmd' -ArgumentList 'web' -WindowStyle Hidden

# 3. 轮询自检：等待服务恢复并确认 v1.1 特性已加载
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 3
  try {
    $r = Invoke-RestMethod 'http://127.0.0.1:3080/plugins/git-sync/status' -TimeoutSec 5
    Log ("[OK] status 接口就绪: state={0} ahead={1} behind={2} scheduler={3}" -f `
      $r.state, $r.ahead, $r.behind, [bool]$r.scheduler)
    try {
      $c = Invoke-RestMethod 'http://127.0.0.1:3080/plugins/git-sync/config' -TimeoutSec 5
      Log ("[OK] config 接口就绪: dailyTime={0} autoSyncEnabled={1} pullFirst={2}" -f `
        $c.config.dailyTime, $c.config.autoSyncEnabled, $c.config.pullFirst)
    } catch { Log "[WARN] config 接口异常: $($_.Exception.Message)" }
    $ok = $true
    break
  } catch {}
}
if ($ok) { Log '--- dsh-git-sync v1.1.0 激活成功 ---' }
else     { Log '[FAIL] 90 秒内服务未恢复，请手动运行 restart.bat 或检查 git 配置' }
