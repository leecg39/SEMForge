import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { cancelContentPackageSchema } from "@/server/content/contracts";
import { cancelContentPackage } from "@/server/content/packages";

type Context = { params: Promise<{ packageId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { packageId } = await context.params;
  const input = await parseBody(request, cancelContentPackageSchema);
  return jsonOk(await cancelContentPackage(auth, packageId, input));
});
