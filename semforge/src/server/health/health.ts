// @TASK P4-O1-T1 - Dependency-free liveness and safe PostgreSQL readiness
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST src/server/health/health.test.ts

export interface ReadinessDatabase {
  query(statement: string): Promise<{ rows: Array<{ ready?: unknown }> }>;
}

export interface ReadinessOptions {
  readonly timeoutMs?: number;
}

const HEALTH_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const;

function jsonHealthResponse(
  status: "ok" | "ready" | "not_ready",
  statusCode: 200 | 503,
): Response {
  return new Response(JSON.stringify({ status }), {
    status: statusCode,
    headers: HEALTH_HEADERS,
  });
}

export function createLivenessResponse(): Response {
  return jsonHealthResponse("ok", 200);
}

async function databaseIsReady(
  database: ReadinessDatabase,
  timeoutMs: number,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      database.query("select 1 as ready"),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("READINESS_TIMEOUT")), timeoutMs);
      }),
    ]);
    return result.rows[0]?.ready === 1;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function createReadinessResponse(
  database: ReadinessDatabase,
  options: ReadinessOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new TypeError("readiness timeout is invalid");
  }
  return (await databaseIsReady(database, timeoutMs))
    ? jsonHealthResponse("ready", 200)
    : jsonHealthResponse("not_ready", 503);
}
