@echo off
setlocal
cd /d "%~dp0"
set "LU_BACKUP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%LU_BACKUP_NODE%" set "LU_BACKUP_NODE=node"
if "%~1"=="" (echo Huzd a kivalasztott snapshots mappat erre az inditora, vagy hasznald a RECOVERY.md utmutatot. & pause & exit /b 1)
"%LU_BACKUP_NODE%" ops\backup\backup.mjs verify --snapshot "%~1"
pause
