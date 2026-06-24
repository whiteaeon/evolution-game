@echo off
REM Convenience launcher: runs ONE agent-loop turn with the right exec policy.
REM   run-turn.cmd          -> one real turn (needs the Claude CLI)
REM   run-turn.cmd -Mock    -> one dry-run turn (no Claude, proves the wiring)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0loop.ps1" %*
