// @TASK P3-C2-T1 - Search Console token refresh and rotation broker
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/target-token.integration.test.ts
import type { SecretCrypto } from "@/lib/crypto";
import {
  GSC_SCOPE,
  type GscOAuthConfig,
  type GscTokenSet,
  refreshGscAccessToken,
} from "@/server/gsc/oauth";
import {
  GscStoreError,
  getGscConnection,
  updateGscConnectionTokens,
} from "@/server/gsc/store";
import {
  type GscSqlSource,
  withGscSqlClient,
} from "@/server/collectors/gsc/database";
import { GscCollectorAccessError } from "@/server/collectors/gsc/target";

const REFRESH_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface GscTokenBroker {
  getAccessToken(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<string>;
}

export interface GscTokenBrokerOptions {
  readonly db: GscSqlSource;
  readonly crypto: SecretCrypto;
  readonly oauthConfig: GscOAuthConfig;
  readonly now?: () => Date;
  readonly refreshAccessToken?: (
    refreshToken: string,
    config: GscOAuthConfig,
  ) => Promise<GscTokenSet>;
}

function tokenAad(
  workspaceId: string,
  connectionId: string,
  type: "access-token" | "refresh-token",
): string {
  return `workspace:${workspaceId}:gsc:${connectionId}:${type}`;
}

function decryptToken(
  crypto: SecretCrypto,
  encrypted: string,
  workspaceId: string,
  connectionId: string,
  type: "access-token" | "refresh-token",
): string {
  const token = crypto.decrypt(encrypted, tokenAad(workspaceId, connectionId, type));
  if (!token) throw new GscCollectorAccessError("TOKEN_DECRYPTION_FAILED");
  return token;
}

function readonlyScope(scope: string | undefined): string {
  const scopes = (scope ?? GSC_SCOPE).split(/\s+/u).filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== GSC_SCOPE) {
    throw new GscCollectorAccessError("INVALID_SCOPE");
  }
  return GSC_SCOPE;
}

function mapStoreError(error: unknown): never {
  if (error instanceof GscCollectorAccessError) throw error;
  if (error instanceof GscStoreError && error.code === "NOT_FOUND") {
    throw new GscCollectorAccessError("NOT_FOUND");
  }
  throw new GscCollectorAccessError("UPSTREAM");
}

export function createGscTokenBroker(options: GscTokenBrokerOptions): GscTokenBroker {
  const now = options.now ?? (() => new Date());
  const refresh = options.refreshAccessToken ?? refreshGscAccessToken;

  return {
    async getAccessToken(input) {
      return withGscSqlClient(options.db, async (db) => {
        const connection = await getGscConnection(db, input).catch(mapStoreError);
        if (!connection) throw new GscCollectorAccessError("NOT_FOUND");
        if (connection.workspaceId !== input.workspaceId) {
          throw new GscCollectorAccessError("FORBIDDEN");
        }

        readonlyScope(connection.scope);
        const expiresAt = Date.parse(connection.tokenExpiresAt);
        if (Number.isFinite(expiresAt) && expiresAt > now().getTime() + REFRESH_SKEW_MS) {
          return decryptToken(
            options.crypto,
            connection.accessTokenEncrypted,
            input.workspaceId,
            input.connectionId,
            "access-token",
          );
        }

        const refreshToken = decryptToken(
          options.crypto,
          connection.refreshTokenEncrypted,
          input.workspaceId,
          input.connectionId,
          "refresh-token",
        );
        let token: GscTokenSet;
        try {
          token = await refresh(refreshToken, options.oauthConfig);
        } catch (error) {
          if (error instanceof GscCollectorAccessError) throw error;
          throw new GscCollectorAccessError("UPSTREAM");
        }
        if (!token.accessToken) throw new GscCollectorAccessError("UPSTREAM");
        const scope = readonlyScope(token.scope);
        const nextRefreshToken = token.refreshToken || refreshToken;
        const refreshedAt = now();
        const tokenExpiresAt =
          token.expiryMs !== undefined && Number.isFinite(token.expiryMs)
            ? new Date(token.expiryMs)
            : new Date(refreshedAt.getTime() + DEFAULT_TOKEN_TTL_MS);

        try {
          await updateGscConnectionTokens(db, {
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
            tokenExpiresAt,
            scope,
          });
        } catch (error) {
          mapStoreError(error);
        }
        return token.accessToken;
      });
    },
  };
}
