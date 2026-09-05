# kimifix.lmctl charter — patch the kimi-code acp-runtime-after-reap bug (operator-authorized 2026-09-05)

We have the kimi-code source (~/repos/providers/kimi-code, Moonshot @moonshot-ai/monorepo, apps/kimi-code
0.41.0 = the exact installed/latest product). kimi.lmctl located the bug at SOURCE level. Fix it, build,
and install our own patched kimi locally.

## The bug (located by kimi.lmctl — see ~/repos/lmctl-src/backlog/kimi-runtime-not-recreated-after-reap.md
   + /tmp/kimi-runtime-source-level-root-cause-to-math-lead.md)
- File: `packages/agent-core-v2/src/agent/runtimeBinding/runtimeBindingService.ts`
- Class `AgentRuntimeBindingService`, constructor `restoreHook` (~lines 38-49).
- Symptom: after a reap (WSL/process kill) of a long-lived session, the acp runtime
  (acp:session_<id> in workspace wd_...) is NOT recreated/rebound on restore → every tool/subagent spawn
  fails "runtime ... does not exist in workspace ..."; the member converses but can't act; only a full
  CLI restart fixes it (refresh insufficient). Read both docs for the full root-cause chain first.

## Task
1. Understand the restoreHook / runtime-binding lifecycle; fix it so a reaped/missing workspace runtime is
   RECREATED/REBOUND on demand (on restore or next use) instead of erroring. Clean, minimal, targeted patch.
2. Establish a RELIABLE REPRO (the bug was hard to repro via simple SIGKILL+retry — it manifests in
   long-lived terminal sessions). Find a deterministic repro or a targeted unit/integration test around the
   restoreHook, so the fix is VERIFIABLE, not speculative.
3. BUILD the patched kimi-code (pnpm monorepo; produce the kimi binary — check apps/kimi-code build via
   Makefile/pnpm/flake.nix).
4. INSTALL LOCALLY, CAREFULLY — the kimi binary is FLEET-SHARED (~/.kimi-code/bin/kimi, used by lmmail,
   tools, liqa Leads, etc.): BACK UP the current 0.41.0 binary first, install the patched one, sha256 the
   before/after, and VERIFY EXISTING kimi sessions still resume/work (don't brick the fleet). Keep a
   one-command rollback to the backup.
5. VERIFY the fix end-to-end: repro the reap → confirm the runtime now recreates → tools/subagents spawn
   → no "does not exist" error, WITHOUT a full CLI restart.

## Discipline
Cross-review (author != reviewer). Autonomy: drive to a working, locally-installed, verified patched kimi;
no operator gate. Report the verified result (repro + fix + install + verify) as /tmp/*-to-math-lead.md.
Keep the patch as a clean diff we could also send upstream to Moonshot AI later.
