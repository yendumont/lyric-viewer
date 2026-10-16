# Reads Windows' "System Media Transport Controls": the same source the volume flyout uses to show
# what is playing. Prints one JSON line per change (and one per second while playing), reads
# commands (play, pause, next, prev, seek <ms>) from stdin. Nothing is sent anywhere.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Wait-Op($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(5000)
    if ($task.IsCompleted) { return $task.Result }
    return $null
}

$manager = Wait-Op ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$coverDir = Join-Path $env:TEMP 'lyric-viewer'
New-Item -ItemType Directory -Force $coverDir | Out-Null
$lastKey = ''
$lastLine = ''
$lastEmit = [DateTime]::MinValue
$coverFile = ''

# Console.In blocks, so a second thread reads the commands and queues them.
$queue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
$reader = [runspacefactory]::CreateRunspace()
$reader.Open()
$reader.SessionStateProxy.SetVariable('q', $queue)
$readerShell = [powershell]::Create()
$readerShell.Runspace = $reader
[void]$readerShell.AddScript({
    while ($null -ne ($l = [Console]::In.ReadLine())) { $q.Enqueue($l) }
    $q.Enqueue('__eof')
})
[void]$readerShell.BeginInvoke()

function Pick-Session {
    $sessions = $manager.GetSessions()
    # Prefer one that is playing, else the one Windows calls current.
    foreach ($s in $sessions) {
        if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { return $s }
    }
    return $manager.GetCurrentSession()
}

while ($true) {
    $session = Pick-Session

    # Commands from the app.
    $cmd = $null
    while ($queue.TryDequeue([ref]$cmd)) {
        if ($cmd -eq '__eof') { exit }
        if ($null -ne $session) {
            try {
                switch -Regex ($cmd) {
                    '^play$' { [void](Wait-Op ($session.TryPlayAsync()) ([bool])) }
                    '^pause$' { [void](Wait-Op ($session.TryPauseAsync()) ([bool])) }
                    '^toggle$' { [void](Wait-Op ($session.TryTogglePlayPauseAsync()) ([bool])) }
                    '^next$' { [void](Wait-Op ($session.TrySkipNextAsync()) ([bool])) }
                    '^prev$' { [void](Wait-Op ($session.TrySkipPreviousAsync()) ([bool])) }
                    '^seek (\d+)$' { [void](Wait-Op ($session.TryChangePlaybackPositionAsync([long]$Matches[1] * 10000)) ([bool])) }
                }
            } catch { }
        }
        $lastLine = ''
    }

    if ($null -eq $session) {
        $line = '{"none":true}'
    } else {
        try {
            $props = Wait-Op ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $info = $session.GetPlaybackInfo()
            $time = $session.GetTimelineProperties()
            $app = $session.SourceAppUserModelId
            $key = "$app|$($props.Artist)|$($props.Title)|$($props.AlbumTitle)|$([int]$time.EndTime.TotalSeconds)"

            if ($key -ne $lastKey) {
                $lastKey = $key
                $coverFile = ''
                $coverTries = 0
            }
            # The player hands over the cover a moment after the song changes, so ask again for a few seconds.
            if ($coverFile -eq '' -and $coverTries -lt 16 -and $null -ne $props.Thumbnail) {
                $coverTries++
                try {
                    $stream = Wait-Op ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                    if ($null -ne $stream) {
                        # The stream is a bare COM object, so it is read through the .NET stream adapter.
                        $asRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
                        $net = $asRead.Invoke($null, @($stream))
                        $ms = New-Object IO.MemoryStream
                        $net.CopyTo($ms)
                        if ($ms.Length -gt 0) {
                            # Spotify's thumbnail is the cover with a strip of its logo under it: keep the square.
                            try {
                                Add-Type -AssemblyName System.Drawing
                                $ms.Position = 0
                                $img = [System.Drawing.Image]::FromStream($ms)
                                # Where the picture ends: a tall thumbnail is cut to a square, and one with a white band
                                # under the cover (the band that carries Spotify's logo) is cut where the band starts.
                                $keep = $img.Height
                                if ($img.Height -gt $img.Width * 1.05) { $keep = $img.Width }
                                $bmp = New-Object System.Drawing.Bitmap($img)
                                for ($y = [int]($keep * 0.4); $y -lt $keep; $y++) {
                                    $white = 0; $seen = 0
                                    for ($x = 0; $x -lt $bmp.Width; $x += 4) {
                                        $c = $bmp.GetPixel($x, $y); $seen++
                                        if ($c.R -gt 232 -and $c.G -gt 232 -and $c.B -gt 232) { $white++ }
                                    }
                                    if ($white -ge $seen * 0.92) { $keep = $y; break }
                                }
                                $bmp.Dispose()
                                if ($keep -lt $img.Height) {
                                    $crop = New-Object System.Drawing.Bitmap($img.Width, $keep)
                                    $g = [System.Drawing.Graphics]::FromImage($crop)
                                    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $img.Width, $keep)), (New-Object System.Drawing.Rectangle(0, 0, $img.Width, $keep)), [System.Drawing.GraphicsUnit]::Pixel)
                                    $g.Dispose()
                                    $out = New-Object IO.MemoryStream
                                    $crop.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
                                    $ms = $out
                                    $crop.Dispose()
                                }
                                $img.Dispose()
                            } catch { }
                            $coverFile = Join-Path $coverDir ("cover-" + [Math]::Abs($key.GetHashCode()) + ".img")
                            [IO.File]::WriteAllBytes($coverFile, $ms.ToArray())
                        }
                    }
                } catch { }
            }

            # Position as of "now": the player reports it with the time it was true at.
            $position = $time.Position.TotalMilliseconds
            $status = [string]$info.PlaybackStatus
            if ($status -eq 'Playing') {
                $age = ([DateTimeOffset]::UtcNow - $time.LastUpdatedTime.ToUniversalTime()).TotalMilliseconds
                if ($age -gt 0 -and $age -lt 3600000) { $position += $age }
            }
            $duration = $time.EndTime.TotalMilliseconds - $time.StartTime.TotalMilliseconds

            $obj = [ordered]@{
                app = $app
                title = [string]$props.Title
                artist = [string]$props.Artist
                album = [string]$props.AlbumTitle
                status = $status
                positionMs = [Math]::Round($position)
                durationMs = [Math]::Round($duration)
                cover = $coverFile
                canSeek = [bool]$info.Controls.IsPlaybackPositionEnabled
                at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            }
            $line = $obj | ConvertTo-Json -Compress
        } catch {
            $line = '{"none":true}'
        }
    }

    $now = [DateTime]::UtcNow
    $stable = $line -replace '"positionMs":\d+,', '' -replace '"at":\d+', ''
    if ($stable -ne $lastLine -or ($now - $lastEmit).TotalMilliseconds -ge 1000) {
        [Console]::Out.WriteLine($line)
        [Console]::Out.Flush()
        $lastLine = $stable
        $lastEmit = $now
    }
    Start-Sleep -Milliseconds 250
}
