import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { marketingProvider } from "@/server/marketing/http";
import { beginMarketingConnection } from "@/server/marketing/provisioning";

const inputSchema = z.object({
  fid: z.string().trim().min(1).max(100),
  provider: z.string().trim(),
  externalPropertyId: z.string().trim().min(1).max(300),
  returnTo: z.string().trim().max(500).optional(),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, inputSchema);
  return jsonOk(await beginMarketingConnection(auth, {
    folderId: input.fid, provider: marketingProvider(input.provider),
    externalPropertyId: input.externalPropertyId, returnTo: input.returnTo,
  }));
});
