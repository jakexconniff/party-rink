@echo off
rem Party Rink launcher: double-click this file on the laptop.
rem Installs dependencies the first time, builds the client, then starts the server.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Get the LTS version from https://nodejs.org, install it,
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\vite (
  echo Installing dependencies ^(first run only, takes a minute^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. See the message above.
    pause
    exit /b 1
  )
)

echo Building the game...
node node_modules\vite\bin\vite.js build
if errorlevel 1 (
  echo.
  echo   Build failed. See the message above.
  pause
  exit /b 1
)

node node_modules\tsx\dist\cli.mjs server\index.ts
pause
