# Solution Architecture

## Contents

1. Target component model
2. API surface
3. Identifier and resolver patterns
4. Auth and role model
5. Lifecycle model
6. Data and evidence model
7. Continuity and exit controls

## 1. Target component model

A robust battery passport solution usually needs these components:

- `Identifier service`: issues or validates the battery unique identifier
- `Resolver layer`: converts the QR-linked identifier into a public page and machine endpoints
- `Public passport service`: exposes Annex XIII public data
- `Restricted access service`: exposes legitimate-interest and authority-only data
- `Evidence repository`: stores declarations, test reports, chain-of-custody records, due diligence evidence, PCF studies, and versioned documents
- `Event ingestion layer`: receives manufacturing, usage, SoH, incident, repurposing, remanufacturing, and end-of-life events
- `Policy engine`: enforces role and purpose-based access
- `Audit log`: records writes, access grants, data exports, and material reads
- `Registry integration`: handles upload of required unique identifiers to the ESPR registry
- `Export and continuity package`: allows operator takeover and vendor exit

## 2. API surface

Use a small and explicit API surface. A good baseline is:

- `GET /passports/{id}` for public passport rendering
- `GET /api/public/batteries/{id}` for machine-readable public fields
- `GET /api/restricted/batteries/{id}` for legitimate-interest or authority views
- `POST /api/batteries/{id}/events` for lifecycle events
- `POST /api/batteries/{id}/documents` for evidence uploads
- `POST /api/batteries/{id}/status` for lifecycle status transitions
- `GET /api/batteries/{id}/audit-log` for authorized auditors
- `POST /api/registry/upload` for ESPR registry interactions where applicable
- `GET /api/export/{id}` for export bundles and takeover

Design errors using standard problem documents such as RFC 9457 where practical.

## 3. Identifier and resolver patterns

Use one of these patterns deliberately:

### HTTP-native

- Identifier is a stable HTTP URI or operator-controlled ID resolved through an operator domain.
- Best when simplicity and web compatibility are the priorities.

### GS1 Digital Link

- Best when product identification already uses GS1 structures or downstream scanning ecosystems expect it.

### DID-based

- Best when identifier portability, decentralized control proofs, or service-endpoint verification materially improve the design.
- Use only if the team can actually operate DID documents, keys, and resolver dependencies responsibly.

### Hybrid

- Use a simple public HTTP resolver while keeping an internal DID or credential trust layer for restricted exchanges.

Avoid provider-only identifiers with no operator-controlled alias.

## 4. Auth and role model

Use both role and purpose.

### Minimum roles

- Public consumer
- Economic operator admin
- Manufacturer or OEM contributor
- Supplier contributor
- Recycler or second-life operator
- Repairer or remanufacturer
- Notified body
- Market surveillance authority
- Commission or delegated authority support
- Platform operator with least privilege

### Access principles

- Public data should not require login.
- Restricted data should require strong authentication and authorization.
- Access should be granted by both `role` and `purpose`.
- Sensitive technical composition or lifecycle data should be disclosed at minimum necessary scope.
- Every privileged read and write should be auditable.

### Credential choices

Use the least complex model that satisfies the use case:

- Enterprise IAM and OAuth 2.1 or OIDC for normal platform access
- mTLS or signed service credentials for system-to-system ingestion
- Optional W3C VC flows when cross-organization portable attestations are valuable

## 5. Lifecycle model

Represent battery lifecycle as explicit states and transitions.

At minimum, track:

- Manufacture and model release
- Placed on market
- In service
- Service or repair event
- Repurposed
- Re-used
- Remanufactured
- Waste
- Recycled

Support versioned updates for:

- State of health
- State of charge snapshots when relevant to downstream use cases
- Number of cycles
- Incidents or negative events
- Operating environment summaries

Do not overwrite history. Append events and derive current state.

## 6. Data and evidence model

Keep two layers:

### Legal minimum layer

Model the minimum fields required by Annex XIII and adopted acts.

### Semantic interoperability layer

Optionally map those fields into:

- RDF or JSON-LD
- Catena-X structures
- VC payloads
- GS1 or resolver metadata

Common evidence objects:

- Declaration of conformity
- Conformity assessment evidence
- Test reports
- PCF study and methodology
- Recycled-content evidence
- Due diligence policy and third-party verification
- Material provenance and chain-of-custody artifacts
- Dismantling instructions and safety measures

## 7. Continuity and exit controls

Treat continuity as a first-class compliance control.

Require:

- Export of raw data, evidence, and schema mappings
- Export of audit logs
- Operator control of primary identifiers or a binding transfer mechanism
- Key-rotation and credential-handover procedure
- A continuity host or escrow arrangement if the provider exits
- Documented recovery procedure if resolver domains or trust keys change

If a provider cannot explain continuity without hand-waving, score it as a major risk.

