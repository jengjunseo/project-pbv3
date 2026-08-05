# PBV3 QA

- [ ] Home accepts 0 and 99; rejects 100 and non-numeric input.
- [ ] Empty slot can save text.
- [ ] Reloading preserves data indefinitely (no TTL).
- [ ] Another device can open the same slot.
- [ ] File upload works under configured max size.
- [ ] Replacing/removing a file cleans the previous Blob best-effort.
- [ ] Clear removes slot/order/usage and Blob best-effort.
- [ ] Soft-cap pressure evicts oldest-updated slots, never the just-saved slot.
- [ ] Focus refresh does not overwrite unsaved local edits.
- [ ] Ctrl/Cmd+S saves.
- [ ] Mobile sticky save bar works.
- [ ] `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build` pass.
