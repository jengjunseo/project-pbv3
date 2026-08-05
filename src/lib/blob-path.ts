function sanitizeFileName(name: string): string {
  const normalized = name.normalize("NFKC").trim();
  const safe = normalized
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{L}\p{N}._()\- ]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return safe || "file";
}

export function makeBlobPath(slotId: number, fileName: string): string {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `pb-v3/slot-${slotId}/${random}-${sanitizeFileName(fileName)}`;
}
