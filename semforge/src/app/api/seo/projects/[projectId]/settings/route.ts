import { jsonOk, parseBody, route } from "@/lib/api";
import { seoProjectSettingsPatchSchema } from "@/lib/seo-project-settings";
import { requireAuth } from "@/lib/session";
import {
  getSeoProjectSettings,
  updateSeoProjectSettings,
} from "@/server/seo-projects/settings";

type Context = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { projectId } = await context.params;
  return jsonOk(await getSeoProjectSettings(auth, projectId));
});

export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { projectId } = await context.params;
  const patch = await parseBody(request, seoProjectSettingsPatchSchema);
  return jsonOk(await updateSeoProjectSettings(auth, projectId, patch));
});
