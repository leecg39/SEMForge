// @TASK P4-B1 - Tenant-bound Toss billing authorization bootstrap
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
// @TEST src/server/billing/http.contract.test.ts
import { createBillingHandlers } from "@/server/billing/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return createBillingHandlers().checkout(request);
}
