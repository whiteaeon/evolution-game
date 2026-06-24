# lib/discover.ps1 — DISCOVER move. Find the single most worthwhile task for this
# turn. Sources, in priority order:
#   1. Failing `npm test` / `npm run build` (typecheck)  → high-priority fix task
#   2. Curated, prioritized backlog (state/tasks/backlog.json)
#   3. TODO / FIXME scan of the source
#   4. (optional) GitHub issues via `gh` — only if a GitHub remote exists
# Returns a task hashtable, or $null when there's nothing to do.

function Get-GitHubRemote {
    $remotes = git -C $script:RepoRoot remote -v 2>$null
    if ($remotes -match 'github\.com') { return $true }
    return $false
}

function Get-NextTask {
    param([switch]$Mock)

    if ($Mock) {
        return [ordered]@{
            id          = 'wiring-selfcheck'
            priority    = 0
            type        = 'selfcheck'
            source      = 'mock'
            title       = 'Agent-loop wiring self-check'
            description = 'Dry-run that exercises discover→worktree→build→verify→persist without calling real Claude or changing the game.'
            verify      = 'A commit exists on agent/wiring-selfcheck, npm test + build + sim still pass, and a ledger entry (mock:true) is written.'
        }
    }

    # 1) failing checks take precedence over any backlog work
    Write-AgentLog 'Discovery: running npm test + build on the repo…'
    $checks = Invoke-GameChecks -Dir $script:RepoRoot
    if (-not $checks.test -or -not $checks.build) {
        $what = @(); if (-not $checks.test) { $what += 'npm test' }; if (-not $checks.build) { $what += 'npm run build' }
        $tail = ($checks.log -split "`n" | Select-Object -Last 40) -join "`n"
        return [ordered]@{
            id          = 'fix-failing-checks'
            priority    = 0
            type        = 'fix-checks'
            source      = 'checks'
            title       = "Fix failing checks: $($what -join ', ')"
            description = "The repository's own checks are failing and must be green before any other work. Make them pass without weakening tests. Recent output:`n$tail"
            verify      = 'npm test and npm run build both exit 0, with no assertions deleted or weakened.'
        }
    }
    Write-AgentLog 'Discovery: checks are green.' 'OK'

    # 2) curated backlog (skip anything already approved for real)
    if (Test-Path $script:Backlog) {
        $done = Get-CompletedTaskIds
        $items = Get-Content $script:Backlog -Raw -Encoding utf8 | ConvertFrom-Json
        $pending = @($items | Where-Object { -not $done.ContainsKey($_.id) } | Sort-Object priority)
        if ($pending.Count) {
            $t = $pending[0]
            return [ordered]@{
                id = $t.id; priority = $t.priority; type = $t.type; source = 'backlog'
                title = $t.title; description = $t.description; verify = $t.verify
            }
        }
        Write-AgentLog 'Discovery: backlog exhausted.'
    }

    # 3) TODO / FIXME scan
    $hit = Get-ChildItem -Path (Join-Path $script:RepoRoot 'src') -Recurse -Filter *.ts -ErrorAction SilentlyContinue |
        Select-String -Pattern 'TODO|FIXME' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) {
        $rel = $hit.Path.Replace($script:RepoRoot, '').TrimStart('\', '/')
        return [ordered]@{
            id          = 'todo-' + (($rel -replace '[^a-zA-Z0-9]', '-')) + "-$($hit.LineNumber)"
            priority    = 5; type = 'todo'; source = 'todo-scan'
            title       = "Resolve TODO/FIXME in $rel`:$($hit.LineNumber)"
            description = "Address this code comment: `"$($hit.Line.Trim())`" ($rel line $($hit.LineNumber)). Implement it or remove it if obsolete."
            verify      = 'The TODO/FIXME is genuinely resolved (not just deleted to silence it) and all checks pass.'
        }
    }

    # 4) optional GitHub discovery (only with a real remote + opt-in)
    if ($script:EnableGhDiscovery -and (Get-GitHubRemote) -and (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-AgentLog 'Discovery: GitHub remote present but gh discovery is a stub — skipping.' 'WARN'
    }

    # 5) self-replenish — keep the loop running with one open-ended small improvement
    #    (each gets a unique id so it's never "already done"; verifier still gates it).
    if ($script:SelfImprove) {
        $themes = @(
            'Raise unit-test coverage of one currently-untested branch or edge case in src/sim — add tests, and fix any real bug they expose.',
            'Improve one small UX or accessibility detail in the DOM UI (src/ui) without touching the sim.',
            'Make one small, determinism-preserving performance improvement in the sim or render layer.',
            'Improve one piece of in-game clarity: a label, tooltip, the chronicle, or tutorial copy.',
            'Tighten one rough edge: pull a magic number into the BALANCE block, de-duplicate a little code, or sharpen a type.'
        )
        $theme = $themes[[Math]::Abs([int](Get-Date).Minute) % $themes.Count]
        Write-AgentLog 'Discovery: backlog + TODOs empty — emitting a self-improvement task.'
        return [ordered]@{
            id          = 'self-improve-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
            priority    = 9; type = 'self-improve'; source = 'self-improve'
            title       = 'Autonomous improvement: ' + ($theme.Split('—')[0].Trim().TrimEnd('.'))
            description = "$theme`n`nMake the SMALLEST change that delivers one concrete, genuine improvement. Preserve the pure-sim / render split (no Phaser/DOM in src/sim). Add or extend tests for any behaviour change. Do NOT weaken existing tests or break the sim reaching the Information Age."
            verify      = 'npm test + build pass; sim still reaches the Information Age in range; no weakened/deleted tests; sim/render split intact; the change is small and genuinely useful.'
        }
    }

    return $null
}
