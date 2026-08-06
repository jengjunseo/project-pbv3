import { apiError, assertSameOrigin, getClientFingerprint, jsonNoStore, readJsonLimited } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cancelUpload } from "@/lib/uploads";
import { cancelUploadSchema } from "@/lib/validation";
import type { CancelUploadResponse, PBErrorResponse } from "@/types/pb";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const fingerprint = getClientFingerprint(request);
    await enforceRateLimit(fingerprint, "upload-cancel", 20, 60);

    const parsed = cancelUploadSchema.safeParse(await readJsonLimited(request, 4 * 1024));
    if (!parsed.success) {
      return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_PAYLOAD", message: "업로드 capability가 올바르지 않습니다." } }, { status: 400 });
    }

    const cancelled = await cancelUpload(parsed.data.capabilityId, fingerprint);
    return jsonNoStore<CancelUploadResponse>({ ok: true, cancelled });
  } catch (cause) {
    return apiError(cause, "UPLOAD_CANCEL_FAILED", "업로드 취소 처리에 실패했습니다.");
  }
}
