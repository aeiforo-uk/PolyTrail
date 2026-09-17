---
name: voltrail-deployer
description: "Production deployment orchestrator for VolTrail. Runs pre-flight checks (TypeScript, ESLint, env var validation against Vercel), deploys via Vercel CLI, and runs post-deploy smoke tests (health, auth, public DPP, API docs). Use this skill whenever deploying to production, checking if a deploy is safe, running smoke tests, or troubleshooting a failed deployment. Also triggers for: 'deploy', 'push to production', 'ship it', 'is it safe to deploy?', 'smoke test', 'post-deploy check', 'why did the deploy fail?', 'check production'."
---

# VolTrail Production Deployer

You are an elite deployment engineer. Your job is to make every deploy safe, fast, and verified. You never deploy blind — you check everything first, deploy with confidence, and verify everything works after.

## Why This Skill Exists

VolTrail deploys to Vercel from the `claude/charming-ramanujan` branch (production) via CLI (`vercel deploy --prod`). Previous deployments have failed because:
- Missing env vars on Vercel (`DEMO_PASSWORD`, `DEMO_MODE` wrong value)
- Env validation in `src/lib/env.ts` throwing at runtime, crashing all API routes
- Wrong `.vercel/project.json` linking to the wrong Vercel project
- Type errors passing local but failing in Vercel's stricter build
- Post-deploy: no one checked if the site actually worked

This skill prevents all of those.

## Architecture Context

- **Framework**: Next.js 15 on Vercel (team: `marklytics`, project: `voltrail`)
- **Project ID**: `prj_y7KxuJ8FJMTFPsP94MAxdkE4XAvA`
- **Org ID**: `team_fomA1P0IQd4LdEW9IGxMY82u`
- **Production URL**: `https://voltrail.vercel.app` (also `voltrail.marklytics.co.uk`)
- **Deploy branch**: `claude/charming-ramanujan` (Vercel CLI deploys from working directory)
- **Auth**: Clerk (primary) + NextAuth (demo credentials fallback)
- **Database**: Neon PostgreSQL (serverless, us-east-1)
- **Required PATH**: `/opt/homebrew/bin` must be in PATH for node/npm/vercel

## The Deploy Process

Run these phases in order. Stop immediately if any phase fails.

### Phase 1: Pre-Flight Checks

Run all checks in parallel where possible. Report results as a table.

```
CHECK 1: Vercel Project Link
- Read `frontend/.vercel/project.json`
- Verify projectId is `prj_y7KxuJ8FJMTFPsP94MAxdkE4XAvA`
- Verify orgId is `team_fomA1P0IQd4LdEW9IGxMY82u`
- If wrong: FIX IT (write the correct values), don't just report

CHECK 2: TypeScript Compilation
- Run: cd frontend && PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
- PASS if 0 errors (warnings are OK)
- FAIL if any errors — show them, do NOT proceed

CHECK 3: ESLint
- Run: cd frontend && PATH="/opt/homebrew/bin:$PATH" npx next lint
- PASS if 0 errors (warnings are OK)
- FAIL if errors — show them

CHECK 4: Git Status
- Run: git status --short
- WARN if uncommitted changes (deploy will use committed code)
- Show the current branch name

CHECK 5: Env Var Validation (THE CRITICAL ONE)
- Run the env-doctor skill or inline check (see below)
- Compare .env.example required vars against what's on Vercel
- This is the check that would have caught today's DEMO_PASSWORD/DEMO_MODE issues
```

**Env Var Validation Detail:**

These env vars MUST exist on Vercel Production (the app crashes without them):
```
NEXTAUTH_SECRET          — session signing (crash if missing)
NEXTAUTH_URL             — auth callback base URL
DATABASE_URL             — Neon connection string
DEMO_MODE                — must be "true" or "false" explicitly
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — Clerk auth (crash on login page)
CLERK_SECRET_KEY         — Clerk server-side auth
```

These env vars SHOULD exist (features degrade without them):
```
DEMO_PASSWORD            — required if DEMO_MODE=true (credentials login fails)
NEXT_PUBLIC_CLERK_SIGN_IN_URL    — defaults to /sign-in if missing
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL — defaults to / if missing
GOOGLE_CLIENT_ID         — Google SSO won't work
GOOGLE_CLIENT_SECRET     — Google SSO won't work
RESEND_API_KEY           — email sending fails silently
```

Check with: `PATH="/opt/homebrew/bin:$PATH" vercel env ls 2>&1`

Parse the output to verify each required var exists for Production environment. If any MUST var is missing, STOP and tell the user to add it before deploying.

### Phase 2: Deploy

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/roshandhanashekeran/VolTrail-Prod/frontend
vercel deploy --prod --yes 2>&1
```

- Capture the full output
- Extract the production URL from the output (line containing "Production: https://...")
- Extract the inspect URL
- If build fails: show the error, identify the root cause, suggest a fix
- Common build failures:
  - Type errors: show the file and line
  - Missing dependencies: suggest `npm install`
  - Env validation throws: the `env.ts` file has runtime checks that can crash the build

### Phase 3: Post-Deploy Smoke Tests

Wait 10 seconds after deploy completes for edge propagation, then run ALL tests:

```
TEST 1: Health Check
- curl -s https://voltrail.vercel.app/api/health/db
- PASS if response contains {"status":"ok"}
- FAIL if 500, redirect, or timeout

TEST 2: Landing Page
- curl -s -o /dev/null -w "%{http_code}" https://voltrail.vercel.app/
- PASS if 200
- FAIL if anything else

TEST 3: Login Page
- curl -s -o /dev/null -w "%{http_code}" https://voltrail.vercel.app/login
- PASS if 200
- FAIL if 500 (indicates env crash)

TEST 4: API Docs (Public)
- curl -s https://voltrail.vercel.app/api/docs | head -100
- PASS if response starts with {"openapi":"3.0
- FAIL if redirect or error

TEST 5: Auth Enforcement
- curl -s -o /dev/null -w "%{http_code}" https://voltrail.vercel.app/api/admin/stats
- PASS if 307 (redirect to login — auth is working)
- FAIL if 200 (auth bypass!) or 500 (crash)

TEST 6: Public DPP (if sample passport exists)
- curl -s -o /dev/null -w "%{http_code}" https://voltrail.vercel.app/p/dpp-0001
- PASS if 200
- SKIP if 404 (no sample data yet)

TEST 7: Custom Domain (if configured)
- curl -s -o /dev/null -w "%{http_code}" https://voltrail.marklytics.co.uk/
- PASS if 200
- SKIP if DNS not configured
```

### Phase 4: Report

Output a clear deployment report:

```
# Deploy Report — VolTrail Production

## Pre-Flight
| Check | Status | Details |
|-------|--------|---------|
| Vercel Link | ✅/❌ | ... |
| TypeScript | ✅/❌ | ... |
| ESLint | ✅/❌ | ... |
| Git Status | ✅/⚠️ | ... |
| Env Vars | ✅/❌ | ... |

## Deployment
- URL: https://voltrail.vercel.app
- Build Time: Xs
- Inspect: <vercel-inspect-url>

## Smoke Tests
| Test | Status | Response |
|------|--------|----------|
| Health | ✅/❌ | ... |
| Landing | ✅/❌ | ... |
| Login | ✅/❌ | ... |
| API Docs | ✅/❌ | ... |
| Auth | ✅/❌ | ... |
| Public DPP | ✅/❌ | ... |

## Verdict: HEALTHY / DEGRADED / BROKEN
```

## Modes

- `/deploy` or "deploy to production" — Full pipeline (pre-flight → deploy → smoke test)
- `/deploy check` or "is it safe to deploy?" — Pre-flight checks only, no deploy
- `/deploy smoke` or "check production" — Smoke tests only against live site
- `/deploy rollback` — Show how to rollback to previous deployment
- `/deploy logs` — Check Vercel runtime logs for errors

## Rollback

If smoke tests fail after deploy:
1. Get the previous deployment ID: `vercel ls voltrail --scope marklytics | head -5`
2. Promote it: `vercel promote <previous-deployment-url> --scope marklytics`
3. Re-run smoke tests to verify rollback worked

## Troubleshooting Common Failures

**Build fails with "[ENV] BLOCKCHAIN_OPERATOR_KEY..."**
→ The `src/lib/env.ts` file has strict validation. Check if any env var validation throws instead of warning. The fix is to make it warn, not throw.

**Login returns 500**
→ Check `DEMO_MODE` value. If `true`, also need `DEMO_PASSWORD` set. Check Vercel runtime logs: `vercel logs <deployment-url> --scope marklytics`

**Health returns redirect instead of JSON**
→ The middleware is blocking `/api/health`. Check `PUBLIC_API_PATHS` in `src/middleware.ts`.

**Auth bypass (admin routes return 200 without auth)**
→ The `isDemoMode()` check is before auth. Verify auth check runs BEFORE demo mode branch in all admin routes.
