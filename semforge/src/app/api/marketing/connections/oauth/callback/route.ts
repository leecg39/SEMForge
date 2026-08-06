import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requiredParam } from "@/server/marketing/http";
import { finishMarketingConnection } from "@/server/marketing/provisioning";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const completed = await finishMarketingConnection(auth, {
    state: requiredParam(request, "state"),
    secretId: requiredParam(request, "secret_id"),
    localConnectionId: requiredParam(request, "connection"),
    externalPropertyId: requiredParam(request, "property"),
  });
  const destination = new URL(completed.returnTo, request.url);
  destination.searchParams.set("marketingConnected", completed.connectionId);
  return NextResponse.redirect(destination);
});
