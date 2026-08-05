import { describe, expect, it } from "vitest";
import { getFileExtension, parseSlotId, validateBlobPath, validateBlobUrl, validateUploadMeta } from "@/lib/validation";

describe("slot validation", () => {
  it("accepts 0 and 99", () => { expect(parseSlotId("0")).toBe(0); expect(parseSlotId("99")).toBe(99); });
  it("rejects invalid values", () => { expect(parseSlotId("-1")).toBeNull(); expect(parseSlotId("100")).toBeNull(); expect(parseSlotId("abc")).toBeNull(); expect(parseSlotId(null)).toBeNull(); });
});

describe("file validation", () => {
  it("blocks active content", () => { expect(validateUploadMeta({ name: "payload.exe", size: 10, type: "application/octet-stream" }).ok).toBe(false); expect(validateUploadMeta({ name: "page.html", size: 10, type: "text/html" }).ok).toBe(false); });
  it("allows source files", () => { expect(validateUploadMeta({ name: "main.ts", size: 10, type: "text/plain" }).ok).toBe(true); });
  it("extracts extensions", () => { expect(getFileExtension("hello.world.JSON")).toBe("json"); });
  it("binds blob paths to a slot", () => { expect(validateBlobPath(17, "pb-v3/slot-17/abc-note.txt")).toBe(true); expect(validateBlobPath(17, "pb-v3/slot-18/abc-note.txt")).toBe(false); });
  it("accepts only official public Blob hosts", () => { expect(validateBlobUrl("https://abc.public.blob.vercel-storage.com/file.txt")).toBe(true); expect(validateBlobUrl("https://evil.example/file.txt")).toBe(false); });
});
