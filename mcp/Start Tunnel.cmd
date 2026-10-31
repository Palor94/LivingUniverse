@echo off
cd /d "%~dp0.."
title Living Universe Tunnel
set "LU_TUNNEL_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "LU_TUNNEL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%LU_TUNNEL_NODE%" "%~dp0start-tunnel.mjs" %*
if errorlevel 1 (
  echo.
  echo No key prompt is active. Do not paste any key into this window.
  pause
)
exit /b
