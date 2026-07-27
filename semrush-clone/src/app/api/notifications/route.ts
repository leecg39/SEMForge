import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { notificationSettings } from "@/db/schema";
import { jsonOk, parseBody, route } from "@/lib/api";
import { newId } from "@/lib/ids";
import { requireAuth } from "@/lib/session";

/**
 * 알림 설정.
 * 원본 `/accounts/notifications/` 는 저장 버튼 없이 토글 즉시 반영된다(증거 O → 규칙 즉시 저장).
 * 항목 3개(교육 콘텐츠 / 제품 소식 및 업데이트 / 예정된 이벤트)도 원본과 동일하다.
 */

const KEYS = ["educational", "product_news", "upcoming_events"] as const;

export const LABELS: Record<(typeof KEYS)[number], string> = {
  educational: "교육 콘텐츠",
  product_news: "제품 소식 및 업데이트",
  upcoming_events: "예정된 이벤트",
};

const patchSchema = z.object({
  key: z.enum(KEYS),
  enabled: z.boolean(),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const rows = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, auth.userId));

  const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
  const data = KEYS.map((key) => ({
    key,
    label: LABELS[key],
    enabled: byKey.get(key) ?? true,
  }));
  const activeCount = data.filter((d) => d.enabled).length;

  return jsonOk(data, {
    meta: { group: "일반", summary: `${activeCount}/${data.length} 활성` },
  });
});

export const PATCH = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const { key, enabled } = await parseBody(request, patchSchema);

  const [existing] = await db
    .select({ id: notificationSettings.id })
    .from(notificationSettings)
    .where(
      and(
        eq(notificationSettings.userId, auth.userId),
        eq(notificationSettings.key, key)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(notificationSettings)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(notificationSettings.id, existing.id));
  } else {
    await db.insert(notificationSettings).values({
      id: newId("nts"),
      userId: auth.userId,
      key,
      enabled,
    });
  }

  return jsonOk({ key, enabled });
});
