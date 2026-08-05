import { describe, expect, it } from "vitest";
import { payloadBytes } from "@/lib/bytes";

describe("payloadBytes", () => {
  it("counts utf8 text and file bytes", () => {
    expect(payloadBytes("abc", null)).toBe(3);
    expect(payloadBytes("한", null)).toBe(3);
    expect(payloadBytes("abc", { url: "https://example.com/f", pathname: "x", name: "x", size: 7, type: "text/plain", uploadedAt: 1 })).toBe(10);
  });
});
