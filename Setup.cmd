@echo off
rem Sets up Lyrics Viewer: installs Bun if it is missing (after asking), installs the packages, downloads Electron, builds the page,
rem creates config.json and a desktop shortcut, and offers to start the app.
rem Options: /auto answers yes to every question, /nostart does not start the app at the end.
rem LV_SHORTCUT_DIR can name another folder for the shortcut (used for testing).
setlocal
title Lyrics Viewer setup
cd /d "%~dp0"
rem Remember the folder now: SHIFT below also clears %0.
set "LV_DIR=%~dp0"
set "AUTO=0"
set "NOSTART=0"
:args
if "%~1"=="" goto argsdone
if /i "%~1"=="/auto" set "AUTO=1"
if /i "%~1"=="/nostart" set "NOSTART=1"
shift
goto args
:argsdone

echo.
echo  Lyrics Viewer - setup
echo  ---------------------
echo.

rem 1. Bun: the program that runs the app's server.
set "BUN=bun"
where bun >nul 2>nul
if not errorlevel 1 goto havebun
if exist "%USERPROFILE%\.bun\bin\bun.exe" set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
if exist "%USERPROFILE%\.bun\bin\bun.exe" goto havebun
echo Bun is not installed. It runs the app's server (https://bun.sh).
if "%AUTO%"=="1" goto installbun
choice /m "Install Bun now from bun.sh"
if errorlevel 2 goto nobun
:installbun
echo Installing Bun...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
if exist "%USERPROFILE%\.bun\bin\bun.exe" set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
if exist "%USERPROFILE%\.bun\bin\bun.exe" goto havebun
:nobun
echo.
echo Bun is needed. Install it from https://bun.sh and run Setup.cmd again.
if not "%AUTO%"=="1" pause
exit /b 1
:havebun
echo Using Bun: %BUN%

rem 2. The app's packages, then Electron (the window the app runs in), then the page.
echo.
echo Installing the app's packages. This can take a minute...
"%BUN%" install
if errorlevel 1 goto failed
echo.
echo Downloading Electron, the window the app runs in. About 100 MB, once...
"%BUN%" node_modules/electron/install.js
if not exist "node_modules\electron\dist\electron.exe" goto failed
echo.
echo Building the page...
"%BUN%" ui/build.ts
if errorlevel 1 goto failed

rem 3. Your settings file (keys go in it later) and a desktop shortcut.
if not exist config.json copy config.example.json config.json >nul
if not defined LV_SHORTCUT_DIR for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "LV_SHORTCUT_DIR=%%D"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $env:LV_SHORTCUT_DIR 'Lyrics Viewer.lnk')); $s.TargetPath=(Join-Path $env:LV_DIR 'start.cmd'); $s.WorkingDirectory=$env:LV_DIR; $s.IconLocation=(Join-Path $env:LV_DIR 'app\icon.ico'); $s.WindowStyle=7; $s.Description='Lyrics Viewer'; $s.Save()"

echo.
echo Done. A shortcut called Lyrics Viewer is on your desktop.
echo Add your keys in the app's settings (press the comma key) or in config.json. See README.md.
echo.
if "%NOSTART%"=="1" goto end
if "%AUTO%"=="1" goto startapp
choice /m "Start Lyrics Viewer now"
if errorlevel 2 goto end
:startapp
start "" "%LV_DIR%start.cmd"
:end
if not "%AUTO%"=="1" pause
exit /b 0

:failed
echo.
echo Something went wrong. Check your internet connection and run Setup.cmd again.
echo If it keeps failing, see the "could not start" part of README.md.
if not "%AUTO%"=="1" pause
exit /b 1
