@echo off
rem Starts Lyric Viewer as an app (needs Bun; run "bun install" once in this folder first).
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" app
