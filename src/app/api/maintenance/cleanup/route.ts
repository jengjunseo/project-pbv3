import { timingSafeEqual } from "node:crypto";
import { apiError, jsonNoStore } from "@/lib/http";
import { runCleanupBatch } from "@/lib/maintenance";
import type { PBErrorResponse } from "@/types/pb";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  try {
    if (!isAuthorized(request)) {
      return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "MAINTENANCE_UNAUTHORIZED", message: "maintenance 인증에 실패했습니다." } }, { status: 401 });
    }
    return jsonNoStore({ ok: true as const, ...(await runCleanupBatch(25)) });
  } catch (cause) {
    return apiError(cause, "MAINTENANCE_FAILED", "cleanup queue 처리에 실패했습니다.");
  }
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET || process.env.PB_MAINTENANCE_SECRET;
  if (!expected) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const custom = request.headers.get("x-pb-maintenance-key");
  return safeEqual(bearer, expected) || safeEqual(custom, expected);
}

function safeEqual(actual: string | null | undefined, expected: string): boolean {
  if (!actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
