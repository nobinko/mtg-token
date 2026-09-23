@echo off
cd /d "%~dp0"
title MTG Token Finder

where node > nul 2>&1
if errorlevel 1 goto node_missing

node scripts\start.mjs
set "APP_EXIT=%errorlevel%"
if "%APP_EXIT%"=="0" exit /b 0

echo.
echo Startup failed. Press any key to close this window.
pause > nul
exit /b %APP_EXIT%

:node_missing
echo.
echo [ERROR] Node.js was not found.
echo Install the LTS version from https://nodejs.org/ and try again.
echo.
pause
exit /b 1
