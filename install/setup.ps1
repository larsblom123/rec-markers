# Rec Markers setup — run ONCE on the Windows PC (normal PowerShell, no admin needed).
#   cd <folder>\install
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# Then restart Premiere → Window > Extensions > Rec Markers.

$ErrorActionPreference = "Stop"

$repoPanel = Resolve-Path (Join-Path $PSScriptRoot "..\panel")
$extDir = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$dest = Join-Path $extDir "com.larry.recmarkers"

Write-Host "== Rec Markers setup ==" -ForegroundColor Cyan

# 1. Enable unsigned CEP panels (PlayerDebugMode) for CEP 9-12
foreach ($v in 9..12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value "1" -PropertyType String -Force | Out-Null
}
Write-Host "[ok] PlayerDebugMode enabled (CSXS 9-12)"

# 2. Install the panel
New-Item -ItemType Directory -Path $extDir -Force | Out-Null
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item $repoPanel $dest -Recurse
Write-Host "[ok] Panel copied to $dest"

Write-Host ""
Write-Host "Done. Restart Premiere Pro, then: Window > Extensions > Rec Markers" -ForegroundColor Green
