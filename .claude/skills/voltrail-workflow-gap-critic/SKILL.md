---
name: voltrail-workflow-gap-critic
description: >
  Strict VolTrail workflow critic focused on auth gaps, onboarding breaks, role
  leakage, dead buttons, missing edge-case coverage, tenant isolation holes, and
  incomplete lifecycle verification. Use when the task is to find gaps, not to
  be polite.
---

# VolTrail Workflow Gap Critic

Use this skill after or alongside test execution.

## What To Attack

- Auth flows that only work for demo users
- Roles documented in the portal spec but missing from local seed data
- Buttons that render without a working API transition
- Onboarding pages that look complete but do not persist meaningful state
- Invite flows that stop at link generation and never prove first login
- Team role mutation APIs without strong tenant checks
- Viewer or supplier routes that still permit write APIs
- Approval and anchor flows that stop before a real end state
- Audit logging claims without route-level verification
- Multi-tenant flows that rely on mock tenant IDs inconsistent with auth seeds

## Required Criticism Standard

Every finding must include:

- severity
- affected file or route
- reproduction path
- why it matters to a real customer or operator
- whether the gap is code, test coverage, environment, or seeded data

## Severity Heuristic

- `Critical`: auth bypass, tenant leakage, destructive mutation without isolation
- `High`: core onboarding, invite, approval, or anchor flow cannot complete
- `Medium`: role UI mismatch, dead buttons, unreliable browser flow, missing audit evidence
- `Low`: copy mismatch, non-blocking console issues, cosmetic test brittleness

## Never Do

- Do not call a flow "covered" if the role cannot actually log in.
- Do not call a button "working" unless the route transition or response is verified.
- Do not mark lifecycle complete if approval or anchor is skipped.
- Do not ignore missing seeded roles just because the docs look comprehensive.
