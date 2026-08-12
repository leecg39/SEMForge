# External-provider launch gates

These gates are intentionally separate from the actual PostgreSQL/Docker QA result. Production credentials were not available, so no live external success is claimed.

## Verified with official adapter contracts or controlled boundaries

- Google/TalorData collection boundary: 9 scheduled calls reached the mock handler with the production job/relay contract.
- NAVER collection boundary: 180 scheduled calls reached the mock handler with the production job/relay contract.
- Google Search Console: the official OAuth/token/collector contracts pass in the 465-test suite; the nine-site fixture had no live GSC bindings and scheduled 0 GSC calls.
- Report snapshot/PDF: the production PostgreSQL snapshot generator ran for 9 sites; a deterministic `%PDF-1.7` renderer boundary created 9 immutable assets. The project integration suite separately exercises real Chromium/Noto rendering.
- Resend delivery: 9 stable idempotency keys completed delivery; an accepted-then-connection-reset fault produced one retry and no additional accepted idempotency identity.
- S3 boundary: 9 private immutable object identities were written to an in-memory contract implementation.

## Blocked before production launch

- Toss Payments: provide sandbox/production secret and client keys, merchant configuration, redirect/webhook endpoints, signature verification inputs, and run an authorized/cancel/retry/webhook smoke test.
- Google/TalorData: provide provider token/account access and run a limited real collection smoke test with quota/timeout evidence.
- Google Search Console: provide a configured OAuth client, authorized test property/account, redirect URI, and run connect/refresh/query/revoke smoke tests.
- NAVER: provide applicable Search API/Search Ads credentials and authorized account, then run limited query/statistics smoke tests.
- Resend: provide API key, verified sender/domain, recipient sandbox, and validate delivery/webhook behavior with the stable idempotency key.
- S3-compatible storage: provide endpoint/region/bucket/credentials, bucket policy/KMS/CORS/lifecycle settings, and validate private PUT/read/signed-URL behavior.
- Deployment edge: validate production DNS/TLS, secrets injection, egress allow-lists, and CronJob/service-account rollout in the target cluster.

These are release launch gates, not evidence of a Phase 4 code failure. They cannot be honestly closed without credentials and provider-side resources.
