# Agent Loop — autonomous build/improve for *Dawn of the Tribe*

A self-contained agent that, once per "turn," finds the next worthwhile task,
does it in an isolated git worktree using a headless **builder** Claude, then has
a separate, adversarial **verifier** Claude (fresh context, sees only the diff)
independently confirm it before anything is allowed to land. All memory lives on
disk, so a context flush loses nothing. It runs on **Windows** (PowerShell +
Task Scheduler) and never touches the game except through normal, verified edits.

This is wired for a solo creative game project — discovery is driven by the
project's own checks and a curated backlog, not CI/issues — but the architecture
is the classic five-move loop.

---

## The five moves (one turn)

```
DISCOVER → HANDOFF → BUILD → VERIFY → PERSIST
```

1. **DISCOVER** (`lib/discover.ps1`) — pick the single most worthwhile task:
   1. **Failing checks first.** Run `npm test` + `npm run build`; if either fails,
      the turn's task is "fix the failing checks" (highest priority).
   2. **Curated backlog** (`state/tasks/backlog.json`) — a prioritized list of the
      real remaining work (art pass, deeper map, family-tree polish, balance,
      audio, perf, a11y, content). Already-approved items are skipped (read from
      the ledger).
   3. **TODO/FIXME scan** of `src/**/*.ts`.
   4. **GitHub issues** via `gh` — *optional and off*; auto-skipped when there's no
      GitHub remote (this project has none, so it runs fully locally).
2. **HANDOFF** (`lib/worktree.ps1`) — create a git **worktree** on a fresh
   `agent/<task>` branch. Worktrees share the one `.git` (cheap, parallel-safe).
   `node_modules` is **junctioned** in from the main checkout so the builder and
   verifier can run the checks immediately with no reinstall.
3. **BUILD** (`lib/build.ps1`) — a headless **builder** Claude (latest model) makes
   the *smallest* change that solves the task, runs `npm test` + `npm run build`
   (+ `npm run sim` when relevant), **commits** (never pushes), and writes
   `AGENT_REPORT.json` with a one-line, falsifiable **claim**.
4. **VERIFY** (`lib/verify.ps1`) — the gate, with two halves that must **agree**:
   - **Objective (the harness runs it):** `npm test`, `npm run build`, and the
     headless `npm run sim` — which must still reach the **Information Age** in a
     sane year range (150–2000) or balance is deemed broken — plus a static scan
     of the diff for **sim/render-split violations** (Phaser/DOM imported into
     `src/sim/`) and **gutted assertions**.
   - **Adversarial (a separate verifier Claude):** a *fresh* `claude -p` that sees
     **only the diff + the claim**, **defaults to REJECT**, and approves only if
     the diff genuinely backs the claim with no faking/scope-creep/regressions.
   - **Final verdict = objective passes AND verifier approves.** Either can veto.
5. **PERSIST** (`lib/persist.ps1`) — append the outcome to the on-disk ledger,
   write a per-turn artifact dir (diff, reports, logs, verdict), and handle the
   branch: **approved work stays on `agent/<task>`** for your review (it is *not*
   merged unless you turn on `AutoMerge`). The worktree is removed; the branch and
   all artifacts are kept.

The verifier's **asymmetry is the point**: different process, fresh context,
diff-only view, default-no. It's a real gate, not a rubber stamp.

---

## Run one turn

```powershell
# Dry-run (no Claude calls; proves the wiring end-to-end). Recommended first.
powershell -NoProfile -ExecutionPolicy Bypass -File agent-loop\loop.ps1 -Mock
#   or simply:  agent-loop\run-turn.cmd -Mock

# A real turn (requires the Claude CLI on PATH — see Dependencies):
agent-loop\run-turn.cmd
```

`-Mock` swaps the Claude builder/verifier for safe stand-ins: the builder makes a
confined, tracked change to `agent-loop/SCRATCH.md` (the game source is never
touched) and the verifier still runs the **real** objective checks and applies the
AND-gate — so the discover→worktree→build→verify→persist pipeline is genuinely
exercised without spending any Claude calls.

Continuous (manual; the scheduler normally drives single turns instead):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File agent-loop\loop.ps1 -Continuous -IntervalMinutes 60 -MaxTurns 0
```

---

## Enable / disable the timer (Windows Task Scheduler)

The scheduler is **not installed by this build**, and the register script creates
the task **DISABLED** so it can't fire unattended Claude turns until you say so.

```powershell
# Register (created DISABLED). Pick your cadence.
powershell -ExecutionPolicy Bypass -File agent-loop\scheduler\register-task.ps1 -IntervalMinutes 120

# Turn it ON when you're ready (this is the moment real, billed turns begin):
Enable-ScheduledTask  -TaskName 'EvolutionGameAgentLoop'

# Pause it any time:
Disable-ScheduledTask -TaskName 'EvolutionGameAgentLoop'

# Remove it entirely:
powershell -ExecutionPolicy Bypass -File agent-loop\scheduler\unregister-task.ps1
```

Scheduled runs append output to `agent-loop/state/results/scheduler.log`. The task
runs as you (logged-on), so `node`, `npm`, `git`, and `claude` must be on **your**
PATH. (If you prefer, register with `-Enable` to register-and-enable in one step.)

---

## Safety & cost

- **Merges are human-gated by default.** Approved work lands on an `agent/<task>`
  branch and stops. Review with `git log agent/<task>`, `git diff main...agent/<task>`,
  then merge yourself. Set `$AutoMerge = $true` in `config.ps1` only if you want
  approved turns auto-merged into the main branch.
- **The scheduler ships OFF.** Nothing recurs until you `Enable-ScheduledTask`.
- **`--dangerously-skip-permissions` (a.k.a. `bypassPermissions`)** is used for the
  headless builder/verifier so they can edit files and run commands without
  interactive prompts. That is real power running unattended on your machine — only
  enable the timer if you accept that, and keep `AutoMerge` off so a bad change
  can't reach your main branch on its own. The worktree isolation + default-reject
  verifier + branch gating are the safety net.
- **Every real turn spends Claude calls** — one builder **and** one verifier
  invocation (the verifier may also re-run checks). A timer firing every N minutes
  spends that every N minutes. Budget accordingly; start with a long interval.
- The verifier's objective half is deterministic and independent of the Claude
  verdict, so even a lenient model can't approve a red build, a broken sim, a
  gutted test, or a sim/render-split violation.

---

## Where state lives (disk = memory)

```
agent-loop/
  config.ps1                 all paths/flags/model — edit here
  loop.ps1                   orchestrator (one turn = five moves)
  run-turn.cmd               convenience launcher (sets exec policy)
  lib/  common discover worktree build verify persist   (.ps1 each)
  prompts/  builder.md  verifier.md                     (tuned for this game)
  scheduler/  register-task.ps1  unregister-task.ps1     (disabled by default)
  state/
    tasks/backlog.json       curated, prioritized work (tracked seed)
    ledger.jsonl             append-only record of every turn (gitignored)
    results/<turn>/          per-turn artifacts: diff.patch, *-report.json,
                             builder.log, verifier.log, verdict.json, turn.json
  SCRATCH.md                 mock dry-run target (keeps the game untouched)
```

Worktrees are created **outside** the repo at `..\evolution-agent-worktrees\<task>`
so git never nests them. The `agent/<task>` branches live in the repo's `.git`.

---

## Dependencies & detection

- **Required:** `node`, `npm`, `git` (the loop checks and errors clearly if any are
  missing). No `jq` — JSON is handled natively in PowerShell.
- **For real turns:** the **Claude CLI** (`claude`) on PATH. If it's missing, run
  with `-Mock`; the loop will refuse a real turn and tell you what to install.
- **Git is required** (worktrees). If `evolution-game` isn't a repo yet, run
  `git init` there first (a one-time, additive step that changes no game files).
- Tunables (model, interval, sane sim-year band, `AutoMerge`, timeouts) live in
  `config.ps1`.

---

## Adapting / extending

- **Add work:** append items to `state/tasks/backlog.json` (`priority`, `type`,
  `title`, `description`, `verify`). Lower `priority` runs sooner.
- **Tune the gate:** `SimMinYear` / `SimMaxYear` / `FinalEraPattern` in `config.ps1`
  define "balance not broken"; `Get-DiffRedFlags` in `lib/verify.ps1` holds the
  static red-flags.
- **Swap discovery sources:** `lib/discover.ps1` is ordered and easy to reorder;
  the `gh` hook is a documented stub that only activates with a GitHub remote.
- **Keep the prompts honest:** `prompts/builder.md` enforces smallest-change +
  sim/render split; `prompts/verifier.md` enforces default-reject + diff-only.
