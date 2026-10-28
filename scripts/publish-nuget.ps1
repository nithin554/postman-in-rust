<#
.SYNOPSIS
    Packs the Courier executable as a NuGet package and optionally publishes it.

.DESCRIPTION
    Builds Courier.<version>.nupkg from a standalone executable and, when -Source is supplied,
    pushes it to a NuGet feed such as GitHub Packages. The NuGet CLI is downloaded automatically
    (and cached under artifacts/tools) when it is not already on PATH.

.PARAMETER ExePath
    Path to the compiled executable to package. Relative paths resolve from the repository root.

.PARAMETER Version
    NuGet package version, for example 1.2.3.

.PARAMETER OutputDirectory
    Directory that receives the .nupkg. Defaults to artifacts/nuget.

.PARAMETER NuspecPath
    Nuspec describing the package. Defaults to nuget/courier.nuspec.

.PARAMETER NuGetExePath
    Path to an existing nuget.exe. When omitted, PATH is checked and the pinned CLI is downloaded.

.PARAMETER Source
    NuGet feed URL. The package is only published when this is supplied.

.PARAMETER ApiKey
    API key used for publishing. Defaults to GITHUB_TOKEN.

.PARAMETER UserName
    User name used for feed authentication. Defaults to GITHUB_ACTOR.

.PARAMETER SkipDuplicate
    Treat pushing an already published version as a success.

.EXAMPLE
    ./scripts/publish-nuget.ps1 -ExePath src-tauri/target/release/courier.exe -Version 0.1.0

.EXAMPLE
    $env:GITHUB_TOKEN = 'ghp_...'
    ./scripts/publish-nuget.ps1 -ExePath src-tauri/target/release/courier.exe -Version 0.1.0 `
        -Source https://nuget.pkg.github.com/nithin554/index.json
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$OutputDirectory = 'artifacts/nuget',

    [string]$NuspecPath = 'nuget/courier.nuspec',

    [string]$NuGetExePath,

    [string]$Source,

    [string]$ApiKey = $env:GITHUB_TOKEN,

    [string]$UserName = $env:GITHUB_ACTOR,

    [switch]$SkipDuplicate
)

$ErrorActionPreference = 'Stop'
$nuGetVersion = '6.11.1'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-RepoPath {
    param([string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return Join-Path $repoRoot $Path
}

function Resolve-NuGetExe {
    if ($NuGetExePath) {
        $resolved = Resolve-RepoPath $NuGetExePath
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            throw "nuget.exe not found at $resolved."
        }

        return $resolved
    }

    foreach ($candidate in @('nuget.exe', 'nuget')) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    $cached = Resolve-RepoPath 'artifacts/tools/nuget.exe'
    if (-not (Test-Path -LiteralPath $cached -PathType Leaf)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cached) | Out-Null
        Write-Host "Downloading NuGet CLI $nuGetVersion to $cached"
        Invoke-WebRequest -Uri "https://dist.nuget.org/win-x86-commandline/v$nuGetVersion/nuget.exe" `
            -OutFile $cached -UseBasicParsing
    }

    return $cached
}

$exeFullPath = Resolve-RepoPath $ExePath
if (-not (Test-Path -LiteralPath $exeFullPath -PathType Leaf)) {
    throw "Executable not found: $exeFullPath"
}

# GitHub Packages and nuget.org both reject anything that is not SemVer 2.0.
$semVerPattern = '^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?(\+[0-9A-Za-z][0-9A-Za-z.-]*)?$'
if ($Version -notmatch $semVerPattern) {
    throw "Invalid NuGet version '$Version'. Expected a SemVer version such as 1.2.3."
}

$nuspecFullPath = Resolve-RepoPath $NuspecPath
if (-not (Test-Path -LiteralPath $nuspecFullPath -PathType Leaf)) {
    throw "Nuspec not found: $nuspecFullPath"
}

if ($Source -and -not $ApiKey) {
    throw 'A NuGet API key is required to publish. Pass -ApiKey or set GITHUB_TOKEN.'
}

$outputFullPath = Resolve-RepoPath $OutputDirectory
New-Item -ItemType Directory -Force -Path $outputFullPath | Out-Null

$nugetExe = Resolve-NuGetExe

# nuget.exe resolves <files> entries against -BasePath, so stage the payload in the layout the
# nuspec expects instead of referencing build output paths directly.
$stagePath = Join-Path $outputFullPath 'stage'
if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
}

$toolTarget = 'windows-x64'
$toolDir = Join-Path $stagePath (Join-Path 'tools' $toolTarget)
New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
Copy-Item -LiteralPath $exeFullPath -Destination (Join-Path $toolDir 'courier.exe') -Force
foreach ($doc in @('LICENSE', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $doc) -Destination $stagePath -Force
}

Write-Host "Packing Courier $Version"
& $nugetExe pack $nuspecFullPath -BasePath $stagePath -Version $Version `
    -OutputDirectory $outputFullPath -NonInteractive
if ($LASTEXITCODE -ne 0) {
    throw "nuget pack failed with exit code $LASTEXITCODE."
}

$packagePath = Join-Path $outputFullPath "Courier.$Version.nupkg"
if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
    throw "Expected package was not created: $packagePath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName -replace '\\', '/' })
}
finally {
    $archive.Dispose()
}

$expectedExeEntry = "tools/$toolTarget/courier.exe"
if ($entries -notcontains $expectedExeEntry) {
    throw "Package $packagePath is missing $expectedExeEntry. Contents: $($entries -join ', ')"
}

Remove-Item -LiteralPath $stagePath -Recurse -Force
Write-Host "Created $packagePath"

if (-not $Source) {
    return
}

if (-not $UserName) {
    $UserName = 'github-actions'
}

# The feed credentials live in a throwaway config so the token is never written to the repository.
$configPath = Join-Path $outputFullPath 'nuget.publish.config'
$escapedSource = [System.Security.SecurityElement]::Escape($Source)
$escapedUser = [System.Security.SecurityElement]::Escape($UserName)
$escapedKey = [System.Security.SecurityElement]::Escape($ApiKey)
$config = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="publish" value="$escapedSource" />
  </packageSources>
  <packageSourceCredentials>
    <publish>
      <add key="Username" value="$escapedUser" />
      <add key="ClearTextPassword" value="$escapedKey" />
    </publish>
  </packageSourceCredentials>
</configuration>
"@
[System.IO.File]::WriteAllText($configPath, $config, (New-Object System.Text.UTF8Encoding($false)))

try {
    Write-Host "Publishing Courier $Version to $Source"
    $pushArguments = @(
        'push', $packagePath,
        '-Source', 'publish',
        '-ConfigFile', $configPath,
        '-ApiKey', $ApiKey,
        '-NonInteractive'
    )
    if ($SkipDuplicate) {
        $pushArguments += '-SkipDuplicate'
    }

    & $nugetExe @pushArguments
    if ($LASTEXITCODE -ne 0) {
        throw "nuget push failed with exit code $LASTEXITCODE."
    }
}
finally {
    Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Published Courier $Version"
