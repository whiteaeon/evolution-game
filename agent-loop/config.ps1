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

# ── Merge model ───────────────────────────────────────────────────────────────
# AutoMerge ON: an approved turn opens a PR and immediately merges it (gh pr merge),
# then fast-forwards local main — so the loop is fully self-driving and each turn
# branches off the freshly-merged main (no conflict pile-up). The ONLY gate is then
# the adversarial verifier + objective checks (tests/build/sim, no weakened tests,
# no sim/render-split break). Set $false to leave approved work as open PRs for you
# to review/merge by hand.
$AutoMerge  = $true
$MainBranch = ''   # auto-detected (main/master) when empty

# Propose approved work as a GitHub PR (push agent/<task> + `gh pr create`).
# Requires a git remote + an authed `gh` CLI. (AutoMerge implies this.)
$PushPR     = $true
$PrBase     = ''   # PR base branch; auto = the repo's main branch when empty

# Continuous-mode pacing (loop.ps1 -Continuous)
$InterTurnSec = 10   # short gap after a real turn before starting the next
$IdleMinutes  = 30   # back off this long when there's no task, or after an error

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
# Self-replenish: when the curated backlog AND the TODO scan are both empty, emit
# an open-ended "find one small, well-tested improvement" task so the loop keeps
# running instead of idling. Every such turn is still fully verifier-gated.
$SelfImprove       = $true

# ── Misc ──────────────────────────────────────────────────────────────────────
$KeepResultsTurns = 200       # prune oldest artifact dirs beyond this many
