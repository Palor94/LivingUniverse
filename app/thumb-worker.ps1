$ErrorActionPreference = 'Stop'
# Long-lived thumbnail worker for app/thumbnails.mjs. Reads one ASCII JSON request per line
# ({"id":n,"src":"...","dst":"...","edge":320}) and answers "<id> ok" or "<id> err".
# The original is only read; the small JPEG is written to dst (outside OneDrive).
Add-Type -AssemblyName System.Drawing
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$rotations = @{2='RotateNoneFlipX';3='Rotate180FlipNone';4='Rotate180FlipX';5='Rotate90FlipX';6='Rotate90FlipNone';7='Rotate270FlipX';8='Rotate270FlipNone'}
while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if (-not $line.Trim()) { continue }
    $id = '0'
    try {
        $request = $line | ConvertFrom-Json
        $id = [string]$request.id
        $stream = [IO.File]::OpenRead($request.src)
        try {
            $image = [Drawing.Image]::FromStream($stream, $false, $true)
            try {
                if ([int64]$image.Width * $image.Height -gt 40000000) { throw 'too large' }
                try {
                    $orientation = [BitConverter]::ToUInt16($image.GetPropertyItem(274).Value, 0)
                    if ($rotations.ContainsKey([int]$orientation)) { $image.RotateFlip([Drawing.RotateFlipType]$rotations[[int]$orientation]) }
                } catch { }
                $edge = [int]$request.edge
                $scale = [Math]::Min(1.0, $edge / [double][Math]::Max($image.Width, $image.Height))
                $bitmap = [Drawing.Bitmap]::new([Math]::Max(1, [int]($image.Width * $scale)), [Math]::Max(1, [int]($image.Height * $scale)))
                try {
                    $graphics = [Drawing.Graphics]::FromImage($bitmap)
                    try {
                        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                        $graphics.Clear([Drawing.Color]::White)
                        $graphics.DrawImage($image, [Drawing.Rectangle]::new(0, 0, $bitmap.Width, $bitmap.Height))
                    } finally { $graphics.Dispose() }
                    $parameters = [Drawing.Imaging.EncoderParameters]::new(1)
                    try {
                        $parameters.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [int64]82)
                        $bitmap.Save($request.dst, $codec, $parameters)
                    } finally { $parameters.Dispose() }
                } finally { $bitmap.Dispose() }
            } finally { $image.Dispose() }
        } finally { $stream.Dispose() }
        [Console]::Out.WriteLine("$id ok")
    } catch {
        [Console]::Out.WriteLine("$id err")
    }
    [Console]::Out.Flush()
}
