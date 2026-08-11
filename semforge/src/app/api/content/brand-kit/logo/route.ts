import { ApiError, jsonOk, parseFormData, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  deleteContentBrandLogo,
  getContentBrandLogoFile,
  uploadContentBrandLogo,
} from "@/server/content/visuals";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const file = await getContentBrandLogoFile(auth);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const form = await parseFormData(request);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError("VALIDATION_ERROR", "업로드할 로고 파일을 선택해 주세요.");
  }
  return jsonOk(await uploadContentBrandLogo(auth, Buffer.from(await file.arrayBuffer())));
});

export const DELETE = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await deleteContentBrandLogo(auth));
});

