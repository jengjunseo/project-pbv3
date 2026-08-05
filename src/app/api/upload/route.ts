import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getMaxFileBytes } from "@/lib/config";
import { checkWriteRateLimit } from "@/lib/rate-limit";
import { cleanupOrphanBlob } from "@/lib/slot-store";
import { parseSlotId, validateBlobPath, validateUploadMeta } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ ok: false, error: { message: "Vercel Blob이 설정되지 않았습니다." } }, { status: 500 });
  if (!(await checkWriteRateLimit(request))) return NextResponse.json({ ok: false, error: { message: "업로드 요청이 너무 많습니다." } }, { status: 429 });
  let body: HandleUploadBody;
  try { body = (await request.json()) as HandleUploadBody; } catch { return NextResponse.json({ ok: false, error: { message: "잘못된 업로드 요청입니다." } }, { status: 400 }); }
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const id = parseSlotId(payload.slotId);
        if (id === null) throw new Error("슬롯 번호가 올바르지 않습니다.");
        const validation = validateUploadMeta(payload);
        if (!validation.ok) throw new Error(validation.message);
        if (!validateBlobPath(id, pathname)) throw new Error("파일 경로가 슬롯과 일치하지 않습니다.");
        return {
          allowedContentTypes: [payload.type || "application/octet-stream"],
          maximumSizeInBytes: getMaxFileBytes(),
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ slotId: id, name: payload.name }),
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(response);
  } catch (cause) {
    return NextResponse.json({ ok: false, error: { message: cause instanceof Error ? cause.message : "업로드에 실패했습니다." } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ ok: true });
  let payload: { slotId?: unknown; pathname?: unknown };
  try { payload = (await request.json()) as { slotId?: unknown; pathname?: unknown }; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const slotId = parseSlotId(payload.slotId);
  const pathname = typeof payload.pathname === "string" ? payload.pathname : "";
  if (slotId === null || !validateBlobPath(slotId, pathname)) return NextResponse.json({ ok: false }, { status: 400 });
  try { await cleanupOrphanBlob(pathname, slotId); } catch { /* keep file when orphan status cannot be confirmed */ }
  return NextResponse.json({ ok: true });
}

function parseClientPayload(raw: string | null | undefined): { slotId: unknown; name: string; size: number; type: string } {
  if (!raw) throw new Error("업로드 메타데이터가 없습니다.");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("업로드 메타데이터가 올바르지 않습니다."); }
  if (typeof parsed.name !== "string" || typeof parsed.size !== "number" || typeof parsed.type !== "string") throw new Error("업로드 메타데이터가 올바르지 않습니다.");
  return { slotId: parsed.slotId, name: parsed.name, size: parsed.size, type: parsed.type };
}
