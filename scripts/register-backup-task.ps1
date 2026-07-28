# Register a daily Windows Task Scheduler job that runs backup-db.ps1.
# The single daily run also produces weekly (Mondays) and monthly (day 1) copies
# via rotation inside backup-db.ps1.
#
# Run once:  powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
# Remove:    Unregister-ScheduledTask -TaskName 'ChatBossAI-DB-Backup' -Confirm:$false

param(
  [string]$TaskName = "ChatBossAI-DB-Backup",
  [string]$At = "12:30"                            # daily run time (24h). PC must be on.
)

$ErrorActionPreference = 'Stop'
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here 'backup-db.ps1'
if (-not (Test-Path $script)) { throw "Not found: $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Output "Registered task '$TaskName' - daily at $At."
Write-Output "Runs: $script"
