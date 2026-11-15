Option Explicit
Dim args, shell, nodePath, scriptPath, workingDirectory, fso, result
Set args = WScript.Arguments
If args.Count <> 3 Then WScript.Quit 2
nodePath = args(0)
scriptPath = args(1)
workingDirectory = args(2)
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(nodePath) Then WScript.Quit 3
If Not fso.FileExists(scriptPath) Then WScript.Quit 3
If Not fso.FolderExists(workingDirectory) Then WScript.Quit 3
If InStr(nodePath, Chr(34)) Or InStr(scriptPath, Chr(34)) Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = workingDirectory
result = shell.Run(Chr(34) & nodePath & Chr(34) & " " & Chr(34) & scriptPath & Chr(34), 0, True)
WScript.Quit result
