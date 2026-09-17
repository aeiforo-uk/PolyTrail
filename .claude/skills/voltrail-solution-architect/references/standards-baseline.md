# VolTrail Standards Baseline

Compiled: 2026-04-05

Use this file when a VolTrail skill needs a current external baseline for architecture, delivery, QA, security, accessibility, interoperability, or software supply-chain decisions.

## Battery Passport And DPP Stack

- `Regulation (EU) 2023/1542`, consolidated through 2025-07-31:
  - Legal base for battery passports, access control, and passport content.
  - Anchor on Articles 77-78, Annex XIII, and the lifecycle obligations around carbon footprint, due diligence, and circularity.
- `Regulation (EU) 2024/1781`:
  - ESPR framework for DPP interoperability and broader product-passport expectations.
- `CIRPASS2 Reference Architecture`:
  - Use for decentralized DPP architecture patterns, resolver thinking, and interoperability framing.
- `Battery Pass`:
  - Use for data cluster interpretation, industry implementation guidance, and practical battery-passport content modeling.
- `UNECE UNTP`:
  - Use for digital trust, verifiable exchange, and transparency/traceability patterns across ecosystems.
- `W3C DID Core`, `VC Data Model 2.0`, `VC Data Integrity 1.0`:
  - Use for issuer identity, verifiable credential payloads, and proof/verifier expectations.
- `GS1 Digital Link`:
  - Use for resolver-friendly identifier and QR/URI design.

## Security And Trust Baseline

- `OWASP ASVS 5.0.0`:
  - Application security verification baseline for auth, access control, crypto, validation, and logging.
- `OWASP API Security Top 10 (2023)`:
  - Use as the API threat baseline: BOLA, broken auth, excessive data exposure, unsafe inventory, SSRF, and related failures.
- `OWASP Web Security Testing Guide`:
  - Use for structured verification steps when converting threats into reproducible tests.
- `NIST SP 800-218 SSDF`:
  - Secure software development baseline for design review, implementation hygiene, verification, and response.
- `NIST Cybersecurity Framework 2.0`:
  - Use for governance, protect/detect/respond/recover planning and executive framing.

## Delivery, Supply Chain, And Operations Baseline

- `SLSA v1.0`:
  - Use for build integrity, provenance, and release hardening.
- `OpenSSF Scorecard`:
  - Use as a practical software supply-chain hygiene signal for branch protection, CI coverage, pinned actions, token permissions, and dependency policy.
- `OpenTelemetry Specification`:
  - Use for trace, metric, and log design; require consistent correlation across browser, API, jobs, and integrations.

## Frontend And QA Baseline

- `WCAG 2.2`:
  - Accessibility floor for keyboard access, focus visibility, target size, and clear user feedback.
- `Playwright Best Practices`:
  - Use for stable browser automation: resilient locators, isolated tests, deterministic data, and waiting on real signals instead of arbitrary sleeps.

## Working Rules

- Prefer primary sources over blog summaries.
- Treat repo-local implementation claims as untrusted until verified against code, tests, or a running environment.
- Treat demo-only behavior as non-compliant unless the task explicitly targets demo mode.
- When a proposed design diverges from one of these baselines, name the divergence and justify it.
