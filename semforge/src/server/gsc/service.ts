// @TASK P2-G1-T1 - Google Search Console OAuth/service orchestration
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/service.integration.test.ts
import { randomUUID } from "node:crypto";

import type { SecretCrypto } from "@/lib/crypto";
import {
  type GscOAuthConfig,
  type GscTokenSet,
  GSC_SCOPE,
  buildGscAuthorizationUrl,
  exchangeGscCode,
  hashOAuthState,
  newOAuthState,
  refreshGscAccessToken,
  safeGscReturnPath,
} from "@/server/gsc/oauth";
import {
  GscStoreError,
  type GscConnectionRecord,
  type GscPropertyBindingRecord,
  type SqlQueryable,
  consumeGscOAuthState,
  createGscConnection,
  disconnectGscConnection,
  getGscConnection,
  listGscConnections,
  saveGscOAuthState,
  updateGscConnectionTokens,
  upsertGscPropertyBinding,
} from "@/server/gsc/store";
import {
  createGoogleSearchConsoleClient,
  type GoogleSearchConsoleClient,
  type GscProperty,
} from "@/server/gsc/google-client";

const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export class GscServiceError extends Error {
  constructor(
    readonly code:
      | "INVALID_STATE"
      | "INVALID_SCOPE"
      | "MISSING_REFRESH_TOKEN"
      | "NOT_FOUND"
      | "DUPLICATE_LABEL"
      | "UPSTREAM"
      | "SECRET_DECRYPTION_FAILED",
    message: string = code,
  ) {
    super(message);
    this.name = "GscServiceError";
  }
}

export interface GscOAuthClient {
  exchangeCode(code: string): Promise<GscTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<GscTokenSet>;
}

export interface GscService {
  startConnection(input: {
    workspaceId: string;
    userId: string;
    label: string;
    returnPath?: string | null;
  }): Promise<{
    authorizationUrl: string;
    state: string;
    expiresAt: string;
  }>;
  completeCallback(input: {
    workspaceId: string;
    userId: string;
    code: string;
    state: string;
  }): Promise<{
    connection: GscConnectionRecord;
    returnPath: string;
  }>;
  listConnections(input: { workspaceId: string }): Promise<GscConnectionRecord[]>;
  refreshConnection(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<GscConnectionRecord>;
  listProperties(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<GscProperty[]>;
  bindProperty(input: {
    workspaceId: string;
    siteId: string;
    connectionId: string;
    propertyUri: string;
  }): Promise<GscPropertyBindingRecord>;
  disconnect(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<void>;
}

export interface GscServiceOptions {
  db: SqlQueryable;
  crypto: SecretCrypto;
  oauthConfig: GscOAuthConfig;
  oauthClient?: GscOAuthClient;
  searchConsoleClient?: GoogleSearchConsoleClient;
  now?: () => Date;
  idFactory?: () => string;
}

function tokenAad(workspaceId: string, connectionId: string, type: "access-token" | "refresh-token"): string {
  return `workspace:${workspaceId}:gsc:${connectionId}:${type}`;
}

function normalizeScope(scope: string | undefined): string {
  const scopes = (scope ?? GSC_SCOPE).split(/\s+/u).filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== GSC_SCOPE) {
    throw new GscServiceError("INVALID_SCOPE");
  }
  return GSC_SCOPE;
}

function tokenExpiresAt(token: GscTokenSet, now: Date): Date {
  if (token.expiryMs && Number.isFinite(token.expiryMs)) return new Date(token.expiryMs);
  return new Date(now.getTime() + DEFAULT_TOKEN_TTL_MS);
}

function mapStoreError(error: unknown): never {
  if (error instanceof GscStoreError) {
    if (error.code === "DUPLICATE_LABEL") throw new GscServiceError("DUPLICATE_LABEL");
    if (error.code === "NOT_FOUND") throw new GscServiceError("NOT_FOUND");
    if (error.code === "INVALID_SCOPE") throw new GscServiceError("INVALID_SCOPE");
  }
  throw error;
}

function decryptToken(
  crypto: SecretCrypto,
  stored: string,
  workspaceId: string,
  connectionId: string,
  type: "access-token" | "refresh-token",
): string {
  const value = crypto.decrypt(stored, tokenAad(workspaceId, connectionId, type));
  if (!value) throw new GscServiceError("SECRET_DECRYPTION_FAILED");
  return value;
}

export function createGscService(options: GscServiceOptions): GscService {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? randomUUID;
  const oauthClient =
    options.oauthClient ??
    {
      exchangeCode: (code: string) => exchangeGscCode(code, options.oauthConfig),
      refreshAccessToken: (refreshToken: string) =>
        refreshGscAccessToken(refreshToken, options.oauthConfig),
    };
  const searchConsoleClient =
    options.searchConsoleClient ?? createGoogleSearchConsoleClient();

  async function refreshIfNeeded(connection: GscConnectionRecord): Promise<GscConnectionRecord> {
    const expiresAt = Date.parse(connection.tokenExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt > now().getTime() + REFRESH_SKEW_MS) {
      return connection;
    }
    return service.refreshConnection({
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
    });
  }

  const service: GscService = {
    async startConnection(input) {
      const issuedAt = now();
      const state = newOAuthState();
      const expiresAt = new Date(issuedAt.getTime() + STATE_TTL_MS);
      const returnPath = safeGscReturnPath(input.returnPath);
      try {
        await saveGscOAuthState(options.db, {
          workspaceId: input.workspaceId,
          userId: input.userId,
          stateHash: hashOAuthState(state),
          connectionLabel: input.label,
          returnPath,
          expiresAt,
        });
      } catch (error) {
        mapStoreError(error);
      }
      return {
        state,
        expiresAt: expiresAt.toISOString(),
        authorizationUrl: buildGscAuthorizationUrl(options.oauthConfig, state),
      };
    },

    async completeCallback(input) {
      const state = await consumeGscOAuthState(options.db, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        stateHash: hashOAuthState(input.state),
        now: now(),
      });
      if (!state) throw new GscServiceError("INVALID_STATE");

      const token = await oauthClient.exchangeCode(input.code);
      const scope = normalizeScope(token.scope);
      if (!token.refreshToken) throw new GscServiceError("MISSING_REFRESH_TOKEN");

      const connectionId = idFactory();
      try {
        const connection = await createGscConnection(options.db, {
          id: connectionId,
          workspaceId: input.workspaceId,
          label: state.connectionLabel,
          accessTokenEncrypted: options.crypto.encrypt(
            token.accessToken,
            tokenAad(input.workspaceId, connectionId, "access-token"),
          ),
          refreshTokenEncrypted: options.crypto.encrypt(
            token.refreshToken,
            tokenAad(input.workspaceId, connectionId, "refresh-token"),
          ),
          tokenExpiresAt: tokenExpiresAt(token, now()),
          scope,
        });
        return { connection, returnPath: state.returnPath };
      } catch (error) {
        mapStoreError(error);
      }
    },

    listConnections(input) {
      return listGscConnections(options.db, input);
    },

    async refreshConnection(input) {
      const current = await getGscConnection(options.db, input);
      if (!current) throw new GscServiceError("NOT_FOUND");
      const refreshToken = decryptToken(
        options.crypto,
        current.refreshTokenEncrypted,
        input.workspaceId,
        input.connectionId,
        "refresh-token",
      );
      const token = await oauthClient.refreshAccessToken(refreshToken);
      const scope = normalizeScope(token.scope);
      const nextRefreshToken = token.refreshToken ?? refreshToken;
      try {
        return await updateGscConnectionTokens(options.db, {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          accessTokenEncrypted: options.crypto.encrypt(
            token.accessToken,
            tokenAad(input.workspaceId, input.connectionId, "access-token"),
          ),
          refreshTokenEncrypted: options.crypto.encrypt(
            nextRefreshToken,
            tokenAad(input.workspaceId, input.connectionId, "refresh-token"),
          ),
          tokenExpiresAt: tokenExpiresAt(token, now()),
          scope,
        });
      } catch (error) {
        mapStoreError(error);
      }
    },

    async listProperties(input) {
      const current = await getGscConnection(options.db, input);
      if (!current) throw new GscServiceError("NOT_FOUND");
      const connection = await refreshIfNeeded(current);
      const accessToken = decryptToken(
        options.crypto,
        connection.accessTokenEncrypted,
        input.workspaceId,
        input.connectionId,
        "access-token",
      );
      return searchConsoleClient.listSites(accessToken);
    },

    async bindProperty(input) {
      try {
        return await upsertGscPropertyBinding(options.db, input);
      } catch (error) {
        mapStoreError(error);
      }
    },

    async disconnect(input) {
      const current = await getGscConnection(options.db, input);
      if (!current) throw new GscServiceError("NOT_FOUND");
      const refreshToken = decryptToken(
        options.crypto,
        current.refreshTokenEncrypted,
        input.workspaceId,
        input.connectionId,
        "refresh-token",
      );
      await searchConsoleClient.revokeToken(refreshToken);
      try {
        await disconnectGscConnection(options.db, input);
      } catch (error) {
        mapStoreError(error);
      }
    },
  };

  return service;
}
