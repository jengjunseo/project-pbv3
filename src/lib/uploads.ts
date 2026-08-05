import "server-only";
import { randomUUID } from "node:crypto";
import {
  STORAGE_BUCKET,
  UPLOAD_CAPABILITY_SECONDS,
} from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  formatSlotId,
  isSafeObjectPath,
  objectPathBelongsToSlot,
  sanitizeFileName,
} from "@/lib/validation";

type PrepareUploadResult = {
  capability_id: string;
  expires_at: string;
  evicted_ids: number[] | null;
};

export async function prepareUpload(input: {
  slotId: number;
  fingerprint: string;
  name: string;
  size: number;
  mime: string;
}): Promise<{ capabilityId: string; signedUrl: string; expiresAt: string; evictedIds: number[] }> {
  const objectPath = `slots/${formatSlotId(input.slotId)}/${randomUUID()}/${sanitizeFileName(input.name)}`;
  if (!isSafeObjectPath(objectPath) || !objectPathBelongsToSlot(objectPath, input.slotId)) {
    throw new Error("generated object path failed validation");
  }

  const expiresAt = new Date(Date.now() + UPLOAD_CAPABILITY_SECONDS * 1000).toISOString();
  const admin = getSupabaseAdmin();

  // Generate the exact-path signed URL before the reservation transaction. The URL is
  // not returned to the browser unless the DB reservation succeeds, so a signing failure
  // can never evict existing slots or leave a capability behind.
  const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUploadUrl(objectPath, { upsert: false });
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`signed upload URL creation failed: ${signed.error?.message ?? "unknown error"}`);
  }

  const { data, error } = await admin.rpc("pb_v3_prepare_upload", {
    p_slot_id: input.slotId,
    p_fingerprint_hash: input.fingerprint,
    p_original_name: input.name,
    p_mime_type: input.mime,
    p_claimed_bytes: input.size,
    p_object_path: objectPath,
    p_expires_at: expiresAt,
  });

  if (error) throw new Error(`prepare upload RPC failed: ${error.message}`);
  const result = data as PrepareUploadResult;
  if (!result?.capability_id) throw new Error("prepare upload RPC returned no capability");

  return {
    capabilityId: result.capability_id,
    signedUrl: signed.data.signedUrl,
    expiresAt: result.expires_at,
    evictedIds: result.evicted_ids ?? [],
  };
}

export async function cancelUpload(capabilityId: string, fingerprint: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("pb_v3_cancel_upload", {
    p_capability_id: capabilityId,
    p_fingerprint_hash: fingerprint,
  });
  if (error) throw new Error(`cancel upload RPC failed: ${error.message}`);
  return data === true;
}
