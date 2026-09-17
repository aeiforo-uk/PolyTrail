# Polytrail

Digital Product Passports for textiles — apparel, footwear and home textiles.

Polytrail publishes a passport that is simultaneously a **credible compliance document**
and a **useful consumer surface**. Research into every textile DPP reachable on the open
web in September 2026 found that nobody ships both: the compliance-first passports are
austere, static and commercially inert; the brand-led ones are single-page apps behind a
per-item token, invisible to crawlers, archives, recyclers and regulators alike.

---

## What is actually built

| Surface | State |
|---|---|
| Public passport page (`/p/<id>`) | Working. Server-rendered, functions with JavaScript disabled. |
| Machine-readable twin (`/p/<id>/dpp.json`) | Working, with `?format=jsonld`. |
| GS1 Digital Link resolver (`/01/<gtin>/…`) | Working. Linkset content negotiation, AI 01/10/21, correct status codes. |
| Console — sign-in, overview, passport list, passport detail | Working. |
| Disclosure preview ("who sees what") | Working. Per-field, per-audience. |
| Console — suppliers, data requests, review queue, team, settings | **Navigation only. Not built.** |
| Passport creation and editing | **Not built.** Passports are seeded; there is no editor yet. |
| Supplier portal, credential signing, registry submission | **Not built.** |

See `docs/STATUS.md` for the honest line-by-line version.

---

## Running it

Requires Node 22+, pnpm 10+, and Docker for Postgres.

```bash
pnpm install
pnpm db:up                    # Postgres 17 on :5434
cd apps/web && cp .env.example .env.local
# set AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
cd ../.. && pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3000
```

The seed prints the demo passport URL and the sign-in accounts. All demo accounts use
the password `Polytrail!2026`.

| Account | Role |
|---|---|
| `ada@meridian.example` | Brand admin |
| `tomas@meridian.example` | Product manager |
| `ines@meridian.example` | Compliance officer |
| `admin@polytrail.eu` | Platform admin |

---

## Layout

```
apps/web/
  src/app/p/[dppId]/        the public passport
  src/app/01/[...path]/     GS1 Digital Link resolver
  src/app/console/          the brand console
  src/lib/passport/         payload schema, vocabularies, benchmarks, identifiers
  src/lib/tier/             field registry and the deny-by-default projector
  src/lib/db/               Drizzle schema and pooled client
  drizzle/                  migrations
docs/                       product, compliance, architecture, design, status
```

## Documentation

- `docs/PRODUCT.md` — what this is, who it is for, and where the market is weak
- `docs/COMPLIANCE.md` — the regulatory position, with dates and citations
- `docs/ARCHITECTURE.md` — how it is put together and why
- `docs/DESIGN.md` — the design system
- `docs/STATUS.md` — what is built, what is not, and what is known to be wrong

## Legacy

`_legacy-battery-passport/` holds the previous battery-passport product this repository
was rebuilt from. Nothing in `apps/` references it. It is kept only so you can consult it;
delete it when you are satisfied.
