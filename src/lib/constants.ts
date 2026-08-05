export const SLOT_MIN = 0;
export const SLOT_MAX = 99;
export const MAX_TEXT_CHARS = 30_000;
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_STORAGE_LIMIT_BYTES = 512 * 1024 * 1024;

export const SLOT_KEY_PREFIX = "pb:v3:slot:";
export const ORDER_KEY = "pb:v3:order";
export const USAGE_KEY = "pb:v3:usage";
export const WRITE_LOCK_KEY = "pb:v3:write-lock";

export const BLOCKED_EXTENSIONS = new Set([
  "exe","bat","cmd","sh","bash","zsh","command","lnk","url","com","msi","scr","ps1","vbs","jar","apk","dmg","pkg","app","html","htm","svg",
]);

export const SAFE_SOURCE_EXTENSIONS = new Set([
  "txt","md","json","csv","tsv","js","jsx","ts","tsx","py","java","c","h","cpp","hpp","cs","go","rs","kt","swift","css","scss","yml","yaml","toml","xml","ipynb",
]);

export const ALLOWED_MIME_TYPES = new Set([
  "image/png","image/jpeg","image/webp","image/gif","application/pdf","text/plain","text/markdown","text/csv","application/json","application/zip","application/x-zip-compressed","application/octet-stream","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
