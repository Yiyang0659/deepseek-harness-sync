Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\wy_liuxiaoyang\.dsh\sync-watch.ps1""", 0, False
