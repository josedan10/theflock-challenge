import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits. The plaintext is returned once; only this digest is stored. */
export function newUploadToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUploadToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** Constant-time check of a presented token against the stored digest. */
export function uploadTokenMatches(stored: Buffer, presented: string): boolean {
  const hash = hashUploadToken(presented);
  return stored.length === hash.length && timingSafeEqual(stored, hash);
}
