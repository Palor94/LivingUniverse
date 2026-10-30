@echo off
cd /d "%~dp0"
set "LIVING_UNIVERSE_DATA=%USERPROFILE%\AppData\Local\LivingUniverse\desktop-catalogue"
set "LIVING_UNIVERSE_MOBILE_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "LIVING_UNIVERSE_MOBILE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%LIVING_UNIVERSE_MOBILE_NODE%" app/setup-mobile.mjs
pause
