# lib/worktree.ps1 — HANDOFF move. Each task gets its own git worktree on an
# `agent/<task>` branch: a real, isolated checkout that shares the repo's single
# .git (so it's cheap and parallel-safe), with node_modules junctioned in so the
# builder/verifier can run `npm test/build/sim` without a fresh install.

function New-AgentWorktree {
    param([Parameter(Mandatory)] [string]$TaskId, [Parameter(Mandatory)] [string]$BaseBranch)

    $safe   = ($TaskId -replace '[^a-zA-Z0-9._-]', '-')
    $branch = "agent/$safe"
    $path   = Join-Path $script:WorktreeBase $safe

    if (-not (Test-Path $script:WorktreeBase)) { New-Item -ItemType Directory -Force -Path $script:WorktreeBase | Out-Null }
    if (Test-Path $path) { Remove-AgentWorktree -TaskId $TaskId }

    # Start each task from a clean branch off the base (delete a stale one first).
    git -C $script:RepoRoot show-ref --verify --quiet "refs/heads/$branch"
    if ($LASTEXITCODE -eq 0) { git -C $script:RepoRoot branch -D $branch | Out-Null }
    git -C $script:RepoRoot worktree add -b $branch $path $BaseBranch | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "git worktree add failed for $branch at $path"
    }

    # Junction node_modules from the main checkout so checks run immediately.
    $srcNm = Join-Path $script:RepoRoot 'node_modules'
    $dstNm = Join-Path $path 'node_modules'
    if ((Test-Path $srcNm) -and -not (Test-Path $dstNm)) {
        cmd /c mklink /J "$dstNm" "$srcNm" | Out-Null
    }

    Write-AgentLog "Worktree ready: $branch -> $path" 'OK'
    return [ordered]@{ Branch = $branch; Path = $path; Base = $BaseBranch }
}

function Remove-AgentWorktree {
    param([Parameter(Mandatory)] [string]$TaskId)
    $safe = ($TaskId -replace '[^a-zA-Z0-9._-]', '-')
    $path = Join-Path $script:WorktreeBase $safe

    # Drop the junction first (rmdir removes the link, never the real target).
    $nm = Join-Path $path 'node_modules'
    if (Test-Path $nm) { cmd /c rmdir "$nm" 2>$null | Out-Null }

    git -C $script:RepoRoot worktree remove --force $path 2>$null | Out-Null
    if (Test-Path $path) { Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue }
    git -C $script:RepoRoot worktree prune 2>$null | Out-Null
    # NOTE: the agent/<task> branch is intentionally KEPT for review/merge.
}

# Unified diff of everything the builder did on its branch, vs the base.
function Get-WorktreeDiff {
    param([Parameter(Mandatory)] [string]$Path, [Parameter(Mandatory)] [string]$BaseBranch)
    return (git -C $Path diff "$BaseBranch...HEAD" 2>&1 | Out-String)
}
