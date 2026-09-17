# Polytrail — project instructions

Digital Product Passports for textiles. Next.js 15.5 App Router, React 19, TypeScript
strict, Tailwind v4, Drizzle, Postgres 17. The app is `apps/web`.

## Read first

- `docs/STATUS.md` — what is actually built, what is not, and what is known to be broken.
  Read this before claiming anything works.
- `docs/COMPLIANCE.md` — the regulatory position. Do not restate DPP deadlines from memory;
  most published dates are wrong. In particular: there is no EN 18213, the DPP Registry
  going live in July 2026 created no textile obligation, and a realistic textile DPP date
  is late 2028–2029.
- `docs/ARCHITECTURE.md` — why things are shaped the way they are.

## Rules that are load-bearing

1. **The public passport (`src/app/p/`) must stay server-rendered.** No client components,
   no hydration required to read a field. Disclosure is native `<details>`. This is the
   product's main differentiator over every competitor; do not regress it for a nicety.
2. **Never add a field to the payload schema without adding it to
   `src/lib/tier/field-registry.ts`.** The projector is deny-by-default, so an unregistered
   field is invisible. Every entry needs a real `basis` citation.
3. **Every tenant-scoped query filters on `tenantId`.** In a shared-schema database that is
   the only thing preventing cross-tenant reads.
4. **Routes declare their roles via `withAuth`** in `src/lib/api/handler.ts`. Do not do
   inline role checks.
5. **Status is colour plus icon plus word.** Never colour alone.
6. **Never show a number without its baseline** on the consumer surface.
7. **An unknown identifier returns 404**, never a soft 200. Machine clients depend on it.

## Commands

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev            # :3000
pnpm typecheck
pnpm build
```

Demo accounts are printed by the seed; password `Polytrail!2026`.

## Legacy

`_legacy-battery-passport/` is the battery-passport product this was rebuilt from. It is
kept for reference only. **Never import from it, and never reintroduce battery-domain
vocabulary** (chemistry, cathode, anode, state of health, Regulation 2023/1542) into
`apps/` or `docs/`.
