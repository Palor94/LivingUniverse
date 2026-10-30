@echo off
title Living Universe - Sogni setup
echo Opening the separate Sogni API key window...
echo Paste the key in that window, not in this console.
cd /d "%~dp0"
set "LU_SOGNI_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%LU_SOGNI_NODE%" (
  "%LU_SOGNI_NODE%" app/setup-sogni.mjs
) else (
  node app/setup-sogni.mjs
)
if errorlevel 1 pause
