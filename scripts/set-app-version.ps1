<#
.SYNOPSIS
    Stamps an application version into every manifest that carries it.

.DESCRIPTION
    Writes the supplied SemVer version into the Tauri config, the Cargo manifest and the Cargo
    lockfile, then reads each one back and fails if the version did not land. Used by the release
    pipeline so a compiled executable reports the same version as the tag semantic-release cuts.

.PARAMETER Version
    SemVer version to stamp, for example 1.2.3 or 1.2.3-beta.1.

.EXAMPLE
    ./scripts/set-app-version.ps1 -Version 1.2.3
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Mirrors the check NuGet and Tauri apply, so a bad version fails before anything is compiled.
$semVerPattern = '^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?(\+[0-9A-Za-z][0-9A-Za-z.-]*)?$'
if ($Version -notmatch $semVerPattern) {
    throw "Invalid version '$Version'. Expected a SemVer version such as 1.2.3."
}

function Read-Manifest {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Manifest not found: $Path"
    }

    return [System.IO.File]::ReadAllText($Path)
}

function Save-Manifest {
    param([string]$Path, [string]$Content)

    # Written byte-for-byte so the repository's existing line endings survive.
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Set-JsonVersion {
    param([string]$Path)

    $text = Read-Manifest $Path
    $match = [regex]::Match($text, '(?m)^(\s*"version"\s*:\s*")[^"]*(")')
    if (-not $match.Success) {
        throw "No version field found in $Path."
    }

    $replacement = $match.Groups[1].Value + $Version + $match.Groups[2].Value
    $updated = $text.Substring(0, $match.Index) + $replacement + $text.Substring($match.Index + $match.Length)
    Save-Manifest $Path $updated
}

function Set-CargoTomlVersion {
    param([string]$Path)

    $text = Read-Manifest $Path
    $packageHeader = [regex]::Match($text, '(?m)^\[package\]\s*$')
    if (-not $packageHeader.Success) {
        throw "No [package] section found in $Path."
    }

    # Only look inside [package]; dependency tables carry their own version keys.
    $offset = $packageHeader.Index + $packageHeader.Length
    $match = [regex]::Match($text.Substring($offset), '(?m)^(\s*version\s*=\s*")[^"]*(")')
    if (-not $match.Success) {
        throw "No version field found in the [package] section of $Path."
    }

    $index = $offset + $match.Index
    $replacement = $match.Groups[1].Value + $Version + $match.Groups[2].Value
    $updated = $text.Substring(0, $index) + $replacement + $text.Substring($index + $match.Length)
    Save-Manifest $Path $updated
}

function Set-CargoLockVersion {
    param([string]$Path, [string]$CrateName)

    $text = Read-Manifest $Path
    $pattern = '(?m)^(name = "' + [regex]::Escape($CrateName) + '"\r?\nversion = ")[^"]*(")'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) {
        throw "No $CrateName entry found in $Path."
    }

    $replacement = $match.Groups[1].Value + $Version + $match.Groups[2].Value
    $updated = $text.Substring(0, $match.Index) + $replacement + $text.Substring($match.Index + $match.Length)
    Save-Manifest $Path $updated
}

$tauriConfigPath = Join-Path $repoRoot 'src-tauri/tauri.conf.json'
$cargoTomlPath = Join-Path $repoRoot 'src-tauri/Cargo.toml'
$cargoLockPath = Join-Path $repoRoot 'src-tauri/Cargo.lock'

Set-JsonVersion $tauriConfigPath
Set-CargoTomlVersion $cargoTomlPath
Set-CargoLockVersion $cargoLockPath 'courier'

if ((Get-Content -Raw $tauriConfigPath | ConvertFrom-Json).version -ne $Version) {
    throw "$tauriConfigPath does not report version $Version after stamping."
}

$cargoManifest = Get-Content -Raw $cargoTomlPath
if ($cargoManifest -notmatch ('(?m)^version\s*=\s*"' + [regex]::Escape($Version) + '"')) {
    throw "$cargoTomlPath does not report version $Version after stamping."
}

$cargoLock = Get-Content -Raw $cargoLockPath
if ($cargoLock -notmatch ('(?m)^name = "courier"\r?\nversion = "' + [regex]::Escape($Version) + '"')) {
    throw "$cargoLockPath does not report version $Version after stamping."
}

Write-Host "Stamped Courier $Version into tauri.conf.json, Cargo.toml and Cargo.lock"
