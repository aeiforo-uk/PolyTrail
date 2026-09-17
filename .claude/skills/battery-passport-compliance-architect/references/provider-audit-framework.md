# Provider Audit Framework

## Contents

1. How to use this framework
2. Scoring bands
3. Mandatory audit dimensions
4. Red flags
5. Example provider landscape

## 1. How to use this framework

Use this framework for:

- DPP-as-a-service providers
- Battery passport platform vendors
- Traceability providers extending into battery passports
- Resolver or credential infrastructure vendors
- Integrators proposing a multi-vendor battery passport stack

Score each dimension as:

- `Pass`
- `Partial`
- `Fail`
- `Unknown`

`Unknown` means evidence was not provided. Do not upgrade `Unknown` to `Pass` based on marketing.

## 2. Scoring bands

- `Critical`: legal non-compliance or continuity failure risk
- `High`: major interoperability, security, or operator-control gap
- `Medium`: implementation weakness that is remediable before go-live
- `Low`: optimization opportunity

## 3. Mandatory audit dimensions

### A. Legal coverage

- Supports in-scope battery categories correctly
- Distinguishes mandatory and optional data
- Implements Annex XIII access segregation
- Tracks upcoming acts without pretending drafts are final

### B. Data model and semantics

- Supports Article 77 and Annex XIII fields cleanly
- Handles model-level and individual-battery data separately
- Supports lifecycle-state changes and dynamic data
- Provides schema versioning and change management

### C. Identifier, QR, and resolver

- Uses globally unique identifiers
- Supports QR access flow
- Allows operator-controlled or portable identifier ownership
- Can integrate with ESPR registry obligations

### D. APIs and integration

- Provides stable APIs for create, update, event ingestion, evidence upload, export, and resolver access
- Supports ERP, MES, PLM, LCA, BMS, and recycling-system integration
- Documents authentication patterns and rate or size limits
- Supports machine-readable exports without provider lock-in

### E. Access control and trust

- Role and purpose-based access control
- Strong admin and privileged-user authentication
- Auditable access grants and privileged reads
- Supports authority and legitimate-interest access distinctions

### F. Security and privacy

- Protects keys, secrets, and service credentials
- Supports integrity proofs or signed evidence
- Limits personal-data storage and clearly justifies any end-user data processing
- Has incident response, vulnerability management, and logging controls

### G. Continuity and exit

- Keeps the passport available if the provider relationship ends
- Provides escrow or migration path
- Exports data, evidence, and history in usable formats
- Documents resolver and domain takeover procedures

### H. Operational readiness

- Supports phased onboarding of suppliers
- Handles incomplete evidence with status flags instead of silent omission
- Provides validation, quality checks, and exception handling
- Supports high-volume issuance and updates

### I. Commercial and contractual controls

- Contract limits provider reuse of passport data
- Contract defines service levels, retention, and exit support
- Contract clarifies operator versus provider responsibilities
- Contract avoids making provider-owned identifiers the only production key

## 4. Red flags

Treat these as immediate escalation items:

- One shared access layer for public and restricted data
- No clear distinction between legal data classes
- No export bundle or weak vendor-exit plan
- Provider-hosted identifier with no transfer path
- No auditable write history
- No restricted-data purpose enforcement
- Claims of compliance based only on consortium participation
- Mandatory reliance on a draft standard with no fallback
- Marketing that says `compliant` but cannot map features to Articles 77, 78, and Annex XIII

## 5. Example provider landscape

The market changes quickly, so refresh live before final procurement advice. As of the research baseline for this skill, examples visible from provider or initiative sources include:

- `Siemens Battery Passport`: positioned as a SaaS battery passport solution with APIs and Catena-X alignment.
- `Circulor`: positioned as an enterprise traceability and battery passport provider with strong provenance and due-diligence messaging.
- `Minespider`: positioned around traceability, mineral provenance, and battery passport workflows.
- `BatteryPass-Ready ecosystem participants`: not one provider, but a readiness and validation environment shaping expected conformance patterns.

Use named providers as market examples only. Always verify current product scope, contract posture, and control evidence live.

