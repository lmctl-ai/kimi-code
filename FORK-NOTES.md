# Fork notes

This repository is a fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)
(MIT License, Copyright (c) 2026 Moonshot AI — see `LICENSE`, unchanged).

**Purpose:** this fork is maintained for use with the
[lmctl-ai/lmctl](https://github.com/lmctl-ai/lmctl) tool, where kimi-code runs as a provider
backend under lmctl.

It carries one additional patch on top of upstream:

- **fix(agent-core-v2): rebind stale agent runtime to local on first use after restore** —
  fixes the "acp-runtime-after-reap" bug: when a session's persisted agent runtime binding
  (e.g. `acp:<sessionId>` from a previous `kimi acp` lifetime) is restored in a process that
  never registers that runtime (TUI, kap-server, headless `-p` mode), every tool call and
  subagent spawn failed permanently with `runtime <id> does not exist in workspace <id>`
  until a full CLI restart. The agent now rebinds to the always-present `local` runtime on
  first use after restore and persists the healed binding.

The patch is confined to `packages/agent-core-v2/src/agent/runtimeBinding/agentRuntime.ts`
and its test file, and is also offered upstream as a pull request.
