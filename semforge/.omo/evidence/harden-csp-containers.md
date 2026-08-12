# Harden CSP and Docker Compose containers evidence

- Task: Low defense-in-depth fix for nginx CSP and Docker Compose runtime hardening.
- Worktree: `/Users/user01/Music/SEMForge-worktrees/harden-csp-containers/semforge/semforge`
- Branch: `codex/harden-csp-containers`
- Base HEAD: `7600874899c707867037d5ef891e41711cce5297`
- Scope changed:
  - `deploy/nginx/nginx.conf`
  - `docker-compose.yml`
  - `scripts/ops/deployment.contract.test.ts`

## Implemented behavior

- nginx CSP now declares a full policy instead of only `frame-ancestors`, `object-src`, and `base-uri`.
- Browser `connect-src` is limited to `'self'`; Google/NAVER/Toss server API origins are intentionally excluded because provider calls are server-side.
- Toss browser SDK script origin is limited to `https://js.tosspayments.com`; Toss payment UI navigation/frame targets are constrained to `https://*.tosspayments.com`.
- Google OAuth is represented as top-level navigation via `navigate-to https://accounts.google.com`, not as a form or XHR target.
- `unsafe-eval` is not allowed.
- `unsafe-inline` is explicitly documented as an accepted Low risk until nonce middleware exists for Next production bootstrap/app CSS.
- All app services rendered by `docker compose config` inherit:
  - `read_only: true`
  - `security_opt: [no-new-privileges:true]`
  - `cap_drop: [ALL]`
  - tmpfs for `/tmp`, `/home/semforge/.cache`, and `/home/semforge/.config`
  - no `cap_add`
  - no `privileged: true`

## Verification

- RED: after adding the new contract tests, focused ops test failed before implementation:
  - Invocation: `npm run test:ops -- --test-name-pattern 'nginx CSP|production docker compose config'`
  - Observable: failed because `tsx` was missing before `npm ci`; after dependencies, compose hardening test failed against the pre-hardening/default config.
- GREEN focused seam:
  - Invocation: `npx tsx --test scripts/ops/deployment.contract.test.ts --test-name-pattern 'nginx CSP|production docker compose config'`
  - Observable: `tests 17`, `pass 17`, `fail 0`
- Full ops seam:
  - Invocation: `npm run test:ops`
  - Observable: `tests 46`, `pass 46`, `fail 0`
- Type/lint:
  - Invocation: `npm run typecheck && npm run lint`
  - Observable: exit code `0`
- Compose renderer:
  - Invocation inside test helper: `docker compose --env-file <project-local-temp-env> --profile scheduled --profile manual -f docker-compose.yml config`
  - Observable: test asserts every app service block contains read-only root filesystem, no-new-privileges, cap drop ALL, expected tmpfs mounts, no cap_add, and no privileged mode.
- Tool versions observed:
  - `node -v`: `v25.4.0`
  - `npm -v`: `11.7.0`
  - `docker compose version`: `Docker Compose version v5.0.2`

## Limitation

- The available PATH in this subagent shell used Node `v25.4.0`, while the project requires Node 24 LTS. The change is limited to nginx/Compose/test contracts and passed type/lint/ops under the available runtime. A parent gate should rerun the same commands with Node 24 before merging.
