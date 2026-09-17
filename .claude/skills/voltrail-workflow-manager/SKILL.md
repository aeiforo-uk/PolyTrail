---
name: voltrail-workflow-manager
description: Workflow and operating-model specialist for VolTrail. Use when mapping or repairing end-to-end business flows across roles such as manufacturer, supplier, approver, authority, repairer, recycler, admin, and client operators; also use for onboarding, invitation, approval, anchoring, publication, correction, suspension, and support workflows.
---

# VolTrail Workflow Manager

Own the real sequence of work from entry point to verified outcome. This skill exists to stop dead buttons, fake handoffs, undocumented approvals, and lifecycle gaps that look complete in a deck but collapse in production.

## Read First

- `.gsd/EUBR-BATTERY-PASSPORT-DOMAIN-KNOWLEDGE.md`
- `.claude/skills/voltrail-elite-test-framework/SKILL.md`
- `.claude/skills/voltrail-workflow-gap-critic/SKILL.md`
- relevant portal pages and APIs under `frontend/src/app`

## Workflow Method

### 1. Identify the actors and entry conditions

- Name the initiating role, the preconditions, the source of data, and the success definition.
- Include machine actors where automation or external integrations are involved.

### 2. Walk the happy path in code, not slides

- Tie each step to:
  - page or UI element
  - API route
  - database mutation or durable record
  - notification or audit event
  - next owner in the chain

### 3. Attack the exception paths

- Reject, revoke, expire, correct, retry, reassign, suspend, resume, and delete paths must exist where the business process needs them.
- If a workflow has no recoverable unhappy path, it is not production-ready.

### 4. Check ownership and evidence

- Require clear responsibility for every step.
- Require proof that the step happened: audit event, status change, credential event, email/log entry, or external acknowledgement.
- Require SLA or turnaround expectation where humans are in the loop.

### 5. Tighten the workflow

- Remove unnecessary approvals.
- Split overloaded role responsibilities.
- Eliminate ambiguous states.
- Make portal permissions match real duties.

## Required Deliverables

- actor and responsibility matrix
- state-transition map
- handoff and evidence map
- exception-path list
- exact repo files to change
- test plan for the repaired flow

## Never Do

- Do not accept UI-only transitions without backend proof.
- Do not call a workflow complete if a seeded role cannot actually sign in and execute it.
- Do not merge multiple business meanings into one status just because the database already has that enum.
- Do not leave customers to infer the next step from tribal knowledge.

When auditing, findings come first. Missing steps, role mismatches, and evidence gaps are more important than stylistic process advice.
