@echo off
rem One-click start: installs what's missing, starts the game and opens it in the browser.
rem Close this window to stop the game.
title Liquid Dreams
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Liquid Dreams needs Node.js, a free program that runs the game on your computer.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo This computer doesn't have winget, the tool this installer needs.
    echo Please install Node.js yourself: go to https://nodejs.org, download the LTS installer, and run it.
    pause
    exit /b 1
  )
  echo Installing it now. Windows may ask for permission: click Yes.
  echo.
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  echo.
  rem Windows needs a new window to pick up the updated PATH, so this window won't see "node" yet even on
  rem success: check the LTS installer's default location too before concluding the install failed.
  set "NODE_NOW_INSTALLED="
  where node >nul 2>nul && set "NODE_NOW_INSTALLED=1"
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_NOW_INSTALLED=1"
  if defined NODE_NOW_INSTALLED (
    echo Node.js is installed. Please double-click "Start Liquid Dreams" again.
    pause
    exit /b 0
  )
  echo Installing Node.js didn't work, or the install was declined.
  echo Please install it yourself: go to https://nodejs.org, download the LTS installer, and run it.
  pause
  exit /b 1
)

rem Vite needs Node ^20.19 or >=22.12 (node_modules/vite's package.json "engines").
node -e "const [maj,min]=process.versions.node.split('.').map(Number);process.exit((maj===20&&min>=19)||(maj===22&&min>=12)||maj>=23?0:1)"
if errorlevel 1 (
  echo This version of Node.js won't run the game; install the LTS version from https://nodejs.org
  pause
  exit /b 1
)

if exist ".git" (
  where git >nul 2>nul && (
    echo Checking for updates...
    git pull --ff-only
    if errorlevel 1 echo Couldn't download the latest update ^(the game will start with the version you have^). If this keeps happening, ask Andrew.
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
