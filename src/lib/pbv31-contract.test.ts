import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RequestEpoch } from "@/lib/client-request-guard";
import { MAX_FILE_BYTES } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import {
  cancelUploadSchema,
  formatSlotId,
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
const client = readFileSync("src/components/MinimalPB.tsx", "utf8");
const arbitraryAttachmentCases = [
  ["notes.txt", "text/plain"],
  ["archive.zip", "application/zip"],
  ["archive.zip", "application/x-zip-compressed"],
  ["archive.zip", "application/octet-stream"],
  ["archive.zip", ""],
  ["archive.zip", "application/vnd.vendor-zip"],
  ["page.html", "text/html"],
  ["script.js", "application/javascript"],
  ["vector.svg", "image/svg+xml"],
  ["document.xml", "application/xml"],
  ["binary.exe", "application/x-msdownload"],
  ["app.apk", "application/vnd.android.package-archive"],
  ["unknown.xyz", "application/octet-stream"],
  ["unknown.xyz", ""],
  ["README", ""],
  ["document.pdf", "application/pdf"],
] as const;

describe("PBV3.1 local contracts", () => {
  it("01 accepts slot zero", () => expect(parseSlotId("0")).toBe(0));
  it("02 accepts padded slot zero", () => expect(parseSlotId("00")).toBe(0));
  it("03 accepts slot ninety-nine", () => expect(parseSlotId("99")).toBe(99));
  it("04 rejects negative slots", () => expect(parseSlotId("-1")).toBeNull());
  it("05 rejects slot one hundred", () => expect(parseSlotId("100")).toBeNull());
  it("06 rejects decimal slots", () => expect(parseSlotId("1.5")).toBeNull());
  it("07 rejects missing slots", () => expect(parseSlotId(undefined)).toBeNull());
  it("08 formats every route as two digits", () => expect(formatSlotId(7)).toBe("07"));
  it("09 strips directory components from names", () => expect(sanitizeFileName("../../a.txt")).toBe("a.txt"));
  it("10 strips control characters", () => expect(sanitizeFileName("a\u0000b.txt")).toBe("ab.txt"));
  it("11 normalizes spaces", () => expect(sanitizeFileName("a   b.txt")).toBe("a-b.txt"));
  it("12 removes leading dots", () => expect(sanitizeFileName("...secret.txt")).toBe("secret.txt"));
  it("13 always returns a nonempty name", () => expect(sanitizeFileName("...")).toBe("file"));
  it.each(arbitraryAttachmentCases)("accepts arbitrary attachment %s with MIME %s", (name, type) => {
    const result = validateUploadInput({ name, size: 1, type });
    expect(result).toEqual({ ok: true, mime: type.trim().toLowerCase() || "application/octet-stream" });
  });
  it("14 accepts a file exactly ten MiB", () => expect(validateUploadInput({ name: "exact.bin", size: MAX_FILE_BYTES, type: "" }).ok).toBe(true));
  it("15 rejects empty files", () => expect(validateUploadInput({ name: "empty", size: 0, type: "" }).ok).toBe(false));
  it("16 rejects files over ten MiB", () => expect(validateUploadInput({ name: "over.bin", size: MAX_FILE_BYTES + 1, type: "application/octet-stream" }).ok).toBe(false));
  it("17 rejects oversized filename metadata", () => expect(prepareUploadSchema.safeParse({ slotId: 17, name: "a".repeat(181), size: 1, type: "" }).success).toBe(false));
  it("18 rejects malformed MIME metadata without treating its value as authorization", () => expect(prepareUploadSchema.safeParse({ slotId: 17, name: "a.bin", size: 1, type: "x".repeat(121) }).success).toBe(false));
  it("19 rejects an invalid slot in the prepare contract", () => expect(prepareUploadSchema.safeParse({ slotId: 100, name: "a.bin", size: 1, type: "" }).success).toBe(false));
  it("20 defaults a missing MIME to octet-stream", () => expect(prepareUploadSchema.parse({ slotId: 17, name: "README", size: 1 }).type).toBe("application/octet-stream"));
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
    expect(migration).toContain("create table if not exists public.pb_v3_slots");
    expect(migration).toContain("insert into storage.buckets");
    expect(migration).toContain("on conflict (id) do update");
    expect(migration).toContain("false,");
    expect(migration).toContain("allowed_mime_types");
    expect(migration).toMatch(/10485760,\s*null\s*\)/);
    expect(migration).toContain("metadata->>'size'");
    expect(migration).toContain("pb_v3_cleanup_not_before");
    expect(migration).toContain("revoke all on function public.pb_v3_commit_slot");
    expect(migration).not.toContain("create or replace function public.pb_v3_evict_oldest");
    expect(client).toContain('fetch("/api/uploads/prepare"');
    expect(client).toContain('method: "PUT"');
    expect(client).toContain('const formData = new FormData()');
    expect(client).toContain('formData.append("cacheControl", "3600")');
    expect(client).toContain('file.slice(0, file.size, "application/octet-stream")');
    expect(client).toContain('formData.append("", opaqueFile, "attachment")');
    expect(client).not.toContain('"Content-Type": file.type');
    expect(client).toContain('/download`');
    expect(client).toContain('aria-label="전체 텍스트 복사"');
    expect(client).toContain('current.removeFile || !current.hydrated');
    expect(client).not.toContain('void load(slot ?? 0)');
    expect(client).not.toContain('먼저 LOAD로 해당 슬롯을 불러온 뒤 저장하세요.');
  });
});
