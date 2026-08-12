# Privacy request approval, execution, and backup marker runbook

This runbook is the beta operational contract for subject-bound DSAR export/correction/erasure and workspace closure deletion requests.

Every export, correction, erasure, and workspace closure deletion uses two isolated production roles. The approver runs `privacy-request` with only `OPERATOR_DATABASE_URL`; the executor then runs the matching `privacy-export`, `privacy-correct`, `privacy-delete`, or direct `delete-workspace` privacy CLI command with only `PRIVACY_DATABASE_URL`, application encryption keys, and S3 credentials. The workspace, external request id, operator id, request type, and subject user id must match across both steps. Export, correction, and erasure require `--subject-user`; workspace closure uses request type `workspace_deletion` and must not include a subject. Subject erasure refuses the last workspace owner; transfer ownership first or approve explicit `workspace_deletion`. The executor fails closed when `privacy_open_request(...)` has not opened that exact request.

The complete field inventory, retention crosswalk, and known access-audit gaps are in
[`../privacy/data-flow-inventory.md`](../privacy/data-flow-inventory.md). Incident handling uses
[`privacy-incident-response-runbook.md`](privacy-incident-response-runbook.md).

```bash
NODE_ENV=production PGSSLMODE=verify-full npm run privacy:request -- \
  --workspace "$WORKSPACE_ID" --request "$REQUEST_ID" \
  --operator "$OPERATOR_ID" --type erasure --subject-user "$SUBJECT_USER_ID"
NODE_ENV=production PGSSLMODE=verify-full npm run privacy:delete -- \
  --workspace "$WORKSPACE_ID" --request "$REQUEST_ID" \
  --operator "$OPERATOR_ID" --subject-user "$SUBJECT_USER_ID"

NODE_ENV=production PGSSLMODE=verify-full npm run privacy:request -- \
  --workspace "$WORKSPACE_ID" --request "$REQUEST_ID" \
  --operator "$OPERATOR_ID" --type workspace_deletion
NODE_ENV=production PGSSLMODE=verify-full node --import tsx scripts/privacy/privacy.ts delete-workspace -- \
  --workspace "$WORKSPACE_ID" --request "$REQUEST_ID" --operator "$OPERATOR_ID"
```

Do not load `operator.env` and `privacy.env` in the same process. Retention uses a third role and `retention.env`; it must not receive `PRIVACY_DATABASE_URL`, `OPERATOR_DATABASE_URL`, application encryption keys, or Google credentials.

The application performs live database/object erasure only after external processor steps succeed. Backups are not mutated in place. Each completed deletion inserts a `backup_deletion_markers` row with the DSAR request id. Operators must:

1. Record the marker id in the incident/DSAR tracker.
2. Confirm PostgreSQL PITR backup expiry according to the configured beta retention window.
3. Confirm object-store version lifecycle expiry for deleted report objects.
4. Keep billing ledger rows only in the anonymized/tombstone form required for refund, dispute, chargeback, tax, and legal hold handling.
5. Attach restore-rehearsal evidence showing erased identities are not reintroduced after a recovery drill.

Retention windows come from the deployed `PRIVACY_RETENTION_POLICY` configuration. They are operational policy values, not statutory retention-period statements.

Successful sensitive reads create tenant-scoped audit records without payload values:

- `privacy.export.read` records only the request identity, data categories, and result counts.
- `privacy.deletion_targets.read` records only the request identity, target categories, and counts.

The operator must confirm these events exist for the request. Do not copy export payloads, OAuth token
envelopes, storage keys, or recipient addresses into tickets or audit metadata.
