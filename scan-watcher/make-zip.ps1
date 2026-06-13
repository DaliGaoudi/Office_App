<#
  make-zip.ps1 — bundle the Scan Bridge setup files into a single zip that the
  web app offers for download (client/public/scan-bridge-setup.zip).

  Run this on Windows after changing any bridge/installer script, then commit
  the updated zip. Vercel builds on Linux and can't regenerate it, so the zip
  is a committed asset.

      powershell -ExecutionPolicy Bypass -File make-zip.ps1
#>
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$root = Split-Path -Parent $here

# Files the office PC needs. Deliberately excludes config.json (secrets),
# bridge.pid, make-zip.ps1 and the zip itself.
$include = @(
    'bridge.js',
    'scan.ps1',
    'bridge-hidden.vbs',
    'install-autostart.cmd',
    'uninstall-autostart.cmd',
    'start-bridge.cmd',
    'watcher.js',
    'config.example.json',
    'README.md'
)

$paths = $include | ForEach-Object {
    $p = Join-Path $here $_
    if (-not (Test-Path $p)) { throw "Missing file: $p" }
    $p
}

$out = Join-Path $root 'client\public\scan-bridge-setup.zip'
New-Item -ItemType Directory -Path (Split-Path $out) -Force | Out-Null
if (Test-Path $out) { Remove-Item $out -Force }

# Files land at the zip root, so Windows "Extract All" makes one clean folder.
Compress-Archive -Path $paths -DestinationPath $out -Force

Write-Host "Wrote $out  ($((Get-Item $out).Length) bytes)"
