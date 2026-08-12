// @TASK P4-R1-T1 - Transactional automatic PDF and owner email outbox
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createHash } from "node:crypto";

import {
  REPORT_EMAIL_DELIVERY_JOB,
  REPORT_PDF_RENDER_JOB,
} from "@/server/reports/delivery/job-handler";

export interface ReportDeliveryOutboxDatabase {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

/** 사용자 PII 조회는 auth role 경계에서 끝내고 worker에는 owner/admin 수신자만 전달한다. */
export async function loadReportOwnerRecipients(
  database: ReportDeliveryOutboxDatabase,
  workspaceId: string,
): Promise<readonly string[]> {
  return (
    await database.query<{ email: string }>(
      `select distinct lower(user_account.email) as email
         from memberships membership
         join users user_account on user_account.id = membership.user_id
        where membership.workspace_id = $1 and membership.role in ('owner', 'admin')
          and user_account.disabled_at is null and user_account.email_verified_at is not null
        order by lower(user_account.email)`,
      [workspaceId],
    )
  ).rows.map(({ email }) => email);
}

export async function enqueueReportDeliveryOutbox(
  database: ReportDeliveryOutboxDatabase,
  input: {
    workspaceId: string;
    reportId: string;
    ownerRecipients: readonly string[];
  },
): Promise<void> {
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key)
     values ($1, $2, $3::jsonb, $4)
     on conflict do nothing`,
    [
      input.workspaceId,
      REPORT_PDF_RENDER_JOB,
      JSON.stringify({ reportId: input.reportId }),
      `report-pdf:${input.reportId}`,
    ],
  );
  const recipients = [...new Set(input.ownerRecipients.map((email) => email.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();
  for (const email of recipients) {
    const recipientHash = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 32);
    await database.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, $2, $3::jsonb, $4)
       on conflict do nothing`,
      [
        input.workspaceId,
        REPORT_EMAIL_DELIVERY_JOB,
        JSON.stringify({ reportId: input.reportId, recipient: email }),
        `report-email:${input.reportId}:${recipientHash}`,
      ],
    );
  }
}
