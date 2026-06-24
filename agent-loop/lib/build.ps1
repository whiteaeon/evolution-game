# lib/build.ps1 — BUILD move. A headless "builder" Claude (latest model, fresh
# process) makes the SMALLEST change that solves the task, runs the checks,
# commits (but does NOT push), and writes AGENT_REPORT.json with a one-line claim.
# In -Mock mode a stand-in builder proves the wiring without calling Claude.

function Format-Template {
    param([string]$Text, [hashtable]$Vars)
    foreach ($k in $Vars.Keys) { $Text = $Text.Replace("{{$k}}", [string]$Vars[$k]) }
    return $Text
}

function Invoke-Builder {
    param(
        [Parameter(Mandatory)] $Task,
        [Parameter(Mandatory)] [hashtable]$Worktree,
        [Parameter(Mandatory)] [string]$ResultDir,
        [switch]$Mock
    )
    $wt = $Worktree.Path
    $reportPath = Join-Path $wt 'AGENT_REPORT.json'
    Remove-Item $reportPath -ErrorAction SilentlyContinue

    if ($Mock) {
        # Stand-in builder: a confined, tracked doc change inside agent-loop only —
        # the game source is never touched. Proves commit + report + diff wiring.
        $scratch = Join-Path $wt 'agent-loop\SCRATCH.md'
        Add-Content -Path $scratch -Value "- [$(Get-Date -Format s)] wiring self-check turn for '$($Task.id)'." -Encoding utf8
        git -C $wt add -A 2>&1 | Out-Null
        git -C $wt commit -m "agent(mock): wiring self-check for $($Task.id)" 2>&1 | Out-Null
        $report = [ordered]@{
            taskId = $Task.id
            claim  = "[MOCK] Appended one self-check line to agent-loop/SCRATCH.md; no game code changed; checks remain green."
            filesChanged = @('agent-loop/SCRATCH.md')
            ranTests = $false; ranBuild = $false; ranSim = $false
            notes = 'Mock builder — no real Claude call.'
        }
        ($report | ConvertTo-Json -Depth 8) | Out-File -FilePath $reportPath -Encoding utf8
    }
    else {
        $tpl = Get-Content (Join-Path $script:PromptsDir 'builder.md') -Raw -Encoding utf8
        $prompt = Format-Template $tpl @{
            TASKID = $Task.id; TITLE = $Task.title; DESC = $Task.description; VERIFY = $Task.verify
        }
        Write-AgentLog "Builder (Claude $script:Model) working on '$($Task.id)'…"
        Invoke-ClaudeHeadless -Prompt $prompt -Cwd $wt -TimeoutSec $script:BuilderTimeoutSec `
            -LogFile (Join-Path $ResultDir 'builder.log') | Out-Null
    }

    # The builder must have committed at least one change on its branch.
    $ahead = git -C $wt rev-list --count "$($Worktree.Base)..HEAD" 2>$null
    $committed = ([int]($ahead | Select-Object -First 1) -gt 0)

    $report = $null
    if (Test-Path $reportPath) {
        try { $report = Get-Content $reportPath -Raw -Encoding utf8 | ConvertFrom-Json } catch {}
    }
    if (-not $report) {
        $report = [pscustomobject]@{ taskId = $Task.id; claim = '(builder wrote no AGENT_REPORT.json)'; filesChanged = @() }
    }

    Copy-Item $reportPath (Join-Path $ResultDir 'builder-report.json') -ErrorAction SilentlyContinue

    return [ordered]@{ committed = $committed; report = $report; reportRaw = (Get-Content $reportPath -Raw -ErrorAction SilentlyContinue) }
}
