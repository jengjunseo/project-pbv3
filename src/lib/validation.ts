import { z } from "zod";
import { ALLOWED_MIME_TYPES, BLOCKED_EXTENSIONS, MAX_TEXT_CHARS, SAFE_SOURCE_EXTENSIONS, SLOT_MAX, SLOT_MIN } from "@/lib/constants";
import { getMaxFileBytes } from "@/lib/config";
import type { PBFileMeta } from "@/types/pb";

export const slotIdSchema = z.number().int().min(SLOT_MIN).max(SLOT_MAX);

const fileMetaSchema: z.ZodType<PBFileMeta> = z.object({
  url: z.string().url(),
  pathname: z.string().min(1).max(500),
  name: z.string().min(1).max(180),
  size: z.number().int().nonnegative(),
  type: z.string().max(120),
  uploadedAt: z.number().int().positive(),
});

export const slotWriteSchema = z.object({ id: slotIdSchema, text: z.string().max(MAX_TEXT_CHARS), file: fileMetaSchema.nullable() });

export function parseSlotId(value: unknown): number | null {
  if (typeof value === "number") {
    const parsed = slotIdSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{1,2}$/.test(normalized)) return null;
  const parsed = slotIdSchema.safeParse(Number(normalized));
  return parsed.success ? parsed.data : null;
}

export function getFileExtension(name: string): string {
  const clean = name.trim().toLowerCase();
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index + 1) : "";
}

export function validateUploadMeta(input: { name: string; size: number; type: string }): { ok: true } | { ok: false; message: string } {
  const name = input.name.trim();
  if (!name || name.length > 180) return { ok: false, message: "파일 이름은 1~180자여야 합니다." };
  if (!Number.isSafeInteger(input.size) || input.size <= 0) return { ok: false, message: "빈 파일은 업로드할 수 없습니다." };
  if (input.size > getMaxFileBytes()) return { ok: false, message: "파일이 허용된 최대 크기를 넘었습니다." };
  const extension = getFileExtension(name);
  if (BLOCKED_EXTENSIONS.has(extension)) return { ok: false, message: `.${extension} 파일은 업로드할 수 없습니다.` };
  const mime = input.type.trim().toLowerCase() || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mime) && !SAFE_SOURCE_EXTENSIONS.has(extension)) return { ok: false, message: "지원하지 않는 파일 형식입니다." };
  return { ok: true };
}

export function validateBlobPath(slotId: number, pathname: string): boolean {
  return pathname.startsWith(`pb-v3/slot-${slotId}/`) && !pathname.includes("..");
}

export function validateBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
