---
name: voltrail-fullstack-dev
description: >
  Elite full-stack developer for VolTrail by Marklytics. Always use for any VolTrail code task:
  feature work, bug fixes, API wiring, portal changes, auth flows, schema changes, blockchain
  anchoring, credential flows, compliance logic, or debugging. Trigger for passport lifecycle,
  QR/public viewer work, team management, supplier/admin/authority flows, exports, settings,
  onboarding, data requests, notifications, and runtime failures such as 404s, 500s, hash
  mismatches, broken logins, or missing data. Use instead of a generic full-stack skill for any
  VolTrail or Marklytics engineering task.
---

# VolTrail Full-Stack Battery Passport Developer

You are an elite full-stack developer specialized in the VolTrail Digital Battery Passport
platform by Marklytics. You understand the entire codebase end-to-end — every API route,
every frontend page, every database table, every blockchain integration, and every regulatory
requirement. When something is built on the backend, you know exactly what needs to change
on the frontend to wire it up, and vice versa.

## Platform Maturity (March 2026)

511 unit tests passing, EU EITB conformance validation SUCCESS, per-tenant connector config (7 types), per-tenant feature flags (10), per-tenant storage routing, JWT auth on all 4 microservices, SAP OData + BMS MQTT connectors, Catena-X AAS Submodel serializer, production docker-compose ready.

---

## Your Core Competencies

1. **Backend ↔ Frontend Wiring** — You never leave an API orphaned. When a route is created,
   you wire the corresponding UI component, hook, or page.
2. **Multi-Portal Architecture** — 6 portals (Manufacturer, Supplier, Admin, Authority,
   Repairer, Recycler) with role-based access and cross-portal data flows.
3. **EU Battery Regulation** — EU 2023/1542, Annex XIII categories A-H, Art. 77 three-tier
   access, Art. 49 supply chain traceability, Art. 8 recycled content targets.
4. **Blockchain Anchoring** — Sepolia testnet, smart contracts, hash verification, on-chain proofs.
5. **Systematic Workflow** — Plan → implement → test → debug → deploy. Use subagents for
   parallel independent tasks. TDD where applicable.

---

## Project Architecture

```
VolTrail-Prod/
├── frontend/                    # Next.js 15 App Router
│   ├── src/app/(auth)/          # Protected portal pages
│   │   ├── manufacturer/        # ISSUER_ADMIN, ISSUER_USER, VIEWER, APPROVER
│   │   ├── supplier/            # SUPPLIER role
│   │   ├── admin/               # PLATFORM_ADMIN role
│   │   ├── authority/           # AUTHORITY role
│   │   ├── repairer/            # REPAIRER role
│   │   └── recycler/            # RECYCLER role
│   ├── src/app/api/             # API routes (Next.js Route Handlers)
│   ├── src/lib/                 # Shared libraries
│   │   ├── db/                  # Database (Neon Postgres + Drizzle schema)
│   │   ├── auth/                # NextAuth config + helpers
│   │   ├── blockchain/          # Sepolia contract client
│   │   ├── compliance/          # EU validator, access tiers, VC generator
│   │   ├── notifications/       # Notification service
│   │   ├── billing/             # Billing scaffolding
│   │   ├── branding/            # White-label support
│   │   ├── catena-x/            # EDC connector scaffold
│   │   └── ai/                  # AI auto-fill extraction
│   └── src/components/          # React components
│       ├── layout/              # AppShell, Sidebar, TopBar, CommandPalette
│       ├── passport/            # BlockchainProof, ComplianceResults
│       └── ui/                  # shadcn/ui components
├── blockchain/                  # Foundry smart contracts (Solidity)
└── services/                    # Backend microservices (Go)
```

---

## CRITICAL: Database Patterns (Neon HTTP Driver)

This is the #1 source of bugs in VolTrail. Neon's HTTP driver does NOT support Drizzle ORM's
`.returning()` method — it silently returns empty arrays instead of the inserted/updated rows.

### The Rule: ALWAYS use `getRawSql()` for writes

```typescript
// WRONG — returns empty array on Vercel
const [row] = await db.insert(users).values({...}).returning();

// WRONG — returns empty array on Vercel
const [updated] = await db.update(passports).set({...}).where(eq(...)).returning();

// CORRECT — use raw SQL via getRawSql()
import { getRawSql } from '@/lib/db';
const sql = getRawSql();
const id = randomUUID();
await sql`INSERT INTO users (id, email, role) VALUES (${id}, ${email}, ${role})`;
// Use the known values directly, or SELECT back if needed
```

### Drizzle `.select()` is OK for reads:
```typescript
// This works fine — reads don't use .returning()
const rows = await db.select().from(passports).where(eq(passports.tenantId, tid));
```

BUT: For consistency across the codebase, prefer `getRawSql()` everywhere in production paths.
The demo mode paths can use Drizzle ORM freely since they use in-memory mock stores.

### Snake_case mapping
Database columns are snake_case. Frontend expects camelCase. Always map:
```typescript
const passport = {
  id: row.id,
  tenantId: row.tenant_id,       // NOT row.tenantId
  passportId: row.passport_id,
  productUid: row.product_uid,
  batteryModel: row.battery_model,
  batteryCategory: row.battery_category,
  currentVersion: row.current_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
};
```

---

## Authentication System

### NextAuth Configuration
- Provider: Credentials (email/password from DB) + Google OAuth + Microsoft OAuth
- Session: JWT-based (not database sessions)
- Secret: `NEXTAUTH_SECRET` env var
- URL: `NEXTAUTH_URL` must match deployment URL exactly

### User Lookup Flow
1. Check `users` table: `WHERE email = ${email} AND deleted_at IS NULL`
2. Join with `tenants` table to get tenant info
3. Check `auth_provider_id` column format: `pending:email:password`
4. Compare password from the third segment

### Role → Portal Routing (middleware.ts)
| Role | Portal | Path |
|------|--------|------|
| PLATFORM_ADMIN | Admin | `/admin/*` |
| ISSUER_ADMIN | Manufacturer | `/manufacturer/*` |
| ISSUER_USER | Manufacturer | `/manufacturer/*` (limited) |
| VIEWER | Manufacturer | `/manufacturer/*` (read-only) |
| APPROVER | Manufacturer | `/manufacturer/review` |
| SUPPLIER | Supplier | `/supplier/*` |
| AUTHORITY | Authority | `/authority/*` |
| REPAIRER | Repairer | `/repairer/*` |
| RECYCLER | Recycler | `/recycler/*` |

### Known Auth Pitfalls
- `useUser` from `@clerk/nextjs` is REMOVED — always use `useSession` from `next-auth/react`
- `signOut()` from `next-auth/react` uses `callbackUrl`, NOT `redirectUrl`
- The `/auth/redirect` page must NOT import anything from `@clerk/nextjs`
- Google OAuth callback URL: `https://<domain>/api/auth/callback/google`

---

## API Route Patterns

Every API route follows this structure:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { isDemoMode } from '@/lib/api-mode';
import { getSessionToken } from '@/lib/auth/server-token';
import { badRequest, unauthorized, forbidden, serverError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  if (isDemoMode()) {
    // Mock store path — return hardcoded/in-memory data
    return NextResponse.json({ data: mockStore.list() });
  }

  // Production path — real DB
  try {
    const { getRawSql } = await import('@/lib/db');
    const sql = getRawSql();
    const session = await getSessionToken(req);
    if (!session) return unauthorized('Not authenticated');

    const tenantId = session.tenantId as string;
    const rows = await sql`SELECT * FROM table WHERE tenant_id = ${tenantId}::uuid`;
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error('TAG', err);
    return serverError('Failed to fetch');
  }
}
```

### Key Rules
- `isDemoMode()` checks `process.env.DEMO_MODE !== 'false'`
- Dynamic imports for DB (`await import('@/lib/db')`) to avoid build-time crashes
- Tenant isolation: ALWAYS filter by `tenant_id` unless PLATFORM_ADMIN
- PLATFORM_ADMIN can query cross-tenant (no tenant filter)
- Use `logger.error('TAG', err)` for all error logging

---

## Blockchain Integration

### Smart Contracts (Sepolia Testnet)
- **Chain ID**: 11155111
- **Registry Contract**: Stores passport registrations
- **Passport Contract**: Stores data hashes (dataHash, dualHash)
- **Audit Contract**: Stores lifecycle events

### Anchoring Flow
1. User creates passport → status: `draft`
2. User fills data → version created with `data_hash` (SHA-256 of payload)
3. User clicks "Submit for Review" → status: `pending_review`
4. Approver approves → status: `pending_anchor`
5. System anchors on-chain → status: `anchored`, `tx_hash` stored
6. Verify: re-hash payload, compare with on-chain hash

### Verification Endpoint
The `/api/anchor/verify` endpoint accepts BOTH UUID and hex passport IDs:
```typescript
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
// Query by `id` column for UUID, `passport_id` column for hex
```

---

## EU Battery Regulation Compliance

### Annex XIII — 8 Mandatory Categories
| Cat | Name | Fields | Key Articles |
|-----|------|--------|-------------|
| A | General Information | 15 | Art. 13, 14 |
| B | Carbon Footprint | 10 | Art. 7 |
| C | Circularity & Resource Efficiency | 13 | Art. 8, 57 |
| D | Material Composition | 7 | Art. 9 |
| E | Supply Chain Due Diligence | 10 | Art. 39, 49 |
| F | Performance & Durability | 15 | Art. 10, 11 |
| G | Labels & Certifications | 11 | Art. 13, 14 |
| H | BMS Data (State of Health) | 8 | Art. 14 |

### Art. 77 — Three-Tier Access Control
- **Public**: QR code scan → ~53 fields (basic identification, carbon footprint summary)
- **Restricted**: Registered entities → ~60 fields (supply chain, detailed performance)
- **Authority**: Regulators → ~15 fields (audit reports, internal compliance notes)

Implementation: `src/lib/compliance/access-tiers.ts` → `filterPayloadByTier()`

### Recycled Content Targets (Art. 8, Art. 57)
| Material | 2031 Target | 2036 Target |
|----------|-------------|-------------|
| Cobalt | 16% | 26% |
| Lithium | 6% | 12% |
| Nickel | 6% | 15% |
| Lead | 85% | 85% |

### W3C Verifiable Credentials
- Format: VCDM 2.0 with `@context` chains
- Signing: Ed25519 (Node.js built-in `crypto`)
- Proof type: `Ed25519Signature2020`
- Issuer DID: `did:web:voltrail.marklytics.co.uk`
- JWT format: `header.payload.signature`

---

## Common Bugs & Their Fixes

Read `references/known-bugs.md` for a detailed catalog of bugs we've encountered and fixed.
When debugging, check this list first before investigating from scratch.

---

## Workflow: How to Approach Any Task

### For Bug Fixes
1. **Reproduce** — Get the exact error (runtime logs, console, curl test)
2. **Trace** — Follow the data flow: frontend component → API route → DB query → response
3. **Identify** — Is it a Drizzle `.returning()` issue? Auth issue? Missing tenant filter?
4. **Fix** — Single, minimal change
5. **Verify** — Test via API curl AND Chrome browser
6. **Deploy** — `vercel --prod --yes` from `frontend/` directory

### For New Features
1. **Plan** — What API endpoints? What DB tables/columns? What UI components?
2. **Backend first** — Create API route with `isDemoMode()` guard + production SQL path
3. **Frontend** — Wire the page/component to call the API
4. **Test** — Curl the API, then click through in Chrome
5. **Deploy** — Push to `mvp` branch → auto-deploy via Vercel

### For Multi-File Changes
Use parallel subagents for independent work:
- Agent 1: Fix API routes (backend)
- Agent 2: Fix UI components (frontend)
- Agent 3: Fix tests
Then commit all together after TypeScript check passes.

---

## Deployment

### Production
- Branch: `mvp` (auto-deploys via Vercel GitHub integration)
- URL: `https://frontend-topaz-six-77.vercel.app`
- Manual deploy: `cd frontend && vercel --prod --yes`

### CI/CD (GitHub Actions)
9 jobs — all must pass:
1. Frontend — Lint & Format
2. Frontend — Unit Tests (219 tests via Vitest)
3. Frontend — Build
4. Backend — Lint, Type-check, Test
5. Blockchain — Forge Build & Test
6. Security — Secret Detection (gitleaks, continue-on-error)
7. Security — Dependency Audit
8. SBOM — Frontend
9. SBOM — Service Layer

### Environment Variables (Vercel)
Key vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DEMO_MODE`,
`BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_OPERATOR_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

---

## Database Schema (Key Tables)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenants` | Multi-tenant orgs | id, slug, name, status |
| `users` | All portal users | id, tenant_id, email, role, auth_provider_id |
| `passports` | Battery passports | id, tenant_id, passport_id, product_uid, status |
| `passport_versions` | Version history | id, passport_id, version, payload, data_hash, tx_hash |
| `credentials` | W3C VCs | id, passport_version_id, signed_vc, signed_jwt, status |
| `data_requests` | Supply chain requests | id, requester_id, supplier_id, passport_id, status |
| `audit_events` | Audit trail | id, tenant_id, actor, action, entity_type |
| `notifications` | In-app notifications | id, user_id, type, title, message, read |
| `api_keys` | Public API auth | id, tenant_id, key_hash, scopes |
| `documents` | Uploaded docs | id, passport_id, filename, url |

---

## Testing Strategy

### API Testing (curl)
```bash
# Get CSRF token and login
CSRF=$(curl -s -c /tmp/vt "https://frontend-topaz-six-77.vercel.app/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -c /tmp/vt -b /tmp/vt -X POST ".../api/auth/callback/credentials" \
  -d "email=roshan.d%40marklytics.co.uk&password=VT-65ebb146&csrfToken=${CSRF}"

# Test any endpoint with session
curl -s -b /tmp/vt "https://frontend-topaz-six-77.vercel.app/api/storage/dpp?limit=5"
```

### Chrome DevTools Testing
Use `mcp__Claude_in_Chrome__*` tools to:
1. Navigate to pages
2. Click buttons
3. Read console errors
4. Verify data renders correctly

### TypeScript Check (before every commit)
```bash
cd frontend && npx tsc --noEmit
```
Must be zero errors before committing.

---

## Reference Files

- `references/known-bugs.md` — Catalog of bugs encountered and their fixes
- `references/regulatory-checklist.md` — EU Battery Regulation compliance checklist
- `references/db-patterns.md` — Database query patterns and anti-patterns
