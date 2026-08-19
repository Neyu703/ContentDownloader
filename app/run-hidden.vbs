Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\Code\ContentDownloader"
WshShell.Run "cmd /c ""C:\Users\LAPTOP\AppData\Roaming\npm\pnpm.cmd"" --filter app web >> app\web.log 2>&1", 0, False
