import { z } from "zod";
import {
  CONTENT_AI_PROFILES,
  DEFAULT_CONTENT_AI_PROFILE,
} from "@/lib/content-ai";
import type { ContentSeoSuggestion } from "@/lib/content-seo";

export const contentAiProfileSchema = z.enum(
  CONTENT_AI_PROFILES.map((profile) => profile.id) as [
    (typeof CONTENT_AI_PROFILES)[number]["id"],
    ...(typeof CONTENT_AI_PROFILES)[number]["id"][],
  ],
);

export const contentIntentSchema = z.enum(["create", "optimize", "repurpose", "brief"]);
export const contentBoardStatusSchema = z.enum(["active", "completed", "failed", "archived"]);
export const contentRunStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export const contentRunStageSchema = z.enum(["validate", "research", "generate", "analyze", "persist"]);

export const createContentBoardSchema = z.object({
  prompt: z.string().trim().min(3, "작성 요청을 3자 이상 입력해 주세요.").max(2_000),
  folderId: z.string().trim().min(1).optional().nullable(),
  intent: contentIntentSchema.optional().default("create"),
  aiProfile: contentAiProfileSchema.optional().default(DEFAULT_CONTENT_AI_PROFILE),
  sourceArticleId: z.string().trim().min(1).optional().nullable(),
});

export const updateContentBoardSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  status: contentBoardStatusSchema.optional(),
  version: z.number().int().positive(),
});

export const createContentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]).optional().default("user"),
  kind: z.enum(["text", "requirements"]).optional().default("text"),
  body: z.string().trim().min(1).max(4_000),
  payload: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const contentRunInputSchema = z.object({
  keyword: z.string().trim().min(1, "핵심 키워드를 입력해 주세요.").max(120),
  title: z.string().trim().max(150).optional().nullable(),
  audience: z.string().trim().min(1).max(240).default("주제에 관심 있는 일반 독자"),
  brandVoice: z.string().trim().min(1).max(240).default("명확하고 신뢰감 있는 전문가"),
  language: z.string().trim().min(2).max(20).default("ko"),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).default("KR"),
  targetWordCount: z.coerce.number().int().min(500).max(5_000).default(1_400),
  sourceUrl: z.string().trim().url().max(2_000).optional().nullable(),
  sourceArticleId: z.string().trim().min(1).optional().nullable(),
  aiProfile: contentAiProfileSchema.optional().default(DEFAULT_CONTENT_AI_PROFILE),
});

const contentOptimizeBaseSchema = contentRunInputSchema.omit({ sourceUrl: true });

export const contentOptimizeRunInputSchema = z.discriminatedUnion("sourceType", [
  contentOptimizeBaseSchema.extend({
    sourceType: z.literal("url"),
    sourceUrl: z.string().trim().url().max(2_000),
    sourceText: z.null().optional().default(null),
  }),
  contentOptimizeBaseSchema.extend({
    sourceType: z.literal("direct"),
    sourceUrl: z.null().optional().default(null),
    sourceText: z.string().trim().min(200, "최적화할 원문을 200자 이상 입력해 주세요.").max(200_000),
  }),
]);

export const contentRepurposeTargetSchema = z.enum(["summary", "newsletter", "social_thread"]);
const contentRepurposeBaseSchema = contentRunInputSchema.omit({ sourceUrl: true, sourceArticleId: true });

export const contentRepurposeRunInputSchema = z.discriminatedUnion("sourceType", [
  contentRepurposeBaseSchema.extend({
    sourceType: z.literal("article"),
    sourceArticleId: z.string().trim().min(1),
    sourceText: z.null().optional().default(null),
    targetFormat: contentRepurposeTargetSchema,
  }),
  contentRepurposeBaseSchema.extend({
    sourceType: z.literal("direct"),
    sourceArticleId: z.null().optional().default(null),
    sourceText: z.string().trim().min(200, "재활용할 원문을 200자 이상 입력해 주세요.").max(200_000),
    targetFormat: contentRepurposeTargetSchema,
  }),
]);

export const createContentRunSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  input: z.union([contentOptimizeRunInputSchema, contentRepurposeRunInputSchema, contentRunInputSchema]),
});

export const generatedArticleSchema = z.object({
  title: z.string().trim().min(1).max(150),
  metaDescription: z.string().trim().min(1).max(320),
  markdown: z.string().trim().min(200).max(200_000),
});

export const contentVisualStyleSchema = z.enum([
  "editorial_photo",
  "illustration",
  "minimal_3d",
  "abstract_graphic",
]);

export const contentImageTitlePositionSchema = z.enum(["top_left", "bottom_left"]);

const hexColorSchema = z.string().trim().regex(/^#[0-9a-f]{6}$/iu, "#RRGGBB 형식으로 입력해 주세요.");

export const updateContentBrandKitSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  version: z.number().int().positive().optional().nullable(),
});

export const createContentVisualSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  stylePreset: contentVisualStyleSchema,
  displayTitle: z.string().trim().min(1).max(80),
  showTitle: z.boolean().default(true),
  showLogo: z.boolean().default(true),
  visualDirection: z.string().trim().max(500).optional().nullable(),
  focalX: z.number().int().min(0).max(100).default(50),
  focalY: z.number().int().min(0).max(100).default(50),
});

export const updateContentVisualSchema = z.object({
  displayTitle: z.string().trim().min(1).max(80).optional(),
  showTitle: z.boolean().optional(),
  showLogo: z.boolean().optional(),
  visualDirection: z.string().trim().max(500).optional().nullable(),
  focalX: z.number().int().min(0).max(100).optional(),
  focalY: z.number().int().min(0).max(100).optional(),
  version: z.number().int().positive(),
});

export const contentVisualSpecificationSchema = z.object({
  concept: z.string().trim().min(1).max(280),
  subject: z.string().trim().min(1).max(80),
  palette: z.array(hexColorSchema).min(3).max(5),
  mood: z.string().trim().min(1).max(80),
  altText: z.string().trim().min(1).max(240),
  seed: z.number().int().min(0).max(2_147_483_647),
});

export const contentProductionKindSchema = z.enum(["image", "video"]);
export const contentProductionStatusSchema = z.enum([
  "draft",
  "planning",
  "awaiting_storyboard_approval",
  "generating_keyframes",
  "awaiting_keyframe_approval",
  "generating",
  "assembling",
  "ready",
  "failed",
  "cancelled",
  "archived",
]);
export const contentAspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
export const contentImagePresetSchema = z.enum(["hero", "square", "portrait", "story"]);

const productionBaseSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  folderId: z.string().trim().min(1).optional().nullable(),
  sourceArticleId: z.string().trim().min(1).optional().nullable(),
  sourceProductionId: z.string().trim().min(1).optional().nullable(),
  sourceAssetId: z.string().trim().min(1).optional().nullable(),
  sourceAssetSha256: z.string().trim().regex(/^[0-9a-f]{64}$/u).optional().nullable(),
  title: z.string().trim().min(1).max(150),
  prompt: z.string().trim().min(3).max(4_000),
});

export const createContentProductionSchema = z.discriminatedUnion("kind", [
  productionBaseSchema.extend({
    kind: z.literal("image"),
    settings: z.object({
      preset: contentImagePresetSchema.default("hero"),
      stylePreset: contentVisualStyleSchema.default("editorial_photo"),
      displayTitle: z.string().trim().min(1).max(80),
      showTitle: z.boolean().default(true),
      titlePosition: contentImageTitlePositionSchema.default("bottom_left"),
      showLogo: z.boolean().default(true),
      focalX: z.number().int().min(0).max(100).default(50),
      focalY: z.number().int().min(0).max(100).default(50),
    }),
  }),
  productionBaseSchema.extend({
    kind: z.literal("video"),
    settings: z.object({
      targetDuration: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(45),
      aspectRatio: contentAspectRatioSchema.default("16:9"),
      stylePreset: contentVisualStyleSchema.default("editorial_photo"),
      nativeAudio: z.literal(true).default(true),
    }),
  }),
]);

export const updateContentProductionSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  prompt: z.string().trim().min(3).max(4_000).optional(),
  status: z.enum(["archived"]).optional(),
  version: z.number().int().positive(),
});

export const approveContentProductionSchema = z.object({
  gate: z.enum(["storyboard", "keyframes"]),
  version: z.number().int().positive(),
});

export const updateContentVideoSceneSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  duration: z.number().int().min(3).max(15).optional(),
  prompt: z.string().trim().min(3).max(2_500).optional(),
  audioPrompt: z.string().trim().min(1).max(1_000).optional(),
  transition: z.enum(["cut", "crossfade"]).optional(),
  version: z.number().int().positive(),
});

export const contentStoryboardSchema = z.object({
  summary: z.string().trim().min(1).max(1_000),
  visualBible: z.object({
    subject: z.string().trim().min(1).max(240),
    palette: z.array(hexColorSchema).min(3).max(5),
    style: z.string().trim().min(1).max(240),
    continuityRules: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  }),
  scenes: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    duration: z.number().int().min(3).max(15),
    prompt: z.string().trim().min(3).max(2_500),
    audioPrompt: z.string().trim().min(1).max(1_000),
    transition: z.enum(["cut", "crossfade"]).default("crossfade"),
  })).min(4).max(10),
});

export const contentPackageTargetStageSchema = z.enum(["article", "image", "video"]);
export const contentPackageStatusSchema = z.enum(["active", "awaiting_approval", "completed", "failed", "cancelled", "archived"]);

export const contentPackageImageSettingsSchema = z.object({
  preset: contentImagePresetSchema.default("hero"),
  stylePreset: contentVisualStyleSchema.default("editorial_photo"),
  displayTitle: z.string().trim().min(1).max(80).optional(),
  showTitle: z.boolean().default(true),
  titlePosition: contentImageTitlePositionSchema.default("bottom_left"),
  showLogo: z.boolean().default(true),
  focalX: z.number().int().min(0).max(100).default(50),
  focalY: z.number().int().min(0).max(100).default(50),
}).default({
  preset: "hero",
  stylePreset: "editorial_photo",
  showTitle: true,
  titlePosition: "bottom_left",
  showLogo: true,
  focalX: 50,
  focalY: 50,
});

export const contentPackageVideoSettingsSchema = z.object({
  targetDuration: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(45),
  aspectRatio: contentAspectRatioSchema.default("16:9"),
  stylePreset: contentVisualStyleSchema.default("editorial_photo"),
  nativeAudio: z.literal(true).default(true),
}).default({
  targetDuration: 45,
  aspectRatio: "16:9",
  stylePreset: "editorial_photo",
  nativeAudio: true,
});

const contentPackageBaseSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  folderId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(150),
  brief: z.string().trim().min(3).max(4_000),
  targetStage: contentPackageTargetStageSchema,
  imageSettings: contentPackageImageSettingsSchema,
  videoSettings: contentPackageVideoSettingsSchema,
});

export const createContentPackageSchema = z.discriminatedUnion("startMode", [
  contentPackageBaseSchema.extend({
    startMode: z.literal("new_article"),
    articleSettings: contentRunInputSchema,
  }),
  contentPackageBaseSchema.extend({
    startMode: z.literal("existing_article"),
    sourceArticleId: z.string().trim().min(1),
  }),
]);

export const updateContentPackageSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  status: z.literal("archived").optional(),
  version: z.number().int().positive(),
});

export const approveContentPackageSchema = z.object({
  gate: z.enum(["article", "image"]),
  itemId: z.string().trim().min(1),
  itemVersion: z.number().int().positive(),
  packageVersion: z.number().int().positive(),
  nextSettings: z.object({
    image: contentPackageImageSettingsSchema.optional(),
    video: contentPackageVideoSettingsSchema.optional(),
  }).optional(),
});

export const regenerateContentPackageSchema = z.object({
  kind: z.enum(["article", "image", "video"]),
  fromLatestSource: z.literal(true),
  packageVersion: z.number().int().positive(),
  nextSettings: z.object({
    image: contentPackageImageSettingsSchema.optional(),
  }).optional(),
});

export const cancelContentPackageSchema = z.object({
  version: z.number().int().positive(),
});

export type ContentIntent = z.infer<typeof contentIntentSchema>;
export type ContentAiProfile = z.infer<typeof contentAiProfileSchema>;
export type ContentRunInput = z.infer<typeof contentRunInputSchema>;
export type ContentOptimizeRunInput = z.infer<typeof contentOptimizeRunInputSchema>;
export type ContentRepurposeRunInput = z.infer<typeof contentRepurposeRunInputSchema>;
export type ContentRepurposeTarget = z.infer<typeof contentRepurposeTargetSchema>;
export type ContentWorkflowRunInput = ContentRunInput | ContentOptimizeRunInput | ContentRepurposeRunInput;
export type GeneratedArticle = z.infer<typeof generatedArticleSchema>;
export type ContentVisualStyle = z.infer<typeof contentVisualStyleSchema>;
export type ContentVisualSpecification = z.infer<typeof contentVisualSpecificationSchema>;
export type CreateContentProduction = z.infer<typeof createContentProductionSchema>;
export type ContentProductionKind = z.infer<typeof contentProductionKindSchema>;
export type ContentProductionStatus = z.infer<typeof contentProductionStatusSchema>;
export type ContentAspectRatio = z.infer<typeof contentAspectRatioSchema>;
export type ContentImagePreset = z.infer<typeof contentImagePresetSchema>;
export type ContentStoryboard = z.infer<typeof contentStoryboardSchema>;
export type CreateContentPackage = z.infer<typeof createContentPackageSchema>;
export type ContentPackageTargetStage = z.infer<typeof contentPackageTargetStageSchema>;
export type ContentPackageStatus = z.infer<typeof contentPackageStatusSchema>;

export interface ContentResearchSnapshot {
  provider: "talordata";
  keyword: string;
  countryCode: string;
  capturedAt: string;
  fromCache: boolean;
  volume: number;
  intent: string | null;
  features: string[];
  results: Array<{
    position: number;
    title: string;
    description: string;
    link: string;
  }>;
}

export interface ContentSeoAnalysis {
  model: "semforge-content-v1";
  score: number | null;
  unavailableReason: string | null;
  wordCount: number;
  suggestions: ContentSeoSuggestion[];
  breakdown: {
    serpCoverage: number;
    structure: number;
    keywordPlacement: number;
    readability: number;
    metadataAndLength: number;
  } | null;
}
