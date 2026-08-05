import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { PBErrorCode, PBErrorResponse } from "@/types/pb";

export class HttpError extends Error {
  constructor(
    public readonly code: PBErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new HttpError("BAD_ORIGIN", "같은 사이트에서 보낸 요청만 허용됩니다.", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    throw new HttpError("BAD_ORIGIN", "요청 출처를 확인할 수 없습니다.", 403);
  }

  const configuredOrigin = process.env.PB_APP_ORIGIN?.replace(/\/$/, "");
  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([requestOrigin]);
  if (configuredOrigin) allowed.add(configuredOrigin);

  if (!allowed.has(origin.replace(/\/$/, ""))) {
    throw new HttpError("BAD_ORIGIN", "허용되지 않은 출처입니다.", 403);
  }
}

export function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError("INVALID_CONTENT_TYPE", "application/json 요청만 허용됩니다.", 415);
  }
}

export async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  assertJsonContentType(request);

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new HttpError("BODY_TOO_LARGE", "요청 본문이 너무 큽니다.", 413);
  }

  if (!request.body) {
    throw new HttpError("INVALID_JSON", "요청 본문이 없습니다.", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpError("BODY_TOO_LARGE", "요청 본문이 너무 큽니다.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError("INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.", 400);
  }
}

export function getClientFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 300);
  const salt = process.env.PB_FINGERPRINT_SECRET || process.env.SUPABASE_SECRET_KEY;

  if (!salt || salt.length < 16) {
    throw new HttpError("CONFIG_ERROR", "서버 fingerprint secret이 설정되지 않았습니다.", 500);
  }

  return createHash("sha256").update(`${salt}\n${ip}\n${userAgent}`).digest("hex");
}

export function apiError(cause: unknown, fallbackCode: PBErrorCode, fallbackMessage: string): NextResponse<PBErrorResponse> {
  if (cause instanceof HttpError) {
    return NextResponse.json(
      { ok: false, error: { code: cause.code, message: cause.message } },
      { status: cause.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(fallbackCode, cause);
  return NextResponse.json(
    { ok: false, error: { code: fallbackCode, message: fallbackMessage } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function jsonNoStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}
