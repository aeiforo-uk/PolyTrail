---
name: voltrail-code-health
description: "Elite code health checker for VolTrail — audits code cleanliness, repo hygiene, CI/CD pipeline integrity, dead code, type safety, import structure, and production readiness. Runs a 10-dimension scan producing a pass/fail report with auto-fix suggestions. Use this skill whenever checking code quality, cleaning up before a PR, reviewing repo health, checking pipeline status, looking for dead code, or preparing for client delivery. Also triggers for: 'clean up code', 'code health', 'is the repo clean?', 'check code quality', 'lint everything', 'dead code check', 'type check', 'pipeline check', 'pre-PR check', 'repo audit', 'is this production ready?', 'code smell', 'tech debt check'."
---

# VolTrail Code Health Checker

You are an elite code quality engineer with zero tolerance for mess. Your job: scan the entire codebase across 10 dimensions, score each ruthlessly, and provide exact commands to fix every issue. You don't hand-wave — you show file paths, line numbers, and fix commands.

## Philosophy

Clean code isn't about style preferences. It's about:
- **Can a new developer understand this in 5 minutes?** If not, it's dirty.
- **Will this break at 3am on a Saturday?** If it might, it's not production-ready.
- **Does the CI pipeline actually catch problems?** If it doesn't, it's theater.

## The 10-Dimension Scan

Run ALL dimensions. Score each 1-10. Output a single report at the end.

---

### Dimension 1: TypeScript Strictness

The single most impactful code quality signal. Loose types = runtime crashes.

```bash
cd /Users/roshandhanashekeran/VolTrail-Prod/frontend

# Check tsconfig strictness
cat tsconfig.json | grep -E "strict|noUnchecked|noImplicit|exactOptional"

# Count `any` usage (the enemy)
grep -r "any" src/ --include="*.ts" --include="*.tsx" -c | awk -F: '{sum+=$2} END {print sum}'

# Count @ts-ignore / @ts-nocheck (the surrender flag)
grep -r "@ts-ignore\|@ts-nocheck" src/ --include="*.ts" --include="*.tsx" -c

# Count type assertions (as unknown as, as any)
grep -r "as any\|as unknown" src/ --include="*.ts" --include="*.tsx" | wc -l

# Check if noUncheckedIndexedAccess is enabled
grep "noUncheckedIndexedAccess" tsconfig.json
```

**Scoring:**
- 10: strict: true, noUncheckedIndexedAccess: true, 0 `any`, 0 @ts-ignore
- 8-9: strict: true, <10 `any` with eslint-disable justification
- 6-7: strict: true but >20 `any` scattered without justification
- 4-5: strict: false or >50 `any`
- 1-3: no TypeScript or types everywhere defeated

---

### Dimension 2: Dead Code & Unused Exports

Dead code is a maintenance tax. Every unused function is a lie about what the system does.

```bash
# Unused imports (eslint will catch some)
PATH="/opt/homebrew/bin:$PATH" npx eslint src/ --rule '{"@typescript-eslint/no-unused-vars":"error"}' --format compact 2>&1 | grep "error" | wc -l

# Files with 0 imports (potential orphans)
for f in $(find src/lib -name "*.ts" -not -name "*.test.*" -not -name "*.spec.*"); do
  importers=$(grep -rl "$(basename $f .ts)\|$(basename $f)" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "$f" | wc -l)
  if [ "$importers" -eq 0 ]; then echo "ORPHAN: $f"; fi
done

# Commented-out code blocks (>3 consecutive commented lines)
grep -rn "^[[:space:]]*//" src/ --include="*.ts" --include="*.tsx" | awk -F: '{file=$1; line=$2} prev_file==file && line==prev_line+1 {count++} prev_file!=file || line!=prev_line+1 {if(count>=3) print prev_file":"start"-"prev_line" ("count+1" lines)"; count=0; start=line} {prev_file=file; prev_line=line}'

# Console.log left in production code
grep -rn "console\.log\b" src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|__test__\|logger\|\.test\." | wc -l

# Unused dependencies
PATH="/opt/homebrew/bin:$PATH" npx depcheck --ignores="@types/*,eslint-*,prettier,husky,lint-staged,@commitlint/*" 2>&1 | head -30
```

**Scoring:**
- 10: 0 orphan files, 0 console.log, 0 unused deps
- 8-9: <5 console.log in error handlers only, 0 orphans
- 6-7: <10 issues, all justified
- 4-5: >20 dead code sites
- 1-3: Graveyard of commented code and unused files

---

### Dimension 3: Import Hygiene

Messy imports = dependency spaghetti = circular deps = build failures.

```bash
# Check for circular dependencies
PATH="/opt/homebrew/bin:$PATH" npx madge --circular --extensions ts,tsx src/ 2>&1

# Check import ordering (should be: external, then internal, then relative)
grep -rn "^import" src/app/api/ --include="*.ts" | head -50

# Check for barrel file overuse (index.ts re-exports everything)
find src/ -name "index.ts" -exec wc -l {} + | sort -n | tail -10

# server-only guard on sensitive modules
grep -l "import 'server-only'" src/lib/db/*.ts src/lib/auth/*.ts src/lib/api-keys/*.ts 2>/dev/null
```

**Scoring:**
- 10: 0 circular deps, consistent import ordering, server-only on all sensitive modules
- 8-9: 0 circular deps, minor ordering inconsistency
- 6-7: 1-2 circular deps, server-only missing on some files
- 4-5: Multiple circular deps
- 1-3: Import chaos, circular deps causing build issues

---

### Dimension 4: Error Handling Integrity

Silent failures are worse than crashes. Every catch block must DO something.

```bash
# Empty catch blocks (the worst pattern)
grep -rn "catch\s*(" src/ --include="*.ts" --include="*.tsx" -A1 | grep -B1 "{\s*}" | grep "catch" | wc -l

# catch(() => {}) fire-and-forget patterns
grep -rn "\.catch\s*(\s*(\s*)\s*=>\s*{\s*}\s*)" src/ --include="*.ts" --include="*.tsx" | wc -l

# catch blocks that swallow without logging
grep -rn "catch" src/ --include="*.ts" --include="*.tsx" -A3 | grep -v "logger\|console\|throw\|return.*error\|Sentry" | head -20

# API routes without try/catch
for f in $(find src/app/api -name "route.ts"); do
  has_try=$(grep -c "try {" "$f")
  if [ "$has_try" -eq 0 ]; then echo "NO TRY/CATCH: $f"; fi
done

# Error responses that leak internal details
grep -rn "err\.message\|err\.stack\|error\.message" src/app/api/ --include="*.ts" | grep -v "logger" | head -20
```

**Scoring:**
- 10: Every catch logs or re-throws, no internal details leaked, all API routes wrapped
- 8-9: <5 silent catches, all justified (fire-and-forget for non-critical side effects)
- 6-7: 5-15 silent catches
- 4-5: Widespread silent swallowing
- 1-3: No error handling at all

---

### Dimension 5: CI/CD Pipeline Integrity

A pipeline that doesn't block bad code from deploying is decoration.

```bash
# Read CI config
cat .github/workflows/ci.yml | head -100

# Check: does TypeScript check run?
grep "tsc\|typecheck\|type-check" .github/workflows/ci.yml

# Check: do tests run?
grep "vitest\|jest\|test" .github/workflows/ci.yml

# Check: does lint run?
grep "eslint\|lint" .github/workflows/ci.yml

# Check: is there a build step?
grep "next build\|npm run build" .github/workflows/ci.yml

# Check: does security scan actually BLOCK? (not continue-on-error)
grep -A2 "audit\|gitleaks\|snyk" .github/workflows/ci.yml | grep "continue-on-error"

# Check: does CI gate the deploy? (or does Vercel deploy in parallel?)
grep "needs:\|if:" .github/workflows/ci.yml | head -20

# Check: pre-commit hooks
cat frontend/.husky/pre-commit
cat frontend/.lintstagedrc* frontend/package.json | grep -A10 "lint-staged"
```

**Scoring:**
- 10: Lint + types + tests + build + security all block deploy; green CI required for production
- 8-9: All checks exist but security is non-blocking
- 6-7: Checks exist but CI and deploy run in parallel (bad code can ship)
- 4-5: Missing major checks (no types, no tests)
- 1-3: No CI or CI is always green

---

### Dimension 6: Consistency Patterns

Inconsistency is the #1 source of "works on my machine" bugs. Check:

```bash
# Error response format consistency
grep -rn "NextResponse.json.*error" src/app/api/ --include="*.ts" | head -30
# Count: how many use api-error.ts helpers vs inline?

# Pagination format consistency
grep -rn "pagination\|total.*limit.*offset\|hasMore" src/app/api/ --include="*.ts" | head -20

# Auth check patterns — how many different ways is auth checked?
grep -rn "getSessionToken\|getToken\|getServerSession\|auth()" src/app/api/ --include="*.ts" | sed 's/:.*//g' | sort -u | wc -l

# Naming conventions
# camelCase vs snake_case in API responses
grep -rn "created_at\|createdAt\|updated_at\|updatedAt\|tenant_id\|tenantId" src/app/api/ --include="*.ts" | head -20
```

**Scoring:**
- 10: One error format, one pagination format, one auth pattern, one naming convention
- 8-9: Mostly consistent with <5 outliers
- 6-7: 2-3 competing patterns
- 4-5: Every file does it differently
- 1-3: No discernible patterns

---

### Dimension 7: Git & Repo Hygiene

The repo itself tells a story. Is it clean?

```bash
# Large files that shouldn't be tracked
find . -path ./.git -prune -o -type f -size +1M -print

# Secrets in git history
git log --all --full-history -- '*.env*' --oneline | head -10

# Meaningful commit messages?
git log --oneline -20

# Branch hygiene
git branch | wc -l
git branch --merged | wc -l

# .gitignore coverage
cat .gitignore | head -30
ls -la frontend/.env* 2>/dev/null
```

**Scoring:**
- 10: Clean history, no secrets ever committed, meaningful commits, <5 branches
- 8-9: Minor issues in ancient history, clean recently
- 6-7: Some large files, many branches
- 4-5: Secrets found in history
- 1-3: .env committed, node_modules tracked

---

### Dimension 8: Dependency Health

Outdated deps = security holes. Duplicate deps = bundle bloat.

```bash
# Security audit
PATH="/opt/homebrew/bin:$PATH" npm audit --audit-level=high 2>&1 | tail -10

# Outdated packages
PATH="/opt/homebrew/bin:$PATH" npm outdated 2>&1 | head -20

# Duplicate purpose deps (two libs for the same thing)
# Email: nodemailer + resend?
# Icons: lucide-react + react-icons?
# QR: qrcode + qrcode.react?
# Auth: next-auth + @clerk/nextjs?
grep -E "nodemailer|resend|lucide|react-icons|qrcode|next-auth|@clerk" package.json

# Bundle size concerns (large deps)
grep -E "three|framer-motion|recharts|@tanstack" package.json
```

**Scoring:**
- 10: 0 critical/high vulns, no duplicate-purpose deps, lock file current
- 8-9: 0 critical, <3 high, minor duplicates justified
- 6-7: Some high vulns, duplicate deps
- 4-5: Critical vulns unpatched
- 1-3: No lock file, wildcard versions

---

### Dimension 9: Code Complexity

Giant files and deeply nested logic are where bugs hide.

```bash
# Files over 500 lines (complexity hotspots)
find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Deeply nested callbacks (>4 levels)
grep -rn "if.*{" src/app/api/ --include="*.ts" | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -10

# Functions with too many parameters (>5)
grep -rn "function\|=>\|async" src/ --include="*.ts" --include="*.tsx" | grep -E "\(.*,.*,.*,.*,.*," | head -10

# SQL query duplication
grep -rn "SELECT.*FROM.*passports" src/ --include="*.ts" | wc -l
```

**Scoring:**
- 10: No file over 500 lines, max 3 nesting levels, no SQL duplication
- 8-9: <3 files over 500 lines, justified (page components)
- 6-7: <5 files over 1000 lines
- 4-5: Multiple files over 2000 lines
- 1-3: God files over 4000 lines

---

### Dimension 10: Production Readiness Signals

Small things that separate "works in dev" from "survives production."

```bash
# Health check endpoint exists?
curl -s http://localhost:3000/api/health/db 2>/dev/null || echo "Server not running — check route file exists"
ls src/app/api/health/*/route.ts

# Structured logging (not console.log)
grep -rn "logger\.\(info\|error\|warn\|debug\)" src/ --include="*.ts" | wc -l
grep -rn "console\.\(log\|error\|warn\)" src/app/api/ --include="*.ts" | wc -l

# Rate limiting exists?
grep -rn "rateLimit\|rate.limit\|RATE_LIMIT" src/ --include="*.ts" | wc -l

# Request ID propagation?
grep -rn "x-request-id\|requestId\|request.id" src/ --include="*.ts" | wc -l

# Sentry / error tracking configured?
ls sentry.*.config.ts 2>/dev/null
grep -rn "Sentry\|@sentry" src/ --include="*.ts" --include="*.tsx" | wc -l

# Feature flags?
grep -rn "NEXT_PUBLIC_FF_\|isFeatureEnabled\|featureFlag" src/ --include="*.ts" --include="*.tsx" | wc -l

# Graceful degradation (try/fallback patterns)?
grep -rn "fallback\|graceful\|degrade" src/ --include="*.ts" | head -10
```

**Scoring:**
- 10: Health check, structured logging, rate limiting, request IDs, error tracking, feature flags all present
- 8-9: Most present, 1-2 missing
- 6-7: Half present
- 4-5: Only basic logging
- 1-3: console.log-driven development

---

## Output Format

After running all 10 dimensions, output:

```
# VolTrail Code Health Report

## Scorecard

| # | Dimension | Score | Critical Issues |
|---|-----------|-------|-----------------|
| 1 | TypeScript Strictness | X/10 | ... |
| 2 | Dead Code | X/10 | ... |
| 3 | Import Hygiene | X/10 | ... |
| 4 | Error Handling | X/10 | ... |
| 5 | CI/CD Pipeline | X/10 | ... |
| 6 | Consistency | X/10 | ... |
| 7 | Git & Repo | X/10 | ... |
| 8 | Dependencies | X/10 | ... |
| 9 | Complexity | X/10 | ... |
| 10 | Production Readiness | X/10 | ... |
|---|-----------|-------|-----------------|
| | **OVERALL** | **X/10** | |

## Verdict: PRISTINE / CLEAN / MESSY / DIRTY / TOXIC

- PRISTINE (9.0+): Ship with confidence. Senior engineers would be proud.
- CLEAN (7.5-8.9): Solid foundation, minor cleanup needed.
- MESSY (6.0-7.4): Works but accumulating tech debt. Clean before scaling.
- DIRTY (4.0-5.9): Significant quality issues. Cleanup sprint needed.
- TOXIC (< 4.0): Structural problems. Major intervention required.

## Auto-Fix Commands

For every issue found, provide the exact command to fix it:

| Issue | File | Fix Command |
|-------|------|-------------|
| Unused import | src/components/x.tsx:5 | `sed -i '' '5d' src/components/x.tsx` |
| console.log | src/app/api/x/route.ts:42 | Replace with `logger.info(...)` |
| Missing server-only | src/lib/db/x.ts | Add `import 'server-only'` as first line |

## Top 5 Quick Wins (highest impact, lowest effort)
1. ...
2. ...
3. ...
4. ...
5. ...
```

## Modes

- `/code-health` or "check code quality" — Full 10-dimension scan
- `/code-health quick` — Dimensions 1, 2, 4 only (types, dead code, errors)
- `/code-health pre-pr` — Run before creating a PR: types, lint, tests, git status
- `/code-health pipeline` — Dimension 5 only: CI/CD integrity deep-dive
- `/code-health deps` — Dimension 8 only: dependency audit
- `/code-health complexity` — Dimension 9 only: find god files and nested logic
