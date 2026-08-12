# Privacy erasure backup marker runbook

This runbook is the beta operational contract for DSAR deletion requests.

The application performs live database/object erasure only after external processor steps succeed. Backups are not mutated in place. Each completed deletion inserts a `backup_deletion_markers` row with the DSAR request id. Operators must:

1. Record the marker id in the incident/DSAR tracker.
2. Confirm PostgreSQL PITR backup expiry according to the configured beta retention window.
3. Confirm object-store version lifecycle expiry for deleted report objects.
4. Keep billing ledger rows only in the anonymized/tombstone form required for refund, dispute, chargeback, tax, and legal hold handling.
5. Attach restore-rehearsal evidence showing erased identities are not reintroduced after a recovery drill.

Default retention windows are product-policy defaults for the paid beta and are configurable. They are not a statement of statutory retention periods.
