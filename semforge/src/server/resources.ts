import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  contentArticles,
  folders,
  keywordListItems,
  keywordLists,
  mediaContacts,
  mediaLists,
  positionTrackingCampaigns,
  reportSchedules,
  reports,
  siteAuditCampaigns,
  siteAuditIssues,
  sites,
  tags,
  trackedKeywords,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  domainSchema,
  nameSchema,
  titleSchema,
  versionField,
} from "@/lib/validators";
import type { ResourceConfig } from "@/server/resource";

/**
 * 리소스 레지스트리.
 * `/api/[resource]/...` 제네릭 라우트가 이 맵만 보고 동작하므로, 여기에 없는 키는 404 가 된다.
 *
 * 증거 등급
 * - folders / sites / tags : 원본 폼·목록·필터에서 실측 (O)
 * - 그 외 6개 도메인 : 진입점만 관찰되었고 필드 구성은 제안 (P)
 */

const optionalText = (max = 500) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable();

/* ---------------------------- folders (O) ---------------------------- */

const folderColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "색상은 #RRGGBB 형식이어야 합니다.")
  .optional()
  .default("#3b82f6");

const folderCreate = z.object({
  name: nameSchema,
  domain: domainSchema,
  shareOnReportCreate: z.boolean().optional().default(false),
  pinned: z.boolean().optional().default(false),
  color: folderColorSchema,
});

// 원본 규칙 R1: 도메인은 1회 설정 후 수정 불가 → update 스키마에 domain 이 없다.
const folderUpdate = z.object({
  name: nameSchema.optional(),
  shareOnReportCreate: z.boolean().optional(),
  pinned: z.boolean().optional(),
  color: folderColorSchema.optional(),
  version: versionField,
});

const folderResource: ResourceConfig = {
  key: "folders",
  label: "폴더",
  table: folders,
  labelField: "name",
  // 원본 검색 placeholder "웹사이트 또는 폴더 이름" → 두 필드를 함께 검색 (O)
  searchFields: ["name", "domain"],
  sortableFields: ["createdAt", "updatedAt", "name", "domain"],
  defaultSort: "createdAt:desc",
  filterableFields: ["owning", "tagId"],
  createSchema: folderCreate,
  updateSchema: folderUpdate,
  uniqueRules: [
    { fields: ["domain"], message: "이미 등록된 웹사이트입니다." },
  ],
  // 원본 kebab 의 "핀 고정"을 목록 정렬에 반영 (O)
  primaryOrder: (cols) => [desc(cols.pinned)],
  extraWhere: (auth, query, cols) => {
    const owning = query.filters.owning?.[0];
    if (owning === "my") return eq(cols.createdBy, auth.userId);
    if (owning === "shared") {
      return sql`${cols.id} IN (SELECT folder_id FROM folder_shares WHERE user_id = ${auth.userId})`;
    }
    return undefined;
  },
  afterCreate: async (auth, row) => {
    // 폴더의 대표 도메인을 사이트로도 등록해 "웹사이트 추가" 목록과 일관성을 유지한다.
    await db.insert(sites).values({
      id: newId(),
      workspaceId: auth.workspaceId,
      folderId: String(row.id),
      domain: String(row.domain),
      isPrimary: true,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
  },
  cascade: [
    { table: sites, foreignKey: "folderId" },
    { table: siteAuditCampaigns, foreignKey: "folderId" },
    { table: positionTrackingCampaigns, foreignKey: "folderId" },
    { table: keywordLists, foreignKey: "folderId" },
    { table: mediaLists, foreignKey: "folderId" },
    { table: reports, foreignKey: "folderId" },
    { table: contentArticles, foreignKey: "folderId" },
  ],
};

/* ----------------------------- sites (O) ----------------------------- */

const siteResource: ResourceConfig = {
  key: "sites",
  label: "웹사이트",
  table: sites,
  labelField: "domain",
  searchFields: ["domain"],
  sortableFields: ["createdAt", "domain"],
  defaultSort: "createdAt:desc",
  filterableFields: ["folderId"],
  createSchema: z.object({
    folderId: z.string().min(1, "폴더를 선택하세요."),
    domain: domainSchema,
    isPrimary: z.boolean().optional().default(false),
  }),
  updateSchema: z.object({
    isPrimary: z.boolean().optional(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["folderId", "domain"], message: "이미 등록된 웹사이트입니다." }],
};

/* ------------------------------ tags (I1) ---------------------------- */

const tagResource: ResourceConfig = {
  key: "tags",
  label: "태그",
  table: tags,
  labelField: "name",
  searchFields: ["name"],
  sortableFields: ["createdAt", "name"],
  defaultSort: "name:asc",
  createSchema: z.object({
    name: titleSchema("태그 이름", 30),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "색상은 #RRGGBB 형식이어야 합니다.")
      .optional()
      .default("#235FE2"),
  }),
  updateSchema: z.object({
    name: titleSchema("태그 이름", 30).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["name"], message: "이미 존재하는 태그입니다." }],
};

/* ------------------- site audit campaigns (P) ------------------------ */

const siteAuditResource: ResourceConfig = {
  key: "site-audits",
  label: "사이트 진단 캠페인",
  table: siteAuditCampaigns,
  labelField: "name",
  searchFields: ["name", "domain"],
  sortableFields: ["createdAt", "updatedAt", "name", "siteHealth", "lastRunAt"],
  defaultSort: "createdAt:desc",
  filterableFields: ["status", "schedule", "folderId", "crawlScope"],
  createSchema: z.object({
    folderId: z.string().min(1).optional().nullable(),
    name: titleSchema("프로젝트 이름", 100),
    domain: domainSchema,
    crawlScope: z.enum(["domain", "subdomain", "path"]).optional().default("domain"),
    pageLimit: z.coerce
      .number()
      .int()
      .min(1, "1 이상이어야 합니다.")
      .max(100000, "100,000 이하여야 합니다.")
      .optional()
      .default(100),
    crawlSource: z
      .enum(["website", "sitemap", "url_list"])
      .optional()
      .default("website"),
    schedule: z.enum(["off", "weekly", "monthly"]).optional().default("off"),
  }),
  updateSchema: z.object({
    name: titleSchema("프로젝트 이름", 100).optional(),
    crawlScope: z.enum(["domain", "subdomain", "path"]).optional(),
    pageLimit: z.coerce.number().int().min(1).max(100000).optional(),
    crawlSource: z.enum(["website", "sitemap", "url_list"]).optional(),
    schedule: z.enum(["off", "weekly", "monthly"]).optional(),
    status: z
      .enum(["idle", "queued", "running", "completed", "failed"])
      .optional(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["name"], message: "같은 이름의 캠페인이 이미 있습니다." }],
  cascade: [{ table: siteAuditIssues, foreignKey: "campaignId" }],
};

/* ---------------- position tracking campaigns (P) -------------------- */

const positionTrackingResource: ResourceConfig = {
  key: "position-tracking",
  label: "포지션 추적 캠페인",
  table: positionTrackingCampaigns,
  labelField: "name",
  searchFields: ["name", "domain"],
  sortableFields: ["createdAt", "updatedAt", "name", "visibility"],
  defaultSort: "createdAt:desc",
  filterableFields: ["status", "device", "searchEngine", "folderId"],
  createSchema: z.object({
    folderId: z.string().min(1).optional().nullable(),
    name: titleSchema("캠페인 이름", 100),
    domain: domainSchema,
    location: optionalText(120).transform((v) => v || "Seoul, South Korea"),
    device: z.enum(["desktop", "mobile", "tablet"]).optional().default("desktop"),
    searchEngine: z.enum(["google", "bing", "chatgpt"]).optional().default("google"),
  }),
  updateSchema: z.object({
    name: titleSchema("캠페인 이름", 100).optional(),
    location: optionalText(120),
    device: z.enum(["desktop", "mobile", "tablet"]).optional(),
    searchEngine: z.enum(["google", "bing", "chatgpt"]).optional(),
    status: z.enum(["active", "paused"]).optional(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["name"], message: "같은 이름의 캠페인이 이미 있습니다." }],
  cascade: [{ table: trackedKeywords, foreignKey: "campaignId" }],
};

/* ----------------------- keyword lists (P) --------------------------- */

const keywordListResource: ResourceConfig = {
  key: "keyword-lists",
  label: "키워드 목록",
  table: keywordLists,
  labelField: "name",
  searchFields: ["name", "seed"],
  sortableFields: ["createdAt", "updatedAt", "name"],
  defaultSort: "createdAt:desc",
  filterableFields: ["mode", "status", "database", "folderId"],
  createSchema: z.object({
    folderId: z.string().min(1).optional().nullable(),
    name: titleSchema("목록 이름", 100),
    // 원본에서 관찰된 3개 모드 (O)
    mode: z.enum(["domain", "seed", "manual"]).optional().default("manual"),
    database: z.string().min(2).max(5).optional().default("US"),
    seed: optionalText(200),
  }),
  updateSchema: z.object({
    name: titleSchema("목록 이름", 100).optional(),
    mode: z.enum(["domain", "seed", "manual"]).optional(),
    database: z.string().min(2).max(5).optional(),
    seed: optionalText(200),
    status: z.enum(["draft", "ready", "generating"]).optional(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["name"], message: "같은 이름의 목록이 이미 있습니다." }],
  cascade: [{ table: keywordListItems, foreignKey: "listId" }],
};

/* ------------------------ media lists (P) ---------------------------- */

const mediaListResource: ResourceConfig = {
  key: "media-lists",
  label: "미디어 리스트",
  table: mediaLists,
  labelField: "name",
  searchFields: ["name", "description"],
  sortableFields: ["createdAt", "updatedAt", "name"],
  defaultSort: "createdAt:desc",
  filterableFields: ["folderId"],
  createSchema: z.object({
    folderId: z.string().min(1).optional().nullable(),
    name: titleSchema("리스트 이름", 100),
    description: optionalText(300),
  }),
  updateSchema: z.object({
    name: titleSchema("리스트 이름", 100).optional(),
    description: optionalText(300),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["name"], message: "같은 이름의 리스트가 이미 있습니다." }],
  cascade: [{ table: mediaContacts, foreignKey: "listId" }],
};

/* --------------------------- reports (P) ----------------------------- */

const reportResource: ResourceConfig = {
  key: "reports",
  label: "보고서",
  table: reports,
  labelField: "name",
  searchFields: ["name"],
  sortableFields: ["createdAt", "updatedAt", "name", "widgetCount"],
  defaultSort: "createdAt:desc",
  filterableFields: ["template", "status", "theme", "folderId"],
  createSchema: z.object({
    folderId: z.string().min(1).optional().nullable(),
    name: titleSchema("보고서 이름", 100),
    // 원본 인기 템플릿 카드에서 관찰 (O)
    template: z
      .enum(["blank", "brand_performance", "ga4", "gsc", "monthly_seo"])
      .optional()
      .default("blank"),
    theme: z.enum(["default", "white_label"]).optional().default("default"),
    widgetCount: z.coerce.number().int().min(0).max(200).optional().default(0),
  }),
  updateSchema: z.object({
    name: titleSchema("보고서 이름", 100).optional(),
    template: z
      .enum(["blank", "brand_performance", "ga4", "gsc", "monthly_seo"])
      .optional(),
    theme: z.enum(["default", "white_label"]).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    widgetCount: z.coerce.number().int().min(0).max(200).optional(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["name"], message: "같은 이름의 보고서가 이미 있습니다." }],
  cascade: [{ table: reportSchedules, foreignKey: "reportId" }],
};

/* ----------------------- content articles (P) ------------------------ */

const contentResource: ResourceConfig = {
  key: "content",
  label: "콘텐츠 문서",
  table: contentArticles,
  labelField: "title",
  searchFields: ["title", "keyword"],
  sortableFields: ["createdAt", "updatedAt", "title", "seoScore", "wordCount"],
  defaultSort: "updatedAt:desc",
  filterableFields: ["mode", "status", "folderId"],
  createSchema: z.object({
    folderId: z.string().min(1).optional().nullable(),
    title: titleSchema("제목", 150),
    // 원본 Content 좌측 메뉴의 생성/최적화/재활용/브리프 (O)
    mode: z.enum(["create", "optimize", "repurpose", "brief"]).optional().default("create"),
    keyword: optionalText(120),
    body: optionalText(20000),
    wordCount: z.number().int().min(0).max(100000).optional().default(0),
    seoScore: z.number().int().min(0).max(100).optional().nullable(),
  }),
  updateSchema: z.object({
    title: titleSchema("제목", 150).optional(),
    mode: z.enum(["create", "optimize", "repurpose", "brief"]).optional(),
    status: z.enum(["draft", "in_review", "published"]).optional(),
    keyword: optionalText(120),
    body: optionalText(20000),
    wordCount: z.number().int().min(0).max(100000).optional(),
    seoScore: z.number().int().min(0).max(100).optional().nullable(),
    version: versionField,
  }),
  uniqueRules: [{ fields: ["title"], message: "같은 제목의 문서가 이미 있습니다." }],
};

/* --------------------------- 레지스트리 ------------------------------ */

export const RESOURCES: Record<string, ResourceConfig> = {
  [folderResource.key]: folderResource,
  [siteResource.key]: siteResource,
  [tagResource.key]: tagResource,
  [siteAuditResource.key]: siteAuditResource,
  [positionTrackingResource.key]: positionTrackingResource,
  [keywordListResource.key]: keywordListResource,
  [mediaListResource.key]: mediaListResource,
  [reportResource.key]: reportResource,
  [contentResource.key]: contentResource,
};

export function findResource(key: string): ResourceConfig | null {
  return RESOURCES[key] ?? null;
}

/** 휴지통 화면에서 훑을 리소스 순서 */
export const TRASHABLE_KEYS = [
  folderResource.key,
  siteAuditResource.key,
  positionTrackingResource.key,
  keywordListResource.key,
  mediaListResource.key,
  reportResource.key,
  contentResource.key,
];
