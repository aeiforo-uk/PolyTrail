# Product

## The opening

Three incompatible things ship under the name "Digital Product Passport", and the
competitive teardown that informed this build reached all of them:

- **The document.** Nudie Jeans and Marimekko serve server-rendered HTML, GS1-addressed,
  readable with JavaScript off. Credible, honest, austere — and commercially inert. No
  verification, no resale, no repair, no ownership.
- **The app.** EON (Chloé, Tommy Hilfiger, Calvin Klein, Coach, and an unannounced
  `dpp.nike.com`), Aura (Stella McCartney, Zegna, Lalique, Tod's), Arianee, Blue Bite and
  TrusTrace all serve a single-page app behind a per-item token. Aura's own error copy is
  *"Cannot authenticate. This experience is exclusive to product holders."* Commercially
  alive, and completely unverifiable from outside — invisible to crawlers, archives,
  accessibility tooling, recyclers, second-hand buyers and any regulator with a script.
- **The registry.** Napapijri's code is a claim token for a take-back scheme gated behind
  creating an account within 60 days of purchase. A legal mechanism wearing a service's
  clothes.

**Nobody has shipped, at a fetchable URL, something that is both a trustworthy compliance
document and a desirable commerce surface.** That is the opening, and it is the entire
product thesis.

## Where the market is weak

Findings from hands-on teardown of live production systems, not from vendor marketing.

1. **"GS1 Digital Link support" is false across the category.** Tested with
   `Accept: application/linkset+json`, five live resolvers returned `text/html`. **Zero of
   five** are conformant. All of them **soft-404** — HTTP 200 for a product that does not
   exist — which silently breaks every machine client, customs check and authority tool
   that trusts status codes.
2. **Access tiering is essentially unimplemented, and brands are leaking.** The flagship
   EU textile DPP pilot publishes purchase-order numbers and full factory addresses
   unauthenticated through an undocumented public JSON API. Everything is public tier.
   EURATEX's stated number-one industry demand is tiered access with commercial
   confidentiality protection.
3. **The showcase passports are empty exactly where the law is heading.** One ships
   `sustainabilityInfo` as an empty object, `scoreForDurability: "0"` and
   `scoreForRepairability: "0"` — the two slots the JRC proposes to mandate — and empty
   strings for facility identifiers.
4. **Traceability vendors have no LCA; LCA vendors have no traceability.** Neither half of
   the market can satisfy a footprint-versus-benchmark requirement alone.
5. **Localisation is broken.** A Swedish brand's passport returns identical English care
   text to `Accept-Language: sv`.
6. **Scan analytics belong to the vendor, not the brand.**
7. **Nobody is registry-aware or eIDAS-aware.** Not one vendor claims EU DPP Registry
   integration or conformance to any EN 182xx standard.
8. **Consumer engagement is tiny and nobody says so.** The only published scan rate in the
   market is 12%. One flagship style has 154 passports in existence. A brand with "20,000+
   scans" across 112 styles is at ~180 scans per style, ever.
9. **The structural gap software cannot fix.** The data originates two to three tiers
   upstream, where suppliers have no EU contractual relationship and often no lab or
   metering capacity. Every DPP in this market is a beautiful page on top of self-declared,
   unmeasured upstream data. **Nobody addresses provenance-of-the-provenance.**

## What Polytrail does differently

Implemented today:

- **Public by default, tiered above it.** One URL that anyone can open, with additional
  fields released to trade partners, repairers, recyclers and authorities. Enforced
  server-side by a deny-by-default projector, not by hiding things in the client.
- **A conformant GS1 Digital Link resolver.** Linkset content negotiation, AI 01/10/21,
  item→batch→model fallback, and real 404s. Demonstrable in one `curl` in a sales call.
- **Server-rendered, works with JavaScript off.** Native `<details>` disclosure, no
  hydration required to read a single field.
- **The verdict band.** Every live passport opens as a stack of closed grey bars, so a
  person who scans and taps nothing learns nothing. Polytrail leads with three or four
  figures already interpreted against a category baseline — and never shows a number
  without the thing it should be measured against.
- **Honest gaps.** An unmapped production step renders as a dashed, greyed node saying
  "not yet mapped by the brand". A blank is indistinguishable from a secret.
- **Honest claims.** Mass-balance recycled content carries the sentence "this garment may
  contain none of it", because that is what mass balance means.
- **Named facilities.** Every mapped step names the actual company. A passport that says
  "a supplier in Portugal" has told the reader nothing they could verify.
- **A disclosure preview in the editor.** Pick an audience, see field by field what they
  can read, before publishing.

Designed for but not yet built: data-provenance grading per field (measured / lab-tested /
supplier-declared / industry-average proxy), resale pre-fill, repair booking, escrow and
continuity, registry and eIDAS onboarding.

## Positioning and pricing

There is a **~25× gap** between the self-serve floor (€29/mo tools) and the lowest
demo-gated tier (Tappr at €749/mo), with nothing in between. Almost every serious vendor
— TrusTrace, Retraced, Fairly Made, Carbonfact, EON, Aura, Arianee — publishes no pricing
at all.

Recommended shape, on the principle of **charging for the hard onboarding, not the
rendering**:

| Tier | Price | For |
|---|---|---|
| Pilot | €0 | 3–5 styles at full fidelity. The conformance checker is the marketing. |
| Compliance | €500–900/mo | SMEs. Sits deliberately under the lowest demo-gated competitor. |
| Operator | €2,500–3,500/mo | Supplier tiers 2–4, LCA, tiering, signed credentials, connectors. |
| Regulated | €6,000–12,000/mo | Registry, eIDAS lifecycle, escrow SLA, authority endpoints. |

Publish the pricing. In a category where everyone is demo-gated, transparency is itself
differentiation. Sell the 2026 obligations — AGEC, PEF, EPR, GPSR — and bill for the 2029
one.

## Anti-patterns this product refuses

Each was observed in a live passport: six collapsed grey bars and a thumbnail; numbers
without comparators; shipping `null` to production; the JavaScript wall; marketing pages
that never lead to an artifact; parked subdomains; compliance-shaped hoops instead of
services; narrative disconnected from workflow; blockchain vocabulary above the fold;
greenwash aesthetics; error walls you cannot act on; hero photography of the thing already
in the reader's hand.
