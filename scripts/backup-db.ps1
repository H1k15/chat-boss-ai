# Backup DB Chat Boss AI - 3-tier rotation (daily/weekly/monthly) from ONE run/day.
#
# Each run creates a dump in the daily folder. If today is Monday -> copy the
# newest dump to weekly. If today is day 1 -> copy to monthly. Then prune old
# files per tier. Uses pg_dump INSIDE the Docker container, gzips, writes to a
# Windows folder. Needs only Docker Desktop + the postgres container running.
#
# Manual run:  powershell -File scripts\backup-db.ps1
# Automated:   register a Task Scheduler task (see scripts\register-backup-task.ps1)
#
# ASCII-only on purpose: PowerShell 5.1 reads BOM-less .ps1 as ANSI, so Vietnamese
# accents would corrupt the parser. Log/console messages are English.

param(
  [string]$Container = "hthngaihtrtvn-postgres-1",
  [string]$Db = "chat_boss_ai",
  [string]$User = "cba",
  [string]$Password = "cba",                       # dev password (already in docker-compose)
  [string]$Root = "$env:USERPROFILE\chatboss-backups",
  [int]$KeepDaily = 14,                            # keep 14 daily
  [int]$KeepWeekly = 8,                            # keep 8 weekly (~2 months)
  [int]$KeepMonthly = 12,                          # keep 12 monthly (~1 year)
  [System.DayOfWeek]$WeeklyOn = [System.DayOfWeek]::Monday
)

$ErrorActionPreference = 'Stop'

# --- Prepare folders + log ----------------------------------------------------
foreach ($d in @('daily', 'weekly', 'monthly')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Root $d) | Out-Null
}
$logFile = Join-Path $Root 'backup.log'
function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line -Encoding utf8
  Write-Output $line
}

function Prune($dir, $keep) {
  $old = Get-ChildItem $dir -Filter '*.sql.gz' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep
  foreach ($f in $old) { Remove-Item $f.FullName -Force; Log "  pruned $($f.Name)" }
}

# --- Check Docker + container -------------------------------------------------
try {
  $running = (docker inspect -f '{{.State.Running}}' $Container 2>$null)
} catch {
  Log "ERROR: cannot call docker. Is Docker Desktop running?"
  exit 1
}
if ($running -ne 'true') {
  Log "ERROR: container '$Container' is not running (state=$running)."
  exit 1
}

# --- Dump -> gzip -------------------------------------------------------------
$stamp   = Get-Date -Format 'yyyyMMdd-HHmm'
$daily   = Join-Path $Root 'daily'
$outFile = Join-Path $daily "chatboss-$stamp.sql.gz"

# pg_dump | gzip runs INSIDE the container; cmd /c handles the '>' redirect (byte-safe).
$inner = "pg_dump -U $User -d $Db | gzip -9"
$cmd   = "docker exec -e PGPASSWORD=$Password $Container sh -c ""$inner"" > ""$outFile"""
cmd /c $cmd

# --- Validate the dump (avoid pruning when dump failed) -----------------------
$size = if (Test-Path $outFile) { (Get-Item $outFile).Length } else { 0 }
if ($size -lt 1000) {
  Log "ERROR: dump too small ($size bytes) -> treat as failed, delete and DO NOT prune."
  if (Test-Path $outFile) { Remove-Item $outFile -Force }
  exit 1
}
$kb = [math]::Round($size / 1KB, 1)
Log "OK daily: $([System.IO.Path]::GetFileName($outFile)) ($kb KB)"

# --- Promote to weekly / monthly ----------------------------------------------
$today = Get-Date
if ($today.DayOfWeek -eq $WeeklyOn) {
  $dst = Join-Path $Root "weekly\chatboss-$stamp.sql.gz"
  Copy-Item $outFile $dst -Force
  Log "OK weekly: $([System.IO.Path]::GetFileName($dst))"
}
if ($today.Day -eq 1) {
  $dst = Join-Path $Root "monthly\chatboss-$stamp.sql.gz"
  Copy-Item $outFile $dst -Force
  Log "OK monthly: $([System.IO.Path]::GetFileName($dst))"
}

# --- Prune old files ----------------------------------------------------------
Prune $daily $KeepDaily
Prune (Join-Path $Root 'weekly') $KeepWeekly
Prune (Join-Path $Root 'monthly') $KeepMonthly

Log "Done. Backup folder: $Root"
