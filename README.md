# Project PB v3

PBV3 is a tiny, login-free transfer pocket. Open a number from **0 to 99**, put text and optionally one small file into it, then open the same number on another device.

**No accounts. No timer. No history.** Slots persist until overwritten, cleared, or evicted under storage pressure.

## PBV3 model
- 100 public slots: `0-99`
- Text up to 30,000 characters
- One file up to 10 MiB by default
- No TTL
- 512 MiB logical soft cap by default
- Oldest **saved** slot evicted first when the soft cap is exceeded
- Read path: one Upstash Redis `GET`
- File upload/download: browser ↔ Vercel Blob directly

## Why it is fast
The critical read path never performs cleanup, TTL refresh, last-read tracking, list scans, or read-side writes. `/slot/[id]` renders from one Redis `GET`; Blob files are served directly by Vercel's file delivery layer.

Writes are intentionally allowed to do more work. Saving updates logical usage and a sorted-set recency index, then evicts oldest-updated slots if necessary.

## Redis keys
```text
pb:v3:slot:{0..99}
pb:v3:order
pb:v3:usage
pb:v3:write-lock
```

## Environment
```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=
PB_STORAGE_LIMIT_BYTES=536870912
PB_MAX_FILE_BYTES=10485760
```

`PB_STORAGE_LIMIT_BYTES` is a soft logical cap. Keep it below the provider's real hard quota so a direct Blob upload has headroom before write-side eviction runs.

## Run
```bash
npm install
npm run dev
```

Quality gates:
```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

## Security boundary
Slots are public-by-number. Anyone can guess, read, overwrite, or clear them. Do not store passwords, credentials, identity documents, or sensitive personal information. Active/executable file types are blocked, and persisted file links must use the Vercel public Blob host.
