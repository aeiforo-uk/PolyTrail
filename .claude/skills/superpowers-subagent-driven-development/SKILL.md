---
name: superpowers-subagent-driven-development
description: >
  Multi-agent execution pattern for VolTrail tasks that benefit from parallel codebase discovery,
  browser verification, or non-overlapping implementation work. Use when a task spans auth,
  onboarding, lifecycle, portals, or audit surfaces and should be split into bounded threads.
---

# Superpowers: Subagent-Driven Development

Use this skill when the task is too wide for a single linear pass and there are clear parallel slices.

## Workflow

1. Identify the critical path first.
2. Keep the immediate blocking step local.
3. Spawn at most three subagents unless the task is explicitly broader.
4. Give each subagent a single ownership axis:
   - auth and role model
   - browser and portal verification
   - API and data lifecycle
5. Require file-path citations and concrete blockers from each subagent.
6. Do not wait idly. Keep integrating or preparing the next step while they run.

## VolTrail Defaults

- Prefer one agent for auth and onboarding gaps.
- Prefer one agent for route and role inventory.
- Prefer one agent for existing test coverage and reusable helpers.

## Output

Return:
- confirmed findings
- contradictions between docs and code
- blockers that prevent full lifecycle verification
- the smallest next edit set needed to move the test program forward
