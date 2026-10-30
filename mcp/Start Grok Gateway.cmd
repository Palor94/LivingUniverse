@echo off
cd /d "%~dp0.."
set "LU_GROK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%LU_GROK_NODE%" set "LU_GROK_NODE=node"
"%LU_GROK_NODE%" "%~dp0http-gateway.mjs"
if errorlevel 1 pause
