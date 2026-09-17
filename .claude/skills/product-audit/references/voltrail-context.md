# VolTrail — Domain-Specific Audit Context

## What VolTrail Is

VolTrail is a Digital Battery Passport platform for EU Battery Regulation 2023/1542
compliance. It creates, manages, and shares battery passports containing material
composition, carbon footprint, supply chain traceability, and performance data.

## Stack

- **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, Framer Motion, shadcn/ui
- **Backend:** Next.js API routes, Drizzle ORM
- **Database:** Supabase (PostgreSQL), with blockchain anchoring (Hyperledger Besu)
- **Auth:** Auth0 via NextAuth/next-auth
- **Deployment:** Vercel (frontend), Supabase (DB)
- **Monorepo:** Frontend at `frontend/`, blockchain at `blockchain/`

## Domain-Specific Security Checks

1. **Tenant isolation** — Multi-tenant via `tenantId`. Every DB query MUST filter
   by tenant. Check for queries that don't include tenant filtering.

2. **Passport data access tiers** — Three access levels:
   - Public (anyone scanning QR)
   - Restricted (authorized operators — recyclers, repairers)
   - Authority (EU market surveillance only)
   Check that the public DPP endpoint doesn't leak restricted/authority fields.

3. **Blockchain anchoring** — Passport hashes are anchored on-chain. Verify:
   - Hash is computed from actual data (not a placeholder)
   - Anchor status is verified, not just assumed
   - Merkle proof validation exists

4. **Document uploads** — Battery passports accept PDF uploads (certificates,
   agreements). Check for:
   - File type validation (not just extension checking)
   - File size limits enforced server-side
   - Files stored in tenant-scoped paths
   - No path traversal in document URLs

## Domain-Specific Backend Checks

1. **Passport lifecycle** — Valid state machine:
   `Draft -> Pending Review -> Anchored -> (Revoked | Recalled)`
   Check that invalid transitions are rejected server-side.

2. **Compliance validation** — EU Battery Regulation has 87 mandatory fields
   across 8 categories (A-H). Check that the validator covers all categories
   and scores are computed correctly.

3. **Registry integration** — CIRPASS EU Registry publishing. Check for:
   - Proper error handling when registry is unavailable
   - Registry metadata stored separately from core passport data

## Domain-Specific Frontend Checks

1. **Form field completeness** — The passport creation wizard has 40+ fields
   across 8 steps. Check that all mandatory fields are enforced.

2. **QR code** — Each passport generates a QR code linking to the public view.
   Verify the URL is correct and the public page renders without auth.

3. **Export formats** — Passports export as JSON, PDF, and Verifiable Credentials.
   Check that exports include all required data.

## Client Delivery — VolTrail Specific

1. **OEM onboarding** — Can a new manufacturer (VinFast, Mahindra, Ashok Leyland)
   be onboarded without code changes?
2. **Branding** — Is tenant branding configurable (logo, colors)?
3. **API keys** — Can clients generate their own API keys for system integration?
4. **Data sovereignty** — Can passport data be hosted in the client's preferred region?
