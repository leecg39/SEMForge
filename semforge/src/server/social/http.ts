import { ApiError } from "@/lib/api";

export function socialFid(request: Request) {
  const value = new URL(request.url).searchParams.get("fid")?.trim();
  if (!value)
    throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  return value;
}
