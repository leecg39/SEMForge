#!/usr/bin/env tsx
// @TASK P5-PRIVACY - Operator-only privacy lifecycle CLI
// @SPEC paid-beta privacy lifecycle blockers
import { getPool } from "@/db/client";
import { PostgresWorkspacePrivacyFence } from "@/server/privacy/fence";
import {
  createProductionPrivacyProcessor,
  createProductionPrivacyRetentionProcessor,
  PrivacyProcessorConfigurationError,
} from "@/server/privacy/processor";
import {
  createPrivacyService,
  readPrivacyRetentionPolicy,
  runPrivacyRetention,
} from "@/server/privacy/service";

type Command = "export" | "correct" | "delete" | "retention";

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  tsx scripts/privacy/privacy.ts export --workspace <uuid> --request <id> --operator <id>",
      "  tsx scripts/privacy/privacy.ts correct --workspace <uuid> --request <id> --operator <id> [--display-name <name>] [--workspace-name <name>]",
      "  tsx scripts/privacy/privacy.ts delete --workspace <uuid> --request <id> --operator <id>",
      "  tsx scripts/privacy/privacy.ts retention --dry-run true|false",
    ].join("\n"),
  );
}

function args(argv: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) usage();
    result.set(key.slice(2), value);
    index += 1;
  }
  return result;
}

function required(input: Map<string, string>, key: string): string {
  const value = input.get(key)?.trim();
  if (!value) usage();
  return value;
}

async function main() {
  const command = process.argv[2] as Command | undefined;
  if (!command || !["export", "correct", "delete", "retention"].includes(command)) usage();
  const input = args(process.argv.slice(3));
  const now = new Date();

  if (command === "retention") {
    const dryRun = required(input, "dry-run");
    const db = getPool("retention");
    try {
      const processor = createProductionPrivacyRetentionProcessor({ env: process.env });
      const result = await runPrivacyRetention({
        db,
        now,
        policy: readPrivacyRetentionPolicy(),
        dryRun: dryRun !== "false",
        processor: {
          deleteWorkspaceObjects: (workspace) =>
            processor.deleteWorkspaceObjects(workspace),
        },
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      await db.end();
    }
    return;
  }

  const base = {
    workspaceId: required(input, "workspace"),
    requestId: required(input, "request"),
    operatorId: required(input, "operator"),
    now,
  };
  const db = getPool("privacy");
  try {
    const service = createPrivacyService({
      db,
      ...(command === "delete"
        ? {
          erasureFence: new PostgresWorkspacePrivacyFence(db),
          processorFactory: (exclusiveDb) =>
            createProductionPrivacyProcessor({ db: exclusiveDb, env: process.env }),
        }
        : {}),
    });
    if (command === "export") {
      process.stdout.write(`${JSON.stringify(await service.exportWorkspaceSubject(base), null, 2)}\n`);
    } else if (command === "correct") {
      process.stdout.write(`${JSON.stringify(await service.correctWorkspaceSubject({
        ...base,
        displayName: input.get("display-name"),
        workspaceName: input.get("workspace-name"),
      }), null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(await service.deleteWorkspaceSubject(base), null, 2)}\n`);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = error instanceof PrivacyProcessorConfigurationError ? 78 : 1;
});
