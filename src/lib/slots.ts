import "server-only";
import { DOWNLOAD_URL_SECONDS, STORAGE_BUCKET } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { PBFileView, PBSlotView } from "@/types/pb";

type SlotDatabaseRow = {
  id: number;
  text: string;
  object_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_bytes: number | string;
  bytes: number | string;
  created_at: string;
  updated_at: string;
  revision: number | string;
};

type CommitRpcResult = SlotDatabaseRow & {
  evicted_ids?: number[] | null;
};

const SLOT_COLUMNS = "id,text,object_path,file_name,file_type,file_bytes,bytes,created_at,updated_at,revision";

export async function readSlot(id: number): Promise<PBSlotView | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("pb_v3_slots")
    .select(SLOT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`slot read failed: ${error.message}`);
  return data ? hydrateSlot(data as SlotDatabaseRow) : null;
}

export async function createSlotDownloadUrl(id: number): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("pb_v3_slots")
    .select("object_path,file_name")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`slot file read failed: ${error.message}`);
  const row = data as { object_path: string | null; file_name: string | null } | null;
  if (!row?.object_path || !row.file_name) return null;

  const signed = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).createSignedUrl(
    row.object_path,
    DOWNLOAD_URL_SECONDS,
    { download: row.file_name },
  );
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`signed download URL creation failed: ${signed.error?.message ?? "unknown error"}`);
  }
  return signed.data.signedUrl;
}

export async function commitSlot(input: {
  id: number;
  text: string;
  fileAction: "keep" | "remove" | "replace";
  capabilityId: string | null;
  fingerprint: string;
}): Promise<{ slot: PBSlotView; evictedIds: number[] }> {
  const { data, error } = await getSupabaseAdmin().rpc("pb_v3_commit_slot", {
    p_slot_id: input.id,
    p_text: input.text,
    p_file_action: input.fileAction,
    p_capability_id: input.capabilityId,
    p_fingerprint_hash: input.fingerprint,
  });

  if (error) throw new Error(`slot commit failed: ${error.message}`);
  const result = data as CommitRpcResult;
  if (!result || typeof result.id !== "number") throw new Error("slot commit returned no row");

  return { slot: hydrateSlot(result), evictedIds: result.evicted_ids ?? [] };
}

export async function clearSlot(id: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("pb_v3_clear_slot", { p_slot_id: id });
  if (error) throw new Error(`slot clear failed: ${error.message}`);
  return data === true;
}

function hydrateSlot(row: SlotDatabaseRow): PBSlotView {
  const file: PBFileView | null = row.object_path && row.file_name
    ? {
        name: row.file_name,
        size: Number(row.file_bytes) || 0,
        type: row.file_type || "application/octet-stream",
      }
    : null;

  return {
    id: row.id,
    text: row.text,
    file,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bytes: Number(row.bytes) || 0,
    revision: Number(row.revision) || 1,
  };
}
