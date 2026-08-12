// @TASK P4-R1-T1 - Snapshot-bound PDF publication and email delivery
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createHash } from "node:crypto";

import { z } from "zod";

import type {
  ReportEmailDeliveryTransaction,
  ReportDeliveryStore,
  ReportPdfAsset,
} from "@/server/reports/delivery/store";
import { snapshotSha256 } from "@/server/reports/rendering/html";
import type { ReportPdfRenderer } from "@/server/reports/rendering/pdf";
import { REPORT_SECTION_KEYS, type WeeklyReportSnapshot } from "@/server/reports/types";
import type { PrivateObjectStorage } from "@/server/storage/s3";

const EmailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReportEmailSendInput {
  readonly recipient: string;
  readonly subject: string;
  readonly html: string;
  readonly idempotencyKey: string;
  readonly snapshotSha256: string;
  readonly attachment: {
    readonly filename: string;
    readonly content: Uint8Array;
    readonly contentType: "application/pdf";
  };
}

export interface ReportEmailSender {
  send(input: ReportEmailSendInput): Promise<{ providerMessageId: string }>;
}

export class ReportEmailSenderError extends Error {
  constructor(
    readonly disposition: "retryable" | "rejected",
    message = "REPORT_EMAIL_SENDER_ERROR",
  ) {
    super(message);
    this.name = "ReportEmailSenderError";
  }
}

export interface ReportDeliveryService {
  renderPdf(input: {
    workspaceId: string;
    reportId: string;
  }): Promise<{ asset: ReportPdfAsset; snapshotSha256: string }>;
  deliverEmail(input: {
    workspaceId: string;
    reportId: string;
    recipient: string;
  }): Promise<{
    status: "delivered" | "already_delivered";
    deliveryId: string;
    pdfAssetId?: string;
    snapshotSha256: string;
  }>;
  ensurePdf(input: {
    workspaceId: string;
    reportId: string;
    snapshot: WeeklyReportSnapshot;
  }): Promise<{ asset: ReportPdfAsset; pdf: Uint8Array; snapshotSha256: string }>;
}

export interface ReportDeliveryServiceOptions {
  readonly store: ReportDeliveryStore;
  readonly storage: PrivateObjectStorage;
  readonly renderer: ReportPdfRenderer;
  readonly email: ReportEmailSender;
  readonly appPublicUrl: string;
  readonly clock?: () => Date;
}

export class ReportDeliveryError extends Error {
  constructor(readonly code:
    | "INVALID_INPUT"
    | "PDF_ERROR"
    | "EMAIL_PROVIDER_ERROR"
    | "EMAIL_PROVIDER_REJECTED"
    | "EMAIL_SUPPRESSED"
    | "EMAIL_IDEMPOTENCY_EXPIRED") {
    super(`REPORT_${code}`);
    this.name = "ReportDeliveryError";
  }
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function emailHtml(
  snapshot: WeeklyReportSnapshot,
  hash: string,
  reportUrl: string,
): string {
  const sections = REPORT_SECTION_KEYS.map((key) => snapshot.sections[key])
    .map((section) => `<li><strong>${escapeHtml(section.key.toUpperCase())}</strong> — ${section.available ? "수집 완료" : "확인 불가"}</li>`)
    .join("");
  const accent = /^#[0-9a-f]{6}$/i.test(snapshot.brand.accentColor)
    ? snapshot.brand.accentColor
    : "#155eef";
  return `<!doctype html><html lang="ko" data-snapshot-sha256="${hash}"><body style="font-family:Arial,sans-serif;color:#162033">
    <p style="color:${accent};font-weight:700">SEMFORGE WEEKLY REPORT</p>
    <h1>${escapeHtml(snapshot.brand.name)} 주간 검색 성과</h1>
    <p>${escapeHtml(snapshot.period.current.start)} — ${escapeHtml(snapshot.period.current.end)}</p>
    <ul>${sections}</ul>
    <p><a href="${escapeHtml(reportUrl)}">웹 리포트 열기</a></p>
    <p style="font-size:11px;color:#667085">Snapshot SHA-256 ${hash}</p>
  </body></html>`;
}

function requireIds(workspaceId: string, reportId: string): void {
  if (!UUID.test(workspaceId) || !UUID.test(reportId)) throw new ReportDeliveryError("INVALID_INPUT");
}

export function createReportDeliveryService(
  options: ReportDeliveryServiceOptions,
): ReportDeliveryService {
  const appPublicUrl = new URL(options.appPublicUrl);
  if (appPublicUrl.protocol !== "https:" && appPublicUrl.hostname !== "localhost") {
    throw new ReportDeliveryError("INVALID_INPUT");
  }
  const clock = options.clock ?? (() => new Date());

  const ensurePdf: ReportDeliveryService["ensurePdf"] = async (input) => {
    requireIds(input.workspaceId, input.reportId);
    return ensurePdfWithStore(options.store, input);
  };

  const ensurePdfWithStore = async (
    store: Pick<ReportDeliveryStore, "findPdfAsset" | "savePdfAsset"> | ReportEmailDeliveryTransaction,
    input: {
      workspaceId: string;
      reportId: string;
      snapshot: WeeklyReportSnapshot;
    },
  ): ReturnType<ReportDeliveryService["ensurePdf"]> => {
    requireIds(input.workspaceId, input.reportId);
    const hash = snapshotSha256(input.snapshot);
    const storageKey = `reports/${input.workspaceId}/${input.reportId}/${hash}.pdf`;
    const existing = await store.findPdfAsset({ ...input, storageKey });
    if (existing) {
      const pdf = await options.storage.getPrivate(existing.storageKey);
      if (pdf.byteLength !== existing.sizeBytes || digest(pdf) !== existing.checksumSha256) {
        throw new ReportDeliveryError("PDF_ERROR");
      }
      return { asset: existing, pdf, snapshotSha256: hash };
    }
    const rendered = await options.renderer.render(input.snapshot);
    if (
      rendered.snapshotSha256 !== hash ||
      Buffer.from(rendered.pdf).subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      throw new ReportDeliveryError("PDF_ERROR");
    }
    const checksumSha256 = digest(rendered.pdf);
    const stored = await options.storage.putPrivate({
      key: storageKey,
      body: rendered.pdf,
      contentType: "application/pdf",
      checksumSha256,
      contentIdentitySha256: hash,
    });
    if (stored.contentIdentitySha256 !== hash) {
      throw new ReportDeliveryError("PDF_ERROR");
    }
    let persistedPdf = rendered.pdf;
    if (!stored.created) persistedPdf = await options.storage.getPrivate(storageKey);
    if (
      persistedPdf.byteLength !== stored.sizeBytes ||
      digest(persistedPdf) !== stored.checksumSha256 ||
      Buffer.from(persistedPdf).subarray(0, 5).toString("ascii") !== "%PDF-"
    ) throw new ReportDeliveryError("PDF_ERROR");
    const asset = await store.savePdfAsset({
      workspaceId: input.workspaceId,
      reportId: input.reportId,
      storageKey,
      checksumSha256: stored.checksumSha256,
      sizeBytes: stored.sizeBytes,
    });
    return { asset, pdf: persistedPdf, snapshotSha256: hash };
  };

  return {
    ensurePdf,
    async renderPdf(input) {
      requireIds(input.workspaceId, input.reportId);
      const snapshot = await options.store.loadReportSnapshot(input);
      const published = await ensurePdf({ ...input, snapshot });
      return { asset: published.asset, snapshotSha256: published.snapshotSha256 };
    },
    async deliverEmail(input) {
      requireIds(input.workspaceId, input.reportId);
      const parsedEmail = EmailSchema.safeParse(input.recipient);
      if (!parsedEmail.success) throw new ReportDeliveryError("INVALID_INPUT");
      const recipient = parsedEmail.data;
      if (await options.store.isEmailSuppressed({
        workspaceId: input.workspaceId,
        recipient,
      })) {
        throw new ReportDeliveryError("EMAIL_SUPPRESSED");
      }
      const recipientHash = digest(recipient);
      const idempotencyRecipientHash = recipientHash.slice(0, 32);
      const idempotencyKey = `report-email:${input.reportId}:${idempotencyRecipientHash}`;
      const result = await options.store.withEmailDeliveryFence({
        workspaceId: input.workspaceId,
        reportId: input.reportId,
        recipient,
        recipientHash,
        idempotencyKey,
        now: clock(),
      }, async (prepared, transaction) => {
        const hash = snapshotSha256(prepared.snapshot);
        if (clock().getTime() - prepared.createdAt.getTime() > 23 * 60 * 60 * 1000) {
          await transaction.markEmailFailed({
            workspaceId: input.workspaceId,
            deliveryId: prepared.id,
            errorCode: "REPORT_EMAIL_IDEMPOTENCY_EXPIRED",
          });
          throw new ReportDeliveryError("EMAIL_IDEMPOTENCY_EXPIRED");
        }
        try {
          const published = await ensurePdfWithStore(transaction, {
            workspaceId: input.workspaceId,
            reportId: input.reportId,
            snapshot: prepared.snapshot,
          });
          const reportUrl = new URL(`/app/reports/${encodeURIComponent(input.reportId)}`, appPublicUrl).toString();
          await options.email.send({
            recipient,
            subject: `${prepared.snapshot.brand.name} 주간 검색 성과 리포트`,
            html: emailHtml(prepared.snapshot, hash, reportUrl),
            idempotencyKey,
            snapshotSha256: hash,
            attachment: {
              filename: `semforge-report-${prepared.snapshot.period.current.end}.pdf`,
              content: published.pdf,
              contentType: "application/pdf",
            },
          });
          await transaction.markEmailDelivered({
            workspaceId: input.workspaceId,
            deliveryId: prepared.id,
            deliveredAt: clock(),
          });
          return {
            status: "delivered" as const,
            deliveryId: prepared.id,
            pdfAssetId: published.asset.id,
            snapshotSha256: hash,
          };
        } catch (error) {
          const providerRejected = error instanceof ReportEmailSenderError &&
            error.disposition === "rejected";
          const errorCode = providerRejected
            ? "REPORT_EMAIL_PROVIDER_REJECTED"
            : "REPORT_EMAIL_PROVIDER_ERROR";
          await transaction.markEmailFailed({
            workspaceId: input.workspaceId,
            deliveryId: prepared.id,
            errorCode,
          });
          throw new ReportDeliveryError(
            providerRejected ? "EMAIL_PROVIDER_REJECTED" : "EMAIL_PROVIDER_ERROR",
          );
        }
      });
      if (result.disposition === "suppressed") {
        throw new ReportDeliveryError("EMAIL_SUPPRESSED");
      }
      if (result.disposition === "already_delivered") {
        return {
          status: "already_delivered",
          deliveryId: result.prepared.id,
          snapshotSha256: snapshotSha256(result.prepared.snapshot),
        };
      }
      return result.value;
    },
  };
}
