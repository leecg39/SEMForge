import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { jsonOk, parseBody, route } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/session";

/**
 * 프로필 설정.
 * 원본 `/accounts/profile/account-info` 의 필드 구성(성명·전화번호·회사·국가·시간대)과
 * 읽기 전용 표시(이메일·ID·회원가입 날짜), 명시적 저장 버튼 동작을 따른다. (증거 O)
 */

const patchSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "성명을 입력하세요.").max(60, "60자 이하로 입력하세요.")),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      version: users.version,
    })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  return jsonOk({
    ...user,
    // 원본에서 국가/시간대는 드롭다운이지만 값 저장 여부를 확인하지 못했다(U). 표시값만 고정한다.
    country: "대한민국",
    timezone: "Asia/Seoul",
    role: auth.role,
    workspace: auth.workspaceName,
  });
});

export const PATCH = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const { name } = await parseBody(request, patchSchema);

  const [before] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  await db
    .update(users)
    .set({ name, updatedAt: new Date(), updatedBy: auth.userId })
    .where(eq(users.id, auth.userId));

  writeAudit(auth, {
    action: "update",
    entityType: "users",
    entityId: auth.userId,
    entityLabel: auth.email,
    before,
    after: { name },
  });

  return jsonOk({ name });
});
