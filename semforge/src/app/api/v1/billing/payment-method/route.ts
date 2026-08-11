// @TASK P2-B1-T1 - Toss billing payment method replacement route
import { createBillingHandlers } from "@/server/billing/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return createBillingHandlers().authorize(request);
}
