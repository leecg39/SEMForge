import { ApiError, jsonOk, parseFormData, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { saveSocialImage } from "@/server/social/media";
import { ensureSocialProject } from "@/server/social/projects";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const project = await ensureSocialProject(auth, socialFid(request));
  const form = await parseFormData(request);
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ApiError(
      "VALIDATION_ERROR",
      "JPEG 또는 PNG 이미지 파일이 필요합니다.",
    );
  if (!new Set(["image/jpeg", "image/png"]).has(file.type))
    throw new ApiError(
      "VALIDATION_ERROR",
      "JPEG 또는 PNG 이미지만 업로드할 수 있습니다.",
    );
  const asset = await saveSocialImage(auth, {
    projectId: project.id,
    bytes: Buffer.from(await file.arrayBuffer()),
    altText: String(form.get("altText") ?? ""),
  });
  return jsonOk(
    {
      id: asset.id,
      url: `/api/social/media/${encodeURIComponent(asset.id)}/`,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
    },
    { status: 201 },
  );
});
