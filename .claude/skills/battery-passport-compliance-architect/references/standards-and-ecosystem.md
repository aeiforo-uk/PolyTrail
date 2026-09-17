# Standards And Ecosystem

## Contents

1. How to classify ecosystem artifacts
2. European standardization track
3. Battery-specific guidance and pilots
4. Identity, credentials, and resolver standards
5. Data-space and industry-interoperability patterns
6. Practical interpretation rules

## 1. How to classify ecosystem artifacts

Use this hierarchy when reasoning about standards:

1. Binding EU law
2. Adopted delegated or implementing acts
3. CEN or CENELEC standardization work and common specifications
4. Sector guidance and pilot artifacts
5. Provider implementation conventions

This prevents overclaiming.

## 2. European standardization track

### CEN/CENELEC JTC 24

Treat JTC 24 as the main European standardization stream for digital product passports.

Its work modules cover:

- Unique identifiers
- Data carriers and link binding
- Access-rights management, information security, and business confidentiality
- Interoperability
- Data processing, exchange protocols, and formats
- Storage, archiving, and persistence
- Authentication, reliability, and integrity
- APIs

Use JTC 24 outputs to shape architecture choices, but verify whether a document is still draft, adopted, or superseded.

### DIN and DKE ecosystem work

Use DIN or DKE outputs as implementation-shaping material, especially in Germany, but do not present them as EU-wide binding law unless incorporated by contract, certification program, or later legal reference.

BatteryPass-Ready materials explicitly point to `DIN-DKE SPEC 99100` as a foundational input for readiness and test-environment work. Treat that as an influential implementation reference, not as a substitute for Union law.

## 3. Battery-specific guidance and pilots

### Battery Pass

Use Battery Pass for battery-specific semantic guidance and practical structure.

Most useful outputs:

- Content clusters and data-attribute guidance
- Technical guidance for passport system design
- Semantic data model work based on RDF

Use Battery Pass to inform structure, terminology, and evidence expectations. Do not treat it as a substitute for Annex XIII.

### BatteryPass-Ready

Use BatteryPass-Ready as a readiness and conformance-oriented implementation signal.

It is useful for:

- Test-environment thinking
- Conformity and data-quality validation concepts
- Understanding where industry is converging operationally

Treat it as a market-readiness initiative, not a legal authority.

### CIRPASS and CIRPASS2

Use CIRPASS and CIRPASS2 for DPP system-architecture patterns.

Core lessons:

- Prefer decentralized operator-controlled data architectures over a single monolithic database.
- Separate identifier, resolver, repository, and access-control responsibilities cleanly.
- Design for cross-sector DPP interoperability, not just battery-only use cases.

## 4. Identity, credentials, and resolver standards

### W3C DID Core

Use DID Core when the solution genuinely benefits from decentralized identifiers, portable service endpoints, or verifiable identifier control.

### W3C Verifiable Credentials Data Model v2.0

Use VC v2.0 when selective disclosure, verifier workflows, and portable signed claims are important.

### W3C Data Integrity

Use Data Integrity when the solution signs JSON-LD or VC artifacts and needs proof suites aligned with W3C recommendations.

### GS1 Digital Link

Use GS1 Digital Link when the solution benefits from well-understood web resolvers, product-identification conventions, and industrial QR interoperability.

### UNTP

Use UNTP for practical cross-border transparency and discoverability patterns.

Most relevant concepts:

- Identity resolution
- Deep-linking from identifiers to passport resources
- Credential and event patterns that can bridge organizations without centralizing all data

## 5. Data-space and industry-interoperability patterns

### Catena-X

Use Catena-X patterns when the implementation targets automotive ecosystem interoperability or supplier-network exchange.

Relevant artifacts include:

- Shared services expectations
- Battery Pass data model work such as CX-0034
- Supplier-to-OEM exchange expectations in automotive chains

Do not make Catena-X a hard dependency unless the customer ecosystem actually requires it.

## 6. Practical interpretation rules

- `Law first`: legal compliance must work even without optional standards.
- `Simple beats clever`: HTTP plus signed evidence is usually easier to govern than a needlessly complex DID plus VC stack.
- `Optional means optional`: DID, VC, GS1, UNTP, RDF, and Catena-X are tools, not universal mandates.
- `Use dual views when useful`: one legal minimum schema and one richer semantic or graph model can coexist.
- `Design for change`: JTC 24, Commission acts, and ecosystem profiles are still evolving.
