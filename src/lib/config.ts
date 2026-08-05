import { DEFAULT_MAX_FILE_BYTES, DEFAULT_STORAGE_LIMIT_BYTES } from "@/lib/constants";

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMaxFileBytes(): number {
  return positiveInt(process.env.PB_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES);
}

export function getStorageLimitBytes(): number {
  return positiveInt(process.env.PB_STORAGE_LIMIT_BYTES, DEFAULT_STORAGE_LIMIT_BYTES);
}
