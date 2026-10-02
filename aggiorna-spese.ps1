<#
  aggiorna-spese.ps1
  ---------------------------------------------------------------------
  Backup dei dati + aggiornamento dell'app SPESE.
#>
[CmdletBinding()]
param(
    [string]$ProjectDir = "",
    [string]$BackupRoot = "C:\Users\Lenovo_user\Desktop\backup-spese",
    [int]$KeepBackups = 30,
    [string]$BackendUrl = "http://localhost:8001/api/",
    [string]$FrontendUrl = "http://localhost:8080/",
    [switch]$SoloDump,
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Step {
    param([string]$m)
    Write-Host ""
    Write-Host "==> $m" -ForegroundColor Cyan
}

function Ok {
    param([string]$m)
    Write-Host "    [OK]   $m" -ForegroundColor Green
}

function Note {
    param([string]$m)
    Write-Host "    [..]   $m" -ForegroundColor DarkGray
}

function Warn {
    param([string]$m)
    Write-Host "    [WARN] $m" -ForegroundColor Yellow
}

function Die {
    param([string]$m)
    Write-Host ""
    Write-Host "!!! ERRORE: $m" -ForegroundColor Red
    Write-Host "!!! Lo script si ferma qui. L'app e i dati non sono stati modificati." -ForegroundColor Red
    try { Stop-Transcript | Out-Null } catch { }
    exit 1
}

function Test-Dump {
    param([string]$Path)

    if (-not (Test-Path -Path $Path)) { return $false }

    $fi = Get-Item -Path $Path
    if ($fi.Length -lt 64) { return $false }

    Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue
    $fs = [System.IO.File]::OpenRead($Path)

    try {
        $buffer = New-Object byte[] 2
        $read = $fs.Read($buffer, 0, 2)
        if ($read -ne 2 -or $buffer[0] -ne 0x1F -or $buffer[1] -ne 0x8B) { return $false }

        $fs.Position = 0
        $gz = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)

        try {
            $buf = New-Object byte[] 64
            $read = $gz.Read($buf, 0, $buf.Length)
            return ($read -gt 0)
        }
        finally {
            $gz.Dispose()
        }
    }
    catch {
        return $false
    }
    finally {
        $fs.Close()
    }
}

# ---------------------------------------------------------------- 0. progetto
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    if ($PSScriptRoot) {
        $ProjectDir = $PSScriptRoot
    }
    else {
        $ProjectDir = (Get-Location).Path
    }
}

if (-not (Test-Path (Join-Path $ProjectDir "docker-compose.yml"))) {
    Die "docker-compose.yml non trovato in '$ProjectDir'."
}

Set-Location $ProjectDir

Write-Host ""
Write-Host "==========================================================" -ForegroundColor White
Write-Host "  SPESE - backup dei dati + aggiornamento dell'app" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor White
Note "Progetto : $ProjectDir"
Note "Backup in: $BackupRoot"

# ---------------------------------------------------------------- 1. docker
Step "1/7 - Verifica di Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die "il comando 'docker' non esiste. Installa e avvia Docker Desktop, poi riprova."
}

$oldPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$dockerInfo = & docker info 2>&1
$dockerSuccess = $LASTEXITCODE
$ErrorActionPreference = $oldPreference

if ($dockerSuccess -ne 0) {
    Die "il motore Docker non risponde. Apri Docker Desktop, attendi che sia 'Engine running' e riprova."
}
Ok "Docker attivo"

$script:ComposeExe = "docker"
$script:ComposeArgs = @("compose")
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        $script:ComposeExe = "docker-compose"
        $script:ComposeArgs = @()
        Note "uso la versione 'docker-compose'"
    }
    else {
        Die "non trovo ne' 'docker compose' ne' 'docker-compose'."
    }
}

function Invoke-Compose {
    param([string[]]$CArgs)

    & $script:ComposeExe @($script:ComposeArgs + $CArgs)
    if ($LASTEXITCODE -ne 0) {
        Die "comando non riuscito: $($script:ComposeExe) $($script:ComposeArgs -join ' ') $($CArgs -join ' ')"
    }
}

function Get-ComposeOutput {
    param([string[]]$CArgs)

    return (& $script:ComposeExe @($script:ComposeArgs + $CArgs) 2>$null)
}

function Wait-Mongo {
    param([int]$Seconds = 90)

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $r = Get-ComposeOutput @("exec", "-T", "mongo", "mongosh", "--quiet", "--eval", 'db.runCommand({ ping: 1 }).ok')
        if (($r -join " ") -match "1") { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Wait-Http {
    param(
        [string]$Url,
        [string]$Label,
        [int]$Seconds = 60
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
                Ok "$Label risponde ($Url)"
                return $true
            }
        }
        catch { }

        Start-Sleep -Seconds 2
    }

    Warn "$Label non risponde su $Url dopo $Seconds secondi"
    return $false
}

function Read-Counts {
    param([string]$Path)

    if (-not (Test-Path -Path $Path)) { return $null }

    $txt = Get-Content -Path $Path -Raw
    if ([string]::IsNullOrWhiteSpace($txt)) { return $null }

    $line = ($txt -split "`r?`n" | Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -Last 1)
    if (-not $line) { return $null }

    try {
        return ($line | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

# ------------------------------------------------------- 2. cartella di backup
Step "2/7 - Preparo la cartella di backup"
if (-not (Test-Path $BackupRoot)) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = Join-Path $BackupRoot ("spese-" + $stamp)
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Ok "Cartella creata: $backupDir"

try {
    Start-Transcript -Path (Join-Path $backupDir "log.txt") -Force | Out-Null
}
catch { }

# --------------------------------------------------------- 3. nome del database
$dbName = ""
$probe = Get-ComposeOutput @("exec", "-T", "backend", "printenv", "DB_NAME") | Select-Object -First 1
if ($probe) { $dbName = $probe.Trim() }

if ([string]::IsNullOrWhiteSpace($dbName)) {
    $envFile = Join-Path $ProjectDir "backend\.env"
    if (Test-Path $envFile) {
        $m = Select-String -Path $envFile -Pattern '^\s*DB_NAME\s*=\s*(.+?)\s*$' | Select-Object -First 1
        if ($m) { $dbName = $m.Matches[0].Groups[1].Value.Trim() }
    }
}

if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "spese" }
Ok "Database MongoDB: $dbName"

Step "3/7 - Registro lo stato attuale (utile per il rollback)"

$mongoId = Get-ComposeOutput @("ps", "-q", "mongo") | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($mongoId)) {
    Warn "il container MongoDB non e' attivo: lo avvio adesso"
    Invoke-Compose @("up", "-d", "mongo")
    Start-Sleep -Seconds 3
    $mongoId = Get-ComposeOutput @("ps", "-q", "mongo") | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($mongoId)) { Die "non riesco ad avviare il container MongoDB." }
$mongoId = $mongoId.Trim()

if (-not (Wait-Mongo -Seconds 90)) { Die "MongoDB non risponde: non posso fare il backup, mi fermo prima di toccare l'app." }
Ok "MongoDB raggiungibile"

Invoke-Compose @("config") | Out-File -FilePath (Join-Path $backupDir "docker-compose-usato.yml") -Encoding UTF8
Invoke-Compose @("images") | Out-File -FilePath (Join-Path $backupDir "immagini-prima.txt") -Encoding UTF8
Copy-Item (Join-Path $ProjectDir "backend\.env") (Join-Path $backupDir "backend.env") -ErrorAction SilentlyContinue

if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $ProjectDir ".git"))) {
    (& git -C $ProjectDir rev-parse HEAD 2>$null) | Out-File -FilePath (Join-Path $backupDir "commit-git.txt") -Encoding UTF8
}

$jsCount = "var d=db.getSiblingDB('$dbName');var o={};d.getCollectionNames().sort().forEach(function(c){o[c]=d.getCollection(c).countDocuments();});print(JSON.stringify(o));"
$countsBeforeFile = Join-Path $backupDir "conteggi-prima.json"
$lines = Get-ComposeOutput @("exec", "-T", "mongo", "mongosh", "--quiet", "--eval", $jsCount)
$json = ($lines | Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -Last 1)
if ($json) {
    $json | Out-File -FilePath $countsBeforeFile -Encoding UTF8
    Ok "Conteggi attuali salvati: $($json.Trim())"
}
else {
    Warn "non sono riuscito a leggere il numero di documenti (proseguo comunque)"
}

# ---------------------------------------------------------------- 4. mongodump
Step "4/7 - Backup del database (mongodump)"
$remoteArchive = "/tmp/spese-backup-$stamp.archive.gz"
$localArchive = Join-Path $backupDir "mongo-$dbName-$stamp.archive.gz"

Invoke-Compose @("exec", "-T", "mongo", "mongodump", "--db", $dbName, "--archive=$remoteArchive", "--gzip")
& docker cp "${mongoId}:$remoteArchive" $localArchive
if ($LASTEXITCODE -ne 0) { Die "non sono riuscito a copiare il dump sul PC: il backup non e' valido." }
Invoke-Compose @("exec", "-T", "mongo", "rm", "-f", $remoteArchive) | Out-Null

if (-not (Test-Dump $localArchive)) {
    Die "il file di backup non e' valido (mancante, troppo piccolo o non compresso). Interrompo PRIMA di aggiornare l'app."
}
$kbDump = [math]::Round((Get-Item $localArchive).Length / 1KB, 1)
Ok "Dump salvato: $localArchive ($kbDump KB)"

# ------------------------------------------------------- 5. volume del database
if (-not $SoloDump) {
    Step "5/7 - Copia di sicurezza del volume Docker del database"
    $vol = ""
    $volCandidates = (& docker volume ls --filter "label=com.docker.compose.volume=mongo-data" --format "{{.Name}}" 2>$null)
    if ($volCandidates) { $vol = ($volCandidates | Select-Object -First 1) }

    if ([string]::IsNullOrWhiteSpace($vol)) {
        $proj = ((Split-Path $ProjectDir -Leaf).ToLower() -replace '[^a-z0-9_-]', '')
        $vol = "${proj}_mongo-data"
    }
    $vol = $vol.Trim()

    & docker volume inspect $vol *> $null
    $volEsiste = ($LASTEXITCODE -eq 0)

    if (-not $volEsiste) {
        Warn "volume Docker '$vol' non trovato: salto la copia del volume (il dump del database resta valido)"
    }
    else {
        $dest = $backupDir -replace '\\', '/'
        & docker run --rm -v "${vol}:/data" -v "${dest}:/backup" alpine sh -c "tar czf /backup/volume-mongo-data.tgz -C /data ."
        $esitoTar = $LASTEXITCODE
        $tgz = Join-Path $backupDir "volume-mongo-data.tgz"
        if ($esitoTar -ne 0 -or -not (Test-Path $tgz)) {
            Warn "copia del volume non riuscita (il dump del database resta comunque valido)"
        }
        else {
            $mbTgz = [math]::Round((Get-Item $tgz).Length / 1MB, 1)
            Ok "Volume salvato: volume-mongo-data.tgz ($mbTgz MB)"
        }
    }
}
else {
    Note "copia del volume saltata (-SoloDump)"
}

# ------------------------------------------------------- 6. build e riavvio
Step "6/7 - Ricostruzione e riavvio dell'app"
if (-not $NoBuild) {
    Invoke-Compose @("build", "backend", "frontend")
    Ok "Immagini backend e frontend ricostruite"
}
else {
    Note "ricostruzione saltata (-NoBuild)"
}
Invoke-Compose @("up", "-d")
Ok "Container riavviati con il nuovo codice"

# ---------------------------------------------------------------- 7. verifiche
Step "7/7 - Verifiche finali"
Start-Sleep -Seconds 3
$okBackend = Wait-Http -Url $BackendUrl -Label "Backend"
$okFrontend = Wait-Http -Url $FrontendUrl -Label "Frontend"

$countsAfterFile = Join-Path $backupDir "conteggi-dopo.json"
$lines2 = Get-ComposeOutput @("exec", "-T", "mongo", "mongosh", "--quiet", "--eval", $jsCount)
$json2 = ($lines2 | Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -Last 1)
if ($json2) { $json2 | Out-File -FilePath $countsAfterFile -Encoding UTF8 }

$before = Read-Counts $countsBeforeFile
$after = Read-Counts $countsAfterFile
if ($before -and $after) {
    $diff = @()
    foreach ($p in $before.PSObject.Properties) {
        $b = [int]$p.Value
        $a = -1
        if ($after.PSObject.Properties.Name -contains $p.Name) { $a = [int]$after.$($p.Name) }
        if ($a -lt $b) { $diff += "$($p.Name): $b -> $a" }
    }

    if ($diff.Count -eq 0) {
        Ok "Nessun documento perso (conteggi invariati o aumentati)"
    }
    else {
        Warn "alcuni conteggi sono diminuiti:"
        foreach ($d in $diff) { Warn "  $d" }
    }
}
else {
    Warn "confronto dei conteggi non disponibile"
}

Invoke-Compose @("ps")

# ---------------------------------------------------------------- riepilogo
Write-Host ""
Write-Host "==========================================================" -ForegroundColor White
Write-Host "  COMPLETATO" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor White
Note "Backup completo in: $backupDir"
Get-ChildItem $backupDir | ForEach-Object { Write-Host "          $($_.Name)" -ForegroundColor Gray }
Write-Host ""

if ($KeepBackups -gt 0) {
    $old = Get-ChildItem -Path $BackupRoot -Directory -Filter "spese-*" |
        Sort-Object Name -Descending | Select-Object -Skip $KeepBackups

    foreach ($d in $old) {
        Remove-Item -Path $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Note "backup vecchio rimosso: $($d.Name)"
    }
}

if (-not ($okBackend -and $okFrontend)) {
    Warn "qualche servizio non risponde: controlla con 'docker compose ps' e 'docker compose logs'"
}

try { Stop-Transcript | Out-Null } catch { }
exit 0
