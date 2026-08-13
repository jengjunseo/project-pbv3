import { apiError, assertSameOrigin, getClientFingerprint, jsonNoStore, readJsonLimited } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prepareUpload } from "@/lib/uploads";
import { prepareUploadSchema, validateUploadInput } from "@/lib/validation";
import type { PBErrorResponse, PrepareUploadResponse } from "@/types/pb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const fingerprint = getClientFingerprint(request);
    await enforceRateLimit(fingerprint, "upload-prepare", 8, 60);

    const parsed = prepareUploadSchema.safeParse(await readJsonLimited(request, 8 * 1024));
    if (!parsed.success) {
      return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_PAYLOAD", message: "파일 정보를 확인해 주세요." } }, { status: 400 });
    }

    const checked = validateUploadInput(parsed.data);
    if (!checked.ok) {
      return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_FILE", message: checked.message } }, { status: 400 });
    }

    const result = await prepareUpload({
      slotId: parsed.data.slotId,
      fingerprint,
      name: parsed.data.name,
      size: parsed.data.size,
      mime: checked.mime,
    });

    return jsonNoStore<PrepareUploadResponse>({ ok: true, ...result });
  } catch (cause) {
    return apiError(cause, "UPLOAD_PREPARE_FAILED", "업로드 준비에 실패했습니다.");
  }
}
