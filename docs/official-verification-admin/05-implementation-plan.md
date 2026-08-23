# Official Verification Admin — Implementation Plan

## Task-01 — Database and backend API

- Spec: OVA-01, OVA-02, OVA-03, OVA-05
- TDD: Standard
- Complexity: Medium
- Status: completed
- Files:
  - `backend/migrations/003_official_identities.sql`
  - `backend/src/verification.rs`
  - `backend/src/lib.rs`
  - `backend/src/routes.rs`
  - `backend/src/state.rs`
  - `backend/src/config.rs`
  - `backend/Cargo.toml`

Implement canonical normalization, public verification with rate limiting, authenticated CRUD, migration, indexes, and seed data.

## Task-02 — Admin interface

- Spec: OVA-02
- TDD: Lite
- Complexity: Medium
- Status: completed
- Files:
  - `admin/index.html`
  - `admin/app.js`
  - `admin/styles.css`

Add an Official Verification section with list, create/edit, active status, and deletion.

## Task-03 — Website proxy and edge exposure

- Spec: OVA-03, OVA-04
- TDD: Standard
- Complexity: Low
- Status: completed
- Files:
  - `src/app/api/official-verification/route.ts`
  - `src/components/OfficialVerificationTool.tsx`
  - `admin/nginx-api.bitbt.com.conf.example`

Replace the frontend allowlist with a same-origin Next proxy that rate-limits by visitor IP, rejects oversized bodies, and fail-closes to the Rust API. Expose the public backend path through Nginx.

## Task-04 — Verification, review, and deployment

- Spec: OVA-01 through OVA-05
- TDD: Standard
- Complexity: Medium
- Status: completed

Deployed 2026-07-26: commit `c699699`, API/Nginx/admin on `43.199.96.207`, frontend pushed for Amplify.

## Commit policy

No commit or push will be created unless explicitly requested by the user.
