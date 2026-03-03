# RefDrop Windows Installer
# Registers the NativeMessaging host so Chrome can communicate with the helper app.
# Run as Administrator (or the registry key will go to HKCU which is fine for single-user).

param(
    [string]$ExtensionId = "obimncghooebncelfoommfdlamciclam"
)

$ErrorActionPreference = "Stop"

$InstallDir  = "$env:LOCALAPPDATA\RefDrop"
$ExePath     = "$InstallDir\refdrop_helper.exe"
$ManifestPath = "$InstallDir\refdrop.json"
$RegKey      = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.refdrop.helper"

Write-Host "RefDrop Installer" -ForegroundColor Cyan
Write-Host "Installing to: $InstallDir"

# 1. Create install directory
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# 2. Copy executable
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceExe = Join-Path $ScriptDir "refdrop_helper.exe"
if (-Not (Test-Path $SourceExe)) {
    Write-Error "refdrop_helper.exe not found next to install.ps1"
    exit 1
}
Copy-Item $SourceExe $ExePath -Force
Write-Host "  Copied helper to $ExePath"

# 3. Write NativeMessaging manifest
$manifest = @{
    name            = "com.refdrop.helper"
    description     = "RefDrop Helper - bridges Chrome to PureRef"
    path            = $ExePath
    type            = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 5

$manifest | Set-Content -Encoding UTF8 -Path $ManifestPath
Write-Host "  Wrote manifest to $ManifestPath"

# 4. Register in Chrome NativeMessaging registry
New-Item -Path $RegKey -Force | Out-Null
Set-ItemProperty -Path $RegKey -Name "(Default)" -Value $ManifestPath
Write-Host "  Registered in Chrome registry"

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "Restart Chrome if it was already open."
