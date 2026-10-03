@echo off
rem One-click start for the Electron app: rebuilds the game if anything changed since the last build, then opens it.
title Liquid Dreams
cd /d "%~dp0"
node electron\launch.mjs
if errorlevel 1 pause
