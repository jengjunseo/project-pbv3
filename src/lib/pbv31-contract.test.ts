import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RequestEpoch } from "@/lib/client-request-guard";
import { formatBytes } from "@/lib/format";
import {
  cancelUploadSchema,
  formatSlotId,
  getFileExtension,
  isSafeObjectPath,
  objectPathBelongsToSlot,
  parseSlotId,
  prepareUploadSchema,
  sanitizeFileName,
  slotCommitSchema,
  validateUploadInput,
} from "@/lib/validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const path17 = `slots/17/${uuid}/notes.txt`;
const migration = readFileSync("supabase/migrations/20260805093000_pb_v3_1_persistence_boundary.sql", "utf8");

describe("PBV3.1 local contracts", () => {
  it("01 accepts slot zero", () => expect(parseSlotId("0")).toBe(0));
  it("02 accepts padded slot zero", () => expect(parseSlotId("00")).toBe(0));
  it("03 accepts slot ninety-nine", () => expect(parseSlotId("99")).toBe(99));
  it("04 rejects negative slots", () => expect(parseSlotId("-1")).toBeNull());
  it("05 rejects slot one hundred", () => expect(parseSlotId("100")).toBeNull());
  it("06 rejects decimal slots", () => expect(parseSlotId("1.5")).toBeNull());
  it("07 rejects missing slots", () => expect(parseSlotId(undefined)).toBeNull());
  it("08 formats every route as two digits", () => expect(formatSlotId(7)).toBe("07"));
  it("09 extracts a lowercase extension", () => expect(getFileExtension("Report.PDF")).toBe("pdf"));
  it("10 strips directory components from names", () => expect(sanitizeFileName("../../a.txt")).toBe("a.txt"));
  it("11 strips control characters", () => expect(sanitizeFileName("a\u0000b.txt")).toBe("ab.txt"));
  it("12 normalizes spaces", () => expect(sanitizeFileName("a   b.txt")).toBe("a-b.txt"));
  it("13 removes leading dots", () => expect(sanitizeFileName("...secret.txt")).toBe("secret.txt"));
  it("14 always returns a nonempty name", () => expect(sanitizeFileName("...")).toBe("file"));
  it("15 accepts a plain text upload", () => expect(validateUploadInput({ name: "a.txt", size: 1, type: "text/plain" }).ok).toBe(true));
  it("16 accepts a PDF upload", () => expect(validateUploadInput({ name: "a.pdf", size: 10, type: "application/pdf" }).ok).toBe(true));
  it("17 rejects empty files", () => expect(validateUploadInput({ name: "a.txt", size: 0, type: "text/plain" }).ok).toBe(false));
  it("18 rejects files over ten MiB", () => expect(validateUploadInput({ name: "a.txt", size: 10 * 1024 * 1024 + 1, type: "text/plain" }).ok).toBe(false));
  it("19 rejects HTML active content", () => expect(validateUploadInput({ name: "a.html", size: 1, type: "text/html" }).ok).toBe(false));
  it("20 rejects SVG active content", () => expect(validateUploadInput({ name: "a.svg", size: 1, type: "image/svg+xml" }).ok).toBe(false));
  it("21 rejects script extensions", () => expect(validateUploadInput({ name: "a.js", size: 1, type: "text/plain" }).ok).toBe(false));
  it("22 rejects extensionless files", () => expect(validateUploadInput({ name: "README", size: 1, type: "text/plain" }).ok).toBe(false));
  it("23 accepts generated exact paths", () => expect(isSafeObjectPath(path17)).toBe(true));
  it("24 accepts recognized legacy paths", () => expect(isSafeObjectPath("slot-17/old.txt")).toBe(true));
  it("25 rejects dot-dot paths", () => expect(isSafeObjectPath("slots/17/../a.txt")).toBe(false));
  it("26 rejects absolute paths", () => expect(isSafeObjectPath("/slots/17/a.txt")).toBe(false));
  it("27 enforces cross-slot ownership", () => expect(objectPathBelongsToSlot(path17, 18)).toBe(false));
  it("28 recognizes matching slot ownership", () => expect(objectPathBelongsToSlot(path17, 17)).toBe(true));
  it("29 invalidates stale request epochs", () => { const e = new RequestEpoch(); const first = e.begin(); e.begin(); expect(e.isCurrent(first)).toBe(false); });
  it("30 accepts the current request epoch", () => { const e = new RequestEpoch(); const current = e.begin(); expect(e.isCurrent(current)).toBe(true); });
  it("31 explicit invalidation makes a request stale", () => { const e = new RequestEpoch(); const current = e.begin(); e.invalidate(); expect(e.isCurrent(current)).toBe(false); });
  it("32 formats binary file sizes", () => expect(formatBytes(1024)).toBe("1.0 KiB"));
  it("33 validates API capability contracts", () => {
    expect(prepareUploadSchema.safeParse({ slotId: 17, name: "a.txt", size: 1, type: "text/plain" }).success).toBe(true);
    expect(cancelUploadSchema.safeParse({ capabilityId: uuid }).success).toBe(true);
    expect(slotCommitSchema.safeParse({ text: "x", fileAction: "replace", capabilityId: uuid }).success).toBe(true);
    expect(slotCommitSchema.safeParse({ text: "x", fileAction: "keep", capabilityId: uuid }).success).toBe(false);
    expect(migration).toContain("update storage.buckets");
    expect(migration).toContain("set public = false");
    expect(migration).toContain("metadata->>'size'");
    expect(migration).toContain("pb_v3_cleanup_not_before");
    expect(migration).toContain("revoke all on function public.pb_v3_commit_slot");
    expect(migration).not.toContain("create or replace function public.pb_v3_evict_oldest");
  });
});
