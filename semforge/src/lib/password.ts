import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export async function hashPassword(
  plain: string
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(plain, salt, KEY_LENGTH);
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPassword(
  plain: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const derived = await scryptAsync(plain, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
