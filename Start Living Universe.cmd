@echo off
cd /d "%~dp0"
rem Bootstrap the verified backup in the actual desktop environment. Never overwrite a catalogue.
set "LIVING_UNIVERSE_DATA=%USERPROFILE%\AppData\Local\LivingUniverse\desktop-catalogue"
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
"%LIVING_UNIVERSE_NODE%" app/bootstrap.mjs
if errorlevel 1 (
    pause
    exit /b 1
)
echo Open http://127.0.0.1:4317 in your browser once the server starts.
echo Keep this window open while using Living Universe.
echo Database folder: %LIVING_UNIVERSE_DATA%
"%LIVING_UNIVERSE_NODE%" app/server.mjs
pause
