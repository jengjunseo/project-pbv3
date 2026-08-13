import "server-only";
import { STORAGE_BUCKET } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isSafeObjectPath } from "@/lib/validation";

type CleanupItem = {
  id: number;
  object_path: string;
};

export async function runCleanupBatch(limit = 20): Promise<{ claimed: number; deleted: number; failed: number }> {
  const admin = getSupabaseAdmin();
  const reaped = await admin.rpc("pb_v3_reap_expired_uploads");
  if (reaped.error) throw new Error(`expired upload reaper failed: ${reaped.error.message}`);

  const claimed = await admin.rpc("pb_v3_claim_cleanup_batch", { p_limit: limit });
  if (claimed.error) throw new Error(`cleanup claim failed: ${claimed.error.message}`);

  const items = (claimed.data ?? []) as CleanupItem[];
  const outcomes: boolean[] = [];
  const concurrency = 5;
  for (let offset = 0; offset < items.length; offset += concurrency) {
    const batch = items.slice(offset, offset + concurrency);
    outcomes.push(...await Promise.all(batch.map((item) => cleanupItem(item))));
  }

  const deleted = outcomes.filter(Boolean).length;
  const failed = outcomes.length - deleted;
  return { claimed: items.length, deleted, failed };
}

async function cleanupItem(item: CleanupItem): Promise<boolean> {
  if (!isSafeObjectPath(item.object_path)) {
    await finishCleanup(item.id, false, "unsafe object path");
    return false;
  }

  const removal = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).remove([item.object_path]);
  if (removal.error) {
    await finishCleanup(item.id, false, removal.error.message);
    return false;
  }

  await finishCleanup(item.id, true, null);
  return true;
}

async function finishCleanup(id: number, success: boolean, errorMessage: string | null): Promise<void> {
  const result = await getSupabaseAdmin().rpc("pb_v3_finish_cleanup", {
    p_cleanup_id: id,
    p_success: success,
    p_error: errorMessage,
  });
  if (result.error) throw new Error(`cleanup finish failed: ${result.error.message}`);
}
