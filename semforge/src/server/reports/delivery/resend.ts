// @TASK P4-R1-T1 - Resend HTTP email adapter with provider idempotency
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import type {
  ReportEmailSendInput,
  ReportEmailSender,
} from "@/server/reports/delivery/service";
import { ReportEmailSenderError } from "@/server/reports/delivery/service";

const MAX_EMAIL_BYTES_AFTER_BASE64 = 40 * 1024 * 1024;

export class ResendEmailError extends ReportEmailSenderError {
  constructor(readonly code: "INVALID_INPUT" | "RETRYABLE" | "REJECTED") {
    super(code === "RETRYABLE" ? "retryable" : "rejected", `RESEND_${code}`);
    this.name = "ResendEmailError";
  }
}

export interface ResendEmailSenderOptions {
  readonly apiKey: string;
  readonly from: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

function nonBlank(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new ResendEmailError("INVALID_INPUT");
  return normalized;
}

export class ResendEmailSender implements ReportEmailSender {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ResendEmailSenderOptions) {
    this.apiKey = nonBlank(options.apiKey, 512);
    this.from = nonBlank(options.from, 320);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 60_000) {
      throw new ResendEmailError("INVALID_INPUT");
    }
  }

  async send(input: ReportEmailSendInput): Promise<{ providerMessageId: string }> {
    const idempotencyKey = nonBlank(input.idempotencyKey, 256);
    const snapshotHash = nonBlank(input.snapshotSha256, 64);
    if (!/^[0-9a-f]{64}$/.test(snapshotHash)) throw new ResendEmailError("INVALID_INPUT");
    const base64 = Buffer.from(input.attachment.content).toString("base64");
    if (Buffer.byteLength(base64, "utf8") > MAX_EMAIL_BYTES_AFTER_BASE64) {
      throw new ResendEmailError("INVALID_INPUT");
    }
    const payload = {
      from: this.from,
      to: [nonBlank(input.recipient, 320)],
      subject: nonBlank(input.subject, 998),
      html: nonBlank(input.html, 10 * 1024 * 1024),
      headers: { "X-SEMForge-Snapshot-SHA256": snapshotHash },
      attachments: [{
        filename: nonBlank(input.attachment.filename, 255),
        content: base64,
      }],
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      throw new ResendEmailError("RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let conflictName: string | null = null;
      if (response.status === 409) {
        try {
          const body = await response.json() as { name?: unknown } | null;
          conflictName = typeof body?.name === "string" ? body.name : null;
        } catch {
          conflictName = null;
        }
      }
      const retryable = response.status === 408 ||
        (response.status === 409 && conflictName === "concurrent_idempotent_requests") ||
        response.status === 425 || response.status === 429 || response.status >= 500;
      throw new ResendEmailError(retryable ? "RETRYABLE" : "REJECTED");
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ResendEmailError("RETRYABLE");
    }
    const providerMessageId = (parsed as { id?: unknown } | null)?.id;
    if (typeof providerMessageId !== "string" || !providerMessageId.trim() || providerMessageId.length > 200) {
      throw new ResendEmailError("RETRYABLE");
    }
    return { providerMessageId };
  }
}
