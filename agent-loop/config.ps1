# config.ps1 — Agent-loop configuration. Dot-sourced by loop.ps1, the libs, and
# the scheduler scripts. Edit values here; nothing else hard-codes paths.

# 'Continue' (not 'Stop'): under Windows PowerShell 5.1, native commands like git
# that write to stderr (e.g. "branch not found") would otherwise become
# terminating errors. Critical steps still fail loudly via explicit $LASTEXITCODE
# checks and `throw`, and loop.ps1 wraps each turn in try/catch.
$ErrorActionPreference = 'Continue'

# ── Paths ─────────────────────────────────────────────────────────────────────
$AgentRoot = $PSScriptRoot                       # ...\evolution-game\agent-loop
$RepoRoot  = Split-Path -Parent $AgentRoot       # ...\evolution-game
$StateDir   = Join-Path $AgentRoot   'state'
$TasksDir   = Join-Path $StateDir    'tasks'
$ResultsDir = Join-Path $StateDir    'results'
$PromptsDir = Join-Path $AgentRoot   'prompts'
$LibDir     = Join-Path $AgentRoot   'lib'
$Ledger     = Join-Path $StateDir    'ledger.jsonl'
$Backlog    = Join-Path $TasksDir    'backlog.json'

# Worktrees live OUTSIDE the repo (a sibling folder) so git never nests them
# inside its own working tree.
$WorktreeBase = Join-Path (Split-Path -Parent $RepoRoot) 'evolution-agent-worktrees'

# ── Headless Claude (builder + verifier) ──────────────────────────────────────
# The latest Claude model. The builder and verifier are separate `claude -p`
# invocations, so the verifier always gets a FRESH context.
$Model            = 'claude-opus-4-8'
$ClaudeCmd        = 'claude'
# CAUTION: --dangerously-skip-permissions lets the headless agent edit/run without
# prompts. Required for unattended turns; understand the risk before enabling the
# scheduler. See README "Safety". (Verified present in Claude CLI 2.1.190.)
$ClaudeExtraArgs  = @('--dangerously-skip-permissions')
$BuilderTimeoutSec  = 1800
$VerifierTimeoutSec = 1200

# ── Safety / merge model ──────────────────────────────────────────────────────
# OFF by default: approved work lands on an `agent/<task>` branch and STOPS there.
# You review and merge. Flip to $true only if you want approved turns auto-merged
# into the main branch.
$AutoMerge  = $false
$MainBranch = ''   # auto-detected (main/master) when empty

# ── Objective game checks (the deterministic half of the gate) ────────────────
# The verifier step ALWAYS runs these in the worktree regardless of what the
# Claude verifier says; both must agree to approve.
$RunSimCheck     = $true
$FinalEraPattern = 'Information Age'
$SimMinYear      = 150     # "reached the final era" must land in this sane band…
$SimMaxYear      = 2000    # …or balance is considered broken → auto-reject.

# ── Discovery ─────────────────────────────────────────────────────────────────
$EnableGhDiscovery = $false   # auto-skipped anyway when there's no GitHub remote
$TodoScanGlobs     = @('src/**/*.ts')

# ── Misc ──────────────────────────────────────────────────────────────────────
$KeepResultsTurns = 200       # prune oldest artifact dirs beyond this many
