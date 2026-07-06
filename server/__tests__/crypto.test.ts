import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { encryptApiKey, decryptApiKey, isLegacyCiphertext } from "../crypto";

describe("API key encryption (v2, AES-256-GCM)", () => {
  it("round-trips a key", () => {
    const secret = "civitai-api-key-abc123";
    const enc = encryptApiKey(secret);
    expect(enc.startsWith("v2:")).toBe(true);
    expect(decryptApiKey(enc)).toBe(secret);
  });

  it("produces different ciphertext for identical plaintext (random IV)", () => {
    const a = encryptApiKey("same-key");
    const b = encryptApiKey("same-key");
    expect(a).not.toBe(b);
    expect(decryptApiKey(a)).toBe("same-key");
    expect(decryptApiKey(b)).toBe("same-key");
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const enc = encryptApiKey("tamper-me");
    const parts = enc.split(":");
    // flip a nibble in the ciphertext
    const flipped = parts[2][0] === "0" ? "1" + parts[2].slice(1) : "0" + parts[2].slice(1);
    const tampered = [parts[0], parts[1], flipped, parts[3]].join(":");
    expect(decryptApiKey(tampered)).toBe("");
  });

  it("returns empty string on garbage input, never throws", () => {
    expect(decryptApiKey("not-a-ciphertext")).toBe("");
    expect(decryptApiKey("v2:zz:zz:zz")).toBe("");
    expect(decryptApiKey("")).toBe("");
  });
});

describe("legacy (createCipher/CBC) compatibility", () => {
  // Recreate exactly what the old code produced:
  //   key = scryptSync(SESSION_SECRET || 'fallback-secret', 'salt', 32)
  //   createCipher('aes-256-cbc', key)  -> EVP_BytesToKey(MD5, no salt)
  function legacyEncrypt(text: string): string {
    const password = crypto.scryptSync(process.env.SESSION_SECRET || "fallback-secret", "salt", 32);
    const chunks: Buffer[] = [];
    let prev = Buffer.alloc(0);
    let total = 0;
    while (total < 48) {
      prev = crypto.createHash("md5").update(Buffer.concat([prev, password])).digest();
      chunks.push(prev);
      total += prev.length;
    }
    const all = Buffer.concat(chunks);
    const cipher = crypto.createCipheriv("aes-256-cbc", all.subarray(0, 32), all.subarray(32, 48));
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return crypto.randomBytes(16).toString("hex") + ":" + encrypted;
  }

  it("detects legacy format", () => {
    expect(isLegacyCiphertext(legacyEncrypt("x"))).toBe(true);
    expect(isLegacyCiphertext(encryptApiKey("x"))).toBe(false);
    expect(isLegacyCiphertext("plaintext-api-key")).toBe(false);
  });

  it("decrypts legacy ciphertext", () => {
    const secret = "old-stored-civitai-key";
    expect(decryptApiKey(legacyEncrypt(secret))).toBe(secret);
  });
});
