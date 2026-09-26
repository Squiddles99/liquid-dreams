@echo off
rem One-click start: installs what's missing, starts the game and opens it in the browser.
rem Close this window to stop the game.
title Liquid Dreams
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Liquid Dreams needs Node.js, a free program that runs the game on your computer.
  echo Installing it now. Windows may ask for permission: click Yes.
  echo.
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js is installed. Please double-click "Start Liquid Dreams" again.
  pause
  exit /b
)

if exist ".git" (
  where git >nul 2>nul && (
    echo Checking for updates...
    git pull --ff-only
  )
)

if not exist "node_modules" echo First run: downloading the game's building blocks. This takes a minute or two...
rem Runs every time so an update that needs new building blocks gets them (a few seconds when nothing changed).
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo Something went wrong downloading. Check the internet connection and try again.
  pause
  exit /b 1
)

echo.
echo Starting Liquid Dreams. Your browser will open in a moment.
echo Use Chrome or Edge. Keep this window open while you play; close it to stop.
echo.
call npm run dev -- --open
pause
