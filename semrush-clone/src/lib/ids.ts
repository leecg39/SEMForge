import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 시간순 정렬이 가능한 26자 식별자(ULID 호환 레이아웃).
 * 목록 기본 정렬이 생성 시각순일 때 커서 페이지네이션을 단순하게 만든다.
 */
export function newId(prefix?: string): string {
  const time = Date.now();
  let timePart = "";
  let t = time;
  for (let i = 0; i < 10; i += 1) {
    timePart = ALPHABET[t % 32] + timePart;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let randomPart = "";
  for (let i = 0; i < 16; i += 1) {
    randomPart += ALPHABET[bytes[i] % 32];
  }
  const id = timePart + randomPart;
  return prefix ? `${prefix}_${id}` : id;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newUuid(): string {
  return randomUUID();
}
