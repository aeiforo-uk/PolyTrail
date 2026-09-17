---
name: voltrail-env-doctor
description: "Environment variable auditor for VolTrail. Compares .env.example against what's actually configured on Vercel (production + preview), flags missing vars, dangerous defaults, and value mismatches. Use this skill whenever checking env vars, debugging 'undefined' errors in production, before deploying, after adding new features that need env vars, or when something works locally but breaks on Vercel. Also triggers for: 'env check', 'why is production broken', 'missing env var', 'check environment', 'env diff', 'what env vars do I need?', 'Vercel env', 'env audit'."
---

# VolTrail Environment Doctor

You are an environment variable specialist. You know every env var VolTrail needs, what happens when each is missing, and how to fix misconfigurations. Your job is to diagnose and fix env-related failures before they reach production.

## Why This Skill Exists

VolTrail has 30+ environment variables across auth, database, blockchain, CIRPASS, and feature flags. The most common production failures come from:
- Env var exists locally but not on Vercel
- Env var exists on Vercel but has the wrong value
- New feature added env var to `.env.example` but nobody added it to Vercel
- `src/lib/env.ts` validation throws at runtime, crashing the entire app
- `DEMO_MODE` semantics changed (was `!== 'false'`, now `=== 'true'`) and production got the wrong value

This skill catches all of these.

## How to Run the Audit

### Step 1: Gather Data (3 sources)

**Source A: What the code expects** — Parse `frontend/.env.example` and `frontend/src/lib/env.ts`
```bash
# All vars declared in .env.example
grep -E "^[A-Z_]+=" frontend/.env.example | sed 's/=.*//' | sort

# All vars accessed in env.ts (the runtime validation layer)
grep -oE "process\.env\.[A-Z_]+" frontend/src/lib/env.ts | sed 's/process.env.//' | sort -u

# Any vars that THROW if missing (the dangerous ones)
grep -B2 "throw new Error.*ENV" frontend/src/lib/env.ts
```

**Source B: What Vercel has** — Query both production and preview environments
```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/roshandhanashekeran/VolTrail-Prod/frontend
vercel env ls 2>&1
```

Parse the output into a structured map: `{ varName: { environments: ['Production', 'Preview'], addedDate } }`

**Source C: What's set locally** — Check `.env.local`
```bash
grep -E "^[A-Z_]+" frontend/.env.local | sed 's/=.*//' | sort
```

### Step 2: Classify Every Variable

For each env var found in any source, classify it:

#### Tier 1: CRITICAL (app crashes without these)
The app won't start or auth won't work at all. These are vars where `env.ts` throws or the auth system fails.

| Variable | Why Critical | What Breaks |
|----------|-------------|-------------|
| `NEXTAUTH_SECRET` | JWT signing | All sessions invalid, 500 on every auth route |
| `NEXTAUTH_URL` | Auth callback base | Login redirects fail |
| `DATABASE_URL` | Neon connection | All DB queries fail with connection error |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend | Login page crashes, blank auth UI |
| `CLERK_SECRET_KEY` | Clerk server | Middleware auth fails, all Clerk users locked out |

#### Tier 2: HIGH (major features break)
The app loads but key features don't work.

| Variable | Why High | What Breaks |
|----------|---------|-------------|
| `DEMO_MODE` | Controls demo vs production behavior | If wrong value: mock data in production or no demo login |
| `DEMO_PASSWORD` | Required when DEMO_MODE=true | Credentials login returns "Invalid password" |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google SSO | "Continue with Google" button fails |
| `AZURE_AD_CLIENT_ID` + `AZURE_AD_CLIENT_SECRET` | Microsoft SSO | "Continue with Microsoft" button fails |
| `RESEND_API_KEY` | Email sending | Invite emails, password resets silently fail |

#### Tier 3: MEDIUM (features degrade gracefully)
Feature is missing but app still works.

| Variable | What Degrades |
|----------|--------------|
| `BLOCKCHAIN_RPC_URL` | Anchoring unavailable (falls back to DB-only) |
| `BLOCKCHAIN_OPERATOR_KEY` | Anchoring unavailable (warns, doesn't crash) |
| `SENTRY_DSN` | No error tracking |
| `EU_REGISTRY_URL` | EU Registry integration unavailable |
| `DPP_VALIDATOR_URL` | DPP validation unavailable |
| `CIRPASS_KEYCLOAK_URL` | CIRPASS auto-token refresh unavailable |
| `PUBLIC_DPP_BASE_URL` | Public DPP links may use wrong base URL |

#### Tier 4: LOW (optional / dev-only)
These are nice-to-have or local development only.

| Variable | Purpose |
|----------|---------|
| `STORAGE_SERVICE_URL` | Microservice URLs (unused in monolith mode) |
| `IDENTITY_SERVICE_URL` | Microservice URLs (unused in monolith mode) |
| `CREDENTIAL_SERVICE_URL` | Microservice URLs (unused in monolith mode) |
| `ANCHOR_SERVICE_URL` | Microservice URLs (unused in monolith mode) |
| `CORS_ALLOWED_ORIGINS` | CORS config (defaults to open in dev) |
| `E2E_*` | Playwright test credentials (local only) |

### Step 3: Compare and Report

Generate a diff table showing what's expected vs what's configured:

```
# VolTrail Env Doctor Report

## Production Environment

### 🔴 CRITICAL — Missing (will crash)
| Variable | Expected | Vercel Status | Fix |
|----------|----------|---------------|-----|
| CLERK_SECRET_KEY | Required | ❌ MISSING | vercel env add CLERK_SECRET_KEY production |

### 🟡 HIGH — Missing (features broken)
| Variable | Expected | Vercel Status | Impact |
|----------|----------|---------------|--------|
| DEMO_PASSWORD | Required when DEMO_MODE=true | ❌ MISSING | Credentials login fails |

### 🟢 OK — All set
| Variable | Vercel Status |
|----------|---------------|
| DATABASE_URL | ✅ Production |
| NEXTAUTH_SECRET | ✅ Production |

### ⚠️ WARNINGS
| Warning | Detail |
|---------|--------|
| DEMO_MODE value | Verify it's "true" (not "false" or empty) if you want demo logins |
| NEXTAUTH_SECRET | Check it's not the dev default "voltrail-dev-secret-change-in-production" |

## Preview Environment
[Same format]

## Local vs Vercel Diff
| Variable | Local | Vercel Prod | Vercel Preview | Status |
|----------|-------|-------------|----------------|--------|
| DEMO_MODE | true | true | true | ✅ |
| DATABASE_URL | set | set | set | ✅ |
| SENTRY_DSN | not set | not set | not set | ℹ️ Optional |
```

### Step 4: Auto-Fix Suggestions

For every missing or wrong variable, provide the exact `vercel env add` command:

```bash
# Fix missing DEMO_PASSWORD on production
echo "<redacted-rotated-credential>" | vercel env add DEMO_PASSWORD production

# Fix missing Clerk keys on production
echo "pk_test_..." | vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
echo "sk_test_..." | vercel env add CLERK_SECRET_KEY production
```

If the user confirms, execute the fixes directly.

## Modes

- `/env-doctor` or "check env vars" — Full audit (all 3 sources, all tiers)
- `/env-doctor prod` — Production environment only
- `/env-doctor preview` — Preview environment only
- `/env-doctor diff` — Show local vs Vercel differences
- `/env-doctor fix` — Auto-fix all missing vars (asks for confirmation)
- `/env-doctor <VAR_NAME>` — Deep-dive into a specific variable

## Special Checks

### DEMO_MODE Semantics Check
The `isDemoMode()` function in `src/lib/api-mode.ts` returns `process.env.DEMO_MODE === 'true'`. This means:
- `"true"` → demo mode ON
- `"false"` → demo mode OFF
- `undefined` (not set) → demo mode OFF
- Any other value → demo mode OFF

If DEMO_MODE is set to `"false"` but the user expects demo logins to work, flag this explicitly.

### Env Validation Crash Detection
Read `src/lib/env.ts` and find any `throw new Error` statements. For each:
- Check if the env var it requires exists on Vercel
- If not, this WILL crash the app at runtime on the first request that imports `env.ts`
- Flag as CRITICAL with exact fix

### NEXT_PUBLIC_ Prefix Check
Variables starting with `NEXT_PUBLIC_` are embedded into the client-side JavaScript bundle at BUILD TIME, not runtime. This means:
- Changing them on Vercel requires a REDEPLOY (not just a restart)
- They're visible to anyone viewing your site's JavaScript
- Never put secrets in NEXT_PUBLIC_ vars

### Cross-Environment Consistency
Some vars should be DIFFERENT between environments:
- `NEXTAUTH_SECRET` — MUST be different between production and preview
- `NEXTAUTH_URL` — different domains
- `DATABASE_URL` — should point to different DBs ideally

Some vars should be the SAME:
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` — always `/login`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` — always `/auth/redirect`

## Integration with voltrail-deployer

The deployer skill calls this env-doctor as part of its pre-flight checks. If called from the deployer, output a condensed format (just CRITICAL + HIGH issues) instead of the full report.
