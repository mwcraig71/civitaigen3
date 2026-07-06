import crypto from "crypto";

import { logger } from "./logger";
/**
 * API-key encryption.
 *
 * Current format (v2): AES-256-GCM with a random 12-byte IV and a dedicated
 * ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 *   "v2:<iv hex>:<ciphertext hex>:<auth tag hex>"
 *
 * Legacy format (v1): AES-256-CBC written with the deprecated
 * crypto.createCipher(), keyed off SESSION_SECRET. Still decryptable below so
 * existing rows keep working; values are re-encrypted to v2 lazily on read.
 *   "<iv hex (unused by legacy cipher)>:<ciphertext hex>"
 */

const V2_PREFIX = "v2:";
const IV_LENGTH = 12; // GCM standard nonce size

function loadKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY env var is required in production and must be 64 hex characters. Generate one with: openssl rand -hex 32"
    );
  }
  logger.warn(
    "[crypto] ENCRYPTION_KEY not set or invalid — using an insecure dev-only key. Set ENCRYPTION_KEY before deploying."
  );
  return crypto.scryptSync("dev-only-insecure-key", "civitaigen2-dev-salt", 32);
}

const KEY = loadKey();

export function encryptApiKey(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

export function isLegacyCiphertext(value: string): boolean {
  if (value.startsWith(V2_PREFIX)) return false;
  const parts = value.split(":");
  return parts.length === 2 && /^[0-9a-fA-F]{32}$/.test(parts[0]) && /^[0-9a-fA-F]+$/.test(parts[1]);
}

export function decryptApiKey(encryptedText: string): string {
  try {
    if (encryptedText.startsWith(V2_PREFIX)) {
      const [ivHex, dataHex, tagHex] = encryptedText.slice(V2_PREFIX.length).split(":");
      const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
    }
    if (isLegacyCiphertext(encryptedText)) {
      return decryptLegacy(encryptedText);
    }
    return ""; // not a recognized ciphertext format
  } catch {
    return ""; // never leak error details containing key material
  }
}

// ---- Legacy (v1) support -------------------------------------------------

/**
 * crypto.createCipher('aes-256-cbc', password) derived key+IV from the
 * password via OpenSSL's EVP_BytesToKey (MD5, 1 iteration, no salt) and
 * ignored any caller-supplied IV. createDecipher was removed in Node 22, so
 * the KDF is reimplemented here with createDecipheriv.
 */
function evpBytesToKey(password: Buffer, keyLen: number, ivLen: number): { key: Buffer; iv: Buffer } {
  const chunks: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let total = 0;
  while (total < keyLen + ivLen) {
    prev = crypto.createHash("md5").update(Buffer.concat([prev, password])).digest();
    chunks.push(prev);
    total += prev.length;
  }
  const all = Buffer.concat(chunks);
  return { key: all.subarray(0, keyLen), iv: all.subarray(keyLen, keyLen + ivLen) };
}

function legacyPassword(): Buffer {
  // Matches the old ENCRYPTION_KEY derivation exactly.
  return crypto.scryptSync(process.env.SESSION_SECRET || "fallback-secret", "salt", 32);
}

function decryptLegacy(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 2) throw new Error("invalid legacy format");
  const { key, iv } = evpBytesToKey(legacyPassword(), 32, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(parts[1], "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
