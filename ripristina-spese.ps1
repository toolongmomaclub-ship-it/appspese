<#
  ripristina-spese.ps1
  ---------------------------------------------------------------------
  Ripristina i dati dell'app SPESE da un backup creato da
  aggiorna-spese.ps1.

  Il ripristino SOSTITUISCE il contenuto attuale del database con
  quello del backup: e' l'operazione corretta per tornare indietro se
  un aggiornamento ha rovinato qualcosa, ma va fatta con consapevolezza.

  Uso:
      .\ripristina-spese.ps1 -BackupDir "C:\Users\Lenovo_user\Desktop\backup-spese\spese-2026-09-29_10-30-00"
      .\ripristina-spese.ps1 -BackupDir "..." -Yes        (senza domanda di conferma)
      .\ripristina-spese.ps1 -Ultimo                      (usa il backup piu' recente)

  Se il backup contiene solo "volume-mongo-data.tgz" (nessun file
  mongo-*.archive.gz) lo script lo segnala e spiega come usarlo: il
  ripristino da volume richiede che il container MongoDB sia fermo.
#>
[CmdletBinding()]
param(
    [string]$BackupDir  = "",
    [string]$BackupRoot = "C:\Users\Lenovo_user\Desktop\backup-spese",
    [string]$ProjectDir = "",
    [string]$DbName     = "",
    [string]$BackendUrl = "http://localhost:8001/api/",
    [switch]$Ultimo,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Step  { param([string]$m) Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok    { param([string]$m) Write-Host "    [OK]   $m" -ForegroundColor Green }
function Note  { param([string]$m) Write-Host "    [..]   $m" -ForegroundColor DarkGray }
function Warn  { param([string]$m) Write-Host "    [WARN] $m" -ForegroundColor Yellow }
function Die   {
    param([string]$m)
    Write-Host ""
    Write-Host "!!! ERRORE: $m" -ForegroundColor Red
    exit 1
}

function Test-Dump {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $fi = Get-Item $Path
    if ($fi.Length -lt 64) { return $false }              # troppo piccolo per essere un dump
    Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $b = New-Object byte[] 2
        $n = $fs.Read($b, 0, 2)
        if ($n -ne 2 -or $b[0] -ne 0x1F -or $b[1] -ne 0x8B) { return $false }   # non e' gzip
        $fs.Position = 0
        $gz = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)
        try {
            $buf = New-Object byte[] 64
            $read = $gz.Read($buf, 0, $buf.Length)
            return ($read -gt 0)                          # il contenuto compresso deve avere dati veri
        } finally { $gz.Dispose() }
    } catch { return $false } finally { $fs.Close() }
}

# ---------------------------------------------------------------- progetto
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    if ($PSScriptRoot) { $ProjectDir = $PSScriptRoot } else { $ProjectDir = (Get-Location).Path }
}
if (-not (Test-Path (Join-Path $ProjectDir "docker-compose.yml"))) {
    Die "docker-compose.yml non trovato in '$ProjectDir'. Metti questo script nella cartella del progetto o usa -ProjectDir <cartella>."
}
Set-Location $ProjectDir

Write-Host ""
Write-Host "==========================================================" -ForegroundColor White
Write-Host "  SPESE - ripristino dei dati da un backup" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor White

# ---------------------------------------------------------------- backup
if ($Ultimo -and [string]::IsNullOrWhiteSpace($BackupDir)) {
    $cand = Get-ChildItem -Path $BackupRoot -Directory -Filter "spese-*" |
            Sort-Object Name -Descending | Select-Object -First 1
    if (-not $cand) { Die "nessun backup trovato in $BackupRoot" }
    $BackupDir = $cand.FullName
}
if ([string]::IsNullOrWhiteSpace($BackupDir)) { Die "indica la cartella del backup con -BackupDir (oppure usa -Ultimo)." }
if (-not (Test-Path $BackupDir)) { Die "la cartella '$BackupDir' non esiste." }
Note "Backup da ripristinare: $BackupDir"

$archive = Get-ChildItem -Path $BackupDir -Filter "mongo-*.archive.gz" -File -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1
$volumeTgz = Join-Path $BackupDir "volume-mongo-data.tgz"

if (-not $archive) {
    Warn "in questa cartella non c'e' nessun dump del database (mongo-*.archive.gz)"
    if (Test-Path $volumeTgz) {
        Write-Host ""
        Write-Host "  E' presente solo la copia del volume:" -ForegroundColor Yellow
        Write-Host "    $volumeTgz" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Ripristino manuale da volume (il database deve essere FERMO):" -ForegroundColor Yellow
        Write-Host "    1) docker compose stop backend frontend mongo" -ForegroundColor Yellow
        Write-Host "    2) docker volume ls   # trova il nome, es. spese-main_mongo-data" -ForegroundColor Yellow
        Write-Host "    3) docker run --rm -v NOMEVOLUME:/data -v `"$BackupDir`":/backup alpine sh -c `"rm -rf /data/* && tar xzf /backup/volume-mongo-data.tgz -C /data`"" -ForegroundColor Yellow
        Write-Host "    4) docker compose up -d" -ForegroundColor Yellow
    }
    Die "nulla da ripristinare in questa cartella."
}
if (-not (Test-Dump $archive.FullName)) { Die "il file di backup '$($archive.Name)' non e' valido: mi fermo." }
Ok "Dump trovato: $($archive.Name) ($([math]::Round($archive.Length/1KB,1)) KB)"

# ---------------------------------------------------------------- docker
Step "1/4 - Verifica di Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "il comando 'docker' non esiste. Avvia Docker Desktop e riprova." }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { Die "il motore Docker non risponde. Apri Docker Desktop e riprova." }
$script:ComposeExe  = "docker"
$script:ComposeArgs = @("compose")
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        $script:ComposeExe  = "docker-compose"
        $script:ComposeArgs = @()
    } else { Die "non trovo ne' 'docker compose' ne' 'docker-compose'." }
}
function Invoke-Compose {
    param([string[]]$CArgs)
    & $script:ComposeExe @($script:ComposeArgs + $CArgs)
    if ($LASTEXITCODE -ne 0) { Die "comando non riuscito: $($script:ComposeExe) $($CArgs -join ' ')" }
}
function Get-ComposeOutput {
    param([string[]]$CArgs)
    return (& $script:ComposeExe @($script:ComposeArgs + $CArgs) 2>$null)
}
Ok "Docker attivo"

# ---------------------------------------------------------------- db name
Step "2/4 - Avvio MongoDB e lettura del nome del database"
if ([string]::IsNullOrWhiteSpace($DbName)) {
    $probe = Get-ComposeOutput @("exec", "-T", "backend", "printenv", "DB_NAME") | Select-Object -First 1
    if ($probe) { $DbName = $probe.Trim() }
}
if ([string]::IsNullOrWhiteSpace($DbName)) { $DbName = "spese" }
Ok "Database: $DbName"

Invoke-Compose @("up", "-d", "mongo")
$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline) {
    $r = Get-ComposeOutput @("exec", "-T", "mongo", "mongosh", "--quiet", "--eval", 'db.runCommand({ ping: 1 }).ok')
    if (($r -join " ") -match "1") { $ready = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $ready) { Die "MongoDB non risponde: impossibile ripristinare ora." }
Ok "MongoDB raggiungibile"

$mongoId = (Get-ComposeOutput @("ps", "-q", "mongo") | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($mongoId)) { Die "container MongoDB non trovato." }
$mongoId = $mongoId.Trim()

# ---------------------------------------------------------------- conferma
if (-not $Yes) {
    Write-Host ""
    Write-Host "  ATTENZIONE: il contenuto attuale del database '$DbName' verra'" -ForegroundColor Red
    Write-Host "  SOSTITUITO con quello del backup:" -ForegroundColor Red
    Write-Host "    $($archive.Name)" -ForegroundColor Red
    $ans = Read-Host "  Scrivi SI per confermare"
    if ($ans -ne "SI") { Write-Host "  Annullato: nulla e' stato modificato." -ForegroundColor Yellow; exit 0 }
}

# ---------------------------------------------------------------- restore
Step "3/4 - Ripristino del backup"
$remote = "/tmp/restore-$([guid]::NewGuid().ToString('N').Substring(0,8)).archive.gz"
& docker cp $archive.FullName "${mongoId}:$remote"
if ($LASTEXITCODE -ne 0) { Die "copia del dump nel container non riuscita." }
Invoke-Compose @("exec", "-T", "mongo", "mongorestore", "--archive=$remote", "--gzip", "--drop")
Invoke-Compose @("exec", "-T", "mongo", "rm", "-f", $remote) | Out-Null
Ok "Dati ripristinati (modalita' --drop)"

$jsCount = "var d=db.getSiblingDB('$DbName');var o={};d.getCollectionNames().sort().forEach(function(c){o[c]=d.getCollection(c).countDocuments();});print(JSON.stringify(o));"
$now = (Get-ComposeOutput @("exec", "-T", "mongo", "mongosh", "--quiet", "--eval", $jsCount) |
        Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -Last 1)
if ($now) { Ok "Documenti ora presenti: $($now.Trim())" }

# ---------------------------------------------------------------- riavvio
Step "4/4 - Riavvio dell'app e verifica"
Invoke-Compose @("up", "-d")
Start-Sleep -Seconds 3
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri $BackendUrl -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { Ok "Backend risponde ($BackendUrl)"; break }
    } catch { }
    Start-Sleep -Seconds 2
}
Invoke-Compose @("ps")

Write-Host ""
Write-Host "==========================================================" -ForegroundColor White
Write-Host "  RIPRISTINO COMPLETATO" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor White
Write-Host ""
