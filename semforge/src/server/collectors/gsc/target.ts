// @TASK P3-C2-T1 - Tenant-scoped GSC collection target loader
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/target-token.integration.test.ts
import {
  type GscSqlSource,
  withGscWorkspaceTransaction,
} from "@/server/collectors/gsc/database";

export type GscCollectorAccessErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_SCOPE"
  | "TOKEN_DECRYPTION_FAILED"
  | "UPSTREAM";

export class GscCollectorAccessError extends Error {
  constructor(readonly code: GscCollectorAccessErrorCode) {
    super(code);
    this.name = "GscCollectorAccessError";
  }
}

export interface GscCollectionTarget {
  readonly workspaceId: string;
  readonly siteId: string;
  readonly bindingId: string;
  readonly connectionId: string;
  readonly propertyUri: string;
}

type TargetRow = {
  workspace_id: string;
  site_id: string;
  binding_id: string;
  connection_id: string;
  property_uri: string;
};

export async function loadGscCollectionTarget(
  db: GscSqlSource,
  input: { workspaceId: string; siteId: string; bindingId: string },
): Promise<GscCollectionTarget> {
  let row: TargetRow | null;
  try {
    row = await withGscWorkspaceTransaction(
      db,
      input.workspaceId,
      async (client) => {
        const result = await client.query<TargetRow>(
          `select binding.workspace_id::text,
              binding.site_id::text,
              binding.id::text as binding_id,
              binding.connection_id::text,
              binding.property_uri
         from gsc_property_bindings binding
         join sites site
           on site.workspace_id = binding.workspace_id
          and site.id = binding.site_id
          and site.active
         join gsc_connections connection
           on connection.workspace_id = binding.workspace_id
          and connection.id = binding.connection_id
          and connection.disconnected_at is null
        where binding.workspace_id = $1
          and binding.site_id = $2
          and binding.id = $3
        limit 1`,
          [input.workspaceId, input.siteId, input.bindingId],
        );
        return result.rows[0] ?? null;
      },
    );
  } catch (error) {
    if (error instanceof GscCollectorAccessError) throw error;
    throw new GscCollectorAccessError("UPSTREAM");
  }
  if (!row) throw new GscCollectorAccessError("NOT_FOUND");
  if (row.workspace_id !== input.workspaceId || row.site_id !== input.siteId) {
    throw new GscCollectorAccessError("FORBIDDEN");
  }
  return {
    workspaceId: row.workspace_id,
    siteId: row.site_id,
    bindingId: row.binding_id,
    connectionId: row.connection_id,
    propertyUri: row.property_uri,
  };
}
