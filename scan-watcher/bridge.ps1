<#
  Scan Bridge (PowerShell edition)
  --------------------------------
  A tiny local web server that lets the web app drive the scanner attached to
  THIS PC. Same role as bridge.js, but written in PowerShell so it needs NO
  install -- every Windows PC already has PowerShell. No Node.js, no admin.

      POST/GET http://127.0.0.1:17171/scan   -> scans one page, returns the image
      GET      http://127.0.0.1:17171/ping    -> health check

  Run:  start-bridge.cmd (visible)  or  bridge-hidden.vbs (background)
  Auto-start at login: run install-autostart.cmd once.

  Optional config.json (same folder): BRIDGE_PORT, SCANNER_NAME, SCAN_DPI, SCAN_FORMAT.

  NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
  when there is no BOM, so non-ASCII glyphs can corrupt parsing.
#>
param(
    [int]$Port = 17171,
    [int]$Dpi = 150,
    [string]$Device = "",
    [string]$Format = "jpeg"
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

# Testing without a scanner: when on, /scan returns a generated test page
# instead of driving WIA. Enable via config (SCAN_MOCK:true) or per request (?mock=1).
$MockDefault = $false

# Load config.json if present (overrides the defaults above).
$cfgPath = Join-Path $here 'config.json'
if (Test-Path $cfgPath) {
    try {
        $cfg = Get-Content -Raw $cfgPath | ConvertFrom-Json
        if ($cfg.BRIDGE_PORT)  { $Port   = [int]$cfg.BRIDGE_PORT }
        if ($cfg.SCAN_DPI)     { $Dpi    = [int]$cfg.SCAN_DPI }
        if ($cfg.SCANNER_NAME) { $Device = [string]$cfg.SCANNER_NAME }
        if ($cfg.SCAN_FORMAT)  { $Format = [string]$cfg.SCAN_FORMAT }
        if ($null -ne $cfg.SCAN_MOCK) { $MockDefault = [bool]$cfg.SCAN_MOCK }
    } catch { Write-Warning "Ignoring invalid config.json: $($_.Exception.Message)" }
}

# WIA image format GUIDs and their MIME types.
$formats = @{
    'jpeg' = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'; 'jpg' = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
    'png'  = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
    'tiff' = '{B96B3CB1-0728-11D3-9D7B-0000F81EF32E}'
    'bmp'  = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'
}
$mime = @{ 'jpeg'='image/jpeg'; 'jpg'='image/jpeg'; 'png'='image/png'; 'tiff'='image/tiff'; 'bmp'='image/bmp' }

function Set-WiaProp($props, $id, $value) {
    try { foreach ($p in $props) { if ($p.PropertyID -eq $id) { $p.Value = $value; return } } } catch { }
}

# Drive the scanner via WIA and return the image bytes.
function Invoke-Scan([int]$scanDpi, [bool]$gray) {
    $fmt = $formats[$Format.ToLower()]
    if (-not $fmt) { $fmt = $formats['jpeg'] }

    $dm = New-Object -ComObject WIA.DeviceManager
    $devInfo = $null
    foreach ($d in $dm.DeviceInfos) {
        if ($d.Type -eq 1) {                      # 1 = Scanner
            if ($Device -ne "") {
                $name = ""
                try { $name = $d.Properties.Item("Name").Value } catch { }
                if ($name -like "*$Device*") { $devInfo = $d; break }
            } else { $devInfo = $d; break }
        }
    }
    if (-not $devInfo) { throw "No scanner found. Make sure the scanner is powered on and its driver is installed." }

    $dev  = $devInfo.Connect()
    $item = $dev.Items.Item(1)
    Set-WiaProp $item.Properties 6147 $scanDpi    # horizontal DPI
    Set-WiaProp $item.Properties 6148 $scanDpi    # vertical DPI
    if ($gray) { Set-WiaProp $item.Properties 6146 2 } else { Set-WiaProp $item.Properties 6146 1 }  # intent: 2=gray,1=color

    $image = $item.Transfer($fmt)
    if (-not $image) { throw "Scan produced no image (cancelled or empty feeder)." }

    $tmp = Join-Path $env:TEMP ("scan-{0}.{1}" -f ([guid]::NewGuid().ToString('N')), $Format)
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
    $image.SaveFile($tmp)
    $bytes = [System.IO.File]::ReadAllBytes($tmp)
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $bytes
}

# Generate a fake A4 "scanned" page (for testing without a scanner).
function New-MockScan([int]$scanDpi) {
    Add-Type -AssemblyName System.Drawing
    $w = [int][math]::Round(8.27 * $scanDpi)
    $h = [int][math]::Round(11.69 * $scanDpi)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.Clear([System.Drawing.Color]::White)
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(170, 170, 170), 3)
        $g.DrawRectangle($pen, 40, 40, ($w - 80), ($h - 80))

        $scale = $scanDpi / 96.0
        $titleFont = New-Object System.Drawing.Font('Arial', [single](40 * $scale), [System.Drawing.FontStyle]::Bold)
        $bodyFont  = New-Object System.Drawing.Font('Arial', [single](13 * $scale))
        $black = [System.Drawing.Brushes]::Black
        $g.DrawString("TEST SCAN", $titleFont, $black, [single](80 * $scale), [single](80 * $scale))
        $g.DrawString((Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "   |   $scanDpi DPI   |   $w x $h px",
                      $bodyFont, $black, [single](80 * $scale), [single](150 * $scale))
        for ($i = 0; $i -lt 22; $i++) {
            $y = [single]((220 + $i * 34) * $scale)
            $g.DrawString(("Line {0:D2}  -  the quick brown fox jumps over the lazy dog 0123456789" -f ($i + 1)),
                          $bodyFont, $black, [single](80 * $scale), $y)
        }

        $ms = New-Object System.IO.MemoryStream
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
        $eps = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $eps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
        $bmp.Save($ms, $codec, $eps)
        return $ms.ToArray()
    } finally {
        $g.Dispose(); $bmp.Dispose()
    }
}

$enc = [System.Text.Encoding]::ASCII

# Write a minimal HTTP/1.1 response (headers as ASCII, then the raw body bytes).
function Write-Response($stream, [int]$status, [string]$reason, $headers, [byte[]]$body) {
    if ($null -eq $body) { $body = [byte[]]@() }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("HTTP/1.1 $status $reason`r`n")
    foreach ($k in $headers.Keys) { [void]$sb.Append(("{0}: {1}`r`n" -f $k, $headers[$k])) }
    [void]$sb.Append(("Content-Length: {0}`r`n" -f $body.Length))
    [void]$sb.Append("Connection: close`r`n`r`n")
    $headerBytes = $enc.GetBytes($sb.ToString())
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
} catch {
    Write-Error "Could not bind to port $Port (is the bridge already running?): $($_.Exception.Message)"
    exit 1
}

try { Set-Content -Path (Join-Path $here 'bridge.pid') -Value $PID -Encoding ascii } catch { }
Write-Host "Scan bridge (PowerShell) listening on http://127.0.0.1:$Port"
Write-Host "  POST /scan  -> trigger the scanner, returns the image"
Write-Host "  GET  /ping  -> health check"

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
        $client.ReceiveTimeout = 5000
        $stream = $client.GetStream()

        # Read request headers (up to the blank line). We don't need the body.
        $buf = New-Object byte[] 4096
        $headerText = ""
        while ($headerText -notmatch "`r`n`r`n") {
            $read = $stream.Read($buf, 0, $buf.Length)
            if ($read -le 0) { break }
            $headerText += $enc.GetString($buf, 0, $read)
            if ($headerText.Length -gt 65536) { break }
        }
        if ([string]::IsNullOrEmpty($headerText)) { continue }

        $lines = $headerText -split "`r`n"
        $reqParts = $lines[0] -split ' '
        $method  = $reqParts[0]
        $rawPath = if ($reqParts.Count -ge 2) { $reqParts[1] } else { '/' }

        $origin = ""
        $pna = $false
        for ($i = 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^(?i)Origin:\s*(.+)$') { $origin = $matches[1].Trim() }
            if ($lines[$i] -match '^(?i)Access-Control-Request-Private-Network:\s*true') { $pna = $true }
        }

        $path  = ($rawPath -split '\?', 2)[0]
        $query = if ($rawPath.Contains('?')) { ($rawPath -split '\?', 2)[1] } else { "" }

        $cors = @{
            'Access-Control-Allow-Origin'  = $(if ($origin) { $origin } else { '*' })
            'Vary'                          = 'Origin'
            'Access-Control-Allow-Methods'  = 'GET, POST, OPTIONS'
            'Access-Control-Allow-Headers'  = 'Content-Type, Authorization'
        }
        if ($pna) { $cors['Access-Control-Allow-Private-Network'] = 'true' }

        if ($method -eq 'OPTIONS') {
            Write-Response $stream 204 'No Content' $cors $null
        }
        elseif ($path -eq '/ping') {
            $h = $cors.Clone(); $h['Content-Type'] = 'application/json'
            Write-Response $stream 200 'OK' $h ($enc.GetBytes('{"ok":true,"service":"scan-bridge-ps","version":1}'))
        }
        elseif ($path -eq '/scan') {
            $scanDpi = $Dpi; $gray = $false; $mock = $MockDefault
            foreach ($kv in ($query -split '&')) {
                $pair = $kv -split '=', 2
                if ($pair[0] -eq 'dpi'  -and $pair.Count -eq 2) { [void][int]::TryParse($pair[1], [ref]$scanDpi) }
                if ($pair[0] -eq 'gray' -and $pair.Count -eq 2 -and $pair[1] -eq '1') { $gray = $true }
                if ($pair[0] -eq 'mock' -and $pair.Count -eq 2) { $mock = ($pair[1] -eq '1') }
            }
            Write-Host ("{0}  scan requested (dpi={1}{2}{3})..." -f (Get-Date -Format o), $scanDpi, $(if ($gray) { ', gray' } else { '' }), $(if ($mock) { ', MOCK' } else { '' }))
            try {
                $bytes = if ($mock) { New-MockScan $scanDpi } else { Invoke-Scan $scanDpi $gray }
                Write-Host ("  scanned {0} bytes" -f $bytes.Length)
                $h = $cors.Clone()
                $ct = $mime[$Format.ToLower()]; if (-not $ct) { $ct = 'application/octet-stream' }
                $h['Content-Type'] = $ct
                Write-Response $stream 200 'OK' $h $bytes
            } catch {
                $msg = ($_.Exception.Message -replace '\\', '\\' -replace '"', '\"')
                Write-Host "  scan failed: $msg"
                $h = $cors.Clone(); $h['Content-Type'] = 'application/json'
                Write-Response $stream 500 'Internal Server Error' $h ($enc.GetBytes("{`"error`":`"$msg`"}"))
            }
        }
        else {
            $h = $cors.Clone(); $h['Content-Type'] = 'application/json'
            Write-Response $stream 404 'Not Found' $h ($enc.GetBytes('{"error":"Not found"}'))
        }
    } catch {
        # Per-connection errors (timeouts, resets) are non-fatal.
    } finally {
        if ($client) { try { $client.Close() } catch { } }
    }
}
