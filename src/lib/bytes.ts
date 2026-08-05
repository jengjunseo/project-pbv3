import type { PBFileMeta } from "@/types/pb";

export function payloadBytes(text: string, file: PBFileMeta | null): number {
  return Buffer.byteLength(text, "utf8") + (file?.size ?? 0);
}
