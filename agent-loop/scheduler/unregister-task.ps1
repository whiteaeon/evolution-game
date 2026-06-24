<#
  unregister-task.ps1 — remove the scheduled agent loop entirely.
  Usage: powershell -ExecutionPolicy Bypass -File unregister-task.ps1
#>
[CmdletBinding()]
param([string]$TaskName = 'EvolutionGameAgentLoop')

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) { Write-Host "No scheduled task named '$TaskName'."; return }
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
