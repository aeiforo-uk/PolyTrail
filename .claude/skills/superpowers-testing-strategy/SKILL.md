---
name: superpowers-testing-strategy
description: >
  Builds an elite VolTrail test strategy across browser, API, auth, onboarding, lifecycle,
  multi-tenant isolation, and audit integrity. Use when the goal is broad portal confidence rather
  than a narrow bug fix.
---

# Superpowers: Testing Strategy

Design the test program in layers.

## Layers

1. Smoke: can each portal load without console, network, or auth failures?
2. Role access: can each role land on the correct portal and get blocked from forbidden routes?
3. Lifecycle: onboarding, invite, passport create, review, anchor, public view.
4. Collaboration: supplier requests, approver workflow, admin visibility.
5. Integrity: audit events, export, verification, tenant isolation, anchor metadata.

## Rules

- Prefer unique test data per run.
- Reuse seeded demo identities when available.
- Separate environment blockers from product failures.
- Treat docs/code drift as a test finding, not a footnote.
- Capture negative paths, not just happy paths.

## VolTrail High-Risk Areas

- hybrid Clerk and NextAuth behavior
- invite linking and temp-password activation
- role enum drift between docs, TS, and DB
- onboarding pages that simulate workflows without backend state machines
- anchor and audit features that look real in UI but derive from mock or list data
