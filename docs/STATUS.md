# Status

Written 17 September 2026. This file exists so nobody has to guess which parts of this
repository are real. Where something is modelled but not implemented, it says so.

## Gates

| Check | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm test` | 328 tests, 24 files |
| `pnpm build` | passes, 42 route surfaces |

## The five product surfaces

Role decides which application you land in. This is enforced server-side in
`src/lib/auth/personas.ts`, the middleware and each layout — not by hiding buttons.

| Surface | Who | State |
|---|---|---|
| `/console` | brand admin, product manager, compliance officer | Built |
| `/p/[dppId]` | anyone with the link | Built |
| `/partner` | repairer, recycler | Built |
| `/authority` | market surveillance | Built |
| `/s/[token]`, `/t/[token]`, `/invite/[token]` | suppliers, transfer recipients, invitees — no account | Built |

Verified: a repairer forcing `/console/passports` is returned to `/partner`; an authority
is returned to `/authority`; a compliance officer lands on their review queue.

## Built

**Passport lifecycle** — create, a ten-section editor mirroring the consumer passport,
immutable versioning with a change reason, a nine-state machine with role-gated transitions,
a publication gate that refuses to publish an unsubstantiated claim or a passport with no
responsible economic operator.

**Data collection** — supplier register with GLN as the authoritative facility identifier;
data requests driven from the field registry with a live email preview; a supplier portal
that needs **no account**, ships essentially no JavaScript and works with scripting off;
field-level review with a dry-run merge that surfaces conflicts instead of overwriting.

**Bulk import and integration** — CSV upload with column mapping, an editable grid of only
the failing rows, and a REST connector that feeds the same validation path as the file
importer.

**Compliance** — review queue with a readable field-by-field diff and field-scoped change
requests; hash-chained audit log with a verify action that re-derives every hash; EU
Registry filing with pre-flight refusal and a mock client that behaves like the real thing;
a four-rung operator verification ladder with real DNS challenge verification.

**Ownership and post-market** — dual-signed transfers (both sides issue a credential),
transfer by email with no account required to accept, and an append-only lifecycle event log
where terminal events close the passport. **The log is now rendered on the public passport**
("What's happened since"), attributed by workspace rather than by individual, with
tier-restricted entries counted rather than silently dropped. Before 17 Sep 2026 the events
were loaded, tier-filtered and then discarded by the HTML page — they reached only the JSON
representation, while the partner portal told repairers and recyclers in three places that
their work "appears on the garment's public passport with your workspace's name on it".

**Integration layer** — API keys acting for the person who minted them, a cursor-paginated
REST v1 with RFC 9457 problem details, an OpenAPI document generated from the same registry
the routes enforce, W3C VC 2.0 credentials with three further EN 18246 mechanisms registered
and refusing honestly, HMAC-signed webhooks with a real retry drain, CSV and a regulator
evidence pack whose manifest hash covers the whole bundle.

**Security** — scrypt passwords, JWT sessions, TOTP enforced at sign-in and re-prompted
before destructive actions, per-IP and per-key rate limiting, SSRF screening on webhook
URLs, CSV formula-injection neutralisation.

## Not built

- **File upload — partially closed (17 Sep 2026).** Real storage now exists:
  `document_blobs` holds bytes in Postgres, content-addressed by SHA-256, written through
  `src/lib/documents/storage.ts` (8 MB cap, content-type allowlist) and served by
  `GET /api/documents/[id]` (role-gated, tenant-scoped, 404 for foreign ids, ETag = content
  hash). The operator-verification rung now stores and reviews real files instead of typed
  filenames. Still metadata-only: supplier portal submissions, passport-level evidence, and
  the regulator evidence pack does not yet bundle stored bytes.
- **eIDAS qualified seal.** Modelled and gated for; needs a QTSP relationship, not code.
- **Certifier portal.** `CERTIFIER` has a persona and a home route that does not exist yet.
- **Cross-brand partner grants.** A repairer can only see items from a workspace that owns
  or created them. There is no model for one brand authorising another's repair network.
- **Transfers can only be addressed by email.** A workspace picker was written and removed
  because it enumerated every tenant on the platform.
- **Blockchain anchoring.** Deliberately absent; hash-anchoring would be the only form
  considered, and no consumer-facing chain vocabulary.
- **ESPR Art. 24 / Art. 25 — unsold goods.** Nothing exists. The destruction ban on unsold
  apparel and footwear and the annual disclosure of what was discarded are *applying now*
  for large companies (see `COMPLIANCE.md`), unlike the textile DPP. There is no disposal
  record, no waste-treatment vocabulary, no tenant-level public disclosure surface, and no
  enterprise-size field on `tenants` to determine who it binds. This is the largest
  **live-obligation** gap in the product.
- **Brand users cannot record a lifecycle event.** 14 of the 17 event types list `brand` as
  an author and `INTERNAL_AUTHOR_ROLES` maps the three console roles to it, but the only
  callers of `appendEvent` are the partner portal and the transfer service. `manufactured`
  and `placed_on_market` exist in the demo only because the seed writes them in raw SQL.
- **10 of 17 event types are unreachable from any UI** — including three of the four
  terminal ones (`incinerated`, `landfilled`, `lost`), so a garment that is burnt or sent to
  landfill leaves its passport permanently open.
- **No consumer or owner surface.** `registered_by_owner` is authored by `owner` and the
  `consumer` tier is fully modelled, but the only way to reach that tier is to accept a
  transfer. There is no ownership registration.
- **No repairer or recycler locator.** `care.repair.partnerRefs` is registered as public and
  editable in the console, and rendered nowhere.
- **Append-only is enforced in application code only.** `passport_events` has no trigger,
  no `REVOKE` and no RLS preventing an `UPDATE` or `DELETE`, and `partner_id` and
  `evidence_document_id` carry no foreign key.

## Known problems

1. **The rate limiter is in-process.** Behind several instances the effective limit
   multiplies by the instance count. Fine as abuse-dampening, not as a quota — it needs a
   shared counter before anyone is charged per request.
2. **Only six locales are translated.** The ESPR expects all official EU languages, and
   free-text passport content is authored in one language regardless.
3. **`passports.completeness` is a cached column** recomputed on save. Nothing recomputes it
   when the field registry changes, so adding a regulated field leaves old scores stale until
   each passport is next saved.
4. **No pagination** on the supplier or data-request lists.
5. **Data-request expiry is evaluated lazily** when a link is used. A sweep job would be
   better than discovering expiry at the moment of use.
6. **`docker-compose.yml` at the repository root was overwritten** during the rebuild. The
   original was the battery stack's file and was going to be removed regardless, but it was
   not read before being replaced.
7. **The legacy tree is quarantined, not deleted.** `_legacy-battery-passport/` still holds
   the battery product. Nothing in `apps/` references it.

## Judgement calls worth revisiting

- **Six audiences, not three.** The JRC proposes public / legitimate interest / authority.
  Polytrail models six and maps down, because a repairer and a recycler need different
  fields — verified: 167 vs 171 readable fields, different sets.
- **Absolute footprint is public by default.** The JRC proposes restricting it and publishing
  a class instead. Brands publish absolute figures voluntarily today and it makes a far
  better consumer page, so the default stays open and the registry entries carry
  `regulated: 'legitimate_interest'` for the day that changes.
- **Supply chain, social data and lifecycle events are carried** even though none is part of
  the proposed ESPR content — they are required by French and Italian national law, by the
  Forced Labour Regulation, and by customers.
- **Registry mode defaults to `mock`.** The Registry is live but textiles have no obligation
  until roughly 2029. Defaulting to a live filing endpoint would be theatre.
