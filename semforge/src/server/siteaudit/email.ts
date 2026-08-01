const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SiteAuditEmailResult =
  | { status: "delivered"; providerId: string }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string };

export function isSiteAuditEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()
  );
}

/**
 * Resend HTTP API를 직접 사용한다. 키와 발신 주소가 없으면 성공처럼 가장하지 않고
 * unavailable 을 반환하며, 호출부가 전달 이력에 그대로 기록한다.
 */
export async function sendSiteAuditEmail(input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<SiteAuditEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return {
      status: "unavailable",
      reason: "RESEND_API_KEY 또는 RESEND_FROM_EMAIL이 설정되지 않았습니다.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { id?: unknown; message?: unknown }
      | null;
    if (!response.ok) {
      return {
        status: "failed",
        reason:
          typeof payload?.message === "string"
            ? payload.message
            : `이메일 제공자가 HTTP ${response.status}를 반환했습니다.`,
      };
    }
    if (typeof payload?.id !== "string") {
      return { status: "failed", reason: "이메일 제공자 응답에 발송 ID가 없습니다." };
    }
    return { status: "delivered", providerId: payload.id };
  } catch (error) {
    return {
      status: "failed",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "이메일 발송 요청이 시간 초과되었습니다."
          : error instanceof Error
            ? error.message
            : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
