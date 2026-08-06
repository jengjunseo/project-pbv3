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
  await admin.rpc("pb_v3_reap_expired_uploads");

  const claimed = await admin.rpc("pb_v3_claim_cleanup_batch", { p_limit: limit });
  if (claimed.error) throw new Error(`cleanup claim failed: ${claimed.error.message}`);

  const items = (claimed.data ?? []) as CleanupItem[];
  let deleted = 0;
  let failed = 0;

  for (const item of items) {
    if (!isSafeObjectPath(item.object_path)) {
      failed += 1;
      await finishCleanup(item.id, false, "unsafe object path");
      continue;
    }

    const removal = await admin.storage.from(STORAGE_BUCKET).remove([item.object_path]);
    if (removal.error) {
      failed += 1;
      await finishCleanup(item.id, false, removal.error.message);
    } else {
      deleted += 1;
      await finishCleanup(item.id, true, null);
    }
  }

  return { claimed: items.length, deleted, failed };
}

async function finishCleanup(id: number, success: boolean, errorMessage: string | null): Promise<void> {
  const result = await getSupabaseAdmin().rpc("pb_v3_finish_cleanup", {
    p_cleanup_id: id,
    p_success: success,
    p_error: errorMessage,
  });
  if (result.error) throw new Error(`cleanup finish failed: ${result.error.message}`);
}
