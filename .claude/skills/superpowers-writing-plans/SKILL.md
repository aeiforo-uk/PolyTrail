---
name: superpowers-writing-plans
description: >
  Writes execution-ready VolTrail plans under docs/superpowers/plans with explicit goals, scope,
  test matrix, blockers, and checkbox tasks. Use before large multi-surface work or audits.
---

# Superpowers: Writing Plans

Write plans to `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`.

## Required Sections

- Title
- Goal
- Architecture
- Tech Stack
- Scope
- Test Matrix
- Execution Tasks
- Known Blockers
- Evidence To Capture

## Task Style

- Use `- [ ]` checkboxes.
- Keep each task independently executable.
- Call out destructive or environment-dependent steps explicitly.
- Name affected files or routes when known.

## VolTrail Focus

For portal testing plans, always cover:
- auth and redirect matrix
- onboarding and invite lifecycle
- team role mutation
- passport creation, review, anchor, viewer
- audit logging and export
- tenant isolation negatives
