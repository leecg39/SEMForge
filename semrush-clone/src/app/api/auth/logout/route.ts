import { db } from "@/db/client";
import { authEvents } from "@/db/schema";
import { jsonOk, route } from "@/lib/api";
import { newId } from "@/lib/ids";
import { destroySession, getAuth } from "@/lib/session";

export const POST = route(async (request: Request) => {
  const auth = await getAuth(request);
  if (auth) {
    db.insert(authEvents)
      .values({
        id: newId("aev"),
        userId: auth.userId,
        email: auth.email,
        eventType: "logout",
        ip: auth.ip,
        userAgent: auth.userAgent,
      })
      .run();
  }
  await destroySession();
  return jsonOk({ ok: true });
});
