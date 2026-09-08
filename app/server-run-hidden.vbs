Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\Code\ContentDownloader\app\server"
WshShell.Run "cmd /c ""E:\Program Files\nodejs\node.exe"" dist\index.js >> logs\server.log 2>&1", 0, False
