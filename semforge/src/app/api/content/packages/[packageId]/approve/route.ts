import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { approveContentPackageSchema } from "@/server/content/contracts";
import { approveContentPackage } from "@/server/content/packages";

type Context = { params: Promise<{ packageId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { packageId } = await context.params;
  const input = await parseBody(request, approveContentPackageSchema);
  return jsonOk(await approveContentPackage(auth, packageId, input));
});
