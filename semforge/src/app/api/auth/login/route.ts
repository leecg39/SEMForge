import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { authEvents, memberships, users } from "@/db/schema";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { newId } from "@/lib/ids";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { emailSchema } from "@/lib/validators";

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력하세요."),
});

const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function meta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
  };
}

function recordEvent(
  eventType: (typeof authEvents.$inferInsert)["eventType"],
  email: string,
  userId: string | null,
  request: Request
) {
  const m = meta(request);
  db.insert(authEvents)
    .values({
      id: newId("aev"),
      userId,
      email,
      eventType,
      ip: m.ip,
      userAgent: m.userAgent,
      country: request.headers.get("x-vercel-ip-country"),
    })
    .run();
}

export const POST = route(async (request: Request) => {
  const { email, password } = await parseBody(request, loginSchema);

  // 같은 이메일에 대한 최근 실패 횟수로 무차별 대입을 제한한다 (P).
  const [{ failures }] = await db
    .select({ failures: sql<number>`count(*)` })
    .from(authEvents)
    .where(
      and(
        eq(authEvents.email, email),
        eq(authEvents.eventType, "login_failed"),
        gt(authEvents.occurredAt, new Date(Date.now() - WINDOW_MS))
      )
    );
  if (Number(failures) >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError(
      "RATE_LIMITED",
      "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요."
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  // 이메일 존재 여부를 노출하지 않도록 실패 메시지를 통일한다.
  const failMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (!user) {
    recordEvent("login_failed", email, null, request);
    throw new ApiError("UNAUTHENTICATED", failMessage);
  }
  const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!ok) {
    recordEvent("login_failed", email, user.id, request);
    throw new ApiError("UNAUTHENTICATED", failMessage);
  }

  const [membership] = await db
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), isNull(memberships.deletedAt)))
    .limit(1);

  await createSession(user.id, membership?.workspaceId ?? null, request);
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  recordEvent("login", email, user.id, request);

  return jsonOk({ id: user.id, email: user.email, name: user.name });
});
