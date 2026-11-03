# dsh-better-sidebar: reveal a path in Windows Explorer AND force the window
# to the foreground. Called from lib/index.js via
#   powershell -NoProfile -ExecutionPolicy Bypass -File win-reveal.ps1 -Target <path>
#
# Strategy (Shell.Application COM may not enumerate cross-session):
#   1. Snapshot existing Explorer MAIN window HWNDs via EnumWindows
#   2. Start-Process explorer with the target path
#   3. Poll for a new Explorer main window HWND (up to 4s)
#   4. Activate whatever we found (new OR existing matching window)
# Log: %TEMP%\dsh-better-sidebar-reveal.log

param([Parameter(Mandatory = $true)][string]$Target)

$ErrorActionPreference = 'SilentlyContinue'
$logFile = Join-Path $env:TEMP 'dsh-better-sidebar-reveal.log'
function Write-Log([string]$Msg) {
    try {
        Add-Content -LiteralPath $logFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Msg) -Encoding UTF8
    } catch {}
}

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class RevealWin {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_SHOWWINDOW = 0x0040;

    public static List<IntPtr> GetExplorerHwnds() {
        var list = new List<IntPtr>();
        EnumWindows((hWnd, lp) => {
            if (!IsWindowVisible(hWnd)) return true;
            var cls = new StringBuilder(256);
            GetClassName(hWnd, cls, 256);
            string c = cls.ToString();
            // CabinetWClass = Explorer folder window, ExploreWClass = older tree view
            if (c == "CabinetWClass" || c == "ExploreWClass") {
                list.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static bool ForceForeground(IntPtr targetHwnd) {
        if (targetHwnd == IntPtr.Zero) return false;

        AllowSetForegroundWindow(-1);

        IntPtr fgHwnd = GetForegroundWindow();
        uint dummyPid = 0;
        uint fgThread = GetWindowThreadProcessId(fgHwnd, out dummyPid);
        uint targetThread = GetWindowThreadProcessId(targetHwnd, out dummyPid);
        uint currentThread = GetCurrentThreadId();

        if (fgThread != 0 && fgThread != currentThread) {
            AttachThreadInput(currentThread, fgThread, true);
        }
        if (targetThread != 0 && targetThread != currentThread && targetThread != fgThread) {
            AttachThreadInput(currentThread, targetThread, true);
        }

        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);

        ShowWindow(targetHwnd, 9); // SW_RESTORE
        SetWindowPos(targetHwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        SetWindowPos(targetHwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

        SwitchToThisWindow(targetHwnd, true);
        bool result = SetForegroundWindow(targetHwnd);

        if (fgThread != 0 && fgThread != currentThread) {
            AttachThreadInput(currentThread, fgThread, false);
        }
        if (targetThread != 0 && targetThread != currentThread && targetThread != fgThread) {
            AttachThreadInput(currentThread, targetThread, false);
        }

        return result;
    }
}
"@

function Activate-Window([IntPtr]$Hwnd) {
    if ($Hwnd -eq [IntPtr]::Zero) { return }
    $ok = [RevealWin]::ForceForeground($Hwnd)
    $okAc = $false
    try {
        $ws   = New-Object -ComObject WScript.Shell
        $okAc = [bool]$ws.AppActivate([int]$Hwnd)
    } catch {}
    Write-Log ("activate hwnd={0} setForeground={1} appActivate={2}" -f $Hwnd, $ok, $okAc)
}

# Resolve to real path
try {
    $resolved = (Resolve-Path -LiteralPath $Target).Path
} catch {
    Write-Log ("resolve-failed target=" + $Target)
    exit 1
}

$isDir = Test-Path -LiteralPath $resolved -PathType Container

# Snapshot Explorer main-window HWNDs before launching
$before = @{}
foreach ($h in [RevealWin]::GetExplorerHwnds()) { $before[[int]$h] = $true }
Write-Log ("before-count=" + $before.Count + " target=" + $resolved)

# Launch explorer
if ($isDir) {
    Start-Process -FilePath "$env:SystemRoot\explorer.exe" -ArgumentList $resolved
} else {
    Start-Process -FilePath "$env:SystemRoot\explorer.exe" -ArgumentList ('/select,"' + $resolved + '"')
}

# Poll for a new Explorer main window for up to 4 seconds
$hwndNew = [IntPtr]::Zero
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 100
    foreach ($h in [RevealWin]::GetExplorerHwnds()) {
        if (-not $before.ContainsKey([int]$h)) {
            $hwndNew = $h
            break
        }
    }
    if ($hwndNew -ne [IntPtr]::Zero) { break }
}

if ($hwndNew -ne [IntPtr]::Zero) {
    Write-Log ("new-hwnd=" + $hwndNew)
    Start-Sleep -Milliseconds 200
    Activate-Window $hwndNew
    exit 0
}

# No new window: Explorer reused an existing one.
# Activate the most recently created Explorer window (highest HWND heuristic).
Write-Log "no-new-window – activating existing Explorer window"
$allHwnds = [RevealWin]::GetExplorerHwnds()
Write-Log ("existing-count=" + $allHwnds.Count)

if ($allHwnds.Count -gt 0) {
    # Pick the one with the highest HWND value (typically the most recently created)
    $best = $allHwnds | Sort-Object { [int64]$_.ToInt64() } -Descending | Select-Object -First 1
    Write-Log ("activate-existing hwnd=" + $best)
    Start-Sleep -Milliseconds 150
    Activate-Window $best
    exit 0
}

Write-Log "no-explorer-window-found"
exit 2
