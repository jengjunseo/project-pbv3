import { Redis } from "@upstash/redis";
import { SLOT_KEY_PREFIX } from "@/lib/constants";

let redisClient: Redis | null = null;

type RedisEnv = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
} & Record<string, string | undefined>;

export function resolveRedisConfig(env: RedisEnv): { url?: string; token?: string } {
  return {
    url: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN,
  };
}

export function getRedis(): Redis {
  if (redisClient) return redisClient;
  const { url, token } = resolveRedisConfig(process.env);
  if (!url || !token) throw new Error("Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  redisClient = new Redis({ url, token });
  return redisClient;
}

export function slotKey(id: number): string {
  return `${SLOT_KEY_PREFIX}${id}`;
}
