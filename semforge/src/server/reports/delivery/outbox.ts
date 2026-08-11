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

export async function enqueueReportDeliveryOutbox(
  database: ReportDeliveryOutboxDatabase,
  input: { workspaceId: string; reportId: string },
): Promise<void> {
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key)
     values ($1, $2, $3::jsonb, $4)
     on conflict (workspace_id, topic, idempotency_key) do nothing`,
    [
      input.workspaceId,
      REPORT_PDF_RENDER_JOB,
      JSON.stringify({ reportId: input.reportId }),
      `report-pdf:${input.reportId}`,
    ],
  );
  const recipients = (
    await database.query<{ email: string }>(
      `select distinct lower(user_account.email) as email
         from memberships membership
         join users user_account on user_account.id = membership.user_id
        where membership.workspace_id = $1 and membership.role = 'owner'
          and user_account.disabled_at is null and user_account.email_verified_at is not null
        order by lower(user_account.email)`,
      [input.workspaceId],
    )
  ).rows;
  for (const { email } of recipients) {
    const recipientHash = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 32);
    await database.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, $2, $3::jsonb, $4)
       on conflict (workspace_id, topic, idempotency_key) do nothing`,
      [
        input.workspaceId,
        REPORT_EMAIL_DELIVERY_JOB,
        JSON.stringify({ reportId: input.reportId, recipient: email }),
        `report-email:${input.reportId}:${recipientHash}`,
      ],
    );
  }
}
