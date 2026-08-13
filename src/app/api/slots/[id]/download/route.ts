import { apiError, jsonNoStore } from "@/lib/http";
import { createSlotDownloadUrl } from "@/lib/slots";
import { parseSlotId } from "@/lib/validation";
import type { DownloadResponse, PBErrorResponse } from "@/types/pb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: rawId } = await context.params;
    const id = parseSlotId(rawId);
    if (id === null) {
      return jsonNoStore<PBErrorResponse>(
        { ok: false, error: { code: "INVALID_SLOT", message: "슬롯 번호는 0~99여야 합니다." } },
        { status: 400 },
      );
    }

    const downloadUrl = await createSlotDownloadUrl(id);
    if (!downloadUrl) {
      return jsonNoStore<PBErrorResponse>(
        { ok: false, error: { code: "LOAD_FAILED", message: "첨부 파일을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return jsonNoStore<DownloadResponse>({ ok: true, downloadUrl });
  } catch (cause) {
    return apiError(cause, "LOAD_FAILED", "파일 링크를 만들지 못했습니다.");
  }
}
