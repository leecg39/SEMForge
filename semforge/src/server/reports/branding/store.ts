// @TASK P4-B1 - Tenant-scoped report branding store
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/server/reports/branding/routes.integration.test.ts
import type { DomainAddressResolver } from "@/server/sites/domain";
import {
  normalizeReportBranding,
  type ReportBranding,
} from "@/server/reports/branding/domain";

export interface BrandingSqlClient {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

interface BrandingSqlConnection extends BrandingSqlClient {
  release(): void;
}

export type BrandingSqlSource = BrandingSqlClient & {
  connect?: () => Promise<BrandingSqlConnection>;
};

export interface BrandingStoreOptions {
  /** The privacy fence already owns BEGIN, tenant context, COMMIT and rollback. */
  readonly transaction?: "existing";
}

type BrandingRow = {
  name: string;
  logo_url: string | null;
  accent_color: string;
};

export class ReportBrandingStoreError extends Error {
  constructor(readonly code: "NOT_FOUND") {
    super(code);
    this.name = "ReportBrandingStoreError";
  }
}

function toBranding(row: BrandingRow): ReportBranding {
  return {
    name: row.name,
    logoUrl: row.logo_url,
    accentColor: row.accent_color,
  };
}

async function withWorkspaceTransaction<T>(
  source: BrandingSqlSource,
  workspaceId: string,
  operation: (db: BrandingSqlClient) => Promise<T>,
  options: BrandingStoreOptions = {},
): Promise<T> {
  if (options.transaction === "existing") return operation(source);
  const connection = source.connect ? await source.connect() : null;
  const db = connection ?? source;
  try {
    await db.query("begin");
    try {
      await db.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await operation(db);
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  } finally {
    connection?.release();
  }
}

export async function getReportBranding(
  source: BrandingSqlSource,
  workspaceId: string,
  options: BrandingStoreOptions = {},
): Promise<ReportBranding> {
  return withWorkspaceTransaction(source, workspaceId, async (db) => {
    const row = (
      await db.query<BrandingRow>(
        "select name, logo_url, accent_color from workspaces where id = $1 limit 1",
        [workspaceId],
      )
    ).rows[0];
    if (!row) throw new ReportBrandingStoreError("NOT_FOUND");
    return toBranding(row);
  }, options);
}

export async function updateReportBranding(
  source: BrandingSqlSource,
  input: { workspaceId: string; branding: ReportBranding },
  resolveLogoAddresses?: DomainAddressResolver,
  options: BrandingStoreOptions = {},
): Promise<ReportBranding> {
  const branding = await normalizeReportBranding(input.branding, resolveLogoAddresses);
  return withWorkspaceTransaction(source, input.workspaceId, async (db) => {
    const row = (
      await db.query<BrandingRow>(
        `update workspaces
            set name = $2, logo_url = $3, accent_color = $4, updated_at = now()
          where id = $1
          returning name, logo_url, accent_color`,
        [input.workspaceId, branding.name, branding.logoUrl, branding.accentColor],
      )
    ).rows[0];
    if (!row) throw new ReportBrandingStoreError("NOT_FOUND");
    return toBranding(row);
  }, options);
}
