import { after } from "next/server";
import { apiError, assertSameOrigin, getClientFingerprint, jsonNoStore, readJsonLimited } from "@/lib/http";
import { runCleanupBatch } from "@/lib/maintenance";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clearSlot, commitSlot, readSlot } from "@/lib/slots";
import { parseSlotId, slotCommitSchema } from "@/lib/validation";
import type { PBErrorResponse, SlotReadResponse, SlotWriteResponse } from "@/types/pb";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: rawId } = await context.params;
    const id = parseSlotId(rawId);
    if (id === null) return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_SLOT", message: "슬롯 번호는 0~99여야 합니다." } }, { status: 400 });

    const slot = await readSlot(id);
    const response: SlotReadResponse = slot
      ? { ok: true, empty: false, slot }
      : { ok: true, empty: true, slot: null };
    return jsonNoStore(response);
  } catch (cause) {
    return apiError(cause, "LOAD_FAILED", "슬롯을 불러오지 못했습니다.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const { id: rawId } = await context.params;
    const id = parseSlotId(rawId);
    if (id === null) return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_SLOT", message: "슬롯 번호는 0~99여야 합니다." } }, { status: 400 });

    const fingerprint = getClientFingerprint(request);
    await enforceRateLimit(fingerprint, "slot-save", 20, 60);

    const parsed = slotCommitSchema.safeParse(await readJsonLimited(request, 64 * 1024));
    if (!parsed.success) {
      return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_PAYLOAD", message: "저장할 내용을 확인해 주세요." } }, { status: 400 });
    }
    const result = await commitSlot({
      id,
      text: parsed.data.text,
      fileAction: parsed.data.fileAction,
      capabilityId: parsed.data.capabilityId,
      fingerprint,
    });

    after(async () => {
      try { await runCleanupBatch(4); } catch (error) { console.error("post-save cleanup failed", error); }
    });

    return jsonNoStore<SlotWriteResponse>({ ok: true, ...result });
  } catch (cause) {
    return apiError(cause, "SAVE_FAILED", "저장하지 못했습니다.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertSameOrigin(request);
    await readJsonLimited(request, 1024);

    const { id: rawId } = await context.params;
    const id = parseSlotId(rawId);
    if (id === null) return jsonNoStore<PBErrorResponse>({ ok: false, error: { code: "INVALID_SLOT", message: "슬롯 번호는 0~99여야 합니다." } }, { status: 400 });

    const fingerprint = getClientFingerprint(request);
    await enforceRateLimit(fingerprint, "slot-clear", 10, 60);
    const cleared = await clearSlot(id);

    after(async () => {
      try { await runCleanupBatch(4); } catch (error) { console.error("post-clear cleanup failed", error); }
    });

    return jsonNoStore({ ok: true as const, cleared });
  } catch (cause) {
    return apiError(cause, "CLEAR_FAILED", "슬롯을 비우지 못했습니다.");
  }
}
