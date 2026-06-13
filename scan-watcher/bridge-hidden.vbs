' Starts the Scan Bridge with NO visible window (runs node bridge.js hidden).
' Self-locating: works as long as this file sits next to bridge.js.
' Used for a manual hidden start; install-autostart.cmd generates its own
' copy in the Startup folder with an absolute path baked in.
Dim sh, fso, here
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
' 0 = hidden window, False = don't wait for it to exit
sh.Run "node bridge.js", 0, False
