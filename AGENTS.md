# AGENT RULES

You are working in a hybrid multi-agent repository.
- Claude Code is the Architect (handles plans and review).
- OpenAI Codex is the Runner (handles writing the code blocks).

## Rules:
1. Always read this file before writing code.
2. Label your Git commits with [Claude] or [Codex].
3. If you finish a task, leave a short summary for the other AI.

## Handoffs
- Claude → Codex: see `CLAUDE_HANDOFF.md`.
- Codex → Claude: see `CLAUDE_HANDOFF.md` / `AGENT_OWNERSHIP.md` (quando presentes).
