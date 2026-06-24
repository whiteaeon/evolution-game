<#
  loop.ps1 — the orchestrator. One invocation = ONE turn made of five moves:
    DISCOVER → HANDOFF (worktree) → BUILD (builder Claude) → VERIFY (verifier
    Claude, fresh+adversarial) → PERSIST (ledger + artifacts + branch).

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File loop.ps1            # one real turn
    powershell -NoProfile -ExecutionPolicy Bypass -File loop.ps1 -Mock      # one dry-run turn (no Claude)
    powershell -NoProfile -ExecutionPolicy Bypass -File loop.ps1 -Continuous -IntervalMinutes 60 -MaxTurns 0

  The scheduler invokes the single-turn form on an interval; it does NOT loop here.
#>
[CmdletBinding()]
param(
    [switch]$Mock,
    [switch]$Continuous,
    [int]$IntervalMinutes = 60,
    [int]$MaxTurns = 1
)

. (Join-Path $PSScriptRoot 'config.ps1')
foreach ($lib in 'common', 'discover', 'worktree', 'build', 'verify', 'persist') {
    . (Join-Path $LibDir "$lib.ps1")
}

function Invoke-AgentTurn {
    param([switch]$Mock)
    $turnId = New-TurnId
    $resultDir = Join-Path $ResultsDir $turnId
    New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
    Write-AgentLog "===== TURN $turnId $(if ($Mock) { '(MOCK / dry-run)' })  =====" 'OK'

    # ── DISCOVER ──
    $task = Get-NextTask -Mock:$Mock
    if (-not $task) { Write-AgentLog 'Nothing to do: checks are green and the backlog is empty.' 'OK'; return $null }
    Write-AgentLog "Task [$($task.source)/$($task.type)] $($task.id) — $($task.title)"

    $base = Get-MainBranch

    # ── HANDOFF ──
    $wt = New-AgentWorktree -TaskId $task.id -BaseBranch $base
    try {
        # ── BUILD ──
        $build = Invoke-Builder -Task $task -Worktree $wt -ResultDir $resultDir -Mock:$Mock
        if (-not $build.committed) {
            Write-AgentLog 'Builder produced no commit — recording a no-op rejection.' 'WARN'
            $verdict = [ordered]@{ approved = $false; objectivePass = $false; claudeApproved = $false; reason = 'builder made no commit'; checks = @{ simYear = 0 } }
            $diff = ''
        }
        else {
            $diff = Get-WorktreeDiff -Path $wt.Path -BaseBranch $base
            Write-AgentLog "Builder claim: $([string]$build.report.claim)"
            # ── VERIFY ──
            $verdict = Invoke-Verifier -Task $task -Worktree $wt -Diff $diff -Claim ([string]$build.report.claim) -ResultDir $resultDir -Mock:$Mock
        }

        # ── PERSIST ──
        $entry = Save-TurnResult -TurnId $turnId -Task $task -Worktree $wt -BuildResult $build -Verdict $verdict -Diff $diff -ResultDir $resultDir -Mock:$Mock
        Write-AgentLog ("Turn $turnId complete: approved={0}" -f $verdict.approved) ($(if ($verdict.approved) { 'OK' } else { 'WARN' }))
        return $entry
    }
    catch {
        Write-AgentLog "Turn error: $($_.Exception.Message)" 'ERROR'
        Remove-AgentWorktree -TaskId $task.id
        throw
    }
}

# ── entry ──
Test-AgentDeps -Mock:$Mock
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
Write-AgentLog "Repo: $RepoRoot | Model: $Model | AutoMerge: $AutoMerge | Mock: $Mock"

if ($Continuous) {
    $i = 0
    while ($MaxTurns -le 0 -or $i -lt $MaxTurns) {
        Invoke-AgentTurn -Mock:$Mock
        $i++
        if ($MaxTurns -gt 0 -and $i -ge $MaxTurns) { break }
        Write-AgentLog "Sleeping $IntervalMinutes min until next turn…"
        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }
}
else {
    Invoke-AgentTurn -Mock:$Mock
}
