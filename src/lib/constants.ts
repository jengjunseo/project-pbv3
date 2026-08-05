export const SLOT_MIN = 0;
export const SLOT_MAX = 99;
export const MAX_TEXT_CHARS = 30_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const STORAGE_LIMIT_BYTES = 512 * 1024 * 1024;
export const UPLOAD_RESERVATION_BYTES = MAX_FILE_BYTES;
export const UPLOAD_CAPABILITY_SECONDS = 15 * 60;
export const DOWNLOAD_URL_SECONDS = 60;
export const STORAGE_BUCKET = "pb-v3";

export const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "jar", "apk", "dmg", "pkg", "app",
  "sh", "bash", "zsh", "command", "lnk", "url",
  "html", "htm", "xhtml", "svg", "xml", "js", "mjs", "cjs",
]);

export const BLOCKED_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
  "application/x-sh",
]);

export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
