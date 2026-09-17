# Regulatory position

Compiled 17 September 2026. Every claim here is dated and sourced, because most of what
is written about textile Digital Product Passports is wrong about timing, and some of it
is wrong about the standards.

## Six corrections worth knowing

1. **There is no "EN 18213".** The CEN/CENELEC JTC 24 family is **EN 18216, 18219, 18220,
   18221, 18222, 18223, 18239, 18246**. A vendor citing 18213 has copied someone's error.
2. **"prEN 18219" is obsolete.** It is **EN 18219:2026**, published and cited in the
   Official Journal.
3. **The Commission did not "select VC + DID + GS1".** EN 18219 permits **five** identifier
   schemes (GS1 Digital Link, IEC 61406, W3C DID, RFID/2D identifiers, DOI) and **four**
   integrity mechanisms (W3C VC 2.0, eIDAS EAA, ISO 22376 VDS, ISO/IEC 20248). The
   single-stack claim traces to a vendor blog. Build for pluggability on both axes.
4. **Footwear is not in the first ESPR working plan** — only a study, due end-2027.
5. **The DPP Registry going live on 20 July 2026 created no textile obligation.**
   18 February 2027 is batteries. A realistic textile DPP date is **late 2028–2029**.
   Vendor-claimed dates span 2027 to 2030 for a date that does not yet exist.
6. **The single most important document for the data model is the JRC preparatory study** —
   *Study on DPP content for textile apparel products under ESPR*, González-Torres &
   Arcipowska, **13 May 2026**. It carries the candidate field list, the proposed
   granularity per field, and the proposed access tier per field.
   <https://susproc.jrc.ec.europa.eu/product-bureau/sites/default/files/2026-05/Textiles_DPP_20260513.pdf>

## What is law now, and what is not

| Instrument | Status | Date that matters |
|---|---|---|
| ESPR (EU) 2024/1781 — DPP framework | **In force** | 18 Jul 2024 |
| ESPR Art. 25 destruction ban, apparel + footwear | **Applying now** | 19 Jul 2026 (medium-sized 19 Jul 2030) |
| ESPR Art. 24 unsold-goods disclosure | **Applying now** (large companies) | medium-sized from 19 Jul 2030 |
| ESPR textile delegated act | **Does not exist** | expected ~2027, application ~2028–29 |
| Textile EPR — Directive (EU) 2025/1892 | In force, not yet binding on producers | transposition 17 Jun 2027; schemes 17 Apr 2028 |
| France AGEC environmental labelling | **In force** | the near-term revenue surface |
| Netherlands UPV textiel | **In force** | 1 Jul 2023 |
| Germany LkSG | In force; reporting not enforced | — |
| Empowering Consumers Dir. (EU) 2024/825 | In force | applies 27 Sep 2026 |
| Regulation (EU) 1007/2011 fibre names | **In force** | the basis of every composition statement |

**The commercial consequence.** A DPP-only product has no 2026–2028 revenue. The same
data model produces AGEC labelling, PEF, EPR registration and GPSR output today; the DPP
is the 2029 land-grab on top of it.

## What the JRC actually proposes for textiles

**Scope:** products ≥80% textile fibres by weight, in 10 apparel categories. Workwear and
sportswear are in. Smart textiles, PPE, medical devices and toys are out. **All
intermediate products — fabrics, yarns, fibres — are excluded**; the obligation attaches
only to the final product.

**Three access tiers, not six:** public · legitimate interest · authority only.
The pattern to internalise is **claims are public, evidence is restricted**. Fibre
composition, substance-of-concern presence and concentration, recyclability score,
recycled content, footprint *class*, care instructions and warranty are public. Substance
*location*, disassembly and end-of-life detail, absolute footprint values and footprint
calculation parameters are legitimate interest. Every conformity certificate is
authority-only.

**Granularity:** model = same technical characteristics, pattern and construction, not
necessarily the same colour or size. Batch = one model, one plant, one run. Item = one
unit. Producer identity and chemical properties are batch-level; footprint is model-level.

**Four proposed requirements:** a robustness score (DO1), a recyclability score (DO2),
recycled content — the only candidate *performance* requirement (DO3), and carbon or
environmental footprint (DO4). **Repairability was assessed and rejected** as not
objectively quantifiable. **Microfibre release was assessed and no option was defined.**

**Three things the regulated textile DPP does *not* contain**, which matters because
every vendor implies otherwise:

1. **No supply-chain tier mapping.** The only supply-chain field that survived is a single
   facility identifier for where the final product was manufactured — tier 1 — and it is
   public. Tier 2–4 mapping is a customer-value feature and a French/Italian national-law
   and Forced Labour Regulation feature. It is not an ESPR DPP requirement.
2. **No social or due-diligence data.** Nothing on CSDDD, living wage, audits or forced
   labour.
3. **No lifecycle events.** Every one of the JRC's 13 use cases records "Data update
   events: None". The regulated passport is a static model/batch record. Resale, repair and
   recycling histories are a differentiator built on UNTP or EPCIS, not compliance.

Polytrail carries all three anyway, and labels them honestly in the console as what they
are rather than implying they are mandatory.

## Identifiers

- **Model** → GTIN-13. **Batch** → GTIN + AI(10). **Item** → SGTIN = GTIN + AI(21).
- **Operator** → Party GLN plus EORI. **Facility** → GLN. Open Supply Hub was considered
  by the JRC and **rejected** as not a formal standardised scheme; Polytrail stores an OS
  ID as supplementary only.
- **Resolvable form:** `https://{brand-domain}/01/{gtin}/21/{serial}`, uncompressed syntax.
  GS1's provisional ESPR standard prefers the **brand-owner domain** over `id.gs1.org` so
  that no app is required.
- **A bare UUID is not a valid UPI** — not a URL, not resolvable, not ISO/IEC 15459
  compliant. Use UUIDs internally, never as the identifier.
- **Decouple identifier granularity from disclosure granularity.** Mint item-level
  identifiers now and populate them by inheritance from batch or model data.

## How Polytrail implements this

`src/lib/tier/field-registry.ts` is the compliance surface. Each of its 229 entries carries
the audiences that may read it, the instrument that asks for it, its regulated tier, and
whether it is part of the JRC's proposed ESPR content. The projector in
`src/lib/tier/project.ts` is deny-by-default: a field absent from the registry is invisible
to everyone but an authority, so the failure mode of forgetting a field is an incomplete
passport rather than a leak.

Where Polytrail's default is more open than the JRC's proposal — absolute carbon and PEF
values, which brands publish voluntarily today — the entry says so and carries
`regulated: 'legitimate_interest'`, so a compliant projection is one function call away
once the delegated act lands.

## What is implemented

- **Registry filing.** `src/lib/registry/` builds the submission envelope — UPI as the most
  specific resolvable URL the data supports, operator identifier ranked LEI → EORI → GLN →
  DID, version hash over the whole descriptor — with a pre-flight that refuses an incomplete
  record and names the instrument asking for each missing field. Two clients: a mock that
  behaves like the real thing (idempotent, replays return the original proof) and an HTTP
  one. `EU_REGISTRY_AUTHORITATIVE` must be explicitly `true` before a filing counts as a
  filing of record, so a staging endpoint cannot masquerade as the Commission's.
- **Verified-operator ladder.** Four rungs in `src/lib/verification/`: email to the
  workspace contact, a real `_polytrail.<domain>` TXT challenge verified through DNS,
  document review with a named reviewer, and the eIDAS qualified seal. The eIDAS rung is
  **modelled and deliberately not implemented** — Polytrail holds no QTSP certificate, the
  panel says so, and a test asserts `implemented === false` so it cannot be flipped without
  one. Against an authoritative endpoint it is a hard blocker on filing.
- **Two-factor authentication.** RFC 6238 TOTP, enforced at sign-in and re-prompted before
  destructive actions.
- **Credential issuance.** W3C VC 2.0 over VC-JOSE-COSE, signing the version's canonical
  hash plus the public-tier projection only. Three further EN 18246 mechanisms — eIDAS EAA,
  ISO 22376 VDS, ISO/IEC 20248 — are registered behind the same interface and refuse
  honestly rather than being absent, because the standard permits four and assuming one is
  the mistake the rest of the market has made.
- **Ownership transfer.** Dual-signed: the sender issues a transfer credential and the
  recipient an acceptance credential, both stored verbatim.

## Known gaps

- **Multilingualism.** Six locales are translated (en, de, fr, it, es, nl). The ESPR expects
  **all** official EU languages, so this remains incomplete — and free-text passport content
  is still authored in one language only.
- **eIDAS qualified seal is not implemented**, only gated for. It needs a QTSP relationship,
  not more code.
- **Document upload is metadata-only** across verification and supplier submissions. The
  rows record what was shown; no bytes are stored, so no content hash is computed.
- **The registry contract is a best reading, not a published schema.** The textile delegated
  act does not exist yet. When it lands, `buildRegistryRecord` is the one function to change.
