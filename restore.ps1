# ===================================================
# DeepSeek Harness 一键恢复/初始化脚本 (Restore)
# ===================================================

$DshDir = $PSScriptRoot
Set-Location -Path $DshDir
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  DeepSeek Harness 环境与插件一键还原" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查/恢复 .credentials.yaml
if (-not (Test-Path "$DshDir\.credentials.yaml")) {
    if (Test-Path "$DshDir\.credentials.yaml.example") {
        Copy-Item "$DshDir\.credentials.yaml.example" "$DshDir\.credentials.yaml"
        Write-Warn "已为您从模板生成 .credentials.yaml，请打开并填入您的真实 API Key！"
    }
} else {
    Write-Success "凭据文件 .credentials.yaml 已就绪。"
}

# 2. 还原插件依赖 (pnpm / npm)
if (Test-Path "$DshDir\profiles\web\package.json") {
    Write-Info "正在自动安装所有插件 (profiles/web)..."
    Push-Location "$DshDir\profiles\web"
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm install
    } else {
        npm install
    }
    Pop-Location
    Write-Success "所有插件依赖安装完成！"
}

# 3. 检查模型配置
if (Test-Path "$DshDir\settings.yaml") {
    Write-Success "模型配置 settings.yaml 已就绪！"
}

Write-Host ""
Write-Success "DeepSeek Harness 配置与插件已全部还原完毕！"
Write-Info "您可以直接启动 DSH (dsh web) 开始使用。"
