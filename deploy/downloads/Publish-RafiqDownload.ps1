[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallerPath,
    [Parameter(Mandatory)][ValidatePattern('^\d{1,4}\.\d{1,4}\.\d{1,4}$')][string]$Version,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9._-]+@[a-zA-Z0-9.:_-]+$')][string]$Server,
    [switch]$Publish
)
$ErrorActionPreference = 'Stop'
$releaseFile = Get-Item -LiteralPath $InstallerPath
if ($releaseFile.PSIsContainer -or $releaseFile.Name -cne "Rafiq-Setup-$Version.exe") { throw 'Pass the reviewed user installer with its canonical versioned name.' }
$releaseHash = (Get-FileHash -LiteralPath $releaseFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($releaseHash -ne $ExpectedSha256.ToLowerInvariant()) { throw 'The installer differs from the reviewed SHA-256.' }
$releaseKey = Join-Path $env:USERPROFILE '.ssh\rafiq_netcup_ed25519'
$releaseHost = $Server
$releaseOptions = @('-i',$releaseKey,'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','BatchMode=yes','-o','ConnectTimeout=10')
$releaseIncoming = "/var/cache/rafiq-downloads/incoming/$Version-$($releaseHash.Substring(0,12))"
& ssh @releaseOptions $releaseHost "install -d -o root -g root -m 0700 $releaseIncoming"
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the private upload directory.' }
& scp @releaseOptions -- $releaseFile.FullName "${releaseHost}:$releaseIncoming/$($releaseFile.Name)"
if ($LASTEXITCODE -ne 0) { throw 'Installer upload failed; public metadata was not changed.' }
$releaseOperation = if ($Publish) { 'publish' } else { 'verify' }
& ssh @releaseOptions $releaseHost "rafiq-publish-download $releaseOperation --file $releaseIncoming/$($releaseFile.Name) --version $Version --sha256 $releaseHash"
if ($LASTEXITCODE -ne 0) { throw 'Server verification/publication failed; inspect the returned error.' }
if ($Publish) {
    $releaseMetadata = Invoke-RestMethod -Uri 'https://rafiq.ammarbalkhi.com/release.json' -Headers @{'Cache-Control'='no-cache'}
    if ($releaseMetadata.available -ne $true -or $releaseMetadata.version -ne $Version -or $releaseMetadata.sha256 -ne $releaseHash -or $releaseMetadata.sizeBytes -ne $releaseFile.Length) { throw 'Publication needs review: public metadata does not match the approved file.' }
    $releaseHead = Invoke-WebRequest -Method Head -Uri ('https://rafiq.ammarbalkhi.com' + $releaseMetadata.url)
    if ([long]($releaseHead.Headers['Content-Length'] | Select-Object -First 1) -ne $releaseFile.Length) { throw 'Publication needs review: public download size differs.' }
    Write-Output "Published and verified: https://rafiq.ammarbalkhi.com$($releaseMetadata.url)"
} else {
    Write-Output 'Privately uploaded and verified. Public downloads were not enabled.'
}
