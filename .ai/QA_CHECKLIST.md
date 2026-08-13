# PBV3.1 QA Checklist

## Automated

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run test` — attachment and persistence contract tests
- [ ] `npm run lint`
- [ ] `npm run security:scan`
- [ ] `npm run build`
- [ ] Preview migration applies cleanly
- [ ] `pbv3_security_checks.sql` passes
- [ ] `pbv3_transaction_checks.sql` passes and rolls back

## Browser preview

- [ ] `00 → 1 → 01 → 7 → 17` input behavior remains natural
- [ ] All `/slot/00`–`/slot/99` shells open
- [ ] Text save/reload works across devices
- [ ] File upload/download works through private signed URLs
- [ ] Replacing a file never destroys the old file when commit fails
- [ ] Rapid `12 → 17` switching cannot show slot 12 data in slot 17
- [ ] A late save response cannot overwrite the new slot UI
- [ ] Ctrl/Cmd+S works without listener churn
- [ ] LOAD ERR / SAVE ERR / UPLOAD ERR are distinguishable
- [ ] Anonymous direct table CRUD fails
- [ ] Anonymous direct Storage list/read/write/delete fails
- [ ] Cancelled/expired/replayed uploads become cleanup candidates
- [ ] Cleanup retry becomes dead after attempt eight

## Safety

- [ ] Production Supabase migration history is unchanged
- [ ] Production Vercel deployment is unchanged
