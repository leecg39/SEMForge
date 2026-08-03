import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { regenerateContentPackageSchema } from "@/server/content/contracts";
import { regenerateContentPackage } from "@/server/content/packages";

type Context = { params: Promise<{ packageId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { packageId } = await context.params;
  const input = await parseBody(request, regenerateContentPackageSchema);
  return jsonOk(await regenerateContentPackage(auth, packageId, input));
});
