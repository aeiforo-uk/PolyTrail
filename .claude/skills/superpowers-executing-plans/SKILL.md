---
name: superpowers-executing-plans
description: >
  Executes VolTrail plans task by task with evidence capture, incremental verification, and
  blocker reporting. Use after a plan exists and the work should be carried through to execution.
---

# Superpowers: Executing Plans

Execute plans in order, but collapse adjacent low-risk tasks when it shortens feedback loops.

## Execution Rules

- Mark completed work in your working notes as you go.
- Verify after each meaningful edit.
- Prefer the smallest runnable test slice before wider suites.
- Keep failed tasks with a concrete blocker and next action.

## Evidence

Capture:
- command run
- result summary
- failing assertion or observed gap
- affected file or route

## VolTrail Preference

Run in this order:
1. auth and role matrix
2. onboarding and invites
3. passport lifecycle
4. admin, authority, supplier, public viewer
5. audit and integrity checks
