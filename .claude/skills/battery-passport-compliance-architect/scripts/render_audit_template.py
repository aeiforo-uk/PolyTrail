#!/usr/bin/env python3
"""
Render a battery passport audit template for a provider, platform, or implementation.
"""

from __future__ import annotations

import argparse
from datetime import date


def build_template(subject_name: str, subject_type: str) -> str:
    today = date.today().isoformat()
    title = f"# Battery Passport Audit Template: {subject_name}"
    return f"""{title}

- Subject type: {subject_type}
- Generated: {today}
- Audit status: draft

## 1. Scope

- In-scope battery categories:
- Geography:
- Economic operators involved:
- Target go-live date:
- Audit objective:

## 2. Regulatory Baseline

- Regulation (EU) 2023/1542 applicability confirmed:
- Article 77 scope confirmed:
- Article 78 control set mapped:
- Annex XIII data classes mapped:
- ESPR registry implications mapped:
- Secondary legislation items requiring live verification:

## 3. Findings Summary

| Area | Status | Severity | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Legal coverage | Unknown | Critical |  |  |
| Data model | Unknown | High |  |  |
| Identifier and QR | Unknown | High |  |  |
| APIs and integration | Unknown | High |  |  |
| Access control | Unknown | Critical |  |  |
| Security and privacy | Unknown | High |  |  |
| Lifecycle handling | Unknown | High |  |  |
| Continuity and exit | Unknown | Critical |  |  |
| Contract posture | Unknown | High |  |  |

## 4. Detailed Audit

### A. Legal Coverage

- Evidence mapping to Articles 77 and 78:
- Evidence mapping to Annex XIII:
- Public vs restricted data segregation:
- Known gaps:

### B. Data Model

- Model-level fields:
- Individual-battery fields:
- Dynamic lifecycle fields:
- Schema versioning:

### C. Identifier and Resolver

- Unique identifier design:
- QR design:
- Resolver ownership:
- ESPR registry plan:

### D. APIs and Integrations

- Public API:
- Restricted API:
- Event ingestion:
- Evidence upload:
- Export API:
- External systems integrated:

### E. Auth, Roles, and Purpose Control

- Roles implemented:
- Purpose-based access implemented:
- Admin controls:
- Audit logging:

### F. Security and Privacy

- Integrity or signing controls:
- Key management:
- Sensitive-data handling:
- Personal-data handling:

### G. Lifecycle and Circularity

- Status transitions supported:
- State-of-health data strategy:
- Repair or second-life support:
- Recycler and dismantling support:

### H. Continuity and Exit

- Data export:
- Identifier portability:
- Escrow or continuity arrangement:
- Provider exit plan:

### I. Commercial and Contractual

- Data reuse restrictions:
- SLA and support:
- Liability boundaries:
- Change-management commitments:

## 5. Red Flags

- 

## 6. Remediation Plan

| Priority | Action | Owner | Target date | Blocking dependency |
| --- | --- | --- | --- | --- |
| P0 |  |  |  |  |
| P1 |  |  |  |  |
| P2 |  |  |  |  |

## 7. Decision

- Recommended outcome:
- Conditions before approval:
- Residual risks:
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a markdown audit template for a battery passport subject."
    )
    parser.add_argument("--subject-name", required=True, help="Display name of the subject")
    parser.add_argument(
        "--subject-type",
        required=True,
        choices=["provider", "platform", "implementation", "solution"],
        help="Audit subject type",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(build_template(args.subject_name, args.subject_type))


if __name__ == "__main__":
    main()
