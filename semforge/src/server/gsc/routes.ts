// @TASK P2-G1-T1 - Google Search Console API v1 routes
// @SPEC user-approved-plan#허용-API
// @TEST src/server/gsc/routes.contract.test.ts
import { z } from "zod";

import {
  ApiError,
  apiSuccess,
  parseJsonBody,
  withApiV1,
} from "@/lib/api-v1";
import { TENANT_WORKSPACE_MANAGER_ROLES } from "@/server/auth/contracts";
import type { RequireAuth } from "@/server/auth/guard";
import type { BillingAccessAuthorizer } from "@/server/billing/access";
import type { GscConnectionRecord, GscPropertyBindingRecord } from "@/server/gsc/store";
import type { GscProperty } from "@/server/gsc/google-client";
import { GscServiceError, type GscService } from "@/server/gsc/service";
import {
  WorkspacePrivacyOperationBlockedError,
  runWorkspaceSharedOperation,
  type WorkspaceSharedOperationPort,
} from "@/server/privacy/access";

export type RequireGscAuth = RequireAuth;

export type GscRouteService = Pick<
  GscService,
  | "resolveCallbackWorkspace"
  | "startConnection"
  | "completeCallback"
  | "listConnections"
  | "listProperties"
  | "bindProperty"
  | "disconnect"
>;

export interface GscRouteHandlerOptions {
  requireAuth: RequireGscAuth;
  authorizeBilling: BillingAccessAuthorizer;
  workspaceOperations: WorkspaceSharedOperationPort;
  getService: () => GscRouteService;
}

type ConnectionContext = { params: Promise<{ connectionId: string }> };

const rejectTenantOverride = z
  .object({ workspaceId: z.never().optional(), userId: z.never().optional() })
  .passthrough();

const connectBodySchema = rejectTenantOverride.extend({
  label: z.string().trim().min(1).max(80),
  returnPath: z.string().trim().max(300).optional(),
});

const bindingBodySchema = rejectTenantOverride.extend({
  siteId: z.uuid(),
  connectionId: z.uuid(),
  propertyUri: z.string().trim().min(1).max(512),
});

function mapGscError(error: unknown): never {
  if (error instanceof WorkspacePrivacyOperationBlockedError) {
    throw new ApiError(
      "CONFLICT",
      "개인정보 삭제가 진행 중이거나 완료되어 이 작업을 수행할 수 없습니다.",
    );
  }
  if (!(error instanceof GscServiceError)) throw error;
  switch (error.code) {
    case "INVALID_STATE":
      throw new ApiError("BAD_REQUEST", "Google 인증 state가 만료되었거나 유효하지 않습니다.");
    case "INVALID_SCOPE":
      throw new ApiError("FORBIDDEN", "Google Search Console readonly 권한만 연결할 수 있습니다.");
    case "MISSING_REFRESH_TOKEN":
      throw new ApiError("CONFLICT", "Google refresh token이 발급되지 않았습니다. 연결을 다시 진행해 주세요.");
    case "NOT_FOUND":
      throw new ApiError("NOT_FOUND");
    case "FORBIDDEN":
      throw new ApiError("FORBIDDEN");
    case "DUPLICATE_LABEL":
      throw new ApiError("DUPLICATE", "같은 이름의 Search Console 연결이 이미 있습니다.");
    case "UPSTREAM":
    case "SECRET_DECRYPTION_FAILED":
      throw new ApiError("INTERNAL");
    default:
      throw new ApiError("INTERNAL");
  }
}

function publicConnection(connection: GscConnectionRecord) {
  return {
    id: connection.id,
    workspaceId: connection.workspaceId,
    label: connection.label,
    tokenExpiresAt: connection.tokenExpiresAt,
    scope: connection.scope,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function publicBinding(binding: GscPropertyBindingRecord) {
  return {
    id: binding.id,
    workspaceId: binding.workspaceId,
    siteId: binding.siteId,
    connectionId: binding.connectionId,
    propertyUri: binding.propertyUri,
    createdAt: binding.createdAt,
  };
}

function publicProperties(properties: readonly GscProperty[]) {
  return properties.map((property) => ({
    siteUrl: property.siteUrl,
    permissionLevel: property.permissionLevel,
  }));
}

export function createGscRouteHandlers(options: GscRouteHandlerOptions) {
  async function requireBilling(
    workspaceId: string,
    capability: "workspace:read" | "workspace:write",
  ): Promise<void> {
    const decision = await options.authorizeBilling({ workspaceId, capability });
    if (!decision.allowed) throw new ApiError("FORBIDDEN");
  }

  function runWorkspaceOperation<T>(
    workspaceId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return runWorkspaceSharedOperation(
      options.workspaceOperations,
      workspaceId,
      operation,
    );
  }

  return {
    connect: {
      POST: withApiV1(async (request, _context, apiContext) => {
        const principal = await options.requireAuth(request, {
          csrf: true,
          roles: TENANT_WORKSPACE_MANAGER_ROLES,
          requestId: apiContext.requestId,
        });
        const body = await parseJsonBody(request, connectBodySchema);
        try {
          const result = await runWorkspaceOperation(principal.workspaceId, async () => {
            await requireBilling(principal.workspaceId, "workspace:write");
            return options.getService().startConnection({
              workspaceId: principal.workspaceId,
              userId: principal.userId,
              label: body.label,
              returnPath: body.returnPath,
            });
          });
          return apiSuccess(result, { status: 201 });
        } catch (error) {
          mapGscError(error);
        }
      }),
    },

    callback: {
      GET: withApiV1(async (request, _context, apiContext) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code")?.trim();
        const state = url.searchParams.get("state")?.trim();
        if (!code || !state) throw new ApiError("BAD_REQUEST", "Google 인증 code와 state가 필요합니다.");
        const principal = await options.requireAuth(request, {
          csrf: false,
          roles: TENANT_WORKSPACE_MANAGER_ROLES,
          requestId: apiContext.requestId,
        });
        try {
          const result = await runWorkspaceOperation(principal.workspaceId, async () => {
            await requireBilling(principal.workspaceId, "workspace:write");
            const service = options.getService();
            const canonicalWorkspaceId = await service.resolveCallbackWorkspace({
              workspaceId: principal.workspaceId,
              userId: principal.userId,
              state,
            });
            if (!canonicalWorkspaceId || canonicalWorkspaceId !== principal.workspaceId) {
              throw new GscServiceError("INVALID_STATE");
            }
            return service.completeCallback({
              workspaceId: canonicalWorkspaceId,
              userId: principal.userId,
              code,
              state,
            });
          });
          return apiSuccess({
            returnPath: result.returnPath,
            connection: publicConnection(result.connection),
          });
        } catch (error) {
          mapGscError(error);
        }
      }),
    },

    connections: {
      GET: withApiV1(async (request, _context, apiContext) => {
        const principal = await options.requireAuth(request, {
          csrf: false,
          roles: ["owner", "admin", "member"],
          requestId: apiContext.requestId,
        });
        try {
          const connections = await runWorkspaceOperation(principal.workspaceId, async () => {
            await requireBilling(principal.workspaceId, "workspace:read");
            return options.getService().listConnections({
              workspaceId: principal.workspaceId,
            });
          });
          return apiSuccess({ items: connections.map(publicConnection) });
        } catch (error) {
          mapGscError(error);
        }
      }),
    },

    connection: {
      DELETE: withApiV1(async (request, context: ConnectionContext, apiContext) => {
        const principal = await options.requireAuth(request, {
          csrf: true,
          roles: TENANT_WORKSPACE_MANAGER_ROLES,
          requestId: apiContext.requestId,
        });
        const { connectionId } = await context.params;
        try {
          await runWorkspaceOperation(principal.workspaceId, async () => {
            await requireBilling(principal.workspaceId, "workspace:write");
            return options.getService().disconnect({
              workspaceId: principal.workspaceId,
              connectionId,
            });
          });
          return apiSuccess({ disconnected: true });
        } catch (error) {
          mapGscError(error);
        }
      }),
    },

    properties: {
      GET: withApiV1(async (request, context: ConnectionContext, apiContext) => {
        const principal = await options.requireAuth(request, {
          csrf: false,
          roles: ["owner", "admin", "member"],
          requestId: apiContext.requestId,
        });
        const { connectionId } = await context.params;
        try {
          const properties = await runWorkspaceOperation(principal.workspaceId, async () => {
            await requireBilling(principal.workspaceId, "workspace:read");
            return options.getService().listProperties({
              workspaceId: principal.workspaceId,
              connectionId,
            });
          });
          return apiSuccess({ items: publicProperties(properties) });
        } catch (error) {
          mapGscError(error);
        }
      }),
    },

    bindings: {
      POST: withApiV1(async (request, _context, apiContext) => {
        const principal = await options.requireAuth(request, {
          csrf: true,
          roles: TENANT_WORKSPACE_MANAGER_ROLES,
          requestId: apiContext.requestId,
        });
        const body = await parseJsonBody(request, bindingBodySchema);
        try {
          const binding = await runWorkspaceOperation(principal.workspaceId, async () => {
            await requireBilling(principal.workspaceId, "workspace:write");
            return options.getService().bindProperty({
              workspaceId: principal.workspaceId,
              siteId: body.siteId,
              connectionId: body.connectionId,
              propertyUri: body.propertyUri,
            });
          });
          return apiSuccess(publicBinding(binding), { status: 201 });
        } catch (error) {
          mapGscError(error);
        }
      }),
    },
  };
}
