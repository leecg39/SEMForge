// @TASK P5-L1-T1 - Fail-closed paid beta legal release manifest
// @SPEC docs/release/legal-launch-gate.md
// @TEST src/app/legal/release.test.ts
import { z } from "zod";

const PLACEHOLDER_PATTERN =
  /(?:<[^>]+>|\b(?:todo|tbd|placeholder|change-me)\b|미정|추후\s*확정|법률\s*검토\s*후|최종\s*문서가\s*아님|example\.(?:com|org|net))/iu;

const publishedText = (minimum = 2, maximum = 2_000) =>
  z.string().trim().min(minimum).max(maximum).refine(
    (value) => !PLACEHOLDER_PATTERN.test(value),
    "must be final published text, not a placeholder",
  );
const publishedEmail = z.string().trim().email().max(320).refine(
  (value) => !PLACEHOLDER_PATTERN.test(value),
  "must be a final operational email address",
);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "must use YYYY-MM-DD").refine(
  (value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
  },
  "must be a valid calendar date",
);

const retentionRuleSchema = z.object({
  category: publishedText(),
  period: publishedText(),
  basis: publishedText(),
}).strict();

const processorSchema = z.object({
  provider: publishedText(),
  purpose: publishedText(),
  retention: publishedText(),
}).strict();

const thirdPartyDisclosureSchema = z.object({
  recipient: publishedText(),
  purpose: publishedText(),
  items: publishedText(),
  retention: publishedText(),
}).strict();

const overseasTransferSchema = z.object({
  recipient: publishedText(),
  country: publishedText(),
  purpose: publishedText(),
  items: publishedText(),
  method: publishedText(),
  timing: publishedText(),
  retention: publishedText(),
}).strict();

const processingActivitySchema = z.object({
  category: publishedText(),
  requiredForService: z.boolean(),
  noticeMode: z.enum(["required_notice_acknowledgement", "separate_optional_consent"]),
  basisType: z.enum([
    "contract",
    "legal_obligation",
    "legitimate_interests",
    "consent",
    "other",
  ]),
  purpose: publishedText(10),
  items: publishedText(2),
  lawfulBasis: publishedText(10),
  retentionCategory: publishedText(),
  refusalOrServiceImpact: publishedText(10),
  withdrawalOrObjectionMethod: publishedText(10),
}).strict().superRefine((activity, context) => {
  if (activity.requiredForService && activity.noticeMode !== "required_notice_acknowledgement") {
    context.addIssue({
      code: "custom",
      path: ["noticeMode"],
      message: "service-required processing must be acknowledged as a notice, not bundled optional consent",
    });
  }
  if (!activity.requiredForService && activity.noticeMode === "separate_optional_consent" && activity.basisType !== "consent") {
    context.addIssue({
      code: "custom",
      path: ["basisType"],
      message: "separate optional consent must identify consent as its reviewed basis",
    });
  }
  if (activity.noticeMode === "separate_optional_consent" && activity.requiredForService) {
    context.addIssue({
      code: "custom",
      path: ["requiredForService"],
      message: "optional consent cannot be required for service",
    });
  }
});

const legalReleaseManifestSchema = z.object({
  schemaVersion: z.literal(2),
  release: z.object({
    status: z.literal("approved"),
    documentVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/u),
    approvedAt: z.string().datetime({ offset: true }),
    approvedBy: publishedText(),
    attestation: z.literal("paid-beta-legal-review-approved"),
  }).strict(),
  operator: z.object({
    businessName: publishedText(),
    representativeName: publishedText(),
    businessRegistrationNumber: z.string().regex(/^\d{3}-\d{2}-\d{5}$/u),
    mailOrderRegistration: z.object({
      number: publishedText(),
      authority: publishedText(),
    }).strict().nullable(),
    businessAddress: publishedText(8, 500),
    supportEmail: publishedEmail,
    supportPhone: z.string().trim().regex(/^[+0-9][0-9()+.\-\s]{6,30}$/u),
  }).strict(),
  privacy: z.object({
    effectiveDate: isoDate,
    officerName: publishedText(),
    contactEmail: publishedEmail,
    rightsRequestMethod: publishedText(10),
    deletionProcedure: publishedText(10),
    securityMeasures: publishedText(10),
    retentionRules: z.array(retentionRuleSchema).min(1).max(50),
    processingActivities: z.array(processingActivitySchema).min(1).max(50),
    processors: z.array(processorSchema).max(50),
    thirdPartyDisclosures: z.array(thirdPartyDisclosureSchema).max(50),
    overseasTransfers: z.array(overseasTransferSchema).max(50),
  }).strict().superRefine((privacy, context) => {
    const approvedRetentionCategories = new Set(
      privacy.retentionRules.map((rule) => rule.category),
    );
    privacy.processingActivities.forEach((activity, index) => {
      if (!approvedRetentionCategories.has(activity.retentionCategory)) {
        context.addIssue({
          code: "custom",
          path: ["processingActivities", index, "retentionCategory"],
          message: "must reference an approved privacy.retentionRules category",
        });
      }
    });
  }),
  terms: z.object({
    effectiveDate: isoDate,
    priceKrw: z.literal(49_000),
    vatIncluded: z.literal(true),
    billingPeriod: z.literal("monthly"),
    cancellationTiming: z.literal("end_of_current_period"),
    refundPolicy: publishedText(10),
    withdrawalPolicy: publishedText(10),
    disputeProcedure: publishedText(10),
  }).strict(),
}).strict();

export type LegalReleaseManifest = z.infer<typeof legalReleaseManifestSchema>;

export class LegalReleaseConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`법률 출시 게이트 검증 실패: ${issues.join(", ")}`);
    this.name = "LegalReleaseConfigurationError";
    this.issues = issues;
  }
}

export function parseLegalReleaseManifest(raw: string | undefined): LegalReleaseManifest {
  if (!raw?.trim()) {
    throw new LegalReleaseConfigurationError(["LEGAL_RELEASE_MANIFEST is required"]);
  }
  if (raw.length > 64 * 1024) {
    throw new LegalReleaseConfigurationError(["LEGAL_RELEASE_MANIFEST must be at most 64 KiB"]);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new LegalReleaseConfigurationError(["LEGAL_RELEASE_MANIFEST must be valid JSON"]);
  }

  const parsed = legalReleaseManifestSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new LegalReleaseConfigurationError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
        return `LEGAL_RELEASE_MANIFEST${path}: ${issue.message}`;
      }),
    );
  }
  return parsed.data;
}

export function readLegalReleaseManifest(
  source: Record<string, string | undefined> = process.env,
): LegalReleaseManifest | null {
  const raw = source.LEGAL_RELEASE_MANIFEST;
  return raw?.trim() ? parseLegalReleaseManifest(raw) : null;
}
