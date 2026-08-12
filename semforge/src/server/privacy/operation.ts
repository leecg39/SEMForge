// @TASK P5-PRIVACY-FENCE - Tenant mutation shared-operation guard
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/sites/routes.integration.test.ts
// @TEST src/server/reports/branding/routes.integration.test.ts
import type {
  WorkspacePrivacyFence,
  WorkspacePrivacyFenceSql,
  WorkspacePrivacyState,
} from "@/server/privacy/fence";

export interface WorkspacePrivacyOperationGuard {
  withShared<T>(
    workspaceId: string,
    operation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<T>;
}

export class WorkspacePrivacyOperationBlockedError extends Error {
  constructor(readonly state: Exclude<WorkspacePrivacyState, "active">) {
    super("WORKSPACE_PRIVACY_OPERATION_BLOCKED");
    this.name = "WorkspacePrivacyOperationBlockedError";
  }
}

export class WorkspacePrivacyOperationConfigurationError extends Error {
  constructor() {
    super("WORKSPACE_PRIVACY_OPERATION_GUARD_REQUIRED");
    this.name = "WorkspacePrivacyOperationConfigurationError";
  }
}

export const missingWorkspacePrivacyOperationGuard: WorkspacePrivacyOperationGuard = {
  async withShared() {
    throw new WorkspacePrivacyOperationConfigurationError();
  },
};

export function createWorkspacePrivacyOperationGuard(
  fence: WorkspacePrivacyFence,
): WorkspacePrivacyOperationGuard {
  return {
    async withShared(workspaceId, operation) {
      const result = await fence.withShared(workspaceId, operation);
      if (result.disposition === "executed") return result.value;
      throw new WorkspacePrivacyOperationBlockedError(result.state);
    },
  };
}
