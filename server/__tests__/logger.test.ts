import { describe, it, expect, vi, afterEach } from "vitest";

// Capture what the logger writes
const lines: string[] = [];
vi.spyOn(process.stdout, "write").mockImplementation((s: any) => { lines.push(String(s)); return true; });
vi.spyOn(process.stderr, "write").mockImplementation((s: any) => { lines.push(String(s)); return true; });

const { logger } = await import("../logger");

afterEach(() => { lines.length = 0; });

describe("logger redaction", () => {
  it("redacts api keys in objects", () => {
    logger.error("failed", { apiKey: "sk_live_abcdefgh12345678" });
    expect(lines.join("")).not.toContain("sk_live_abcdefgh12345678");
    expect(lines.join("")).toContain("[REDACTED]");
  });

  it("redacts bearer tokens", () => {
    logger.error("auth", 'authorization: Bearer eyJhbGciOi.secret.token');
    expect(lines.join("")).not.toContain("eyJhbGciOi.secret.token");
  });

  it("redacts password fields", () => {
    logger.error({ password: "hunter2" });
    expect(lines.join("")).not.toContain("hunter2");
  });

  it("keeps normal content", () => {
    logger.error("generation 123 failed for user 456");
    expect(lines.join("")).toContain("generation 123 failed for user 456");
  });
});
