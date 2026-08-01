import { after } from "next/server";
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  enqueueAdvertisingResearch,
  executeAdvertisingResearch,
  listAdvertisingResearchRuns,
} from "@/server/advertising/research";

const schema = z.object({
  domain: z.string().trim().min(3).max(253),
  folderId: z.string().trim().min(1).max(80).nullable().optional(),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  languageCode: z.string().trim().min(2).max(10).optional().default("ko"),
  device: z.enum(["desktop", "mobile"]).optional().default("desktop"),
  keywords: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listAdvertisingResearchRuns(auth));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, schema);
  const run = await enqueueAdvertisingResearch(auth, input);
  after(async () => {
    const completed = await executeAdvertisingResearch(auth, run.id);
    if (completed.status === "failed") {
      console.error(`[advertising] research run ${run.id} failed: ${completed.errorMessage}`);
    }
  });
  return jsonOk(run, {
    status: 202,
    meta: { execution: "background", poll: `/api/advertising/research-runs/${run.id}/` },
  });
});

