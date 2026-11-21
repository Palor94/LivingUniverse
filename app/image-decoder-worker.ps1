$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
function Convert-LuImage($request) {
    $bytes = if ($request.src) { [IO.File]::ReadAllBytes($request.src) } else { [Convert]::FromBase64String($request.data) }
    $stream = [IO.MemoryStream]::new($bytes, $false)
    $image = [Drawing.Image]::FromStream($stream, $false, $true)
    try {
        if ([int64]$image.Width * $image.Height -gt 40000000) { throw 'Image exceeds pixel limit' }
        $edge = if ($request.edge) { [int]$request.edge } else { 768 }
        $limit = if ($request.src) { 20971520 } else { 196608 }
        $qualities = @(85,65,45,25)
        if ($request.src) { $qualities = @(82) }
        if ($request.reference -eq $true) {
            $edge = 2048
            $limit = 3145728
            $qualities = @(90,88,85)
        }
        if ($request.reference -eq $true -or $request.src) {
            # Normalize EXIF orientation when deriving a reference. Originals
            # remain untouched and retain their original metadata.
            try {
                $orientation = [BitConverter]::ToUInt16($image.GetPropertyItem(274).Value,0)
                $rotations = @{2='RotateNoneFlipX';3='Rotate180FlipNone';4='Rotate180FlipX';5='Rotate90FlipX';6='Rotate90FlipNone';7='Rotate270FlipX';8='Rotate270FlipNone'}
                if ($rotations.ContainsKey([int]$orientation)) { $image.RotateFlip([Drawing.RotateFlipType]$rotations[[int]$orientation]) }
            } catch { }
        }
        $sourceX = 0; $sourceY = 0; $sourceW = $image.Width; $sourceH = $image.Height
        if ($null -ne $request.crop) {
            $c = $request.crop
            if ($c.x -lt 0 -or $c.y -lt 0 -or $c.w -lt .01 -or $c.h -lt .01 -or ([double]$c.x+[double]$c.w) -gt (1.0+1e-12) -or ([double]$c.y+[double]$c.h) -gt (1.0+1e-12)) { throw 'Invalid crop' }
            $sourceX = [int][Math]::Floor($c.x*$image.Width+.5)
            $sourceY = [int][Math]::Floor($c.y*$image.Height+.5)
            $sourceW = [Math]::Max(1,[int][Math]::Floor(($c.x+$c.w)*$image.Width+.5)-$sourceX)
            $sourceH = [Math]::Max(1,[int][Math]::Floor(($c.y+$c.h)*$image.Height+.5)-$sourceY)
        }
        $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
        while ($edge -ge 48) {
            $scale = [Math]::Min(1.0, $edge / [double][Math]::Max($sourceW, $sourceH))
            $bitmap = [Drawing.Bitmap]::new([Math]::Max(1,[int]($sourceW*$scale)), [Math]::Max(1,[int]($sourceH*$scale)))
            try {
                $graphics = [Drawing.Graphics]::FromImage($bitmap)
                try {
                    if ($request.reference -eq $true -or $request.src) {
                        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
                    }
                    $graphics.Clear([Drawing.Color]::White); $graphics.DrawImage($image,[Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height),$sourceX,$sourceY,$sourceW,$sourceH,[Drawing.GraphicsUnit]::Pixel)
                } finally { $graphics.Dispose() }
                foreach ($quality in $qualities) {
                    $output = [IO.MemoryStream]::new()
                    $parameters = [Drawing.Imaging.EncoderParameters]::new(1)
                    try {
                        $parameters.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality,[int64]$quality)
                        $bitmap.Save($output,$codec,$parameters)
                        if ($output.Length -le $limit) { return [Convert]::ToBase64String($output.ToArray()) }
                    } finally { $output.Dispose(); $parameters.Dispose() }
                }
            } finally { $bitmap.Dispose() }
            if ($request.reference -eq $true) { if ($edge -le 1024) { throw 'Image exceeds output bound' }; $edge = [Math]::Max(1024,[int]($edge*0.75)) }
            else { $edge = [int]($edge/2) }
        }
        throw 'Image exceeds output bound'
    } finally { $image.Dispose(); $stream.Dispose() }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $id = 0
  try {
    $request = $line | ConvertFrom-Json
    $id = $request.id
    $result = Convert-LuImage $request
    if ($request.dst) { [IO.File]::WriteAllBytes($request.dst,[Convert]::FromBase64String($result)); $answer = @{id=$id;ok=$true} }
    else { $answer = @{id=$id;ok=$true;data=$result} }
  } catch { $answer = @{id=$id;ok=$false;error=($_.Exception.GetType().FullName+': '+$_.Exception.Message+' (line '+$_.InvocationInfo.ScriptLineNumber+')')} }
  [Console]::Out.WriteLine(($answer | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
}
