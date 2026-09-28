# kimifix durable memory — team state

## Mission (charter: PATCH-CHARTER.md, operator-authorized 2026-09-05)
Patch kimi-code acp-runtime-after-reap bug, build, install patched kimi locally with fleet-safe
backup/rollback, verify end-to-end, report to math.lmctl (/home/mma/repos/egtry-books-math/math.lmctl).

## Root cause (confirmed by Lead code read)
- packages/agent-core-v2/src/agent/runtimeBinding/runtimeBindingService.ts restoreHook else-branch
  reinstates a replayed stale runtime binding without validation. RuntimeRegistry is per-process
  in-memory. A session last driven via `kimi acp` persists binding `acp:<sessionId>`; resumed in a
  host without the acp provider (TUI / kap-server / headless `-p`), every IAgentRuntimeService
  acquire/inspect throws "runtime acp:session_<id> does not exist in workspace wd_...". Main agent
  converses (model calls need no runtime) but all tools/subagent spawns die. Refresh keeps the same
  session id -> replayed forever.
- Restore-time acquire is NOT a valid fix: in the acp flow, restore runs BEFORE
  bindSessionRuntime registers the acp runtime (packages/acp-server/src/server.ts wireSession,
  src/start.ts bindSessionRuntime).

## Agreed fix design (Lead spec, /tmp/kimifix-coder-task-1.md)
Lazy heal at point of use in packages/agent-core-v2/src/agent/runtimeBinding/agentRuntime.ts
(AgentRuntimeService.inspect/acquire): on RuntimeError code 'runtime.not_found', rebind via
this.binding.set({workspaceId, runtimeId: 'local'}) and retry once; rethrow original if already
'local' or set() throws. isAvailable() stays PASSIVE (toolActivation probes it pre-bind in the ACP
flow — healing there would flip healthy agents). binding.set persists via durable RuntimeSetBinding.
NO comments in agent-core-v2 (comment-free zone). Tests added to existing
packages/agent-core-v2/test/agent/runtimeBinding/runtimeBindingService.test.ts (simulate restore via
captured onDidRestore hook + state.set(runtimeBindingKey, stale acp binding)).

## Roster status (ping 2026-09-05)
- Coder (codex): reachable, tasked with implementation (task /tmp/kimifix-coder-task-1.md).
- Reviewer1 (codex): reachable, standby.
- Reviewer2 (claude): STANDS DOWN — suspects prompt injection, wants direct operator confirmation in
  its own session. Do not task it; cross-review covered by Reviewer1 + Reviewer3.
- Reviewer3 (agy): reachable, standby.

## Environment facts
- Repo: /home/mma/repos/providers/kimi-code, branch main, node v24.18.0, pnpm 10.33.0 (corepack).
- Installed fleet binary: ~/.kimi-code/bin/kimi = native SEA ELF ~183MB, v0.41.0.
- Build: root `pnpm build` -> apps/kimi-code `tsdown` + native SEA scripts
  (apps/kimi-code/scripts/native/build.mjs, profiles local/release; `build:native:sea` script).
- Headless scriptable paths: `kimi -S <id> -p "prompt"` (local host, no acp provider),
  `kimi acp` (ACP over stdio; lmctl chat spawns this per turn).
- lmctl teamfile: /home/mma/repos/providers/kimi-code/kimifix.lmctl (untracked, do not commit).

## Plan / status
1. [running] Coder implements patch+tests.
2. Cross-review Reviewer1 + Reviewer3 on git diff.
3. Lead: commit in small units, build (pnpm install running first), e2e repro old vs patched
   (acp-created session resumed via -S/-p headless), backup ~/.kimi-code/bin/kimi + sha256 +
   rollback script, install, verify existing sessions resume.
4. Report READY to math.lmctl: /tmp/kimifix-result-to-math-lead.md.

## Progress log (2026-09-05, Lead)
- Coder task-1 DONE: heal in inspect/acquire + 4 tests, 14/14 pass, typecheck+lint clean.
- E2E "before" REPRO against fleet binary 0.41.0 (deterministic, new method):
  1. `node /tmp/kimifix-e2e/acp-drive.mjs ~/.kimi-code/bin/kimi /tmp/kimifix-e2e/ws "<prompt>"` creates
     ACP session (driver uses @agentclientprotocol/sdk from repo node_modules).
     Session: session_d30e3476-110e-435c-88c0-3fe8ebca9c96, workspace wd_ws_c629fc78df75.
  2. Resume headless: `cd /tmp/kimifix-e2e/ws && kimi -S <id> -p "<prompt>"` (NOTE: -p cannot combine
     with --auto; -p takes the NEXT arg as value, mind flag order).
  OLD binary behavior: (a) Bash tool entirely ABSENT from toolset (toolActivation gates on
  isAvailable=false from stale acp binding); (b) AgentSwarm spawn fails with EXACT fleet error:
  "runtime acp:session_d30e3476-110e-435c-88c0-3fe8ebca9c96 does not exist in workspace wd_ws_c629fc78df75".
- KEY FINDING: passive isAvailable = deadlock (no acquire ever fires -> heal never triggers).
  Fix extended (Coder task-2): isAvailable heals too (via healing inspect). Safe in ACP flow:
  transient local flip pre-bind, bindSessionRuntime switch() re-asserts acp right after.
- Reviewer3 review (round 1): REQUEST-CHANGES — #2/#3/#6 = the isAvailable deadlock (already task-2);
  #1 (restrict heal to acp:-prefix) REJECTED by Lead (layering; unavailable never heals; switch()
  re-asserts); #4 snapshot-heals trade-off accepted; #5 attach set() failure as error cause (minor, in task-2).
- Reviewer1 turn ERRORED: provider model issue ("gpt-5.4 not supported with ChatGPT account"). Re-dispatch on final diff.
- Reviewer2: stands down (wants direct operator confirmation). Not blocking.
- Build: `pnpm run build` OK (apps/kimi-code/dist/main.mjs 19.11MB includes patch).
  Patched-dist smoke: resume still lacks Bash (confirms deadlock finding) -> task-2 required.
- Native binary: `pnpm -C apps/kimi-code build:native:sea` (profile local) ->
  apps/kimi-code/dist-native/bin/linux-x64/kimi. Requires node >=24.15 (have 24.18).
- Rollback script ready: ~/.kimi-code/kimi-rollback-0.41.0.sh (restores ~/.kimi-code/bin/kimi.0.41.0.bak).

## COMPLETE (2026-09-05)
- Commit 8cb31d9e4 on main (2 files, upstream-ready). Reviewer3 APPROVE round 2.
- Native SEA built: apps/kimi-code/dist-native/bin/linux-x64/kimi.
- INSTALLED to ~/.kimi-code/bin/kimi via atomic temp+mv. sha256 patched=1c2e10bfaa82e57cb439dd69eb1e5b77b472c43a8f9091150811e0ac9afe624f.
- Backup: ~/.kimi-code/bin/kimi.0.41.0.bak sha256=5031a83b21fd3792cb43ea3f4a7eb590d6f10db6043b16c814bb15bccfb89147.
- Rollback: ~/.kimi-code/kimi-rollback-0.41.0.sh (temp+mv, ETXTBSY-safe).
- Verified post-install: old-binary session resumes+Bash OK; stale ACP session spawns subagent (PONG);
  lmctl chat fleet path OK (Reviewer3 turn on patched binary).
- Report: /tmp/kimifix-result-to-math-lead.md. E2E harness: /tmp/kimifix-e2e/ (acp-drive.mjs, ws/).

## PUBLISHED (2026-09-05, operator-authorized via math.lmctl)
- Public fork: https://github.com/lmctl-ai/kimi-code (public, default main; history = upstream
  f9ca33376 + fix f138db36e + FORK-NOTES 22a1f20ba; NO charter/team files; LICENSE intact).
- Upstream: issue https://github.com/MoonshotAI/kimi-code/issues/3562 + PR
  https://github.com/MoonshotAI/kimi-code/pull/3563 (OPEN; awaits maintainer /approve on the issue
  per upstream external-PR policy). Branch mike-lmctl:upstream-pr/acp-runtime-fix (+changeset).
- Report: /tmp/kimifix-publish-to-math-lead.md (delivery to math.lmctl retrying — Lead terminal-held).

## PUBLISH ADDENDUM #2841 DONE (2026-09-05)
- lmctl-ai/kimi-code description updated to lmctl-purpose wording; FORK-NOTES.md states the fork is
  maintained for use with lmctl-ai/lmctl (commit abe8974ca on public main). MIT/(c) Moonshot AI intact.
- Upstream PR #3563 left bug-focused per instruction.
- Report: /tmp/kimifix-addendum-to-math-lead.md (delivery retrying — math Lead terminal-held).

## UPSTREAM TRIAGE (2026-09-07, math addendum re PR #3563 / third-party PR #3589)
- Verdict: #3589 (fileHistory late captures) does NOT conflict with #3563 — disjoint files, merge-tree
  clean vs current upstream main (27 commits drifted; only trivial 1-line test-helper change overlaps),
  no touch of the runtime-rebind path. Complementary, if anything.
- #3563 still OPEN + MERGEABLE. Issue #3562 zero maintainer comments (filed Sat 2026-09-05).
- Decision: (a) patience — no nudge before 2026-09-12; then ONE polite comment on #3562 (welcome? +
  #3588/#3589 kinship). One-shot cron 01M1Y6CGYBN3R6PN8MWG701Z0T fires 2026-09-12 09:23 local to do it.
- Report: /tmp/kimifix-triage-to-math-lead.md (delivery retrying — math Lead terminal-held).

## STAND-DOWN (2026-09-07, operator decision via math.lmctl — supersedes triage #3438)
- PR #3563 / issue #3562: fire-and-forget. NO nudge, NO #3589 cross-reference, NO rebase-checks.
- The 2026-09-12 nudge cron was DELETED (01M1Y6CGYBN3R6PN8MWG701Z0T).
- Only re-engage trigger: a maintainer DIRECTLY comments on #3563 asking us something.
- Our patched binary + lmctl-ai/kimi-code fork remain the deliverable of record.

## AUTOPILOT CHECK-IN SWEEP (2026-09-12)
- Fresh verification: local main @ 8cb31d9e4; installed binary sha256 1c2e10bf…624f (patched, 0.41.0);
  runtimeBinding suite 14/14 pass; lmctl-ai/kimi-code public/main/clean; PR #3563 OPEN+MERGEABLE;
  0 cron jobs; no delegated work in flight (Coder/Reviewer tasks all completed earlier).
- Consolidated report /tmp/kimifix-consolidated-to-math-lead.md — delivery bounced again (math Lead
  terminal-held since 2026-09-09). No further retry loops; stand-down order says close out.
- Note: lmctl warned state.db v59 > build v58 (cosmetic; update lmctl when convenient).

## .npmrc HYGIENE TASK (2026-09-15, math meta-lead) — NOT APPLIED, reported
- No .mcp.json anywhere in repo. .npmrc content: auto-install-peers/engine-strict/strict-peer-dependencies
  only, 0 credential patterns — but it is UPSTREAM-tracked (origin/main); untracking would diverge the
  clean fork for zero credential benefit. Recommendation sent: keep tracked unless math overrides.
  Report: /tmp/kimifix-npmrc-to-math-lead.md

## .npmrc ITEM CLOSED (2026-09-16, operator)
- Operator confirmed false positive: .npmrc stays tracked (build-correctness pnpm flags, no secrets,
  upstream-owned). Nine-item remediation set fully discharged (8 real + this 1 false positive).
- kimifix PARKED: no open items. Re-engage triggers on record: (1) maintainer directly comments on
  upstream PR #3563; (2) new tasking via math.lmctl/operator.

## FLEET RECOVERY STAGED (2026-09-24)
- Root cause of the renewed fleet wedge: the patched 0.41.0 binary was replaced by the stock native
  auto-update to 2.0.2 on 2026-09-20. Installed `~/.kimi-code/bin/kimi` sha256 is
  `364a737a11334ed5fd13c852116af91673bbc6c11298c2ddf54204f4edd1e220`; update state records the
  successful 2.0.2 install. lmctl launches this binary as `kimi acp`; it does not embed node-sdk.
- Automatic installation is disabled persistently in `~/.kimi-code/tui.toml` with
  `[upgrade] auto_install = false`. Stock 2.0.2 source confirms this gates background installs and
  startup swaps of automatically staged payloads. Manual upgrades remain available.
- The handover's 0.48.1 target does not exist upstream. Official versions jump from 0.43.1 to 2.0.0.
  Current upstream main is 2.1.1 (`be7d5f5fe`). Branch `kimifix/rebase-2.1.1` cherry-picks the fix as
  `bf8b9909e`; its diff from origin/main contains only agentRuntime.ts and the existing runtime-binding
  test file. Upstream ACP session load/resume re-registration remains intact.
- Verification: runtime-binding suite 14/14; agent-core-v2 typecheck; comment-free guard (1740 files);
  focused oxlint (0 warnings/errors); ACP lifecycle/e2e-turn suites 40/40; git diff check all pass.
- Native SEA rebuilt with Node 24.18.0 and passed native smoke. Staged artifact:
  `~/.kimi-code/bin/kimi.2.1.1-kimifix`, version 2.1.1, sha256
  `3d00d5e2678a7956de6c8246e077e8644021371fd01e2d86d86b50a6b7766267`.
- Current stock backup: `~/.kimi-code/bin/kimi.2.0.2.stock.bak` with matching installed sha256.
  Rollback script: `~/.kimi-code/kimi-rollback-2.0.2.sh` (syntax checked; not executed).
- Real staged-binary E2E passed: ACP-created session resumed headlessly and executed Bash
  (`KIMIFIX_RUNTIME_OK`); the same session loaded through a fresh ACP process, then resumed headlessly
  and executed Bash again (`KIMIFIX_RELOAD_OK`). `kimi-code/k3` resolved in both flows.
- LIVE INSTALL PENDING: active lmctl/Kimi processes still map `~/.kimi-code/bin/kimi`; per the safety
  gate, the live path was not replaced. Stop/restart all Kimi ACP children, atomically install the
  staged artifact, then verify existing fleet sessions. Do not commit durable-memory or lmctl files.

## LIVE INSTALL COMPLETE (2026-09-24)
- Operator confirmed all Kimi sessions exited. A `/proc/*/exe` preflight found no process executing
  the live binary.
- Atomically installed the staged artifact via verified temporary sibling + rename.
- Live `~/.kimi-code/bin/kimi` now reports 2.1.1 with sha256
  `3d00d5e2678a7956de6c8246e077e8644021371fd01e2d86d86b50a6b7766267`.
- Automatic installation remains disabled. Stock 2.0.2 backup and rollback script remain intact.


## 2026-09-23/24 — fleet-wide wedge, root cause = auto-update; fix re-based to 2.1.1 and installed

SUPERSEDES the "installed fleet binary v0.41.0" facts above.

### What happened
- ~2026-09-23 all lmctl-driven kimi sessions fleet-wide wedged: converse OK, every tool call fails
  "runtime acp:session_<id> does not exist in workspace wd_<id>". kimifix Lead session
  (session_a6f3b09d) and refact-kimi Lead (session_8259736a) both live-hit it.
- Lead diagnosis (remote, via WebSearch/FetchURL — own tools were dead):
  1. Our heal rebinds to runtime `local`, but `bootstrap()` registers NO runtime providers and the
     ACP host (packages/acp-server/src/start.ts) registers ONLY AcpRuntimeProviderFactory — an
     ACP-host workspace has no `local` runtime, so our patch CANNOT heal a wedge inside `kimi acp`
     (heal -> set('local') -> pre-acquire throws not_found -> original error rethrown).
  2. Current upstream acp-server re-registers + re-binds the acp runtime on session/load|resume
     (AcpServer.wireSession -> bindSessionRuntime -> AcpRuntimeProviderFactory.bindSession +
     IAgentRuntimeBindingService.switch) — the proper fix for lmctl's serving mode.
- Ground truth found by Coder (operator-dispatched 2026-09-24): kimi AUTO-UPDATE replaced the
  patched 0.41.0 binary with stock 2.0.2 on 2026-09-20 -> no heal anywhere -> fleet wedged on next
  resumes. lmctl launches `~/.kimi-code/bin/kimi acp` directly (no embedded node-sdk copy).
  Containment: `[upgrade] auto_install = false` in ~/.kimi-code/tui.toml (stock-supported).
  Note: requested target "0.48.1" did not exist; upstream tags jump 0.43.1 -> 2.0.0.

### Current state (verified by Lead after operator restart 2026-09-24)
- Branch `kimifix/rebase-2.1.1` = origin/main @ 2.1.1 (be7d5f5fe) + ONE commit bf8b9909e = our
  2-file heal patch (agentRuntime.ts +29/-5, runtimeBindingService.test.ts +98), git identity
  Mike Ma <mike.ma@lmctl.com>. Working tree clean except untracked internal ops files (correct).
- Installed fleet binary: ~/.kimi-code/bin/kimi = 2.1.1-kimifix, sha256
  3d00d5e2678a7956de6c8246e077e8644021371fd01e2d86d86b50a6b7766267 (atomic temp+mv install).
- Rollback: stock 2.0.2 backup ~/.kimi-code/bin/kimi.2.0.2.stock.bak (sha 364a737a...) + script
  ~/.kimi-code/kimi-rollback-2.0.2.sh. Older 0.41.0 backup/rollback still on disk.
- Lead verification: own wedged session recovered on first post-install turn (ACP resume re-bind —
  repro path (b) live-verified, history intact); runtimeBinding vitest 14/14 re-run by Lead;
  Coder's pre-install checks: ACP suites 40/40, typecheck, lint, comment-free guard 1740 files,
  native smoke, real ACP->headless-resume Bash KIMIFIX_RUNTIME_OK, fresh ACP load ->
  headless-resume KIMIFIX_RELOAD_OK, model kimi-code/k3 resolves.
- refact-kimi Lead session: lmctl status shows idle/no-mail after restart (serving infra healthy).
- Cross-review of the rebase diff dispatched to Reviewer3 (agy) 2026-09-24 (author=Coder).
- Upstream PR #3563 / issue #3563: still fire-and-forget per 2026-09-07 stand-down; upstream main
  does NOT contain our heal, so the patch remains necessary for the cross-host half. Rebase of the
  PR branch onto 2.1.1 is possible later but ONLY with operator sign-off.

### Lessons / watch items
- kimi auto-update will silently replace a patched fleet binary. `auto_install = false` is now
  set; after ANY manual future upgrade, re-apply the patch or confirm upstream merged #3563.
- durable-memory/kimifix-status.md could not be updated while Lead was wedged (tools dead);
  the full handover lived in the operator-relayed message and /tmp/kimifix-handover (operator copy).


## 2026-09-24 (2) — operator follow-ups: docs, fork push

- Auto-upgrade disable VERIFIED in place: `~/.kimi-code/tui.toml` has `[upgrade] auto_install = false`;
  no upgrade keys in config.toml; installed binary still 2.1.1-kimifix (sha 3d00d5e2...).
- Docs for the public fork on branch `kimifix/fork-main-2.1.1` (= kimifix/rebase-2.1.1 + one docs commit
  b8ad55cc8): README.md fork-notice section naming the main issue (acp-runtime-after-reap: symptom,
  one-paragraph root cause, patch location, PR reference) + the auto-update operational note;
  FORK-NOTES.md rewritten for the 2.1.1 base (issue description, patch summary, upstream-vs-ours
  split: upstream>=2.x re-binds ACP runtime on session load/resume, our heal covers cross-host resumes,
  auto-update lesson).
- Reviewer3 (agy) APPROVEd the rebase commit bf8b9909e earlier today (byte-for-byte agentRuntime.ts,
  14/14 tests, comment-free guard OK, single clean commit, no internal files).
- durable-memory/ stays UNTRACKED from any public branch; committed only to local main.

- PUSHED: public fork https://github.com/lmctl-ai/kimi-code main is now 1fe822718 (upstream 2.1.1 +
  fix bf8b9909e + docs). Verified via gh api: public, default_branch main, description intact,
  FORK-NOTES.md present, durable-memory/ absent (no internal leak). Coder reviewed docs pre-push:
  CHANGES-REQUESTED (two accuracy fixes: cross-host wedge is NOT fixed by restarting the same
  non-ACP host; `local` runtime exists only in TUI/kap-server/headless hosts) — both applied and
  amended before push. Local internal durable-memory committed on local main only.

## 2026-09-24 (3) — upstream watch: external repro, still no maintainer
- PR #3563: open, no human feedback (only changeset-bot + codex-connector bots from 2026-09-05).
- Issue #3562: first-ever comment today from EXTERNAL user MaxjoyMa (not a maintainer) — reproduces
  on stock CLI 2.1.0 macOS, mid-session variant (turns 49-52 die at first tool call; restarts did
  NOT recover); "looking forward to #3563 landing". Note: that mid-session ACP-host reap variant is
  likely NOT covered by our heal (no `local` in ACP hosts) nor by 2.1.0's resume re-bind.
- Operator decision 2026-09-24: NO action — no maintainer feedback, stand-down (2026-09-07) holds.
  No comments, no PR rebase, no scope extension. Re-engage trigger unchanged: a maintainer directly
  comments on #3563.

## 2026-09-25 — teamfile leak-proofing (math request)
- Added `*.lmctl` + `*.lmctl.*` to `.git/info/exclude` (local-only, no upstream-facing .gitignore
  diff; the `*.lmctl.*` pattern catches derived backups like kimifix.lmctl.bak.1788642003).
  Verified: `git status --short` empty on the fork branch, `git check-ignore -v` matches both files.
  Applies repo-wide regardless of checked-out branch. (Internal main also carries the .gitignore
  variant from the earlier fleet hygiene sweep, b40a66399/eec... — harmless overlap.)

## 2026-09-27 — Enhancement: batched delivery of queued prompts (operator tasking)

Operator request: harness used to deliver queued prompts strictly one turn each (FIFO); enhancement =
when a turn ends with n prompts queued, deliver ALL of them to the model at once in the next turn.

- Design by Lead: machine-level batch drain (gate whole queue snapshot sequentially, per-item
  block/fail/rewrite, arrivals during gating re-gated), engine passes `entries`, loopService binds
  secondary waiters to the shared turn (batched map, mirrors `steered` precedent).
- Author: Coder (codex). Cross-review: Reviewer3 (agy) — REQUEST-CHANGES, 5 findings. Fixed: (1) waiter
  leak when batch head cancelled pre-bind (live-entry promotion to primary, both bind sites), (3) gating
  onError infinite ready<->gating loop (now emits prompt.gate_failed per item + clears queue), (4)
  drainBatch=[] poisoning (undefined instead). Pre-existing, not fixed: (2) notifications-vs-prompt
  ordering inversion context vs store history (base had it), (5) re-submit race history duplication
  (base had it for 1 entry; now n; needs journal dedup, out of scope).
- Verify: focused 142 tests pass (Lead re-ran), full agent-core-v2 suite 6,878 pass / 2 skipped,
  typecheck + root lint + comment guard (1,740 files) + diff-check clean.
- Commits on kimifix/fork-main-2.1.1: 76ad98034 (feat + changeset), 6dd98df61 (README fork-notice
  paragraph). Pushed to lmctl-ai/kimi-code main (= 6dd98df61, public, default branch main).
- NOTE: first native rebuild raced the durable-memory branch dance (Lead checked out main mid-build);
  binary discarded, clean rebuild on the correct branch required before install.

Install follow-up (2026-09-27): clean rebuild on kimifix/fork-main-2.1.1 @ 6dd98df61 (first build
raced the branch dance — discarded). Fleet binary ~/.kimi-code/bin/kimi = 2.1.1-kimifix+batch, sha256
496cc96663d5b1d541e4c8ca35a6e25287dde3348ed87fdcf150f9a58b057e33 (staged as kimi.2.1.1-kimifix.2).
Enhancement markers verified in SEA blob. Rollback: ~/.kimi-code/kimi-rollback-2.1.1-kimifix.sh
(restores 3d00d5e2...). Smoke: --version + headless KIMIFIX_BATCH_OK pass. Report:
/tmp/kimifix-batch-drain-to-math-lead.md. Team back to standby-as-service.

Upstream PR for the batch-drain enhancement (2026-09-27, operator tasking): branch
kimifix/batch-queued-prompts-upstream = origin/main (be7d5f5fe, no drift) + cherry-pick 7aaef76ef,
pushed to mike-lmctl fork; issue #4051 + PR #4052 filed on MoonshotAI/kimi-code. NOTE: upstream
accepts external PRs for approved bug fixes only — feature PRs need maintainer /approve on the issue;
PR body acknowledges this (reference implementation, fire-and-forget like #3563). README fork notice
now links PR #3563 (acp-runtime fix) and PR #4052 (batch delivery); docs commit 8170e0d69, fork
main = 8170e0d69. Re-engage trigger unchanged: only a maintainer directly commenting on our PRs.

Operator doctrine (2026-09-27): the fork IS the deliverable. Upstream PRs (#3563, #4052, any future
ones) are filed as courtesy/reference for US, not for them — we move on regardless of acceptance.
Upstream's feature-PR policy, closures without review, or silence need no response and no triage.
Re-engage ONLY on a maintainer directly commenting on one of our PRs/issues.
