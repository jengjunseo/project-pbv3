import { getRedis } from "@/lib/redis";

const LIMIT = 60;

export async function checkWriteRateLimit(request: Request): Promise<boolean> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const minute = Math.floor(Date.now() / 60_000);
  const key = `pb:v3:rate:${ip}:${minute}`;
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 70);
  return count <= LIMIT;
}
