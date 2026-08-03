import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { updateContentPackageSchema } from "@/server/content/contracts";
import { getContentPackage, updateContentPackage } from "@/server/content/packages";

type Context = { params: Promise<{ packageId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { packageId } = await context.params;
  return jsonOk(await getContentPackage(auth, packageId));
});

export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { packageId } = await context.params;
  const input = await parseBody(request, updateContentPackageSchema);
  return jsonOk(await updateContentPackage(auth, packageId, input));
});
