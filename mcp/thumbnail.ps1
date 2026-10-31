$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Drawing
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $bytes = [Convert]::FromBase64String($request.data)
    $stream = [IO.MemoryStream]::new($bytes, $false)
    $image = [Drawing.Image]::FromStream($stream, $false, $true)
    try {
        if ([int64]$image.Width * $image.Height -gt 40000000) { throw 'Image exceeds pixel limit' }
        $edge = 768
        $limit = 196608
        $qualities = @(85,65,45,25)
        if ($request.reference -eq $true) {
            $edge = 2048
            $limit = 3145728
            $qualities = @(90,88,85)
            # Normalize EXIF orientation when deriving a reference. Originals
            # remain untouched and retain their original metadata.
            try {
                $orientation = [BitConverter]::ToUInt16($image.GetPropertyItem(274).Value,0)
                $rotations = @{2='RotateNoneFlipX';3='Rotate180FlipNone';4='Rotate180FlipX';5='Rotate90FlipX';6='Rotate90FlipNone';7='Rotate270FlipX';8='Rotate270FlipNone'}
                if ($rotations.ContainsKey([int]$orientation)) { $image.RotateFlip([Drawing.RotateFlipType]$rotations[[int]$orientation]) }
            } catch { }
        }
        $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
        while ($edge -ge 48) {
            $scale = [Math]::Min(1.0, $edge / [double][Math]::Max($image.Width, $image.Height))
            $bitmap = [Drawing.Bitmap]::new([Math]::Max(1,[int]($image.Width*$scale)), [Math]::Max(1,[int]($image.Height*$scale)))
            try {
                $graphics = [Drawing.Graphics]::FromImage($bitmap)
                try {
                    if ($request.reference -eq $true) {
                        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
                    }
                    $graphics.Clear([Drawing.Color]::White); $graphics.DrawImage($image,0,0,$bitmap.Width,$bitmap.Height)
                } finally { $graphics.Dispose() }
                foreach ($quality in $qualities) {
                    $output = [IO.MemoryStream]::new()
                    $parameters = [Drawing.Imaging.EncoderParameters]::new(1)
                    try {
                        $parameters.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality,[int64]$quality)
                        $bitmap.Save($output,$codec,$parameters)
                        if ($output.Length -le $limit) { [Console]::Out.Write([Convert]::ToBase64String($output.ToArray())); exit 0 }
                    } finally { $output.Dispose(); $parameters.Dispose() }
                }
            } finally { $bitmap.Dispose() }
            if ($request.reference -eq $true) { if ($edge -le 1024) { exit 1 }; $edge = [Math]::Max(1024,[int]($edge*0.75)) }
            else { $edge = [int]($edge/2) }
        }
        exit 1
    } finally { $image.Dispose(); $stream.Dispose() }
} catch { [Console]::Error.Write('Thumbnail conversion unavailable.'); exit 1 }
