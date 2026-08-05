import "server-only";
import { HttpError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function enforceRateLimit(
  fingerprint: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("pb_v3_take_rate_limit", {
    p_fingerprint_hash: fingerprint,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) throw new Error(`rate-limit RPC failed: ${error.message}`);
  if (data !== true) {
    throw new HttpError("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요.", 429);
  }
}
