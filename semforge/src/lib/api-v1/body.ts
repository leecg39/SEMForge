// @TASK P2-A1-T1 - API v1 JSON 본문 검증
// @SPEC docs/planning/06-tasks.md#api-v1

import { type ZodType } from "zod";

import { ApiError } from "./error";

function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

export function zodErrorFields(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Readonly<Record<string, string>> {
  const fields = new Map<string, string>();
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "_root";
    if (!fields.has(path)) fields.set(path, issue.message);
  }
  return Object.fromEntries(fields);
}

export async function parseJsonBody<TOutput>(
  request: Request,
  schema: ZodType<TOutput>
): Promise<TOutput> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.");
  }

  const result = await schema.safeParseAsync(input);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", undefined, {
      fields: zodErrorFields(result.error),
    });
  }
  return result.data;
}
