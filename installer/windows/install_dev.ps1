# RefDrop — Dev Setup (Python, no build required)
# Run once after loading the extension as unpacked.
# Usage: .\install_dev.ps1 -ExtensionId "abcdefghijklmnopabcdefghijklmnop"

param(
    [Parameter(Mandatory=$true)]
    [string]$ExtensionId
)

$HelperBat  = (Resolve-Path "$PSScriptRoot\..\..\helper\refdrop_helper.bat").Path
$RegKey     = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.refdrop.helper"
$ManifestPath = "$env:LOCALAPPDATA\RefDrop\refdrop_dev.json"

New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\RefDrop" | Out-Null

$manifest = @{
    name            = "com.refdrop.helper"
    description     = "RefDrop Helper (dev)"
    path            = $HelperBat
    type            = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 5

$manifest | Set-Content -Encoding UTF8 -Path $ManifestPath

New-Item -Path $RegKey -Force | Out-Null
Set-ItemProperty -Path $RegKey -Name "(Default)" -Value $ManifestPath

Write-Host "Done. Restart Chrome." -ForegroundColor Green
Write-Host "Helper: $HelperBat"
Write-Host "Manifest: $ManifestPath"
