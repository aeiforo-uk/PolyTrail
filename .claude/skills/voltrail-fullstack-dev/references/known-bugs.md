# Known Bugs & Their Fixes

This catalog documents bugs we've encountered and resolved in VolTrail.
Check here FIRST when debugging — the same patterns recur.

---

## 1. Drizzle `.returning()` Returns Empty Array
**Symptom:** API creates/updates a record but response has no data, or "0 passports created"
**Cause:** Neon's HTTP driver doesn't support `.returning()` — silently returns `[]`
**Fix:** Replace with `getRawSql()` tagged template + separate SELECT if needed
**Files affected:** Every API route that writes to DB
**Status:** All routes migrated as of March 2026

## 2. `useUser can only be used inside ClerkProvider`
**Symptom:** 500 error on `/auth/redirect` or any page using Clerk hooks
**Cause:** ClerkProvider was removed from layout.tsx but imports remain
**Fix:** Replace all `useUser`/`useClerk` with `useSession`/`signOut` from `next-auth/react`
**Files affected:** sidebar.tsx, top-bar.tsx, command-palette.tsx, auth/redirect, onboard pages
**Status:** Fixed — all Clerk UI hooks removed

## 3. Verify Integrity Shows "Hash Mismatch" (False Positive)
**Symptom:** Clicking "Verify Integrity" always shows red "data may have been tampered with"
**Cause:** Frontend sends UUID but verify endpoint only queried by 66-char hex `passport_id`
**Fix:** Added UUID detection in verify route — queries `id` column for UUIDs
**Status:** Fixed

## 4. `CLIENT_FETCH_ERROR` on Login Page
**Symptom:** NextAuth error in console, session fetch fails
**Cause:** Usually stale session cookie after redeployment, or NEXTAUTH_URL mismatch
**Fix:** Clear cookies, verify NEXTAUTH_URL matches deployment URL exactly
**Status:** Recurring — happens after each deployment

## 5. Supply Chain Page Shows No Data Intermittently
**Symptom:** Supply Chain sidebar page sometimes shows partners, sometimes empty
**Cause:** `data_requests` table has no `deleted_at` column but query filtered by it
**Fix:** Removed `AND deleted_at IS NULL` from data_requests queries
**Status:** Fixed

## 6. Team Page Shows No Members
**Symptom:** Team management page shows 0 members
**Cause:** Drizzle SELECT with complex joins failing silently
**Fix:** Migrated to raw SQL with proper tenant_id filtering
**Status:** Fixed

## 7. Demo Mode Leaks Into Production
**Symptom:** Real DB queries mixed with demo users, confusing data
**Cause:** `DEMO_PASSWORD` env var still set even when `DEMO_MODE=false`
**Fix:** Guard demo user check with `isDemoMode()` in auth-options.ts
**Status:** Fixed

## 8. Google OAuth Login Loops / Error Page
**Symptom:** Google sign-in works but redirects to error page
**Cause:** `/auth/redirect` page imported `useUser` from `@clerk/nextjs` without ClerkProvider
**Fix:** Rewrote redirect page to use NextAuth `useSession()` only
**Status:** Fixed

## 9. Passport Detail Shows All Zeros
**Symptom:** Data tab on passport shows 0 for all values
**Cause:** Version payload stored as nested `{payload: {payload: {...}}}` — component reads wrong level
**Fix:** Added payload normalization in the detail page data extraction
**Status:** Fixed

## 10. Batch Creation Creates 0 Passports
**Symptom:** Quick batch creates 0 passports, shows success but empty results
**Cause:** Drizzle `.returning()` in batch-from-template route returns empty array
**Fix:** Migrated to raw SQL INSERT + manual response construction
**Status:** Fixed
