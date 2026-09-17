# Architecture

Next.js 15.5 App Router · React 19 · TypeScript strict · Tailwind v4 · Drizzle · Postgres 17.

## Shape

```
apps/web
├── src/app
│   ├── p/[dppId]/            public passport — server components only
│   ├── 01/[...path]/         GS1 Digital Link resolver
│   ├── console/              brand console, behind a layout-level auth gate
│   └── login/
├── src/lib
│   ├── passport/             payload schema, vocabularies, identifiers, benchmarks
│   ├── tier/                 field registry + deny-by-default projector
│   ├── db/                   Drizzle schema, pooled client
│   ├── auth/                 roles, scrypt passwords, JWT sessions
│   ├── api/                  RFC 9457 problem responses, withAuth wrapper
│   ├── audit/                hash-chained audit model
│   ├── gs1/                  Digital Link construction and parsing
│   └── crypto/               RFC 8785 canonical JSON + hashing
└── drizzle/                  migrations
```

## The decisions that matter

**The public passport is server-rendered and contains no client components.**
This is the difference between a document and an app pretending to be one. Disclosure is
native `<details>`/`<summary>`; dark mode is `prefers-color-scheme` as well as a class, so
the page is correct before any JavaScript runs. Every competitor's consumer surface that
was tested renders nothing without JS.

**The tier projector reads the registry, not the payload.**
`projectForTier` walks `FIELD_REGISTRY` and copies only what an entry explicitly permits.
A field nobody registered is invisible rather than public, so forgetting a field produces
an incomplete passport, never a leak. It also returns a `withheld` list, which is why the
public page can say "70 further fields are recorded and released to authorised parties"
instead of silently having a gap.

**Audiences are a set, not a rank.**
`tierAllows(caller, audiences)` — with `authority` reading everything and anything marked
`public` readable by all. A linear ladder would force a wholesale buyer and a waste
operator into the same bucket, and they need genuinely different fields.
`regulatedTierOf()` maps the set down to the regulator's three tiers for export.

**Content lives in a JSONB payload; identity and addressing live in columns.**
`passport_versions.payload` holds the passport; `passports` holds the identifiers, status
and publication pointer. Resolving a public URL is one indexed lookup. Versions are
immutable — a correction writes a new version with a `changeReason`.

**Integrity is RFC 8785 canonical JSON, hashed with SHA-256.**
Two systems that disagree about key order still agree about the hash, which is what makes
a passport hash portable to a third-party verifier.

**Identifiers are random, not sequential.**
16 characters of Crockford base32 — 80 bits, no I/L/O/U, so it survives being read off a
care label by hand. A sequential id would leak how many products a brand has published.

**`withAuth` exists.**
The predecessor product did role checks inline across 238 route files, which means a
missed check is invisible. Here a route declares its roles once and the tenant is bound
before the handler runs.

**Every console query takes `tenantId` first and filters on it.**
In a shared-schema database that is the only defence against cross-tenant reads. A query
in `console/queries.ts` without a tenant predicate is a bug.

## Lifted from the predecessor

The battery product it was rebuilt from contributed proven *patterns*, re-implemented
rather than copied: the deny-by-default tier projector, the hash-chained audit log, the
canonical-JSON integrity hash, the GS1 Digital Link builder, the immutable-version model,
and the white-label branding table. Its schema was ~90% domain-neutral; only
`battery_families` and three columns were domain-bound, which is why a rebuild was cheap.

Its 76 migrations, two competing tier systems, Catena-X adapter, battery compliance
validators and 3,249-line battery wizard were left behind.

## Deliberately not used

- **No blockchain in the request path.** Anchoring is a hash-anchor at most. Every luxury
  incumbent ships crypto-wallet UI in a consumer app; it is a liability, not an asset.
- **No ORM migrations at runtime.** `scripts/migrate.mjs` applies plain SQL in filename
  order and records what ran, so a customer's DBA can read it before it touches anything.
- **No third-party font CDN.** `next/font` self-hosts at build time. A passport that fetches
  its type from someone else's server on every view is a view, not a document — and these
  pages get opened in shop basements on bad connections.

## Running the checks

```bash
pnpm typecheck
pnpm build
pnpm --filter @polytrail/web exec node measure.mjs http://localhost:3100/p/<id>   # overflow audit
```
