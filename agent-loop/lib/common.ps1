# lib/common.ps1 — shared helpers: logging, deps, git, JSON ledger, game checks,
# and the headless-Claude invocation (with a mock for dry-runs).

function Write-AgentLog {
    param([string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR', 'OK')] [string]$Level = 'INFO')
    $ts = (Get-Date).ToString('HH:mm:ss')
    $color = @{ INFO = 'Gray'; WARN = 'Yellow'; ERROR = 'Red'; OK = 'Green' }[$Level]
    Write-Host "[$ts][$Level] $Message" -ForegroundColor $color
}

function New-TurnId { (Get-Date).ToString('yyyyMMdd-HHmmss') }

function Get-NpmExe {
    $cmd = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return 'npm'
}

function Test-AgentDeps {
    param([switch]$Mock)
    $missing = @()
    foreach ($t in 'node', 'npm', 'git') {
        if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { $missing += $t }
    }
    if (-not $Mock -and -not (Get-Command $script:ClaudeCmd -ErrorAction SilentlyContinue)) {
        $missing += "$script:ClaudeCmd (Claude CLI)"
    }
    if ($missing.Count) {
        throw "Missing required tools: $($missing -join ', '). Install them, or run with -Mock for a dry-run that doesn't call Claude."
    }
    if (-not (Test-Path (Join-Path $script:RepoRoot '.git'))) {
        throw "Repo at $script:RepoRoot is not a git repository. Run 'git init' there first (the worktree isolation requires git)."
    }
}

function Get-MainBranch {
    if ($script:MainBranch) { return $script:MainBranch }
    $head = git -C $script:RepoRoot symbolic-ref --quiet --short HEAD 2>$null
    if ($head) { return $head }
    foreach ($b in 'main', 'master') {
        git -C $script:RepoRoot show-ref --verify --quiet "refs/heads/$b" 2>$null
        if ($LASTEXITCODE -eq 0) { return $b }
    }
    return 'main'
}

# ── ledger (append-only JSONL on disk = the loop's memory) ─────────────────────

function Add-LedgerEntry {
    param([hashtable]$Entry)
    $line = ($Entry | ConvertTo-Json -Compress -Depth 12)
    Add-Content -Path $script:Ledger -Value $line -Encoding utf8
}

function Read-Ledger {
    if (-not (Test-Path $script:Ledger)) { return @() }
    $out = @()
    foreach ($line in Get-Content -Path $script:Ledger -Encoding utf8) {
        if ($line.Trim()) { try { $out += ($line | ConvertFrom-Json) } catch {} }
    }
    return $out
}

# Backlog ids that have a real (non-mock) approval already.
function Get-CompletedTaskIds {
    $ids = @{}
    foreach ($e in (Read-Ledger)) {
        if ($e.approved -and -not $e.mock) { $ids[$e.taskId] = $true }
    }
    return $ids
}

# ── objective game checks (deterministic half of the verifier gate) ────────────

function Invoke-GameChecks {
    param([Parameter(Mandatory)] [string]$Dir, [switch]$IncludeSim)
    $npm = Get-NpmExe
    $res = [ordered]@{ test = $false; build = $false; sim = (-not $IncludeSim); simYear = 0; log = '' }
    Push-Location $Dir
    try {
        $t = & $npm test 2>&1 | Out-String
        $res.test = ($LASTEXITCODE -eq 0)
        $res.log += "===== npm test (exit $LASTEXITCODE) =====`n$t`n"

        $b = & $npm run build 2>&1 | Out-String
        $res.build = ($LASTEXITCODE -eq 0)
        $res.log += "===== npm run build (exit $LASTEXITCODE) =====`n$b`n"

        if ($IncludeSim) {
            $s = & $npm run sim 2>&1 | Out-String
            $res.log += "===== npm run sim =====`n$s`n"
            $m = [regex]::Match($s, "$([regex]::Escape($script:FinalEraPattern)) at year (\d+)")
            if ($m.Success) {
                $res.simYear = [int]$m.Groups[1].Value
                $res.sim = ($res.simYear -ge $script:SimMinYear -and $res.simYear -le $script:SimMaxYear)
            }
        }
    } finally { Pop-Location }
    return $res
}

# ── headless Claude invocation ─────────────────────────────────────────────────

# Real call: a fresh `claude -p` process with the latest model. The verifier is a
# separate call, so it inherently has a fresh, diff-only context.
function Invoke-ClaudeHeadless {
    param(
        [Parameter(Mandatory)] [string]$Prompt,
        [Parameter(Mandatory)] [string]$Cwd,
        [int]$TimeoutSec = 1200,
        [string]$LogFile
    )
    # Pass the prompt via STDIN, not as a CLI arg. Under Windows PowerShell 5.1 a
    # long multi-line `-p "<prompt>"` argument gets mangled when it contains tokens
    # like `--noEmit` (e.g. from an embedded diff), which then leak as claude CLI
    # flags ("unknown option"). Piping the prompt to stdin keeps it 100% literal.
    $args = @('-p', '--model', $script:Model) + $script:ClaudeExtraArgs
    Push-Location $Cwd
    try {
        $out = $Prompt | & $script:ClaudeCmd @args 2>&1 | Out-String
    } finally { Pop-Location }
    if ($LogFile) { $out | Out-File -FilePath $LogFile -Encoding utf8 }
    return $out
}

# Parse the first {...} JSON object out of mixed CLI output.
function Get-JsonObject {
    param([string]$Text)
    if (-not $Text) { return $null }
    $depth = 0; $start = -1
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $c = $Text[$i]
        if ($c -eq '{') { if ($depth -eq 0) { $start = $i }; $depth++ }
        elseif ($c -eq '}') { $depth--; if ($depth -eq 0 -and $start -ge 0) {
            $cand = $Text.Substring($start, $i - $start + 1)
            try { return ($cand | ConvertFrom-Json) } catch { $start = -1 }
        } }
    }
    return $null
}
