<#
  register-task.ps1 — register the recurring agent loop with Windows Task
  Scheduler. **Created DISABLED by default** so it does not start firing
  unattended Claude turns. Enable it explicitly when you're ready:

      Enable-ScheduledTask -TaskName 'EvolutionGameAgentLoop'

  …and disable any time with:

      Disable-ScheduledTask -TaskName 'EvolutionGameAgentLoop'

  Each fired turn spends real Claude calls (a builder + a verifier). Read the
  README "Safety & cost" section before enabling.

  Usage:
      powershell -ExecutionPolicy Bypass -File register-task.ps1 [-IntervalMinutes 120] [-Enable]
#>
[CmdletBinding()]
param(
    [int]$IntervalMinutes = 120,
    [string]$TaskName = 'EvolutionGameAgentLoop',
    [switch]$Enable   # opt-in: enable immediately (default leaves it disabled)
)

$agentRoot = Split-Path -Parent $PSScriptRoot
$loop = Join-Path $agentRoot 'loop.ps1'
$logDir = Join-Path $agentRoot 'state\results'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'scheduler.log'

if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
    throw 'ScheduledTasks module not available. Use schtasks.exe manually (see README) or run on Windows 8+/Server 2012+.'
}

# Run one turn, appending all output to a rolling log.
$cmd = "& '$loop' *>> '$log'"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$cmd`""

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($IntervalMinutes) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Dawn of the Tribe autonomous build/improve loop (one turn per interval)." -Force | Out-Null

if ($Enable) {
    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "Registered AND ENABLED '$TaskName' every $IntervalMinutes min. It will start firing real Claude turns." -ForegroundColor Yellow
}
else {
    Disable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "Registered '$TaskName' every $IntervalMinutes min — but DISABLED." -ForegroundColor Green
    Write-Host "Enable when ready:  Enable-ScheduledTask -TaskName '$TaskName'"
}
Write-Host "Log: $log"
