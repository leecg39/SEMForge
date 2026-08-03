import { z } from "zod";

/** 소셜 게시물 생성/수정 공용 요청 스키마 — route 파일은 Next export 규칙상 임의 export 를 가질 수 없어 분리한다. */
export const socialPostSchema = z.object({
  text: z.string().max(2200).optional().default(""),
  linkUrl: z.string().url().nullable().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  publishMode: z.enum(["draft", "now", "scheduled", "recurring"]),
  scheduledAt: z.string().datetime().nullable().optional(),
  recurrence: z
    .object({
      frequency: z.literal("weekly").optional(),
      weekday: z.number().int().min(0).max(6).optional(),
      time: z.string().optional(),
    })
    .optional(),
  recurrenceEndAt: z.string().datetime().nullable().optional(),
  profileIds: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).optional(),
  mediaAssetId: z.string().nullable().optional(),
  idempotencyKey: z.string().max(120).optional(),
});
