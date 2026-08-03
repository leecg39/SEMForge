export type ContentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ContentRunStage = "validate" | "research" | "generate" | "analyze" | "persist";

export interface ContentRunView {
  id: string;
  boardId: string;
  articleId: string | null;
  intent: "create" | "optimize" | "repurpose" | "brief";
  status: ContentRunStatus;
  stage: ContentRunStage;
  processing: boolean;
  input: Record<string, unknown>;
  provenance: Record<string, unknown>;
  output: Record<string, unknown>;
  error: { code?: string; message?: string; stage?: ContentRunStage; retryable?: boolean };
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentArticleView {
  id: string;
  workspaceId: string;
  folderId: string | null;
  boardId: string | null;
  title: string;
  mode: "create" | "optimize" | "repurpose" | "brief";
  status: "draft" | "in_review" | "published";
  keyword: string | null;
  sourceUrl: string | null;
  metaDescription: string | null;
  bodyFormat: "markdown";
  wordCount: number;
  seoScore: number | null;
  body: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ContentVisualStyle =
  | "editorial_photo"
  | "illustration"
  | "minimal_3d"
  | "abstract_graphic";

export interface ContentBrandKitView {
  id: string | null;
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  version: number | null;
  canManage: boolean;
}

export interface ContentAssetView {
  id: string;
  kind: "source" | "thumbnail" | "open_graph";
  url: string;
  downloadUrl: string;
  mimeType: "image/webp" | "image/jpeg" | "image/png" | "image/svg+xml";
  width: number;
  height: number;
  byteSize: number;
  altText: string | null;
}

export interface ContentVisualView {
  id: string;
  articleId: string;
  sourceVisualId: string | null;
  articleVersion: number;
  stylePreset: ContentVisualStyle;
  displayTitle: string;
  showTitle: boolean;
  showLogo: boolean;
  visualDirection: string | null;
  focalX: number;
  focalY: number;
  status: "queued" | "running" | "ready" | "failed" | "cancelled";
  stage: "validate" | "generate" | "render";
  specification: {
    concept?: string;
    subject?: string;
    palette?: string[];
    mood?: string;
    altText?: string;
    seed?: number;
  };
  provenance: Record<string, unknown>;
  error: { code?: string; message?: string; stage?: string; retryable?: boolean };
  activeAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  assets: ContentAssetView[];
}

export interface ContentCapabilitiesView {
  articleCreation: { enabled: boolean; reason: string | null };
  visualCreation: { enabled: boolean; reason: string | null; model: string };
  imageCreation: { enabled: boolean; reason: string | null; model: string; renderer: string };
  videoCreation: {
    enabled: boolean;
    reason: string | null;
    plannerModel: string;
    rendererModel: string;
    ffmpeg: boolean;
  };
  talorData: { enabled: boolean; reason: string | null };
  contentModels: Array<{
    id: ContentAiProfileId;
    provider: ContentAiProvider;
    providerLabel: string;
    model: string;
    label: string;
    reasoningEffort: string | null;
    enabled: boolean;
    reason: string | null;
  }>;
  chatMock: { enabled: boolean; reason: string | null; model: string };
}

export type ContentProductionKind = "image" | "video";
export type ContentProductionStatus =
  | "draft"
  | "planning"
  | "awaiting_storyboard_approval"
  | "generating_keyframes"
  | "awaiting_keyframe_approval"
  | "generating"
  | "assembling"
  | "ready"
  | "failed"
  | "cancelled"
  | "archived";

export interface ContentProductionAssetView {
  id: string;
  kind: "image_source" | "image_result" | "thumbnail" | "open_graph" | "keyframe" | "scene_video" | "final_video" | "poster";
  url: string;
  downloadUrl: string;
  mimeType: "image/webp" | "image/jpeg" | "image/png" | "image/svg+xml" | "video/mp4";
  width: number;
  height: number;
  byteSize: number;
  durationMs: number | null;
  fps: number | null;
  hasAudio: boolean | null;
  altText: string | null;
  sceneId: string | null;
}

export interface ContentVideoSceneView {
  id: string;
  ordinal: number;
  title: string;
  duration: number;
  prompt: string;
  audioPrompt: string;
  transition: "cut" | "crossfade";
  status: "draft" | "queued" | "submitting" | "processing" | "ready" | "failed" | "unknown" | "cancelled";
  providerTaskId: string | null;
  error: { code?: string; message?: string; retryable?: boolean };
  version: number;
  keyframe: ContentProductionAssetView | null;
  video: ContentProductionAssetView | null;
}

export interface ContentVideoStoryboardView {
  id: string;
  revision: number;
  status: "draft" | "approved" | "superseded";
  totalDuration: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  stylePreset: ContentVisualStyle;
  summary: string;
  visualBible: {
    subject?: string;
    palette?: string[];
    style?: string;
    continuityRules?: string[];
  };
  approvedAt: string | null;
  scenes: ContentVideoSceneView[];
}

export interface ContentProductionView {
  id: string;
  kind: ContentProductionKind;
  folderId: string | null;
  folderName: string | null;
  articleId: string | null;
  articleVersion: number | null;
  articleCurrentVersion: number | null;
  sourceProductionId: string | null;
  sourceAssetId: string | null;
  sourceAssetSha256: string | null;
  stale: boolean;
  title: string;
  prompt: string;
  status: ContentProductionStatus;
  stage: "validate" | "plan" | "generate" | "render" | "keyframes" | "submit_scenes" | "poll_scenes" | "assemble" | "persist";
  settings: Record<string, unknown> & Partial<ContentPackageImageSettings>;
  result: Record<string, unknown>;
  provenance: Record<string, unknown>;
  error: { code?: string; message?: string; stage?: string; retryable?: boolean };
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  assets: ContentProductionAssetView[];
  storyboard: ContentVideoStoryboardView | null;
}

export interface ContentWorkspaceItem {
  id: string;
  kind: "package" | "article" | ContentProductionKind;
  title: string;
  folderName: string | null;
  status: string;
  stage: string;
  href: string;
  updatedAt: string;
  packageId?: string | null;
  packageTitle?: string | null;
  group?: "package" | "item";
  children?: ContentWorkspaceItem[];
}

export interface ContentLibraryItem {
  id: string;
  kind: "article" | ContentProductionKind;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  thumbnailUrl: string | null;
  updatedAt: string;
  packageId: string | null;
  packageTitle: string | null;
  group: "item";
}

export type ContentPackageTargetStage = "article" | "image" | "video";
export type ContentPackageStatus = "active" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "archived";
export type ContentPackageStep = "article" | "article_review" | "image" | "image_review" | "video" | "complete";
export type ContentImageTitlePosition = "top_left" | "bottom_left";

export interface ContentPackageImageSettings {
  preset: "hero" | "square" | "portrait" | "story";
  stylePreset: ContentVisualStyle;
  displayTitle?: string;
  showTitle: boolean;
  titlePosition: ContentImageTitlePosition;
  showLogo: boolean;
  focalX: number;
  focalY: number;
}

export interface ContentPackageItemView {
  id: string;
  kind: "article" | "image" | "video";
  revision: number;
  parentItemId: string | null;
  sourceVersion: number | null;
  status: "active" | "superseded" | "failed";
  version: number;
  stale: boolean;
  board: ContentBoardView | null;
  article: ContentArticleView | null;
  production: ContentProductionView | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPackageView {
  id: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  brief: string;
  startMode: "new_article" | "existing_article";
  targetStage: ContentPackageTargetStage;
  currentStep: ContentPackageStep;
  status: ContentPackageStatus;
  settings: {
    article?: Record<string, unknown>;
    image: ContentPackageImageSettings;
    video: Record<string, unknown>;
  };
  error: { code?: string; message?: string; step?: string };
  version: number;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ContentPackageItemView[];
  activeItems: {
    article: ContentPackageItemView | null;
    image: ContentPackageItemView | null;
    video: ContentPackageItemView | null;
  };
}

export interface ContentBoardView {
  id: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  intent: "create" | "optimize" | "repurpose" | "brief";
  status: "active" | "completed" | "failed" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    kind: "text" | "requirements" | "progress" | "artifact" | "error";
    body: string;
    payload: unknown;
    createdAt: string;
  }>;
  runs: ContentRunView[];
  articles: ContentArticleView[];
}

export interface ContentBoardListItem {
  id: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  intent: ContentBoardView["intent"];
  status: ContentBoardView["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
  latestRun: null | Pick<ContentRunView, "id" | "status" | "stage" | "updatedAt"> & {
    error: ContentRunView["error"];
  };
}
import type { ContentAiProfileId, ContentAiProvider } from "@/lib/content-ai";
