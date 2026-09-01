#Requires -Version 5.1
<#
.SYNOPSIS
  修复 DSH Antigravity (agy CLI) 桥接在 Windows 上的 spawn ENAMETOOLONG 问题。

.DESCRIPTION
  根因：dsh-agy-link 桥接把整个 prompt 放在命令行 "-p" 参数里传给 agy.exe。
  会话首次调用 agy 时，prompt 包含 DSH 注入的完整技能目录（可达 40KB+），
  超过 Windows CreateProcess 单条命令行 32767 字符（cmd.exe 8191 字符）上限，
  导致 spawn 失败："failed to spawn agy: Error: spawn ENAMETOOLONG"。

  本脚本给 dist/index.js 打一个最小补丁：当 argv 超长时，去掉 "-p" 参数，
  改把 prompt 通过 stdin 传给 agy（agy 原生支持，stream-json 输出不受影响）。

  脚本是幂等的：已打补丁则直接跳过。修改前自动备份，修改后用 node --check
  校验语法，失败自动回滚。

.PARAMETER Path
  手动指定 dsh-agy-link 的 dist/index.js 路径（默认自动定位）。

.PARAMETER Test
  补丁后做一次 40KB 大 prompt 端到端验证（会真实调用一次 agy，需要已登录）。

.PARAMETER Restart
  修复后自动重启 DSH（会断开当前所有正在运行的会话，包括 Web GUI 连接）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File Fix-AgyLongArgv.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File Fix-AgyLongArgv.ps1 -Test -Restart
#>
[CmdletBinding()]
param(
    [string]$Path,
    [switch]$Test,
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$MARK1 = 'PATCH(agy-long-argv'
$MARK2 = 'stdinPrompt !== null || !opts.keepStdin'

function Find-Target([string]$Override) {
    if ($Override) {
        if (Test-Path $Override) { return (Resolve-Path $Override).Path }
        throw "指定的文件不存在: $Override"
    }
    $known = Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-agy-link\dist\index.js'
    if (Test-Path $known) { return $known }
    $dsh = Join-Path $env:USERPROFILE '.dsh'
    $hit = Get-ChildItem $dsh -Recurse -Filter 'index.js' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*dsh-agy-link*dist*index.js' } |
        Select-Object -First 1
    if ($hit) { return $hit.FullName }
    throw "未找到 dsh-agy-link\dist\index.js。请确认 DSH 已安装并运行过，或用 -Path 手动指定。"
}

function Get-PatchBlock1([string]$nl, [string]$t) {
    # 插入在 "const viaCmd = ..." 之后、"const env = ..." 之前
    $lines = @(
        "$t// $MARK1 2026-09-01): Windows CreateProcess caps a single command"
        "$t// line at 32767 UTF-16 chars (cmd.exe at 8191). First-turn requests embed the"
        "$t// whole injected context (skills catalog etc.) into the ""-p"" prompt, which"
        "$t// overflowed the limit and made spawn fail with ENAMETOOLONG. When the argv is"
        "$t// too long, drop ""-p <prompt>"" from the command line and forward the prompt via"
        "$t// stdin instead (agy reads the prompt from stdin when -p is absent). The auth"
        "$t// login probe is protected because it runs with keepStdin: true."
        "$tlet stdinPrompt = null;"
        "$tif (!opts.keepStdin) {"
        "$t${t}try {"
        "$t${t}${t}const pi = opts.args.indexOf(""-p"");"
        "$t${t}${t}if (pi >= 0 && pi + 1 < opts.args.length) {"
        "$t${t}${t}${t}let totalLen = String(opts.bin ?? """").length + 16;"
        "$t${t}${t}${t}for (const a of opts.args) totalLen += String(a ?? """").length + 3;"
        "$t${t}${t}${t}if (totalLen > (viaCmd ? 7000 : 30000)) {"
        "$t${t}${t}${t}${t}stdinPrompt = opts.args[pi + 1];"
        "$t${t}${t}${t}${t}opts.args = opts.args.slice(0, pi).concat(opts.args.slice(pi + 2));"
        "$t${t}${t}${t}}"
        "$t${t}${t}}"
        "$t${t}} catch {}"
        "$t}"
    )
    return ($lines -join $nl)
}

function Get-PatchBlock2([string]$nl, [string]$t) {
    # 替换 "let settled = false; 之后的 stdin-end 块
    $lines = @(
        "${t}if (stdinPrompt !== null) try {"
        "$t${t}child.stdin?.write(stdinPrompt);"
        "$t} catch {}"
        "${t}if (stdinPrompt !== null || !opts.keepStdin) try {"
        "$t${t}child.stdin?.end();"
        "$t} catch {}"
    )
    return ($lines -join $nl)
}

# ---------- 主流程 ----------
$target = Find-Target $Path
Write-Host "[1/5] 桥接文件: $target"
$raw = [IO.File]::ReadAllText($target)

$has1 = $raw.Contains($MARK1)
$has2 = $raw.Contains($MARK2)
if ($has1 -and $has2) {
    Write-Host "[OK] 补丁已存在，无需重复安装。（如问题仍存在，请确认已重启 DSH：$env:USERPROFILE\.dsh\restart.bat）"
    if ($Test) { Invoke-Test } 
    if ($Restart) { Invoke-RestartDsh }
    exit 0
}

Write-Host "[2/5] 检测到未打补丁（edit1=$has1, edit2=$has2），开始安装..."
$nl = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
$t  = [char]9
$backup = "$target.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item $target $backup -Force
Write-Host "      已备份到: $backup"

$patched = $raw
if (-not $has1) {
    $pattern1 = 'const viaCmd = IS_WIN && isCmdShim\(opts\.bin\);'
    $block1 = Get-PatchBlock1 $nl $t
    $rx1 = New-Object System.Text.RegularExpressions.Regex($pattern1)
    if (-not $rx1.IsMatch($patched)) { Write-Warning "锚点1未命中（上游代码结构可能已变化），跳过 edit1。请参照 SKILL.md 手工修复。" }
    else { $patched = $rx1.Replace($patched, { param($m) $m.Value + $nl + $block1 }, 1) }
}
if (-not $has2) {
    $pattern2 = 'let settled = false;(?:\r?\n\t)if \(!opts\.keepStdin\) try \{\r?\n\t\tchild\.stdin\?\.end\(\);\r?\n\t\} catch \{\}'
    $block2 = Get-PatchBlock2 $nl $t
    $rx2 = New-Object System.Text.RegularExpressions.Regex($pattern2)
    if (-not $rx2.IsMatch($patched)) { Write-Warning "锚点2未命中（上游代码结构可能已变化），跳过 edit2。请参照 SKILL.md 手工修复。" }
    else {
        $replacement2 = "let settled = false;" + $nl + $block2
        $patched = $rx2.Replace($patched, { param($m) $replacement2 }, 1)
    }
}

if ($patched -eq $raw) {
    Write-Warning "没有任何锚点命中，文件未修改。dsh-agy-link 可能已升级并自带修复，请先重启 DSH 验证；如仍报错请更新本脚本。"
    exit 1
}

[IO.File]::WriteAllText($target, $patched)

# node --check 语法校验，失败回滚
Write-Host "[3/5] node --check 语法校验..."
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $check = & node --check $target 2>&1
    if ($LASTEXITCODE -ne 0) {
        Copy-Item $backup $target -Force
        Write-Host "      校验失败，已回滚备份。node 输出: $check"
        exit 1
    }
    Write-Host "      语法 OK"
} else {
    Write-Warning "未找到 node，跳过语法校验。"
}

Write-Host "[4/5] 完成。补丁标记: edit1=$(-not $has1 -or $has1) edit2 安装完毕。"
Write-Host "      生效条件：重启 DSH（$env:USERPROFILE\.dsh\restart.bat）。重启会断开所有运行中的会话。"

if ($Test) { Invoke-Test }
if ($Restart) { Invoke-RestartDsh } else { Write-Host "[5/5] 未指定 -Restart，请手动重启 DSH 后验证。" }
exit 0
