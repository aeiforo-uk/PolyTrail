---
name: battery-passport-compliance-architect
description: Design, audit, or gap-assess an EU battery passport solution against Regulation (EU) 2023/1542, ESPR digital product passport interoperability, Battery Pass guidance, CIRPASS/CIRPASS2 patterns, UNTP, W3C credential standards, GS1-style resolver patterns, Catena-X alignment, and provider control requirements. Use when Codex needs to define or review battery passport data models, APIs, identifiers and QR flows, roles and access control, lifecycle workflows, provider selection, compliance evidence packs, or operating models for EV, LMT, and industrial battery passport solutions.
---

# Battery Passport Compliance Architect

## Overview

Use this skill to produce high-confidence battery passport architecture, compliance audits, provider evaluations, and implementation plans. Keep legal requirements, draft standards, and voluntary ecosystem patterns clearly separated.

## Workflow

### 1. Confirm scope and regulatory posture

Start every engagement by fixing the exact scope:

- Battery category: EV, LMT, or industrial battery greater than 2 kWh
- Actor model: manufacturer, importer, authorised representative, OEM, passport platform provider, recycler, second-life operator, notified body support, or mixed ecosystem
- Deliverable: architecture, compliance gap assessment, provider audit, RFP criteria, API design, or remediation plan
- Geography: EU market access is the controlling baseline even if systems are hosted elsewhere

Read [references/regulatory-baseline.md](references/regulatory-baseline.md) first. If the task depends on dates, access-rights rules, or secondary legislation status, verify live EUR-Lex and Commission sources before finalizing recommendations.

### 2. Classify each requirement correctly

For every requirement, label it as one of:

- `Binding law`
- `Adopted secondary legislation`
- `Draft or pending secondary legislation`
- `Harmonized or sector standardization work`
- `Voluntary ecosystem guidance`
- `Provider-specific feature`

Do not present Battery Pass, UNTP, W3C, Catena-X, GS1, DIN/DKE, or BatteryPass-Ready outputs as legally mandatory unless a law, contract, or customer program explicitly makes them mandatory.

### 3. Load only the references needed

Use this selection rule:

- Legal scope, dates, data-access classes, operator duties: [references/regulatory-baseline.md](references/regulatory-baseline.md)
- Standards, initiatives, and ecosystem alignment: [references/standards-and-ecosystem.md](references/standards-and-ecosystem.md)
- APIs, identifiers, resolver flows, auth, lifecycle events, persistence: [references/solution-architecture.md](references/solution-architecture.md)
- Provider due diligence, RFPs, controls, red flags: [references/provider-audit-framework.md](references/provider-audit-framework.md)
- Source provenance and live verification targets: [references/source-register.md](references/source-register.md)

### 4. Apply the non-negotiable control set

Any acceptable battery passport solution should satisfy all of the following:

- Support the Article 77 scope and access model for public, authority-only, and legitimate-interest data.
- Use a durable unique identifier and QR flow that resolves to the passport and can be registered in the ESPR registry.
- Preserve operator accountability even when a service provider hosts or processes data.
- Enforce role-based rights for viewing, introducing, modifying, and updating data.
- Keep the passport available even if the original responsible operator or provider exits.
- Prevent provider reuse of hosted data beyond the storage or processing service it was engaged to provide.
- Provide strong authentication, integrity, auditability, privacy, and anti-fraud controls.
- Support lifecycle status changes such as original, repurposed, re-used, remanufactured, and waste.
- Preserve exportability and vendor-exit paths for identifiers, schemas, history, evidence, and documents.

If any of these controls fail, treat the solution as non-compliant or high-risk until remediated.

### 5. Choose the architecture stance explicitly

Use [references/solution-architecture.md](references/solution-architecture.md) to define the target pattern. Make the following decisions explicit:

- Identifier model: HTTP URI, GS1 Digital Link, DID-based resolver, or hybrid
- Data model: minimum legal schema plus optional RDF or graph representation
- Credential model: plain signed records, W3C Verifiable Credentials, enterprise PKI, or hybrid
- Access model: public site plus protected APIs, or data-space style federated exchange
- Dynamic data strategy: BMS, MES, ERP, LCA, PCF, due diligence, and recycling signals
- Persistence model: operator-hosted, provider-hosted with escrow, or delegated continuity arrangement

Prefer boring and explainable choices over fashionable ones. If DID or VC is used, justify why it improves interoperability, selective disclosure, or verifier trust. If it does not, use a simpler HTTP plus signed evidence design.

### 6. Produce one of the standard outputs

Use the request type to decide the output:

- `Architecture brief`: target components, APIs, trust model, lifecycle flows, risk register
- `Compliance audit`: requirement-by-requirement pass, fail, partial, unknown matrix with remediation
- `Provider audit`: capability, interoperability, contractual, security, and exit assessment
- `RFP package`: mandatory controls, scoring model, evidence requests, disqualifiers
- `Implementation roadmap`: phased milestones to reach 18 February 2027 readiness

When auditing a provider or implementation, run:

```bash
python3 scripts/render_audit_template.py --subject-name "Vendor X" --subject-type provider
```

Fill the generated template with evidence-backed findings rather than generic commentary.

### 7. Separate law from implementation advice in the final answer

Always keep these sections distinct:

- `What the law requires now`
- `What is still pending or draft`
- `What the ecosystem recommends`
- `What this specific solution should implement`
- `Residual risks and assumptions`

Use exact dates such as `18 February 2027` instead of relative phrasing.

## Default architecture guidance

Unless the user asks for a different pattern, start with this baseline:

- Stable battery unique identifier plus QR code
- Human-readable public passport page
- Machine-readable API for public data
- Protected API for legitimate-interest and authority data
- Evidence store for declarations, conformity, tests, provenance, and chain-of-custody artifacts
- Event or ingestion endpoints for state-of-health and lifecycle changes
- Append-only audit log for all writes and material reads
- Export package for vendor exit and continuity

Map the API and data ownership back to economic operators, not just to the platform vendor.

## Provider evaluation rules

When evaluating a platform provider:

- Require proof of current support for Article 77 and Article 78 controls, not roadmap promises alone.
- Require evidence for exportability, continuity, and operator takeover if the provider relationship ends.
- Require a clear model for resolver ownership, key management, and credential rotation.
- Require contract language limiting provider reuse of stored or processed passport data.
- Require support for both static model data and dynamic individual-battery lifecycle data.
- Require a documented path to adapt when Annex XIII or implementing acts change.

Treat missing evidence, gated demos, or marketing-only claims as `unverified`.

## What to avoid

- Do not assume all battery categories are in scope for the passport.
- Do not collapse public and restricted data into one access layer.
- Do not store end-user personal data in the passport unless there is a lawful and clearly justified basis.
- Do not make a provider-owned identifier the only resolvable key.
- Do not depend on a single proprietary format without export and continuity guarantees.
- Do not label a draft standard, consortium paper, or pilot convention as mandatory law.

