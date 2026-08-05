# Project PB v3.1

PB is a login-free public pocket: open one of the slots `00`–`99`, place text and optionally one file in it, then open the same number on another device.

PBV3.1 keeps the existing PB interface and permanent retention model, but replaces the persistence boundary. The browser no longer talks to Supabase Database or Storage with broad public credentials.

```text
Browser
 ├─ static PB UI ─────────── Vercel CDN
 ├─ same-origin /api/* ───── Vercel Function (icn1)
 │                              ↓
 │                         Supabase Seoul
 └─ exact signed upload ─── private Supabase Storage
```

## Product rules

- Public slots: `00`–`99`
- No account or timer
- Text limit: 30,000 characters
- File limit: 10 MiB
- Logical storage cap: 512 MiB
- Oldest-updated slots are evicted only under capacity pressure
- Slot contents remain until overwritten, cleared, or evicted
- PB is not a secure vault; never store credentials or sensitive documents

## PBV3.1 persistence boundary

- Browser mutations go only through same-origin JSON APIs.
- `SUPABASE_SECRET_KEY` exists only in the server runtime.
- `pb_v3_slots` timestamps, paths, byte counts, revisions, and eviction decisions are database-owned.
- Text size uses PostgreSQL `octet_length`, so UTF-8 bytes—not JavaScript character counts—drive capacity.
- File size comes from `storage.objects.metadata.size`; client claims are ignored at commit time.
- The `pb-v3` bucket is private after the migration.
- Upload preparation produces one random exact object path and a signed upload URL.
- One pending capability reserves the full 10 MiB worst case; a fingerprint may hold at most two.
- Signed-upload replay is contained by delaying deletion of capability-created paths until the signed URL lifetime has elapsed.
- New object upload, metadata verification, slot commit, and old-object cleanup follow a commit-before-cleanup order.
- Cleanup is durable, leased, retried with backoff, and moved to `dead` after eight attempts.

## API routes

- `GET /api/slots/:id` — read text and file metadata
- `POST /api/slots/:id` — transactional save
- `DELETE /api/slots/:id` — clear slot and cancel pending uploads
- `GET /api/slots/:id/download` — create a 60-second private download URL
- `POST /api/uploads/prepare` — reserve capacity and issue an exact signed upload
- `POST /api/uploads/cancel` — cancel a pending capability
- `GET /api/maintenance/cleanup` — authenticated durable cleanup worker

Mutation routes enforce same-origin requests, JSON content type, streamed body limits, and database-backed rate limits.

## Static slot shell and latency

`/slot/00` through `/slot/99` are generated as static page shells. Persistence APIs are pinned to Vercel Seoul (`icn1`) with `vercel.json`. A normal text read is one same-origin browser request followed by one server-side Supabase row read. Private file signing happens only when the file is opened, not on every text load.

## Environment

Copy `.env.example` to `.env.local`:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
PB_APP_ORIGIN=http://localhost:3000
PB_FINGERPRINT_SECRET=replace-with-at-least-32-random-characters
PB_MAINTENANCE_SECRET=replace-with-at-least-32-random-characters
CRON_SECRET=replace-with-at-least-32-random-characters
```

Never create `NEXT_PUBLIC_SUPABASE_*` variables for PBV3.1.

## Database migration

The reproducible migration is:

```text
supabase/migrations/20260805093000_pb_v3_1_persistence_boundary.sql
```

It is intentionally **not auto-applied**. Apply it to a disposable or preview Supabase branch first, then run:

```text
supabase/tests/pbv3_security_checks.sql
supabase/tests/pbv3_transaction_checks.sql
```

The existing production project must not receive this migration until preview certification passes.

## Local quality gates

```bash
npm install
npm run typecheck
npm run test          # 33 local contract tests
npm run lint
npm run security:scan
npm run build
```

The security scan rejects server secrets, Supabase REST/Storage endpoints, and browser-side Authorization headers in client components.

## Preview certification

Before production:

1. Apply the migration on a disposable/preview Supabase database.
2. Pass both SQL security/transaction suites inside `BEGIN … ROLLBACK`.
3. Pass install, typecheck, 33 tests, lint, secret scan, and production build.
4. Verify browser text save/reload, file upload/download, rapid slot switching, stale save/load races, cancellation, and direct anonymous DB/Storage denial.
5. Only then plan a separate, explicitly approved production migration and deployment.
