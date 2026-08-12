#!/usr/bin/env tsx
// @TASK P1-FINAL-PRIVACY - Operator approval before DSAR execution
// @SPEC final_privacy_roles#operator-approval-boundary
// @TEST scripts/ops/privacy-request.test.ts
import { pathToFileURL } from "node:url";

import { getPool } from "@/db/client";

type PrivacyRequestType = "export" | "correction" | "erasure" | "workspace_deletion";

export interface PrivacyRequestArguments {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly operatorId: string;
  readonly type: PrivacyRequestType;
  readonly subjectUserId: string | null;
}

const SUPPORTED_TYPES = ["export", "correction", "erasure", "workspace_deletion"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class PrivacyRequestUsageError extends Error {
  constructor() {
    super(
      "Usage: privacy-request --workspace <uuid> --request <id> --operator <id> --type export|correction|erasure|workspace_deletion [--subject-user <uuid>]",
    );
    this.name = "PrivacyRequestUsageError";
  }
}

export function parsePrivacyRequestArgs(argv: readonly string[]): PrivacyRequestArguments {
  const values = new Map<string, string>();
  const supported = new Set(["--workspace", "--request", "--operator", "--type", "--subject-user"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !supported.has(key) || !value || value.startsWith("--") || values.has(key)) {
      throw new PrivacyRequestUsageError();
    }
    values.set(key, value);
  }
  const workspaceId = values.get("--workspace") ?? "";
  const requestId = values.get("--request") ?? "";
  const operatorId = values.get("--operator") ?? "";
  const type = values.get("--type") ?? "";
  const subjectUserId = values.get("--subject-user") ?? null;
  if (
    !UUID_PATTERN.test(workspaceId) ||
    !requestId || requestId !== requestId.trim() || requestId.length > 200 ||
    !operatorId || operatorId !== operatorId.trim() || operatorId.length > 200 ||
    !SUPPORTED_TYPES.includes(type as PrivacyRequestType) ||
    (type === "workspace_deletion" ? subjectUserId !== null : !subjectUserId || !UUID_PATTERN.test(subjectUserId))
  ) {
    throw new PrivacyRequestUsageError();
  }
  return { workspaceId, requestId, operatorId, type: type as PrivacyRequestType, subjectUserId };
}

export async function runPrivacyRequest(
  argv: readonly string[],
  options: {
    readonly now?: () => Date;
    readonly openRequest?: (
      input: PrivacyRequestArguments & { readonly requestedAt: Date },
    ) => Promise<{ readonly id: string; readonly status: string }>;
    readonly stdout?: (value: string) => void;
    readonly stderr?: (value: string) => void;
  } = {},
): Promise<number> {
  const stdout = options.stdout ?? ((value: string) => process.stdout.write(value));
  const stderr = options.stderr ?? ((value: string) => process.stderr.write(value));
  try {
    const input = parsePrivacyRequestArgs(argv);
    const requestedAt = (options.now ?? (() => new Date()))();
    const openRequest = options.openRequest ?? (async (request) => {
      const db = getPool("operator");
      try {
        const row = (
          await db.query<{ id: string; status: string }>(
            `select id::text, status
               from privacy_open_request($1::uuid, $2::text, $3::text, $4::text, $5::timestamptz, $6::uuid)`,
            [
              request.workspaceId,
              request.requestId,
              request.type,
              request.operatorId,
              request.requestedAt,
              request.subjectUserId,
            ],
          )
        ).rows[0];
        if (
          !row || !UUID_PATTERN.test(row.id) ||
          !["queued", "completed"].includes(row.status)
        ) {
          throw new Error("PRIVACY_REQUEST_NOT_OPENED");
        }
        return row;
      } finally {
        await db.end();
      }
    });
    const result = await openRequest({ ...input, requestedAt });
    stdout(`${JSON.stringify({ id: result.id, status: result.status })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof PrivacyRequestUsageError) {
      stderr(`${error.message}\n`);
      return 64;
    }
    stderr("privacy request approval failed\n");
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runPrivacyRequest(process.argv.slice(2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main();
}
