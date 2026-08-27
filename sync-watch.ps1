# ===================================================
# DeepSeek Harness 配置实时自动同步监控器
# ===================================================

$DshDir = "C:\Users\wy_liuxiaoyang\.dsh"
Set-Location -Path $DshDir
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  DeepSeek Harness 实时同步服务已启动" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "监听目录: $DshDir" -ForegroundColor Gray
Write-Host "监听项: 模型配置(settings.yaml), 插件清单(package.json), cordis配置, 自定义skills" -ForegroundColor Gray
Write-Host "按 Ctrl+C 可退出实时同步监控。" -ForegroundColor Yellow
Write-Host ""

$timer = New-Object System.Timers.Timer
$timer.Interval = 5000 # 5秒防抖
$timer.AutoReset = $false
$lastTriggerFile = ""

$action = {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] 检测到配置发生变更 ($lastTriggerFile)，正在自动同步到 GitHub..." -ForegroundColor Magenta
    & "$DshDir\sync.ps1" -Push -Message "Auto-sync ($lastTriggerFile): $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 实时同步完成，继续监听中..." -ForegroundColor Cyan
}

Register-ObjectEvent -InputObject $timer -EventName Elapsed -Action $action | Out-Null

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $DshDir
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$changeHandler = {
    param($sender, $eventArgs)
    $name = $eventArgs.Name
    # 过滤关注的文件
    if ($name -match 'settings\.yaml$' -or 
        $name -match 'package\.json$' -or 
        $name -match 'cordis.*\.ya?ml$' -or 
        $name -match '^skills\\') {
        
        $global:lastTriggerFile = $name
        $timer.Stop()
        $timer.Start()
    }
}

Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $changeHandler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Created -Action $changeHandler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $changeHandler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $changeHandler | Out-Null

# 保持前台运行
while ($true) {
    Start-Sleep -Seconds 1
}
