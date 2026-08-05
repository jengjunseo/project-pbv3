# PBV3 Agent Guide

PBV3 is intentionally small. Keep the product surface narrow and the critical path fast.

## Product invariants
- Slots are public and addressed only by numbers 0-99.
- Slot data has no TTL. It remains until overwritten, cleared, or evicted by storage pressure.
- Reads must stay cheap: a slot read is one Redis `GET`. Never mutate access timestamps on read.
- Eviction happens on writes only, oldest-updated slot first.
- Files go directly browser -> Vercel Blob. Never proxy file bytes through a Next.js function.
- Redis stores text + file metadata + ordering/usage metadata. Blob stores file bytes.
- No login, chat, history, comments, notifications, or background cron unless the product scope explicitly changes.

## Quality gates
Run `npm run typecheck`, `npm run test`, `npm run lint`, and `npm run build` before shipping.

## Change discipline
Prefer local, explicit changes. Do not introduce a framework, ORM, state library, or component library for a problem that can be solved directly in this codebase.
