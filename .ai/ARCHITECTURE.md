# PBV3 Architecture

PBV3 is a public 100-slot transfer pocket. Persistence is indefinite. Capacity pressure is handled by write-side eviction instead of TTL.

## Hot path
`/slot/[id]` is a dynamic Server Component and calls `readSlot(id)` directly. `readSlot` performs exactly one Redis `GET`. Do not add read-side analytics, last-seen updates, TTL refreshes, or cleanup scans.

## Write consistency
Writes use a short coarse Redis lock because there are only 100 slots and write throughput is not the bottleneck. Usage accounting and eviction therefore stay simple and deterministic.

Order is stored in a sorted set. A save performs `ZADD(score=updatedAt)`. Eviction removes oldest-updated slots until logical usage is under the configured soft cap.

## Blob lifecycle
New files upload directly browser -> Blob. Successful replacement, clear, and eviction delete old Blob objects best-effort. Redis remains authoritative for what is visible in PB.
