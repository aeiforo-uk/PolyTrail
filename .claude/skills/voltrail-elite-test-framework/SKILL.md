---
name: voltrail-elite-test-framework
description: >
  Orchestrates rigorous VolTrail testing across auth, onboarding, team invites,
  role gating, passport lifecycle, API contracts, audit evidence, and browser
  interaction. Use for deep QA, regression sweeps, multi-role lifecycle checks,
  portal walkthroughs, and test creation before execution.
---

# VolTrail Elite Test Framework

Use this skill when the task is to verify real platform behavior, not just unit coverage.

## Scope

Cover these lanes in order:

1. `frontend/src/lib/auth/auth-options.ts`
   Confirm which roles have real credentials, demo credentials, or no seeded account.
2. `service-layer/docs/portal-architecture-and-role-based-access.md`
   Use the role and portal matrix as the expected behavior baseline.
3. `service-layer/docs/issuer-onboarding-and-passport-flow.md`
   Use the documented onboarding and approval lifecycle as the expected workflow baseline.
4. `frontend/e2e`
   Prefer targeted Playwright specs over one giant browser script.
5. `frontend/tests/api`
   Add or extend route-level tests for auth, onboarding, team, audit, and lifecycle APIs.
6. `frontend/tests/cirpass/scripts`
   Use these only when the task requires CIRPASS registry or 10-passport demo flows.

## Execution Rules

- Do not assume all roles are seeded locally. Detect missing role credentials first.
- Prefer browser coverage for buttons, navigation, invite links, and state transitions.
- Prefer API tests for authz, tenant isolation, audit logging, and edge cases.
- Use unique test data per run for invites and passports.
- Clean up created users or passports when the route permits it.
- Treat missing seeded users for `AUTHORITY`, `REPAIRER`, or `RECYCLER` as a product gap, not a test excuse.

## Minimum Role Matrix

Try to cover, in this order:

- `PLATFORM_ADMIN`
- `ISSUER_ADMIN`
- `ISSUER_USER`
- `APPROVER`
- `VIEWER`
- `SUPPLIER`
- `AUTHORITY`
- `REPAIRER`
- `RECYCLER`

If a role cannot authenticate, record:

- missing seed account
- missing env vars
- broken redirect
- role exists in docs but not in auth

## Required Lifecycle Lanes

### Lane 1: Auth and portal access

- Login page renders
- Role lands on the correct portal
- Sidebar exposes only role-allowed routes
- Protected API routes reject unauthenticated and forbidden roles

### Lane 2: Onboarding and team administration

- Invite team member
- Open invite link
- Validate onboarding entry screen
- Verify role change, suspension, reactivation, and deletion APIs
- Confirm viewer is read-only

### Lane 3: Passport lifecycle

- Create passport
- Submit for review
- Approver advances to pending anchor
- Manufacturer sees anchor action
- If integrity provider is available, attempt anchor and verify result

### Lane 4: Supplier and audit surfaces

- Data request visibility
- Supplier submission or acceptance path
- Audit trail pages and APIs
- Cross-tenant restrictions

## Output Format

Report:

1. what ran
2. what was blocked
3. evidence-backed failures
4. missing coverage that still needs seeded users, external services, or env
