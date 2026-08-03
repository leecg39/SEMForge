import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createContentPackageSchema } from "@/server/content/contracts";
import { createContentPackage, listContentPackages } from "@/server/content/packages";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listContentPackages(auth, request));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createContentPackageSchema);
  return jsonOk(await createContentPackage(auth, input), { status: 201 });
});
