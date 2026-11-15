@echo off
cd /d "%~dp0.."
rem Already running? Do not start a second copy (it would fail with "address in use").
curl.exe -s -o nul -m 3 http://127.0.0.1:4320/.well-known/oauth-authorization-server >nul 2>nul
if not errorlevel 1 (
  echo The Grok gateway already runs.
  timeout /t 5 >nul
  exit /b 0
)
set "LU_GROK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%LU_GROK_NODE%" set "LU_GROK_NODE=node"
"%LU_GROK_NODE%" "%~dp0http-gateway.mjs"
if errorlevel 1 pause
