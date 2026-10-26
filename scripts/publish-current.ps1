param([string]$ProductExe = '', [string]$Installer = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ProductExe) { $ProductExe = Join-Path $projectRoot 'src-tauri/target/release/floward.exe' }
if (-not $Installer) { $Installer = Join-Path $projectRoot 'src-tauri/target/release/bundle/nsis/floward_2.0.0_x64-setup.exe' }
foreach ($item in @($ProductExe, $Installer)) { if (-not (Test-Path -LiteralPath $item -PathType Leaf)) { throw "Missing built artifact: $item" } }
# One authority for every observed executable and shortcut. Never publish the
# fixed entry separately and then silently leave the user's other entry stale.
python (Join-Path $PSScriptRoot 'unify-entry.py') --apply --source $ProductExe
if ($LASTEXITCODE -ne 0) { throw 'Entry update failed. See release/entry-update-report.json; publication is not complete.' }
$currentDir = Join-Path $projectRoot 'release/current'
Copy-Item -LiteralPath (Join-Path $projectRoot 'src-tauri/icons/icon.ico') -Destination (Join-Path $currentDir 'naozha.ico') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $currentDir '使用说明.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $currentDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $currentDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'COPYRIGHT') -Destination $currentDir -Force
$hash = (Get-FileHash -LiteralPath (Join-Path $currentDir 'naozha.exe')).Hash
@{entry=(Join-Path $currentDir 'naozha.exe');sha256=$hash;published=(Get-Date).ToString('o');verification='release/entry-update-report.json'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $currentDir 'CURRENT.json') -Encoding utf8
$installerDir = Join-Path $projectRoot 'release/installers'
New-Item -ItemType Directory -Force -Path $installerDir | Out-Null
Copy-Item -LiteralPath $Installer -Destination $installerDir -Force
Write-Output 'All discovered Floward entries verified; installer copied. No application was launched.'
