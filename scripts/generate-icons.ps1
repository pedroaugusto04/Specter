Add-Type -AssemblyName System.Drawing

function Create-RoundedSpecterIcon([int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [float]($size * 0.22)
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    
    # Create rounded rect path for background
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    # Fill background (#09090B)
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 9, 9, 11))
    $g.FillPath($bgBrush, $path)

    # Stroke (#FAFAFA)
    $penWidth = [Math]::Max(1.5, ($size * 0.07))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 250, 250, 250), $penWidth)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    # Viewbox is 32x32 in original SVG
    $scale = $size / 32.0

    # Top-Left Bracket: M8 13 V8.5 C8 8.22 8.22 8 8.5 8 H13
    $tlPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tlPath.AddLine(8*$scale, 13*$scale, 8*$scale, 8.5*$scale)
    $tlPath.AddArc((8)*$scale, (8)*$scale, (1)*$scale, (1)*$scale, 180, 90)
    $tlPath.AddLine(8.5*$scale, 8*$scale, 13*$scale, 8*$scale)
    $g.DrawLines($pen, @(
        [System.Drawing.PointF]::new(8*$scale, 13*$scale),
        [System.Drawing.PointF]::new(8*$scale, 8*$scale),
        [System.Drawing.PointF]::new(13*$scale, 8*$scale)
    ))

    # Top-Right Bracket: M19 8 H23.5 C23.77 8 24 8.22 24 8.5 V13
    $g.DrawLines($pen, @(
        [System.Drawing.PointF]::new(19*$scale, 8*$scale),
        [System.Drawing.PointF]::new(24*$scale, 8*$scale),
        [System.Drawing.PointF]::new(24*$scale, 13*$scale)
    ))

    # Bottom-Left Bracket: M8 19 V23.5 C8 23.77 8.22 24 8.5 24 H13
    $g.DrawLines($pen, @(
        [System.Drawing.PointF]::new(8*$scale, 19*$scale),
        [System.Drawing.PointF]::new(8*$scale, 24*$scale),
        [System.Drawing.PointF]::new(13*$scale, 24*$scale)
    ))

    # Bottom-Right Bracket: M19 24 H23.5 C24 24 24 23.77 24 23.5 V19
    $g.DrawLines($pen, @(
        [System.Drawing.PointF]::new(19*$scale, 24*$scale),
        [System.Drawing.PointF]::new(24*$scale, 24*$scale),
        [System.Drawing.PointF]::new(24*$scale, 19*$scale)
    ))

    # Center Dot: circle cx="16" cy="16" r="2.5"
    $dotRadius = 2.5 * $scale
    $dotRect = New-Object System.Drawing.RectangleF((16*$scale - $dotRadius), (16*$scale - $dotRadius), (2*$dotRadius), (2*$dotRadius))
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 250, 250))
    $g.FillEllipse($dotBrush, $dotRect)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $outPath ($size x $size)"
}

Create-RoundedSpecterIcon 16 "extension/icons/icon-16.png"
Create-RoundedSpecterIcon 48 "extension/icons/icon-48.png"
Create-RoundedSpecterIcon 128 "extension/icons/icon-128.png"
