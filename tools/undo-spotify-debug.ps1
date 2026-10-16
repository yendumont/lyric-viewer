# Puts Spotify's launch back as it was before the debugger port (--remote-debugging-port=8088) was added.
# Run in PowerShell. It only touches Spotify's own shortcuts, its startup entry and Spicetify's launch flags.
$ws = New-Object -ComObject WScript.Shell
$shortcuts = @(
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Spotify.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Spotify.lnk')
)
foreach ($path in $shortcuts) {
  if (Test-Path $path) { $l = $ws.CreateShortcut($path); $l.Arguments = ''; $l.Save() }
}
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Get-ItemProperty $run -Name Spotify -ErrorAction SilentlyContinue) {
  Set-ItemProperty $run -Name Spotify -Value ((Join-Path $env:APPDATA 'Spotify\Spotify.exe') + ' --autostart --minimized')
}
$ini = Join-Path $env:APPDATA 'spicetify\config-xpui.ini'
if (Test-Path $ini) { (Get-Content $ini -Raw) -replace 'spotify_launch_flags\s*=.*', 'spotify_launch_flags   = ' | Set-Content $ini }