@echo off
setlocal
cd /d "%~dp0"
set "LU_BACKUP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%LU_BACKUP_NODE%" set "LU_BACKUP_NODE=node"
"%LU_BACKUP_NODE%" ops\backup\backup.mjs create
if errorlevel 1 (echo A mentes nem keszult el teljesen. A korabbi mentesek megmaradtak.) else (echo A helyi mentes ellenorizve. Ellenorizd a OneDrive szinkronizaciojat is.)
pause
