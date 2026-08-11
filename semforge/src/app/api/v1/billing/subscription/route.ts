// @TASK P2-B1-T1 - Billing subscription summary route
import { createBillingHandlers } from "@/server/billing/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return createBillingHandlers().summary(request);
}
