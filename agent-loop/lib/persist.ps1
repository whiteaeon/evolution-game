# lib/persist.ps1 — PERSIST move. Everything the turn produced is written to disk
# so a context flush loses nothing: the append-only ledger (the loop's memory),
# a per-turn artifact dir (diff, reports, logs, verdict), and the branch handling.
# Approved work lands on its agent/<task> branch and STOPS there unless AutoMerge
# is explicitly enabled — or, with PushPR on, it's PROPOSED as a GitHub PR (still
# human-gated: a PR is reviewed/merged by you, not auto-merged).

# Push the approved branch and open a PR vs the base. Returns the PR URL (or '').
function Publish-PullRequest {
    param([hashtable]$Worktree, $Task, $Verdict, [string]$Claim)
    $base = if ($script:PrBase) { $script:PrBase } else { Get-MainBranch }
    Push-Location $script:RepoRoot
    try {
        Write-AgentLog "Pushing $($Worktree.Branch) and opening a PR vs $base…"
        git push -u origin $Worktree.Branch 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-AgentLog "git push failed; branch kept locally." 'WARN'; return '' }

        $reason = ([string]$Verdict.reason)
        if ($reason.Length -gt 600) { $reason = $reason.Substring(0, 600) + '…' }
        $tail = if ($script:AutoMerge) { "Auto-merged after passing the verifier + objective checks." }
                else { "Produced + verified automatically; please review before merging." }
        $body = "Autonomous **agent-loop** change for task ``$($Task.id)``.`n`n" +
                "**Claim:** $Claim`n`n" +
                "**Verifier (approved, fresh/diff-only):** $reason`n`n" +
                "Objective checks: test=$($Verdict.checks.test) build=$($Verdict.checks.build) sim=$($Verdict.checks.sim) (Information Age year $($Verdict.checks.simYear)). " +
                $tail
        $out = gh pr create --base $base --head $Worktree.Branch --title $Task.title --body $body 2>&1 | Out-String
        $url = ($out | Select-String -Pattern 'https?://\S+/pull/\d+' | Select-Object -First 1).Matches.Value
        if ($url) { Write-AgentLog "APPROVED — opened PR: $url" 'OK'; return [string]$url }
        Write-AgentLog "Branch pushed but PR not parsed (already open?). gh: $($out.Trim())" 'WARN'
        return ''
    }
    finally { Pop-Location }
}

# Merge an open PR (gh) and fast-forward local main, so the next turn branches off
# the freshly-merged base (no conflict pile-up). Returns $true on success.
# NOTE: gh pr merge can exit non-zero even when the merge SUCCEEDS (GitHub still
# computing mergeability → "UNKNOWN", or --delete-branch hiccups). So we don't
# trust the exit code — we poll the PR's actual state and only proceed on MERGED.
function Merge-PullRequest {
    param([string]$Branch, [string]$Base)
    Push-Location $script:RepoRoot
    try {
        $state = ''
        for ($i = 0; $i -lt 8; $i++) {
            $state = (gh pr view $Branch --json state -q .state 2>$null | Out-String).Trim()
            if ($state -eq 'MERGED') { break }
            gh pr merge $Branch --merge 2>&1 | Out-Null   # may report non-zero yet still merge
            Start-Sleep -Seconds 4
        }
        $state = (gh pr view $Branch --json state -q .state 2>$null | Out-String).Trim()
        if ($state -ne 'MERGED') { Write-AgentLog "PR for $Branch not merged after retries (state=$state) — left open." 'WARN'; return $false }
        git push origin --delete $Branch 2>&1 | Out-Null   # best-effort remote cleanup
        git fetch origin $Base 2>&1 | Out-Null
        git checkout $Base 2>&1 | Out-Null
        git merge --ff-only "origin/$Base" 2>&1 | Out-Null
        Write-AgentLog "AUTO-MERGED $Branch into $Base (PR merged; local $Base fast-forwarded)." 'OK'
        return $true
    }
    finally { Pop-Location }
}

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
    $prUrl = ''
    $base = if ($script:PrBase) { $script:PrBase } else { Get-MainBranch }
    if ($Verdict.approved) {
        $canPush = (-not $Mock) -and $script:PushPR -and (git -C $script:RepoRoot remote)
        if ($canPush) {
            # open a PR (audit trail / portfolio); auto-merge it if configured
            $prUrl = Publish-PullRequest -Worktree $Worktree -Task $Task -Verdict $Verdict -Claim ([string]$BuildResult.report.claim)
            if ($script:AutoMerge -and $prUrl) {
                $merged = Merge-PullRequest -Branch $Worktree.Branch -Base $base
            }
        }
        elseif ($script:AutoMerge -and -not $Mock) {
            # no remote / push disabled → land it with a local merge
            git -C $script:RepoRoot merge --no-ff $Worktree.Branch -m "agent: merge $($Task.id)" 2>&1 | Out-Null
            $merged = ($LASTEXITCODE -eq 0)
            if (-not $merged) { Write-AgentLog 'AutoMerge (local) FAILED (conflict?) — branch kept.' 'WARN'; git -C $script:RepoRoot merge --abort 2>$null | Out-Null }
            else { Write-AgentLog "AUTO-MERGED (local) $($Worktree.Branch) into $base." 'OK' }
        }
        else {
            Write-AgentLog "APPROVED — kept on branch $($Worktree.Branch) for your review (no push)." 'OK'
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
        pr = $prUrl
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
