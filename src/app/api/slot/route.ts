import { NextResponse } from "next/server";
import { checkWriteRateLimit } from "@/lib/rate-limit";
import { clearSlot, readSlot, saveSlot } from "@/lib/slot-store";
import { parseSlotId, slotWriteSchema, validateBlobPath, validateBlobUrl, validateUploadMeta } from "@/lib/validation";
import type { PBErrorResponse, SlotReadResponse, SlotWriteResponse } from "@/types/pb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<SlotReadResponse | PBErrorResponse>> {
  const id = parseSlotId(new URL(request.url).searchParams.get("id"));
  if (id === null) return error("INVALID_SLOT", "슬롯 번호는 0~99여야 합니다.", 400);
  try {
    const slot = await readSlot(id);
    return NextResponse.json(slot ? { ok: true, empty: false, slot } : { ok: true, empty: true, slot: null });
  } catch (cause) {
    return error("READ_FAILED", messageFrom(cause, "슬롯을 불러오지 못했습니다."), 500);
  }
}

export async function POST(request: Request): Promise<NextResponse<SlotWriteResponse | PBErrorResponse>> {
  if (!(await checkWriteRateLimit(request))) return error("RATE_LIMITED", "저장 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", 429);
  let json: unknown;
  try { json = await request.json(); } catch { return error("INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.", 400); }
  const parsed = slotWriteSchema.safeParse(json);
  if (!parsed.success) return error("INVALID_PAYLOAD", "저장할 내용을 확인해 주세요.", 400);
  const { id, text, file } = parsed.data;
  if (!text.trim() && !file) return error("EMPTY_SLOT", "텍스트나 파일 중 하나는 있어야 합니다.", 400);
  if (file) {
    const fileCheck = validateUploadMeta(file);
    if (!fileCheck.ok) return error("INVALID_FILE", fileCheck.message, 400);
    if (!validateBlobPath(id, file.pathname) || !validateBlobUrl(file.url)) return error("INVALID_FILE", "파일 정보가 올바르지 않습니다.", 400);
  }
  try {
    const result = await saveSlot({ id, text, file });
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    return error("SAVE_FAILED", messageFrom(cause, "저장하지 못했습니다."), 500);
  }
}

export async function DELETE(request: Request): Promise<NextResponse<{ ok: true; cleared: boolean } | PBErrorResponse>> {
  if (!(await checkWriteRateLimit(request))) return error("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요.", 429);
  const id = parseSlotId(new URL(request.url).searchParams.get("id"));
  if (id === null) return error("INVALID_SLOT", "슬롯 번호는 0~99여야 합니다.", 400);
  try {
    const cleared = await clearSlot(id);
    return NextResponse.json({ ok: true, cleared });
  } catch (cause) {
    return error("CLEAR_FAILED", messageFrom(cause, "슬롯을 비우지 못했습니다."), 500);
  }
}

function error(code: string, message: string, status: number): NextResponse<PBErrorResponse> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
