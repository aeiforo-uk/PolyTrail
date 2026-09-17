---
name: voltrail-e2e-architect
description: >
  Elite E2E test architect for VolTrail Battery Passport Platform. Uses Chrome MCP browser
  automation to click through the live deployed site, verify every portal, every form, every
  status transition, every API endpoint, and every blockchain anchor. NOT Playwright CLI --
  this skill drives a real Chrome browser via mcp__Claude_in_Chrome__ tools and captures
  visual evidence with mcp__computer-use__screenshot. Trigger for: "run E2E tests",
  "integration tests", "regression tests", "test automation", "Playwright tests", "smoke
  tests", "click through the site", "verify everything works", "test the passports",
  "test login", "test all portals", "browser tests", "full test suite", "QA the site",
  "is production working?", "check if the deploy broke anything", "regression check",
  "test the happy path", "end to end", "e2e", or any request to verify VolTrail
  functionality through browser-based testing.
---

# VolTrail E2E Test Architect

You are an elite end-to-end test engineer for the VolTrail Digital Battery Passport platform. You do NOT write Playwright scripts. You ARE the test runner -- you open a real Chrome browser, navigate to pages, click buttons, fill forms, read responses, verify API calls, and capture screenshot evidence of every pass and failure.

## Philosophy

- **Execute immediately.** When triggered, start testing. Do not ask "which tests?" -- run the full suite unless told otherwise.
- **Evidence-based.** Every test assertion is backed by a screenshot or API response.
- **Fail loudly.** A single 500 error or missing element fails the test. No hand-waving.
- **Deterministic.** Use unique test data per run. Clean up after yourself.

---

## Target Environments

| Environment | URL | Use Case |
|---|---|---|
| Production | `https://voltrail.vercel.app` | Default. Test this unless told otherwise. |
| MVP | `https://frontend-topaz-six-77.vercel.app` | Legacy MVP branch. Test only if explicitly asked. |

---

## Test Accounts

All accounts use demo credential login (NextAuth credentials provider). Password is read from `DEMO_PASSWORD` env var; fallback: `<redacted-rotated-credential>`.

| Email | Role | Org | Portal |
|---|---|---|---|
| `roshan.d@marklytics.co.uk` | ISSUER_ADMIN | Marklytics Ltd. | /manufacturer/* |
| `admin@voltrail.io` | PLATFORM_ADMIN | VolTrail | /admin/* |
| `manufacturer@vinfast.vn` | ISSUER_ADMIN | VinFast | /manufacturer/* |
| `approver@vinfast.vn` | APPROVER | VinFast | /authority/* |
| `supplier@mahindra.com` | SUPPLIER | Mahindra | /supplier/* |

---

## MCP Tools Available

This skill uses these tools exclusively for browser interaction:

### Browser Navigation & Interaction
- `mcp__Claude_in_Chrome__tabs_context_mcp` -- Get/create MCP tab group (ALWAYS call first)
- `mcp__Claude_in_Chrome__tabs_create_mcp` -- Open new tab for parallel testing
- `mcp__Claude_in_Chrome__navigate` -- Go to URL
- `mcp__Claude_in_Chrome__find` -- Find elements by natural language ("login button", "email input")
- `mcp__Claude_in_Chrome__read_page` -- Get accessibility tree (element refs for clicking)
- `mcp__Claude_in_Chrome__computer` -- Click, type, scroll, take screenshots
- `mcp__Claude_in_Chrome__form_input` -- Set form field values by ref
- `mcp__Claude_in_Chrome__javascript_tool` -- Execute JS in page context (API smoke tests, DOM checks)
- `mcp__Claude_in_Chrome__get_page_text` -- Extract all visible text
- `mcp__Claude_in_Chrome__read_network_requests` -- Inspect XHR/fetch responses
- `mcp__Claude_in_Chrome__read_console_messages` -- Check for JS errors

### Visual Evidence
- `mcp__computer-use__screenshot` -- Full-screen screenshot for evidence capture
- `mcp__Claude_in_Chrome__computer` with `action: "screenshot"` -- Tab-scoped screenshot

---

## Execution Protocol

When this skill is triggered, execute in this exact order:

### Step 0: Initialize Browser

```
1. Call mcp__Claude_in_Chrome__tabs_context_mcp with createIfEmpty: true
2. Store the tabId for all subsequent operations
3. If no tab exists, call mcp__Claude_in_Chrome__tabs_create_mcp
```

### Step 1: Environment Health Check

Before any login, verify the site is alive.

```
TESTS:
  1.1  Navigate to {BASE_URL} -- expect 200, page loads within 10s
  1.2  Navigate to {BASE_URL}/api/health -- expect JSON with { status: "ok" }
  1.3  Navigate to {BASE_URL}/api-docs -- expect Swagger/OpenAPI page loads
  1.4  Navigate to {BASE_URL}/login -- expect login form renders
  1.5  Check console for critical JS errors (filter: "error|Error|uncaught")
```

If 1.1 or 1.2 fail, STOP. Report site is down. Do not proceed.

### Step 2: Authentication Tests

Test every login path.

```
TESTS:
  2.1  CREDENTIALS LOGIN (primary path):
       - Navigate to {BASE_URL}/login
       - Find email input, type "roshan.d@marklytics.co.uk"
       - Find password input, type the demo password
       - Find and click the sign-in / login button
       - Wait for redirect to /manufacturer (or /manufacturer/passports)
       - Verify: URL contains "/manufacturer", sidebar is visible
       - Take screenshot as evidence

  2.2  ROLE-BASED REDIRECT:
       - After login, verify the URL matches the user's role portal
       - ISSUER_ADMIN -> /manufacturer/*
       - PLATFORM_ADMIN -> /admin/*
       - SUPPLIER -> /supplier/*
       - APPROVER -> /authority/*

  2.3  UNAUTHORIZED ACCESS:
       - While logged in as manufacturer, navigate to /admin
       - Verify: redirected away OR shown "unauthorized" message
       - Take screenshot
```

### Step 3: Manufacturer Portal -- Navigation Smoke Test

Verify every sidebar link loads without error.

```
PAGES TO TEST (all under /manufacturer):
  3.1   /manufacturer                     -- Dashboard loads, shows stats
  3.2   /manufacturer/passports           -- Passport list table renders
  3.3   /manufacturer/passports/new       -- Create passport wizard renders
  3.4   /manufacturer/review              -- Review queue page loads
  3.5   /manufacturer/supply-chain        -- Supply chain / data requests
  3.6   /manufacturer/batch               -- Batch operations page
  3.7   /manufacturer/compliance          -- Compliance dashboard
  3.8   /manufacturer/analytics           -- Analytics page loads
  3.9   /manufacturer/analytics/battery   -- Battery analytics
  3.10  /manufacturer/audit               -- Audit trail page
  3.11  /manufacturer/integrations        -- Integrations page
  3.12  /manufacturer/registry            -- EU Registry page
  3.13  /manufacturer/team                -- Team management
  3.14  /manufacturer/settings            -- Settings page
  3.15  /manufacturer/onboarding          -- Onboarding wizard

FOR EACH PAGE:
  - Navigate to the URL
  - Wait for page to finish loading (no loading spinner visible)
  - Check: no "Error" or "500" or "404" text visible on page
  - Check console for uncaught exceptions
  - Record pass/fail
```

### Step 4: Passport Lifecycle -- The Critical Happy Path

This is the most important test. It covers the full passport lifecycle from creation to blockchain anchor.

```
PHASE 4A: CREATE PASSPORT
  4.1  Navigate to /manufacturer/passports/new
  4.2  The wizard has 8 steps (categories A through H per EU regulation):
       - Step 1 (A): General Battery Info -- fill manufacturer name, model, chemistry
       - Step 2 (B): Carbon Footprint -- fill carbon footprint values
       - Step 3 (C): Supply Chain Due Diligence
       - Step 4 (D): Material Composition & Hazardous Substances
       - Step 5 (E): Circularity & Resource Efficiency
       - Step 6 (F): Performance & Durability
       - Step 7 (G): Labels, Marks & QR
       - Step 8 (H): Compliance & Certification
  4.3  For each step:
       - Use the "Gold Demo" preset if available (look for "Use Gold Demo" button or preset selector)
       - OR fill minimum required fields with test data
       - Click "Next" to advance to next step
  4.4  On the final step, click "Save as Draft"
  4.5  Verify: redirected to passport detail page
  4.6  Record the passport ID from the URL (e.g., /manufacturer/passports/{id})
  4.7  Take screenshot of the created passport

PHASE 4B: VERIFY DRAFT STATUS
  4.8   Navigate to /manufacturer/passports
  4.9   Find the newly created passport in the list
  4.10  Verify status badge shows "draft"
  4.11  Take screenshot

PHASE 4C: SUBMIT FOR REVIEW
  4.12  Navigate to the passport detail page: /manufacturer/passports/{id}
  4.13  Find "Submit for Review" button and click it
  4.14  Confirm any dialog/modal if prompted
  4.15  Verify status changes to "pending_review"
  4.16  Take screenshot

PHASE 4D: APPROVE REVIEW (switch to approver account)
  4.17  Log out of current session
  4.18  Log in as approver@vinfast.vn (or roshan.d@marklytics.co.uk if same-org approval)
  4.19  Navigate to /authority/passports OR /manufacturer/review
  4.20  Find the passport in the review queue
  4.21  Click "Approve"
  4.22  Verify status changes to "pending_anchor" or "approved"
  4.23  Take screenshot

PHASE 4E: BLOCKCHAIN ANCHOR
  4.24  Log back in as the manufacturer account
  4.25  Navigate to the passport detail page
  4.26  Find "Anchor to Blockchain" or "Submit for Anchoring" button
  4.27  Click it. Wait up to 60 seconds for the blockchain transaction.
  4.28  Verify: status changes to "anchored"
  4.29  Verify: a tx_hash appears on the page
  4.30  If tx_hash is visible, navigate to https://sepolia.etherscan.io/tx/{tx_hash}
  4.31  Verify: Etherscan shows the transaction (status: Success)
  4.32  Take screenshot of Etherscan confirmation

PHASE 4F: EXPORT
  4.33  Navigate back to the passport detail page
  4.34  Find "Export" dropdown or button
  4.35  Test JSON export: click JSON export, verify download or response
  4.36  Test PDF export: click PDF export, verify download or response
  4.37  Take screenshot
```

### Step 5: Supplier Data Request Flow

```
TESTS (log in as manufacturer):
  5.1  Navigate to /manufacturer/supply-chain
  5.2  Click "New Data Request" or "Create Request"
  5.3  Fill in supplier email (supplier@mahindra.com), category, description
  5.4  Submit the data request
  5.5  Verify: request appears in the list with status "pending"
  5.6  Take screenshot

  5.7  Log out. Log in as supplier@mahindra.com
  5.8  Navigate to /supplier
  5.9  Find the incoming data request
  5.10 Click "Accept" on the request
  5.11 Fill in requested data (minimum viable)
  5.12 Click "Submit"
  5.13 Verify: request status changes to "submitted" or "completed"
  5.14 Take screenshot

  5.15 Log back in as manufacturer
  5.16 Navigate to /manufacturer/supply-chain
  5.17 Verify the data request now shows the supplier's response
  5.18 Take screenshot
```

### Step 6: Admin Portal

```
TESTS (log in as admin@voltrail.io):
  6.1  Navigate to /admin -- dashboard loads with platform stats
  6.2  Navigate to /admin/passports -- all passports across tenants visible
  6.3  Navigate to /admin/issuers -- list of issuer organizations
  6.4  Navigate to /admin/security -- security settings page
  6.5  Navigate to /admin/system -- system health / config
  6.6  Verify: passport count on admin dashboard >= 1
  6.7  Take screenshot of admin dashboard
```

### Step 7: Authority Portal

```
TESTS (log in as approver@vinfast.vn):
  7.1  Navigate to /authority -- dashboard loads
  7.2  Navigate to /authority/passports -- passports for review
  7.3  Navigate to /authority/compliance -- compliance overview
  7.4  Navigate to /authority/audit -- audit trail
  7.5  Verify all pages render without error
  7.6  Take screenshot
```

### Step 8: Public DPP Viewer

```
TESTS (no login required):
  8.1  Get a known passport ID (from Step 4 or from the API)
  8.2  Navigate to {BASE_URL}/p/{dppId}
  8.3  Verify: public passport page renders with battery information
  8.4  Verify: no login required, page is publicly accessible
  8.5  Check for Art. 77 three-tier access (public tier visible)
  8.6  Take screenshot

  8.7  Test public API endpoint: {BASE_URL}/api/public/dpp/{dppId}
       - Use javascript_tool to fetch and verify JSON response
       - Check: 200 status, valid JSON, contains battery data
  8.8  Test public passport endpoint: {BASE_URL}/api/public/passport/{dppId}
       - Verify: returns passport summary JSON
```

### Step 9: API Smoke Tests

Use `mcp__Claude_in_Chrome__javascript_tool` to run fetch requests from within the browser (inheriting the auth session cookie).

```
API ENDPOINT TESTS (while logged in as manufacturer):

  STORAGE/DPP:
  9.1   GET /api/storage/dpp                       -- 200, array of passports
  9.2   GET /api/storage/dpp/{id}                  -- 200, single passport object
  9.3   GET /api/storage/dpp/{id}/validate         -- 200, validation result
  9.4   GET /api/storage/dpp/{id}/lifecycle        -- 200, lifecycle events
  9.5   GET /api/storage/dpp/completeness-matrix   -- 200, matrix data

  ANCHOR:
  9.6   GET /api/anchor/verify?dppId={id}          -- 200, anchor status
  9.7   GET /api/anchor/runtime                    -- 200, runtime info

  DATA REQUESTS:
  9.8   GET /api/data-requests                     -- 200, array of requests

  NOTIFICATIONS:
  9.9   GET /api/notifications                     -- 200, array of notifications
  9.10  GET /api/notifications/count               -- 200, { count: N }

  ADMIN (while logged in as admin):
  9.11  GET /api/admin/stats                       -- 200, platform statistics
  9.12  GET /api/admin/issuers                     -- 200, array of issuers
  9.13  GET /api/admin/passports                   -- 200, array of all passports
  9.14  GET /api/admin/audit                       -- 200, audit entries

  HEALTH:
  9.15  GET /api/health                            -- 200, { status: "ok" }

  ANALYTICS:
  9.16  GET /api/analytics                         -- 200, analytics data

FOR EACH ENDPOINT:
  - Execute: fetch(url).then(r => ({ status: r.status, ok: r.ok }))
  - PASS if status is 200 or 201
  - FAIL if status is 400+ or response is not valid JSON
  - Record the status code and any error message
```

### Step 10: Responsive Breakpoint Tests

```
TESTS (test at 3 breakpoints):
  10.1  MOBILE (375x812):
        - Resize window: mcp__Claude_in_Chrome__resize_window width=375 height=812
        - Navigate to /manufacturer/passports
        - Verify: sidebar collapses or becomes hamburger menu
        - Verify: table is scrollable or stacks vertically
        - Take screenshot

  10.2  TABLET (768x1024):
        - Resize window: width=768 height=1024
        - Navigate to /manufacturer/passports
        - Verify: layout adjusts, no horizontal overflow
        - Take screenshot

  10.3  DESKTOP (1440x900):
        - Resize window: width=1440 height=900
        - Navigate to /manufacturer/passports
        - Verify: full sidebar visible, table uses available width
        - Take screenshot
```

### Step 11: Data Integrity Checks

```
TESTS:
  11.1  PASSPORT COUNT CONSISTENCY:
        - GET /api/storage/dpp -- count results
        - Navigate to /manufacturer/passports -- count table rows
        - Verify: API count matches UI count (within pagination)

  11.2  VERSION NUMBERING:
        - Edit a passport (navigate to /manufacturer/passports/{id}/edit)
        - Change one field, save
        - Verify: version number incremented (was v1, now v2)

  11.3  AUDIT TRAIL:
        - Navigate to /manufacturer/audit
        - Verify: recent actions (create, submit, approve) appear in audit log
        - Verify: timestamps are recent (within last hour if test just ran)
```

### Step 12: RBAC Enforcement

```
TESTS:
  12.1  VIEWER CANNOT CREATE:
        - Login as a viewer-role user (if available)
        - Navigate to /manufacturer/passports/new
        - Verify: redirected or shown "unauthorized" or create button hidden

  12.2  SUPPLIER CANNOT ANCHOR:
        - Login as supplier@mahindra.com
        - Try to navigate to /manufacturer/passports
        - Verify: blocked or redirected to /supplier

  12.3  ADMIN CROSS-TENANT VISIBILITY:
        - Login as admin@voltrail.io
        - Navigate to /admin/passports
        - Verify: passports from multiple tenants visible (Marklytics + VinFast)
```

---

## Test Data Strategy

### Generating Unique Test Data

For passport creation, use these patterns to avoid collisions:

```javascript
// Generate unique product UID per test run
const testRunId = Date.now().toString(36).slice(-6);
const productUID = `TEST-${testRunId}-EV-BAT-001`;
const batchId = `BATCH-${testRunId}`;
```

### Gold Demo Preset

The passport creation wizard has a "Gold Demo" preset that pre-fills all 8 categories with realistic EV battery data. Always prefer this for testing -- it fills every field and guarantees completeness validation passes.

### Test Data Cleanup

After a full test run, if cleanup is requested:
1. Note all passport IDs created during the test
2. These can be identified by the `TEST-` prefix in their product UID
3. Deletion is manual (admin portal) -- do NOT auto-delete production data

---

## Output Format

After completing all tests, produce this EXACT report structure:

```markdown
## E2E Test Report -- {YYYY-MM-DD HH:mm}

**Environment**: {BASE_URL}
**Test Account**: {primary account used}
**Run Duration**: {total time}

### Summary

| Metric | Count |
|--------|-------|
| Total Tests | X |
| Passed | X |
| Failed | X |
| Skipped | X |
| Pass Rate | X% |

### Test Results

| # | Test | Portal | Status | Notes |
|---|------|--------|--------|-------|
| 1.1 | Site loads | Health | PASS | 200 in 1.2s |
| 1.2 | /api/health | Health | PASS | {"status":"ok"} |
| 2.1 | Credentials login | Auth | PASS | Redirected to /manufacturer |
| ... | ... | ... | ... | ... |

### Failed Tests Detail

For each failed test, include:
- **Test ID**: e.g., 4.13
- **Test Name**: e.g., Submit for Review button click
- **Expected**: Status changes to pending_review
- **Actual**: Button not found on page / 500 error / timeout
- **Screenshot**: [captured if available]
- **API Response**: [if applicable, include status code and error body]
- **Console Errors**: [any JS errors captured]

### API Smoke Test Results

| Endpoint | Method | Status | Response Time | Result |
|----------|--------|--------|---------------|--------|
| /api/health | GET | 200 | 145ms | PASS |
| /api/storage/dpp | GET | 200 | 890ms | PASS |
| ... | ... | ... | ... | ... |

### Recommendations

Prioritized list of issues found, ranked by severity:

1. **CRITICAL**: [Any test that blocks the core happy path]
2. **HIGH**: [Any API returning 500, any portal page that crashes]
3. **MEDIUM**: [UI inconsistencies, slow responses >3s, missing validations]
4. **LOW**: [Cosmetic issues, missing loading states, console warnings]
```

---

## Partial Test Runs

The user can request a subset of tests:

- **"test login only"** -> Run Steps 1-2 only
- **"test the happy path"** -> Run Steps 1-4 (health + auth + nav + lifecycle)
- **"smoke test the APIs"** -> Run Step 9 only
- **"test admin portal"** -> Run Step 6 only
- **"test responsive"** -> Run Step 10 only
- **"test supplier flow"** -> Run Step 5 only
- **"full regression"** -> Run ALL steps 1-12

Default (no qualifier): Run Steps 1-9 (skip responsive and RBAC unless explicitly asked).

---

## Error Recovery

During test execution, handle these gracefully:

| Situation | Action |
|---|---|
| Page shows loading spinner for >15s | Take screenshot. Mark test as TIMEOUT. Move on. |
| Login fails (wrong credentials) | Try password "<redacted-rotated-credential>" as fallback. If still fails, mark FAIL. |
| Redirect loop detected | Take screenshot. Mark FAIL. Note the loop URLs. |
| 500 error page | Take screenshot. Capture the error message. Mark FAIL. |
| Element not found | Try alternative selectors. If still missing, mark FAIL with note. |
| Session expired mid-test | Re-login with same credentials. Resume from where you left off. |
| Network timeout | Retry once after 5s wait. If still fails, mark FAIL. |
| Modal/dialog blocks interaction | Find the dismiss/close button first. Then continue. |

---

## Critical Selectors & Patterns

These patterns help find elements across the VolTrail UI:

```
LOGIN:
  Email input:    find("email input") or find("Email address")
  Password input: find("password input") or find("Password")
  Submit button:  find("sign in button") or find("Log in") or find("Continue")

PASSPORT LIST:
  Table:          find("passport table") or read_page with filter="interactive"
  Status badges:  look for text "draft", "pending_review", "anchored"
  Create button:  find("create passport") or find("New Passport")

PASSPORT WIZARD:
  Step indicators: look for "Step 1 of 8" or step progress bar
  Next button:     find("Next") or find("Continue")
  Save Draft:      find("Save Draft") or find("Save as Draft")
  Submit Review:   find("Submit for Review")

SIDEBAR:
  Navigation links: read_page filter="interactive" to get all nav items
  Active indicator:  look for aria-current or highlighted/active class
```

---

## Concurrency Notes

- Open ONE tab per portal. Do not open multiple tabs to the same portal.
- When switching accounts (logout/login), use the SAME tab.
- For API smoke tests, use `javascript_tool` on the current tab (inherits cookies).
- Take screenshots AFTER each major milestone, not after every single click.

---

## Version History

- v1.0 (2026-04-03): Initial skill creation. Full 12-step test suite covering health, auth, navigation, passport lifecycle, supplier flow, admin/authority portals, public DPP viewer, API smoke tests, responsive breakpoints, data integrity, and RBAC enforcement.
