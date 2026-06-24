# lib/verify.ps1 — VERIFY move. The gate has two halves that must AGREE:
#   (A) Deterministic objective checks the harness runs itself — npm test/build,
#       the headless sim still reaching the final era in range, and a static scan
#       of the diff for sim/render-split violations and gutted assertions.
#   (B) An adversarial "verifier" Claude in a FRESH context that sees ONLY the
#       diff + the builder's one-line claim, defaults to REJECT, and approves
#       only if the diff genuinely backs the claim.
# Final verdict = (A passes) AND (B approves). Either one can veto.

function Get-DiffRedFlags {
    param([string]$Diff)
    $flags = @()
    $curFile = ''
    $removedExpect = 0; $addedExpect = 0
    foreach ($line in ($Diff -split "`n")) {
        if ($line -like '+++ b/*') { $curFile = $line.Substring(6).Trim(); continue }
        if ($line.StartsWith('+') -and -not $line.StartsWith('+++')) {
            $add = $line.Substring(1)
            if ($curFile -match 'src/sim/' -and ($add -match 'from\s+["'']phaser' -or $add -match '\bdocument\.' -or $add -match '\bwindow\.')) {
                $flags += "sim/render split violation: $curFile adds a Phaser/DOM reference"
            }
            if ($curFile -match '\.test\.ts' -and $add -match 'expect\(') { $addedExpect++ }
        }
        elseif ($line.StartsWith('-') -and -not $line.StartsWith('---')) {
            $rem = $line.Substring(1)
            if ($curFile -match '\.test\.ts' -and $rem -match 'expect\(') { $removedExpect++ }
            if ($rem -match '\bit\.skip\(|\bdescribe\.skip\(') { } # informational only
        }
    }
    if ($removedExpect -gt $addedExpect) {
        $flags += "weakened tests: $removedExpect assertion line(s) removed vs $addedExpect added"
    }
    return , $flags
}

function Invoke-Verifier {
    param(
        [Parameter(Mandatory)] $Task,
        [Parameter(Mandatory)] [hashtable]$Worktree,
        [Parameter(Mandatory)] [string]$Diff,
        [Parameter(Mandatory)] [string]$Claim,
        [Parameter(Mandatory)] [string]$ResultDir,
        [switch]$Mock
    )
    # ── (A) objective, deterministic ──
    Write-AgentLog 'Verifier: running objective checks (test/build/sim)…'
    $checks = Invoke-GameChecks -Dir $Worktree.Path -IncludeSim:$script:RunSimCheck
    $checks.log | Out-File (Join-Path $ResultDir 'verify-checks.log') -Encoding utf8
    $staticFlags = Get-DiffRedFlags -Diff $Diff
    $objectivePass = $checks.test -and $checks.build -and $checks.sim -and ($staticFlags.Count -eq 0)

    $simMsg = if ($script:RunSimCheck) {
        if ($checks.simYear) { "reached '$script:FinalEraPattern' at year $($checks.simYear)" } else { "did NOT reach '$script:FinalEraPattern' in range" }
    } else { 'sim check disabled' }
    Write-AgentLog ("Objective: test={0} build={1} sim={2} ({3}) staticFlags={4}" -f $checks.test, $checks.build, $checks.sim, $simMsg, $staticFlags.Count) `
        ($(if ($objectivePass) { 'OK' } else { 'WARN' }))

    # ── (B) adversarial Claude verifier (fresh, diff-only, default REJECT) ──
    $claudeApproved = $false; $claudeReason = ''
    if ($Mock) {
        # Stand-in: approves only if objective checks pass AND the diff stays out of
        # the game source (proving the AND-gate + veto wiring).
        $touchesGameSrc = ($Diff -match '\+\+\+ b/src/')
        $claudeApproved = ($objectivePass -and -not $touchesGameSrc)
        $claudeReason = if ($touchesGameSrc) { '[MOCK] diff touches game src — a real verifier would scrutinize; mock rejects.' }
                        elseif (-not $objectivePass) { '[MOCK] objective checks failed.' }
                        else { '[MOCK] confined doc-only change; objective checks green.' }
    }
    else {
        $tpl = Get-Content (Join-Path $script:PromptsDir 'verifier.md') -Raw -Encoding utf8
        $diffForClaude = if ($Diff.Length -gt 24000) { $Diff.Substring(0, 24000) + "`n…(diff truncated)…" } else { $Diff }
        $prompt = Format-Template $tpl @{
            TASKID = $Task.id; TITLE = $Task.title; CLAIM = $Claim
            CHECKS = ("test={0} build={1} sim={2} ({3})" -f $checks.test, $checks.build, $checks.sim, $simMsg)
            STATICFLAGS = (($staticFlags -join '; ') -as [string])
            DIFF = $diffForClaude
        }
        Write-AgentLog "Verifier (Claude $script:Model, fresh context) judging the diff…"
        $out = Invoke-ClaudeHeadless -Prompt $prompt -Cwd $Worktree.Path -TimeoutSec $script:VerifierTimeoutSec `
            -LogFile (Join-Path $ResultDir 'verifier.log')
        $v = Get-JsonObject -Text $out
        if ($v) { $claudeApproved = [bool]$v.approved; $claudeReason = [string]$v.reason }
        else { $claudeApproved = $false; $claudeReason = 'verifier produced no parsable VERDICT.json → default REJECT' }
    }

    $approved = $objectivePass -and $claudeApproved
    $verdict = [ordered]@{
        approved      = $approved
        objectivePass = $objectivePass
        claudeApproved = $claudeApproved
        reason        = $claudeReason
        checks        = [ordered]@{ test = $checks.test; build = $checks.build; sim = $checks.sim; simYear = $checks.simYear }
        staticFlags   = $staticFlags
    }
    ($verdict | ConvertTo-Json -Depth 8) | Out-File (Join-Path $ResultDir 'verdict.json') -Encoding utf8
    return $verdict
}
