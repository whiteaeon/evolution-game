# lib/persist.ps1 — PERSIST move. Everything the turn produced is written to disk
# so a context flush loses nothing: the append-only ledger (the loop's memory),
# a per-turn artifact dir (diff, reports, logs, verdict), and the branch handling.
# Approved work lands on its agent/<task> branch and STOPS there unless AutoMerge
# is explicitly enabled — the human gates merges by default.

function Save-TurnResult {
    param(
        [Parameter(Mandatory)] [string]$TurnId,
        [Parameter(Mandatory)] $Task,
        [Parameter(Mandatory)] [hashtable]$Worktree,
        [Parameter(Mandatory)] $BuildResult,
        [Parameter(Mandatory)] $Verdict,
        [Parameter(Mandatory)] [string]$Diff,
        [Parameter(Mandatory)] [string]$ResultDir,
        [switch]$Mock
    )
    $Diff | Out-File (Join-Path $ResultDir 'diff.patch') -Encoding utf8

    $merged = $false
    if ($Verdict.approved) {
        if ($script:AutoMerge) {
            $main = Get-MainBranch
            Write-AgentLog "AutoMerge ON: merging $($Worktree.Branch) into $main…"
            git -C $script:RepoRoot merge --no-ff $Worktree.Branch -m "agent: merge $($Task.id)" 2>&1 | Out-Null
            $merged = ($LASTEXITCODE -eq 0)
            if (-not $merged) { Write-AgentLog 'AutoMerge FAILED (conflict?) — branch kept for manual merge.' 'WARN'; git -C $script:RepoRoot merge --abort 2>$null | Out-Null }
            else { Write-AgentLog "Merged into $main." 'OK' }
        }
        else {
            Write-AgentLog "APPROVED — kept on branch $($Worktree.Branch) for your review (AutoMerge is OFF)." 'OK'
        }
    }
    else {
        Write-AgentLog "REJECTED — branch $($Worktree.Branch) kept for inspection; nothing merged." 'WARN'
    }

    $entry = [ordered]@{
        turn = $TurnId; ts = (Get-Date).ToString('o')
        taskId = $Task.id; source = $Task.source; type = $Task.type
        title = $Task.title
        claim = [string]$BuildResult.report.claim
        committed = [bool]$BuildResult.committed
        approved = [bool]$Verdict.approved
        objectivePass = [bool]$Verdict.objectivePass
        claudeApproved = [bool]$Verdict.claudeApproved
        reason = [string]$Verdict.reason
        simYear = $Verdict.checks.simYear
        branch = $Worktree.Branch
        merged = $merged
        mock = [bool]$Mock
        artifacts = (Split-Path -Leaf $ResultDir)
    }
    Add-LedgerEntry -Entry $entry
    ($entry | ConvertTo-Json -Depth 8) | Out-File (Join-Path $ResultDir 'turn.json') -Encoding utf8
    Write-AgentLog "Ledger updated: $script:Ledger"

    # tidy the worktree (branch is kept); prune old artifact dirs
    Remove-AgentWorktree -TaskId $Task.id
    $dirs = Get-ChildItem $script:ResultsDir -Directory -ErrorAction SilentlyContinue | Sort-Object Name
    if ($dirs.Count -gt $script:KeepResultsTurns) {
        $dirs | Select-Object -First ($dirs.Count - $script:KeepResultsTurns) | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    return $entry
}
