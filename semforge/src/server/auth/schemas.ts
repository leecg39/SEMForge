// @TASK P2-A1-T1 - Authentication input validation
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import { z } from "zod";

export const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const createInviteInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(100),
  workspaceSlug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  email: normalizedEmailSchema,
  releaseTarget: z.enum(["sandbox", "staging", "paid-production"]).default("paid-production"),
}).strict();

export const opaqueTokenSchema = z
  .string()
  .min(32)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const credentialPasswordSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !/\p{C}/u.test(value), "비밀번호에 제어 문자를 사용할 수 없습니다.");

export const newPasswordSchema = credentialPasswordSchema
  .refine((value) => [...value].length >= 12, "비밀번호는 12자 이상이어야 합니다.")
  .refine((value) => /\p{L}/u.test(value), "비밀번호에 문자를 포함해야 합니다.")
  .refine((value) => /\p{N}/u.test(value), "비밀번호에 숫자를 포함해야 합니다.");

export const acceptInviteInputSchema = z.object({
  token: opaqueTokenSchema,
  email: normalizedEmailSchema,
  password: credentialPasswordSchema,
  displayName: z.string().trim().min(1).max(100).optional(),
  legalAccepted: z.boolean(),
  legalTermsVersion: z.string().trim().min(1).max(80),
  legalTermsSha256: z.string().trim().regex(/^[0-9a-f]{64}$/u),
  legalPrivacyVersion: z.string().trim().min(1).max(80),
  legalPrivacySha256: z.string().trim().regex(/^[0-9a-f]{64}$/u),
  legalPresentedAt: z.string().trim().datetime({ offset: true }),
  currentSessionToken: opaqueTokenSchema.optional(),
}).strict();

export const loginInputSchema = z.object({
  email: normalizedEmailSchema,
  password: credentialPasswordSchema,
  workspaceId: z.uuid().optional(),
  currentSessionToken: opaqueTokenSchema.optional(),
  throttleKey: z.string().trim().min(1).max(512).optional(),
}).strict();

export const requestPasswordResetInputSchema = z.object({
  email: normalizedEmailSchema,
  throttleKey: z.string().trim().min(1).max(512).optional(),
}).strict();

export const resetPasswordInputSchema = z.object({
  token: opaqueTokenSchema,
  password: credentialPasswordSchema,
}).strict();

export type CreateInviteInput = z.input<typeof createInviteInputSchema>;
export type AcceptInviteInput = z.input<typeof acceptInviteInputSchema>;
export type LoginInput = z.input<typeof loginInputSchema>;
export type RequestPasswordResetInput = z.input<typeof requestPasswordResetInputSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordInputSchema>;
