import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  authEvents,
  memberships,
  notificationSettings,
  users,
  workspaces,
} from "@/db/schema";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { emailSchema, passwordSchema } from "@/lib/validators";

/**
 * 가입.
 * 가입자는 자신의 워크스페이스를 하나 갖고 그 소유자가 된다.
 * 원본의 가입 화면은 이메일/비밀번호 + 소셜이지만, 소셜 로그인은 구현 범위 밖이다.
 */

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(60, "60자 이하로 입력하세요."))
    .optional(),
});

function slugify(email: string): string {
  const base = email.split("@")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || "workspace";
}

export const POST = route(async (request: Request) => {
  const { email, password, name } = await parseBody(request, signupSchema);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (existing) {
    throw new ApiError("DUPLICATE", "이미 사용 중인 이메일입니다.", {
      fields: { email: "이미 사용 중인 이메일입니다." },
    });
  }

  const displayName = name || email.split("@")[0];
  const { hash, salt } = await hashPassword(password);

  // 슬러그가 겹치면 짧은 접미사를 붙인다.
  let slug = slugify(email);
  const [slugTaken] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (slugTaken) slug = `${slug}-${newId().slice(-4).toLowerCase()}`;

  const workspaceId = newId("wsp");
  const userId = newId("usr");

  await db.insert(workspaces).values({
    id: workspaceId,
    name: `${displayName}의 워크스페이스`,
    slug,
    plan: "free",
    createdBy: userId,
    updatedBy: userId,
  });
  await db.insert(users).values({
    id: userId,
    email,
    name: displayName,
    passwordHash: hash,
    passwordSalt: salt,
    lastLoginAt: new Date(),
  });
  await db.insert(memberships).values({
    id: newId("mem"),
    workspaceId,
    userId,
    role: "owner",
    createdBy: userId,
    updatedBy: userId,
  });
  for (const key of ["educational", "product_news", "upcoming_events"] as const) {
    await db.insert(notificationSettings).values({
      id: newId("nts"),
      userId,
      key,
      enabled: true,
    });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  db.insert(authEvents)
    .values({
      id: newId("aev"),
      userId,
      email,
      eventType: "registration",
      ip: forwarded ? forwarded.split(",")[0].trim() : null,
      userAgent: request.headers.get("user-agent"),
    })
    .run();

  await createSession(userId, workspaceId, request);

  return jsonOk({ id: userId, email, name: displayName }, { status: 201 });
});
