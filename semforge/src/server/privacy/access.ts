// @TASK P5-PRIVACY-DIRECT-API - Race-safe workspace shared-operation access port
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/privacy/access.test.ts

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

/**
 * Production composition seam. The final privacy-fence integration replaces
 * this fail-closed body with PostgresWorkspacePrivacyFence(getPool(...)).
 * An identity fallback is intentionally forbidden because it would reopen the
 * erasure race when composition is missing.
 */
export function createRuntimeWorkspacePrivacyFence(): WorkspaceSharedOperationPort {
  throw new Error("WORKSPACE_PRIVACY_FENCE_NOT_COMPOSED");
}
