Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "wscript.exe ""E:\Code\ContentDownloader\app\server-run-hidden.vbs""", 0, False
WshShell.Run "wscript.exe ""E:\Code\ContentDownloader\app\run-hidden.vbs""", 0, False
