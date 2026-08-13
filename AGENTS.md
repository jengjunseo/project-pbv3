# PBV3.1 Agent Guide

## Non-negotiable product invariants

- Slots are public and addressed by `00`–`99`.
- There is no TTL. Data remains until overwrite, clear, or capacity eviction.
- Preserve the existing PB visual language and numeric input behavior.
- Browser code never imports Supabase, receives a publishable key, or calls `/rest/v1` or `/storage/v1` directly.
- Database mutation authority, byte accounting, timestamps, object paths, revisions, reservations, and eviction stay server/DB-owned.
- File bytes travel browser → exact signed Storage URL; they do not pass through a Vercel Function.
- Never delete the old object before the new slot transaction commits.
- Reads and saves must ignore stale responses after slot navigation.
- Production deployment and production database changes require a separate explicit instruction.

## Storage transaction order

1. Server validates input and creates a random exact path.
2. Database reserves 10 MiB and creates a single-use capability.
3. Browser uploads to that exact private-bucket path.
4. Commit RPC locks capability/current slot, reads actual Storage metadata, calculates UTF-8 bytes, commits the row, then queues old/evicted objects.
5. Cleanup worker deletes queue items after any signed-upload replay window and retries failures with bounded backoff.

## Required checks

```bash
npm run typecheck
npm run test
npm run lint
npm run security:scan
npm run build
```

For schema work, apply the migration only to disposable/preview Supabase and run both SQL files under `supabase/tests/`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
