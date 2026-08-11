// @TASK P2-G1-T1 - PostgreSQL-backed Google Search Console store
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/store.integration.test.ts

export interface SqlQueryable {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

interface ReleasableSqlQueryable extends SqlQueryable {
  release(): void;
}

interface SqlConnectable extends SqlQueryable {
  connect(): Promise<ReleasableSqlQueryable>;
}

export class GscStoreError extends Error {
  constructor(
    readonly code:
      | "DUPLICATE_LABEL"
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "INVALID_SCOPE"
      | "INVALID_PROPERTY",
    message: string = code,
  ) {
    super(message);
    this.name = "GscStoreError";
  }
}

export interface GscOAuthStateRecord {
  workspaceId: string;
  userId: string;
  connectionLabel: string;
  returnPath: string;
}

export interface GscConnectionRecord {
  id: string;
  workspaceId: string;
  label: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export interface GscPropertyBindingRecord {
  id: string;
  workspaceId: string;
  siteId: string;
  connectionId: string;
  propertyUri: string;
  createdAt: string;
}

type GscConnectionRow = {
  id: string;
  workspace_id: string;
  label: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: Date | string;
  scope: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type GscBindingRow = {
  id: string;
  workspace_id: string;
  site_id: string;
  connection_id: string;
  property_uri: string;
  created_at: Date | string;
};

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function toConnection(row: GscConnectionRow): GscConnectionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    label: row.label,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: iso(row.token_expires_at),
    scope: row.scope,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toBinding(row: GscBindingRow): GscPropertyBindingRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    siteId: row.site_id,
    connectionId: row.connection_id,
    propertyUri: row.property_uri,
    createdAt: iso(row.created_at),
  };
}

function normalizeLabel(label: string): string {
  const value = label.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!value || value.length > 80) throw new GscStoreError("NOT_FOUND", "INVALID_LABEL");
  return value;
}

function normalizePropertyUri(propertyUri: string): string {
  const value = propertyUri.trim();
  if (!value || value.length > 512) {
    throw new GscStoreError("INVALID_PROPERTY");
  }
  if (!value.startsWith("sc-domain:") && !/^https?:\/\/[^/\s]+\/?$/i.test(value)) {
    throw new GscStoreError("INVALID_PROPERTY");
  }
  return value;
}

async function inWorkspaceTransaction<T>(
  db: SqlQueryable,
  workspaceId: string,
  operation: (client: SqlQueryable) => Promise<T>,
): Promise<T> {
  const connect = (db as Partial<SqlConnectable>).connect;
  const leasedClient = typeof connect === "function" ? await connect.call(db) : null;
  const client = leasedClient ?? db;
  let transactionStarted = false;
  let result: T | undefined;
  let failure: { error: unknown } | null = null;
  try {
    await client.query("begin");
    transactionStarted = true;
    await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    result = await operation(client);
    await client.query("commit");
  } catch (error) {
    failure = { error };
    if (transactionStarted) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the operation/commit error; rollback is best-effort cleanup.
      }
    }
  }
  if (leasedClient) {
    try {
      leasedClient.release();
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
  return result as T;
}

function mapConnectionError(error: unknown): never {
  const message =
    error instanceof Error ? `${error.message} ${(error as { code?: string }).code ?? ""}` : "";
  if (/gsc_connections_workspace_label_uq/i.test(message)) {
    throw new GscStoreError("DUPLICATE_LABEL");
  }
  if (/gsc_connections_encrypted_tokens_ck|INVALID_SCOPE/i.test(message)) {
    throw new GscStoreError("INVALID_SCOPE");
  }
  throw error;
}

export async function saveGscOAuthState(
  db: SqlQueryable,
  input: {
    workspaceId: string;
    userId: string;
    stateHash: string;
    connectionLabel: string;
    returnPath: string;
    expiresAt: Date;
  },
): Promise<void> {
  await inWorkspaceTransaction(db, input.workspaceId, async (client) => {
    await client.query(
      `insert into oauth_states
         (workspace_id, user_id, state_hash, provider, connection_label, return_path, expires_at)
       values ($1, $2, $3, 'gsc', $4, $5, $6)`,
      [
        input.workspaceId,
        input.userId,
        input.stateHash,
        normalizeLabel(input.connectionLabel),
        input.returnPath,
        input.expiresAt,
      ],
    );
  });
}

export async function consumeGscOAuthState(
  db: SqlQueryable,
  input: {
    workspaceId: string;
    userId: string;
    stateHash: string;
    now: Date;
  },
): Promise<GscOAuthStateRecord | null> {
  return inWorkspaceTransaction(db, input.workspaceId, async (client) => {
    const result = await client.query<{
      workspace_id: string;
      user_id: string;
      connection_label: string;
      return_path: string;
    }>(
      `update oauth_states
          set consumed_at = $5
        where workspace_id = $1
          and user_id = $2
          and state_hash = $3
          and provider = 'gsc'
          and consumed_at is null
          and expires_at > $4
        returning workspace_id::text, user_id::text, connection_label, return_path`,
      [input.workspaceId, input.userId, input.stateHash, input.now, input.now],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      userId: row.user_id,
      connectionLabel: row.connection_label,
      returnPath: row.return_path,
    };
  });
}

export async function createGscConnection(
  db: SqlQueryable,
  input: {
    id: string;
    workspaceId: string;
    label: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenExpiresAt: Date;
    scope: string;
  },
): Promise<GscConnectionRecord> {
  try {
    return await inWorkspaceTransaction(db, input.workspaceId, async (client) => {
      const result = await client.query<GscConnectionRow>(
        `insert into gsc_connections
           (id, workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id::text, workspace_id::text, label, access_token_encrypted, refresh_token_encrypted,
                   token_expires_at, scope, created_at, updated_at`,
        [
          input.id,
          input.workspaceId,
          normalizeLabel(input.label),
          input.accessTokenEncrypted,
          input.refreshTokenEncrypted,
          input.tokenExpiresAt,
          input.scope,
        ],
      );
      return toConnection(result.rows[0]!);
    });
  } catch (error) {
    mapConnectionError(error);
  }
}

export async function listGscConnections(
  db: SqlQueryable,
  input: { workspaceId: string },
): Promise<GscConnectionRecord[]> {
  return inWorkspaceTransaction(db, input.workspaceId, async (client) => {
    const result = await client.query<GscConnectionRow>(
      `select id::text, workspace_id::text, label, access_token_encrypted, refresh_token_encrypted,
              token_expires_at, scope, created_at, updated_at
         from gsc_connections
        where workspace_id = $1 and disconnected_at is null
        order by created_at asc, id asc`,
      [input.workspaceId],
    );
    return result.rows.map(toConnection);
  });
}

export async function getGscConnection(
  db: SqlQueryable,
  input: { workspaceId: string; connectionId: string },
): Promise<GscConnectionRecord | null> {
  return inWorkspaceTransaction(db, input.workspaceId, async (client) => {
    const result = await client.query<GscConnectionRow>(
      `select id::text, workspace_id::text, label, access_token_encrypted, refresh_token_encrypted,
              token_expires_at, scope, created_at, updated_at
         from gsc_connections
        where workspace_id = $1 and id = $2 and disconnected_at is null
        limit 1`,
      [input.workspaceId, input.connectionId],
    );
    return result.rows[0] ? toConnection(result.rows[0]) : null;
  });
}

export async function updateGscConnectionTokens(
  db: SqlQueryable,
  input: {
    workspaceId: string;
    connectionId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenExpiresAt: Date;
    scope: string;
  },
): Promise<GscConnectionRecord> {
  try {
    return await inWorkspaceTransaction(db, input.workspaceId, async (client) => {
      const result = await client.query<GscConnectionRow>(
        `update gsc_connections
            set access_token_encrypted = $3,
                refresh_token_encrypted = $4,
                token_expires_at = $5,
                scope = $6,
                updated_at = now()
          where workspace_id = $1 and id = $2 and disconnected_at is null
          returning id::text, workspace_id::text, label, access_token_encrypted, refresh_token_encrypted,
                    token_expires_at, scope, created_at, updated_at`,
        [
          input.workspaceId,
          input.connectionId,
          input.accessTokenEncrypted,
          input.refreshTokenEncrypted,
          input.tokenExpiresAt,
          input.scope,
        ],
      );
      if (!result.rows[0]) throw new GscStoreError("NOT_FOUND");
      return toConnection(result.rows[0]);
    });
  } catch (error) {
    if (error instanceof GscStoreError) throw error;
    mapConnectionError(error);
  }
}

export async function disconnectGscConnection(
  db: SqlQueryable,
  input: { workspaceId: string; connectionId: string },
): Promise<void> {
  await inWorkspaceTransaction(db, input.workspaceId, async (client) => {
    const result = await client.query<{ id: string }>(
      `update gsc_connections
          set disconnected_at = now(), updated_at = now()
        where workspace_id = $1 and id = $2 and disconnected_at is null
        returning id::text`,
      [input.workspaceId, input.connectionId],
    );
    if (!result.rows[0]) throw new GscStoreError("NOT_FOUND");
  });
}

export async function upsertGscPropertyBinding(
  db: SqlQueryable,
  input: {
    workspaceId: string;
    siteId: string;
    connectionId: string;
    propertyUri: string;
  },
): Promise<GscPropertyBindingRecord> {
  const propertyUri = normalizePropertyUri(input.propertyUri);
  return inWorkspaceTransaction(db, input.workspaceId, async (client) => {
    const site = await client.query<{ id: string }>(
      "select id::text from sites where workspace_id = $1 and id = $2 and active limit 1",
      [input.workspaceId, input.siteId],
    );
    const connection = await client.query<{ id: string }>(
      "select id::text from gsc_connections where workspace_id = $1 and id = $2 and disconnected_at is null limit 1",
      [input.workspaceId, input.connectionId],
    );
    if (!site.rows[0] || !connection.rows[0]) throw new GscStoreError("NOT_FOUND");

    const result = await client.query<GscBindingRow>(
      `insert into gsc_property_bindings (workspace_id, site_id, connection_id, property_uri)
       values ($1, $2, $3, $4)
       on conflict (workspace_id, site_id)
       do update set connection_id = excluded.connection_id, property_uri = excluded.property_uri
       returning id::text, workspace_id::text, site_id::text, connection_id::text, property_uri, created_at`,
      [input.workspaceId, input.siteId, input.connectionId, propertyUri],
    );
    return toBinding(result.rows[0]!);
  });
}
