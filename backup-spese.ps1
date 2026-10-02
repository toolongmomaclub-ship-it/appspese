[CmdletBinding()]
param(
    [string]$ProjectDir = "",
    [string]$BackupRoot = "C:\Users\Lenovo_user\Desktop\backup-spese",
    [string]$DbName = "spese",
    [switch]$SkipMongo
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    $ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
}

$ProjectDir = (Resolve-Path $ProjectDir).Path
if (-not (Test-Path (Join-Path $ProjectDir "docker-compose.yml"))) {
    throw "docker-compose.yml non trovato in '$ProjectDir'."
}

$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$archivePath = Join-Path $BackupRoot "spese-full-$stamp.zip"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("spese-backup-" + [guid]::NewGuid().ToString('N'))
$projectCopy = Join-Path $tempRoot "project"
$mongoDumpPath = Join-Path $tempRoot "mongo-$DbName.archive.gz"

try {
    New-Item -ItemType Directory -Path $projectCopy -Force | Out-Null

    Write-Host "" 
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  Backup completo SPESE" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Progetto: $ProjectDir"
    Write-Host "Archivio: $archivePath"

    foreach ($item in Get-ChildItem -Path $ProjectDir -Force) {
        $dest = Join-Path $projectCopy $item.Name
        if ($item.PSIsContainer) {
            Copy-Item -Path $item.FullName -Destination $dest -Recurse -Force
        }
        else {
            Copy-Item -Path $item.FullName -Destination $dest -Force
        }
    }

    if (-not $SkipMongo) {
        if (-not (Test-Command "docker")) {
            throw "Docker non trovato nel PATH. Avvia Docker Desktop e riprova."
        }

        & docker info *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Docker non risponde: avvia Docker Desktop e riprova."
        }

        $composeExe = "docker"
        $composeArgs = @("compose")

        & docker compose version *> $null
        if ($LASTEXITCODE -ne 0) {
            if (Test-Command "docker-compose") {
                & docker-compose version *> $null
                if ($LASTEXITCODE -eq 0) {
                    $composeExe = "docker-compose"
                    $composeArgs = @()
                }
                else {
                    throw "Non trovo 'docker compose' nè 'docker-compose'."
                }
            }
            else {
                throw "Non trovo 'docker compose' nè 'docker-compose'."
            }
        }

        function Invoke-Compose {
            param([string[]]$Args)
            if ($composeExe -eq "docker") {
                & docker compose @Args
            }
            else {
                & docker-compose @Args
            }

            if ($LASTEXITCODE -ne 0) {
                throw "Comando Docker Compose fallito: $composeExe $($Args -join ' ')"
            }
        }

        Write-Host "[1/3] Avvio MongoDB se necessario..."
        Invoke-Compose @("up", "-d", "mongo")

        Write-Host "[2/3] Dump del database '$DbName'..."
        $dumpTemp = "/tmp/${DbName}-backup-archive.gz"
        if ($composeExe -eq "docker") {
            & docker compose exec -T mongo sh -lc "mongodump --db \"$DbName\" --gzip --archive=\"$dumpTemp\""
        }
        else {
            & docker-compose exec -T mongo sh -lc "mongodump --db \"$DbName\" --gzip --archive=\"$dumpTemp\""
        }

        if ($LASTEXITCODE -ne 0) {
            throw "mongodump non riuscito per il database '$DbName'."
        }

        & docker cp "spese-mongo:$dumpTemp" $mongoDumpPath
        if ($LASTEXITCODE -ne 0) {
            throw "Non riesco a copiare il dump Mongo fuori dal container."
        }

        Write-Host "[3/3] Creazione archivio zip finale..."
    }
    else {
        Write-Host "[1/2] Salto del dump Mongo (-SkipMongo)."
        Write-Host "[2/2] Creazione archivio zip finale..."
    }

    $itemsToArchive = @($projectCopy)
    if (-not $SkipMongo -and (Test-Path $mongoDumpPath)) {
        $itemsToArchive += $mongoDumpPath
    }

    Compress-Archive -Path $itemsToArchive -DestinationPath $archivePath -Force

    Write-Host "" 
    Write-Host "Backup completato: $archivePath" -ForegroundColor Green
    Write-Host "File creato: $([System.IO.Path]::GetFileName($archivePath))" -ForegroundColor Green
    Write-Host "" 
}
finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
    }
}
