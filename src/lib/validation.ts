import { z } from "zod";
import {
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  BLOCKED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  SLOT_MAX,
  SLOT_MIN,
} from "@/lib/constants";

export const slotIdSchema = z.number().int().min(SLOT_MIN).max(SLOT_MAX);

export const prepareUploadSchema = z.object({
  slotId: slotIdSchema,
  name: z.string().min(1).max(180),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  type: z.string().max(120).default("application/octet-stream"),
});

export const slotCommitSchema = z.object({
  text: z.string().max(MAX_TEXT_CHARS),
  fileAction: z.enum(["keep", "remove", "replace"]),
  capabilityId: z.string().uuid().nullable(),
}).superRefine((value, context) => {
  if (value.fileAction === "replace" && !value.capabilityId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["capabilityId"], message: "replacement requires a capability" });
  }
  if (value.fileAction !== "replace" && value.capabilityId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["capabilityId"], message: "capability is only valid for replacement" });
  }
});

export const cancelUploadSchema = z.object({
  capabilityId: z.string().uuid(),
});

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

export function formatSlotId(id: number): string {
  return String(id).padStart(2, "0");
}

export function getFileExtension(name: string): string {
  const basename = name.trim().toLowerCase().split(/[\\/]/).pop() ?? "";
  const index = basename.lastIndexOf(".");
  return index >= 0 ? basename.slice(index + 1) : "";
}

export function sanitizeFileName(name: string): string {
  const basename = name.trim().split(/[\\/]/).pop() ?? "file";
  const safe = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._()\- ]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return safe || "file";
}

export function validateUploadInput(input: { name: string; size: number; type: string }): { ok: true; mime: string } | { ok: false; message: string } {
  const name = input.name.trim();
  if (!name || name.length > 180) return { ok: false, message: "파일 이름은 1~180자여야 합니다." };
  if (!Number.isSafeInteger(input.size) || input.size <= 0) return { ok: false, message: "빈 파일은 업로드할 수 없습니다." };
  if (input.size > MAX_FILE_BYTES) return { ok: false, message: "파일은 최대 10 MiB까지 업로드할 수 있습니다." };

  const extension = getFileExtension(name);
  if (!extension || BLOCKED_EXTENSIONS.has(extension)) {
    return { ok: false, message: extension ? `.${extension} 파일은 업로드할 수 없습니다.` : "확장자가 없는 파일은 업로드할 수 없습니다." };
  }

  const mime = input.type.trim().toLowerCase() || "application/octet-stream";
  if (BLOCKED_MIME_TYPES.has(mime) || !ALLOWED_MIME_TYPES.has(mime)) {
    return { ok: false, message: "지원하지 않거나 브라우저에서 실행될 수 있는 파일 형식입니다." };
  }

  return { ok: true, mime };
}

const NEW_OBJECT_PATH = /^slots\/(?:0\d|[1-9]\d)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[\p{L}\p{N}._()\-]+$/iu;
const LEGACY_OBJECT_PATH = /^slot-(?:\d|[1-9]\d)\/[A-Za-z0-9._()\-]+$/;

export function isSafeObjectPath(path: string): boolean {
  if (!path || path.length > 500 || path.includes("..") || path.includes("//") || path.startsWith("/")) return false;
  return NEW_OBJECT_PATH.test(path) || LEGACY_OBJECT_PATH.test(path);
}

export function objectPathBelongsToSlot(path: string, slotId: number): boolean {
  return path.startsWith(`slots/${formatSlotId(slotId)}/`) || path.startsWith(`slot-${slotId}/`);
}
