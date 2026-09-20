import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatSlotId, isSafeObjectPath, objectPathBelongsToSlot, sanitizeFileName, validateUploadInput } from "@/lib/validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("Unicode attachment filenames", () => {
  it.each([
    ["수학시험.pdf", "file.pdf"],
    ["한글 이름.zip", "file.zip"],
    ["사진 01.png", "01.png"],
    ["시험지", "file"],
    ["日本語_파일.txt", "file.txt"],
    ["résumé.txt", "r-sum.txt"],
    ["...secret.txt", "secret.txt"],
    ["a..b.txt", "a-b.txt"],
    ["../../시험지.pdf", "file.pdf"],
    ["a\u0000b.txt", "ab.txt"],
  ])("generates a safe ASCII object name for %s", (original, expected) => {
    const objectName = sanitizeFileName(original);
    expect(objectName).toBe(expected);
    expect(objectName).toMatch(/^[A-Za-z0-9._()\-]+$/);
    expect(objectName).not.toContain("..");
    const objectPath = `slots/${formatSlotId(7)}/${uuid}/${objectName}`;
    expect(isSafeObjectPath(objectPath)).toBe(true);
    expect(objectPathBelongsToSlot(objectPath, 7)).toBe(true);
  });

  it("accepts the original Korean filename as upload metadata", () => {
    expect(validateUploadInput({ name: "수학시험.pdf", size: 1024, type: "application/pdf" }))
      .toEqual({ ok: true, mime: "application/pdf" });
  });

  it("retains the original name in the database and download response", () => {
    const upload = readFileSync("src/lib/uploads.ts", "utf8");
    const slots = readFileSync("src/lib/slots.ts", "utf8");
    const client = readFileSync("src/components/MinimalPB.tsx", "utf8");
    expect(upload).toContain("p_original_name: input.name");
    expect(slots).toContain("name: row.file_name");
    expect(slots).toContain("download: row.file_name");
    expect(client).toContain("name: file.name");
  });
});
