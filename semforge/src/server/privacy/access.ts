// @TASK P5-PRIVACY-DIRECT-API - Race-safe workspace shared-operation access port
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/privacy/access.test.ts
import { getPool } from "@/db/client";
import {
  PostgresWorkspacePrivacyFence,
  type WorkspacePrivacyFencePool,
} from "@/server/privacy/fence";

export type WorkspacePrivacyState = "active" | "blocking" | "erased";

export type WorkspaceSharedOperationResult<T> =
  | { readonly disposition: "executed"; readonly value: T }
  | {
      readonly disposition: "skipped";
      readonly state: Exclude<WorkspacePrivacyState, "active">;
    };

/** Structural subset implemented by PostgresWorkspacePrivacyFence. */
export interface WorkspaceSharedOperationPort {
  withShared<T>(
    workspaceId: string,
    operation: () => Promise<T>,
  ): Promise<WorkspaceSharedOperationResult<T>>;
}

export class WorkspacePrivacyOperationBlockedError extends Error {
  constructor(readonly workspaceState: Exclude<WorkspacePrivacyState, "active">) {
    super("WORKSPACE_PRIVACY_OPERATION_BLOCKED");
    this.name = "WorkspacePrivacyOperationBlockedError";
  }
}

export async function runWorkspaceSharedOperation<T>(
  access: WorkspaceSharedOperationPort,
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const result = await access.withShared(workspaceId, operation);
  if (result.disposition === "skipped") {
    throw new WorkspacePrivacyOperationBlockedError(result.state);
  }
  return result.value;
}

export function createRuntimeWorkspacePrivacyFence(
  pool: WorkspacePrivacyFencePool = getPool("webFence"),
): WorkspaceSharedOperationPort {
  const fence = new PostgresWorkspacePrivacyFence(pool);
  return {
    withShared(workspaceId, operation) {
      return fence.withShared(workspaceId, operation);
    },
  };
}
