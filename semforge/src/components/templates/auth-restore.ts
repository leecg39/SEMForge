const MAX_RESTORE_KEYWORD_LENGTH = 80;

export function normalizeSignupRestoreKeyword(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const keyword = raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!keyword || Array.from(keyword).length > MAX_RESTORE_KEYWORD_LENGTH) return null;
  if (/[\u0000-\u001f\u007f]/u.test(keyword)) return null;
  return keyword;
}

export function signupSuccessHref(value: unknown): string {
  const keyword = normalizeSignupRestoreKeyword(value);
  if (!keyword) return "/home/";
  const params = new URLSearchParams({ keyword });
  return `/analytics/keywordmagic/?${params.toString()}`;
}
