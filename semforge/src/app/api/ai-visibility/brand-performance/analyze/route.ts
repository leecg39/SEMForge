import { after } from "next/server";
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  generateBrandPerformanceAnalysis,
  prepareBrandPerformanceAnalysis,
} from "@/server/ai-visibility/brand-performance";

const schema = z.object({
  fid: z.string().trim().min(1).max(80),
  runId: z.string().trim().min(1).max(80),
  provider: z.enum(["google_aio", "chatgpt_web", "gemini_grounded"]),
  locationKey: z.string().trim().min(1).max(80),
  retry: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, schema);
  const prepared = await prepareBrandPerformanceAnalysis(auth, input);
  if (prepared.status === "pending") {
    after(async () => {
      try {
        await generateBrandPerformanceAnalysis(auth, prepared.reportId);
      } catch (error) {
        console.error(`[brand-performance] report ${prepared.reportId} failed`, error);
      }
    });
  }
  return jsonOk(prepared, { status: prepared.reused ? 200 : 202 });
});
