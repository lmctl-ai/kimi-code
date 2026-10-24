# Fork notes

This repository is a fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)
(MIT License, Copyright (c) 2026 Moonshot AI — see `LICENSE`, unchanged).

**Purpose:** this fork is maintained for use with the
[lmctl-ai/lmctl](https://github.com/lmctl-ai/lmctl) tool, where kimi-code runs as a provider
backend under lmctl.

## Main issue patched: "acp-runtime-after-reap"

When a session's persisted agent runtime binding (e.g. `acp:<sessionId>` from a previous
`kimi acp` lifetime) is restored by a process that never registers that runtime (TUI,
kap-server, headless `-p`), the agent keeps conversing but every tool call and subagent spawn
fails with `runtime <id> does not exist in workspace <id>` — restarting the same non-ACP host
just replays the stale binding, so the wedge persists until the binding is repaired or an ACP
host re-registers and rebinds the runtime.

The fork carries one patch on top of upstream (currently based on upstream **2.3.1**):

- **fix(agent-core-v2): rebind stale agent runtime to local on first use after restore** —
  `AgentRuntimeService.inspect()`/`acquire()`/`isAvailable()` catch `runtime.not_found`,
  rebind the agent to the `local` runtime that TUI/kap-server/headless hosts provide
  (persisting the durable `RuntimeSetBinding` event), and retry once.
  Registered-but-unavailable runtimes never heal; when the `local` fallback is missing (e.g.
  in an ACP host, which registers no `local` runtime) the original error is rethrown with the
  fallback failure attached as `cause`.

The patch is confined to `packages/agent-core-v2/src/agent/runtimeBinding/agentRuntime.ts`
and its test file, and is also offered upstream as a pull request.

Upstream ≥ 2.x separately re-registers and re-binds the ACP runtime on `session/load` /
`session/resume` (`AcpServer.wireSession` → `bindSessionRuntime`), which covers the case of a
session resumed by a fresh `kimi acp` process. The two fixes are complementary: upstream's
covers ACP-host resumes, this patch covers cross-host resumes (an ACP-created session resumed
in a TUI, kap-server, or headless host, where no ACP runtime exists at all).

## Enhancement over upstream: batched delivery of queued prompts

Upstream delivers prompts you send while the agent is working strictly one at a time — each
queued prompt gets its own turn after the current one finishes. This fork instead delivers
every prompt that is queued when a turn ends together in the next turn: the model sees all
queued messages at once (FIFO order, each still a separate user message) and answers them in
a single turn. Prompts sent while the agent is idle behave exactly as upstream. Offered
upstream as [PR #4052](https://github.com/MoonshotAI/kimi-code/pull/4052)
(issue [#4051](https://github.com/MoonshotAI/kimi-code/issues/4051)).

## Installing this fork

Patched binaries are published as GitHub releases on this fork and install with
[lmscript](https://github.com/lmctl-ai/lmctl) (asset `kimi-code-linux-x64`, SHA-256 verified
against the release's `SHA256SUMS`):

```sh
lmscript install github:lmctl-ai/kimi-code@v2.3.1+kimifix.1
```

lmscript verifies the checksum, caches the binary under
`~/.cache/lmscript/tools/github/lmctl-ai/kimi-code/<tag>/`, and prints the cached path; then
install it over your kimi-code binary (back up the stock one first):

```sh
cp ~/.kimi-code/bin/kimi ~/.kimi-code/bin/kimi.stock.bak
cp ~/.cache/lmscript/tools/github/lmctl-ai/kimi-code/v2.3.1+kimifix.1/kimi-code ~/.kimi-code/bin/kimi
```

## Operational note: auto-update

kimi-code auto-update silently replaces a patched binary with the stock release, which
reintroduces the bug fleet-wide (observed 2026-09-20: patched 0.41.0 replaced by stock 2.0.2,
and again 2026-10-24: patched 2.1.1 replaced by stock 2.3.1).
If you run a patched build, disable automatic installs:

```toml
# ~/.kimi-code/tui.toml
[upgrade]
auto_install = false
```
