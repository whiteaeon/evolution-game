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
      # one turn every N minutes:
      powershell -ExecutionPolicy Bypass -File register-task.ps1 [-IntervalMinutes 120] [-Enable]
      # or one long-lived loop, turns back-to-back, kept alive by a 15-min heartbeat:
      powershell -ExecutionPolicy Bypass -File register-task.ps1 -Continuous [-Enable]
#>
[CmdletBinding()]
param(
    [int]$IntervalMinutes = 120,
    [string]$TaskName = 'EvolutionGameAgentLoop',
    [switch]$Enable,       # opt-in: enable immediately (default leaves it disabled)
    [switch]$Continuous    # run ONE long-lived loop (turns back-to-back), kept alive by a 15-min heartbeat
)

$agentRoot = Split-Path -Parent $PSScriptRoot
$loop = Join-Path $agentRoot 'loop.ps1'
$logDir = Join-Path $agentRoot 'state\results'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'scheduler.log'

if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
    throw 'ScheduledTasks module not available. Use schtasks.exe manually (see README) or run on Windows 8+/Server 2012+.'
}

if ($Continuous) {
    # One long-lived process that runs turns back-to-back (loop.ps1 -Continuous).
    # A time-trigger "heartbeat" (every 15 min) is the keep-alive: the single-
    # instance lockfile means only ONE continuous loop ever runs, so each fire just
    # confirms the loop is alive — and relaunches it within 15 min if it died (e.g.
    # after a reboot, via StartWhenAvailable). We use a time trigger + finite limit
    # because AtLogOn / infinite-limit settings can require elevation to register.
    $cmd = "& '$loop' -Continuous -MaxTurns 0 *>> '$log'"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$cmd`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Days 3) -MultipleInstances IgnoreNew
    $desc = "Dawn of the Tribe autonomous loop — CONTINUOUS (turns back-to-back; PRs proposed for approved work)."
}
else {
    # One turn per interval.
    $cmd = "& '$loop' *>> '$log'"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$cmd`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($IntervalMinutes) `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
    $desc = "Dawn of the Tribe autonomous build/improve loop (one turn per interval)."
}

# Unregister any existing task first — a fresh Register is more reliable than a
# `-Force` overwrite, which can fail with "Access is denied" (0x80070005) when the
# existing task can't be modified in place.
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
}
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description $desc -ErrorAction Stop | Out-Null
}
catch {
    Write-Host "Register-ScheduledTask FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "If this is 'Access is denied', run this script from an ELEVATED PowerShell (Run as administrator)." -ForegroundColor Yellow
    throw
}

$mode = if ($Continuous) { 'CONTINUOUS (15-min heartbeat keep-alive, turns back-to-back)' } else { "every $IntervalMinutes min" }
if ($Enable) {
    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "Registered AND ENABLED '$TaskName' — $mode. It will spend real Claude turns." -ForegroundColor Yellow
}
else {
    Disable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "Registered '$TaskName' — $mode — but DISABLED." -ForegroundColor Green
    Write-Host "Enable when ready:  Enable-ScheduledTask -TaskName '$TaskName'"
}
Write-Host "Log: $log"
