@echo off
rem Starts Lyrics Viewer (#Hype) as an app (needs Bun; run "bun install" once in this folder first).
cd /d "%~dp0"
set "BUN=bun"
where bun >nul 2>nul || set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
rem Electron no longer downloads its program during "bun install". This fetches it (or updates it after a version change) and does
rem nothing, in about a tenth of a second, when it is already there.
"%BUN%" node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron could not be set up. Check your internet connection and run start.cmd again.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" app
