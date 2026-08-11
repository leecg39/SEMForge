// @TASK P4-O1-T1 - Structured JSON logging with correlation and redaction
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST src/server/observability/logger.test.ts

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext extends Readonly<Record<string, unknown>> {
  readonly requestId?: string | null;
  readonly workspaceId?: string | null;
  readonly jobId?: string | null;
  readonly provider?: string | null;
}

export interface JsonLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface JsonLoggerOptions {
  readonly service?: string;
  readonly now?: () => Date;
  readonly write?: (line: string) => void;
}

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(?:^|[_-])(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|billing[_-]?key|fingerprint|email|phone|telephone|address|(?:customer|user|full|first|last|legal)[_-]?name)(?:$|[_-])/iu;

function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, `Bearer ${REDACTED}`)
    .replace(
      /\b(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/giu,
      `$1${REDACTED}@`,
    )
    .replace(
      /\b(token|api[_-]?key|billing[_-]?key|password|secret)=([^&\s]+)/giu,
      `$1=${REDACTED}`,
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, REDACTED)
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/gu, REDACTED);
}

function shouldRedactKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLocaleLowerCase("en-US");
  return SENSITIVE_KEY.test(`_${normalized}_`);
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactText(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen, depth + 1));
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = shouldRedactKey(key)
      ? REDACTED
      : sanitizeValue(child, seen, depth + 1);
  }
  return result;
}

function safeCorrelationValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? redactText(value.trim()) : null;
}

export function createJsonLogger(options: JsonLoggerOptions = {}): JsonLogger {
  const now = options.now ?? (() => new Date());
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const service = options.service?.trim() || process.env.SEMFORGE_SERVICE?.trim() || "web";

  const log = (level: LogLevel, message: string, context: LogContext = {}): void => {
    const {
      requestId,
      workspaceId,
      jobId,
      provider,
      ...details
    } = context;
    const sanitizedDetails = sanitizeValue(details, new WeakSet<object>(), 0) as Record<
      string,
      unknown
    >;
    write(JSON.stringify({
      timestamp: now().toISOString(),
      level,
      service,
      message: redactText(message),
      requestId: safeCorrelationValue(requestId),
      workspaceId: safeCorrelationValue(workspaceId),
      jobId: safeCorrelationValue(jobId),
      provider: safeCorrelationValue(provider),
      ...sanitizedDetails,
    }));
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context),
  };
}
