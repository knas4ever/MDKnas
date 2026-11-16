# Builds an unsigned .msix for Microsoft Store upload (the Store signs it).
param(
  [string]$Exe = 'src-tauri\target\release\mdknas.exe',
  [string]$Out = 'msix-out'
)
$ErrorActionPreference = 'Stop'
$pkg = Join-Path $Out 'pkg'
Remove-Item $Out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$pkg\Assets" -Force | Out-Null
Copy-Item $Exe $pkg

# Store version must be a.b.c.0
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
$parts = $v.Split('.')
$version = "$($parts[0]).$($parts[1]).$($parts[2]).0"
(Get-Content msix\AppxManifest.xml -Raw).Replace('__VERSION__', $version) |
  Set-Content "$pkg\AppxManifest.xml" -Encoding UTF8

Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path build\icon.png))
function Save-Logo($name, $w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = [Math]::Min($w, $h)
  $g.DrawImage($src, [int](($w - $s) / 2), [int](($h - $s) / 2), $s, $s)
  $bmp.Save("$pkg\Assets\$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Save-Logo 'StoreLogo' 50 50
Save-Logo 'Square44x44Logo' 44 44
Save-Logo 'Square150x150Logo' 150 150

$makeappx = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe' |
  Sort-Object FullName -Descending | Select-Object -First 1
& $makeappx.FullName pack /d $pkg /p "$Out\MDKnas_$version.msix" /o
if ($LASTEXITCODE -ne 0) { throw 'makeappx failed' }
Get-Item "$Out\*.msix" | ForEach-Object { "{0}: {1:N1} MB" -f $_.Name, ($_.Length / 1MB) }
