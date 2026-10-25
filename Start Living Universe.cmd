@echo off
cd /d "%~dp0"
set "LIVING_UNIVERSE_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "LIVING_UNIVERSE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not "%LIVING_UNIVERSE_NODE%"=="node" if not exist "%LIVING_UNIVERSE_NODE%" (
    echo Living Universe requires Node.js 24 or newer.
    echo Open this project in Codex, or install Node.js from nodejs.org.
    pause
    exit /b 1
)
echo Open http://127.0.0.1:4317 in your browser once the server starts.
echo Keep this window open while using Living Universe.
"%LIVING_UNIVERSE_NODE%" app/server.mjs
pause
