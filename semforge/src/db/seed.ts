import { db } from "@/db/client";
import {
  apiKeys,
  auditLogs,
  authEvents,
  clickstreamEvents,
  contentArticles,
  folderShares,
  folderTags,
  folders,
  keywordListItems,
  keywordLists,
  keywordMetrics,
  linkGraphEdges,
  mediaContacts,
  mediaLists,
  memberships,
  notificationSettings,
  positionTrackingCampaigns,
  reportSchedules,
  reports,
  siteAuditCampaigns,
  siteAuditIssues,
  sites,
  serpSnapshots,
  tags,
  trackedKeywords,
  users,
  workspaces,
} from "@/db/schema";
import { seedAnalyticsData } from "@/db/seed-analytics";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/password";

/**
 * 현실적인 시드 데이터.
 * 값은 결정적(고정)이며 외부 API에 의존하지 않는다.
 *
 * 데이터 원칙(2026-07-29): 기본 경로는 구조(계정/폴더/빈 캠페인)만 심는다.
 * 데모 지표(순위·검색량·건강 점수·가시성 등 하드코딩 상수)와 가상 분석 원천
 * 데이터(가상 도메인 SERP/클릭스트림/링크 그래프)는 SEED_DEMO_DATA=1 일 때만
 * 삽입한다. 실제 지표는 TalorData/Firecrawl 수집으로 채운다.
 */

const DEMO = process.env.SEED_DEMO_DATA === "1";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY);

async function main() {
  console.log("[seed] 기존 데이터 삭제");
  // 자식 → 부모 순으로 비운다.
  const tablesInOrder = [
    auditLogs,
    authEvents,
    notificationSettings,
    apiKeys,
    serpSnapshots,
    clickstreamEvents,
    linkGraphEdges,
    keywordMetrics,
    siteAuditIssues,
    siteAuditCampaigns,
    trackedKeywords,
    positionTrackingCampaigns,
    keywordListItems,
    keywordLists,
    mediaContacts,
    mediaLists,
    reportSchedules,
    reports,
    contentArticles,
    folderTags,
    folderShares,
    tags,
    sites,
    folders,
    memberships,
    users,
    workspaces,
  ];
  for (const table of tablesInOrder) {
    await db.delete(table);
  }

  if (DEMO) {
    console.log("[seed] SEED_DEMO_DATA=1 — 가상 분석 원천 데이터 삽입");
    await seedAnalyticsData(now);
  }

  const workspaceId = newId("wsp");
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Acme 마케팅팀",
    slug: "acme",
    plan: "guru",
    createdAt: ago(120),
    updatedAt: ago(120),
  });

  console.log("[seed] 사용자 4명 (역할별)");
  const password = await hashPassword("password1234");
  const people = [
    { key: "owner", name: "김소유", email: "owner@example.com", role: "owner" as const },
    { key: "admin", name: "박관리", email: "admin@example.com", role: "admin" as const },
    { key: "editor", name: "이편집", email: "editor@example.com", role: "editor" as const },
    { key: "viewer", name: "최조회", email: "viewer@example.com", role: "viewer" as const },
  ];
  const userIds: Record<string, string> = {};
  for (const person of people) {
    const id = newId("usr");
    userIds[person.key] = id;
    await db.insert(users).values({
      id,
      email: person.email,
      name: person.name,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      lastLoginAt: ago(1),
      createdAt: ago(110),
      updatedAt: ago(110),
    });
    await db.insert(memberships).values({
      id: newId("mem"),
      workspaceId,
      userId: id,
      role: person.role,
      createdAt: ago(110),
      updatedAt: ago(110),
    });
    for (const key of ["educational", "product_news", "upcoming_events"] as const) {
      await db.insert(notificationSettings).values({
        id: newId("nts"),
        userId: id,
        key,
        enabled: !(person.key === "viewer" && key === "educational"),
      });
    }
    await db.insert(authEvents).values({
      id: newId("aev"),
      userId: id,
      email: person.email,
      eventType: "registration",
      ip: "121.143.31.143",
      country: "대한민국",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      occurredAt: ago(110),
    });
    await db.insert(authEvents).values({
      id: newId("aev"),
      userId: id,
      email: person.email,
      eventType: "login",
      ip: "121.143.31.143",
      country: "대한민국",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      occurredAt: ago(1),
    });
  }

  console.log("[seed] 태그");
  const tagRows = [
    { name: "핵심 브랜드", color: "#235FE2" },
    { name: "이커머스", color: "#12A25C" },
    { name: "관찰 대상", color: "#F0872B" },
  ];
  const tagIds: string[] = [];
  for (const tag of tagRows) {
    const id = newId("tag");
    tagIds.push(id);
    await db.insert(tags).values({
      id,
      workspaceId,
      name: tag.name,
      color: tag.color,
      createdBy: userIds.owner,
      updatedBy: userIds.owner,
      createdAt: ago(90),
      updatedAt: ago(90),
    });
  }

  console.log("[seed] 폴더 + 웹사이트");
  const folderSpecs = [
    {
      name: "Acme 본사",
      domain: "acme.example.com",
      pinned: true,
      owner: "owner",
      extraSites: ["shop.acme.example.com", "blog.acme.example.com"],
      tags: [0, 1],
      siteHealth: 87,
      visibility: 42,
    },
    {
      name: "Northwind 리테일",
      domain: "northwind.example.com",
      pinned: false,
      owner: "admin",
      extraSites: ["kr.northwind.example.com"],
      tags: [1],
      siteHealth: 73,
      visibility: 28,
    },
    {
      name: "Globex 경쟁 관찰",
      domain: "globex.example.com",
      pinned: false,
      owner: "editor",
      extraSites: [],
      tags: [2],
      siteHealth: 61,
      visibility: 15,
    },
    {
      name: "Initech 신규",
      domain: "initech.example.com",
      pinned: false,
      owner: "editor",
      extraSites: [],
      tags: [],
      siteHealth: null,
      visibility: null,
    },
  ];

  const folderIds: string[] = [];
  for (const [index, spec] of folderSpecs.entries()) {
    const folderId = newId("fld");
    folderIds.push(folderId);
    const createdBy = userIds[spec.owner];
    await db.insert(folders).values({
      id: folderId,
      workspaceId,
      name: spec.name,
      domain: spec.domain,
      pinned: spec.pinned,
      shareOnReportCreate: index === 0,
      createdBy,
      updatedBy: createdBy,
      createdAt: ago(80 - index * 10),
      updatedAt: ago(5),
    });
    await db.insert(sites).values({
      id: newId("sit"),
      workspaceId,
      folderId,
      domain: spec.domain,
      isPrimary: true,
      createdBy,
      updatedBy: createdBy,
      createdAt: ago(80 - index * 10),
      updatedAt: ago(80 - index * 10),
    });
    for (const extra of spec.extraSites) {
      await db.insert(sites).values({
        id: newId("sit"),
        workspaceId,
        folderId,
        domain: extra,
        createdBy,
        updatedBy: createdBy,
        createdAt: ago(60),
        updatedAt: ago(60),
      });
    }
    for (const tagIndex of spec.tags) {
      await db.insert(folderTags).values({
        id: newId("ftg"),
        folderId,
        tagId: tagIds[tagIndex],
      });
    }
  }

  // editor 소유 폴더를 viewer 에게 공유 → 소유권 필터 "나에게 공유된" 테스트용
  await db.insert(folderShares).values({
    id: newId("shr"),
    folderId: folderIds[2],
    userId: userIds.viewer,
    permission: "view",
    createdBy: userIds.editor,
  });

  console.log("[seed] 사이트 감사 캠페인");
  const auditSpecs = [
    { folder: 0, name: "Acme 월간 감사", schedule: "monthly" as const, status: "completed" as const, health: 87 },
    { folder: 1, name: "Northwind 주간 감사", schedule: "weekly" as const, status: "running" as const, health: 73 },
    { folder: 2, name: "Globex 1회 감사", schedule: "off" as const, status: "failed" as const, health: null },
  ];
  for (const spec of auditSpecs) {
    const campaignId = newId("sac");
    await db.insert(siteAuditCampaigns).values({
      id: campaignId,
      workspaceId,
      folderId: folderIds[spec.folder],
      name: spec.name,
      domain: folderSpecs[spec.folder].domain,
      crawlScope: "domain",
      pageLimit: 500,
      crawlSource: "website",
      schedule: spec.schedule,
      status: spec.status,
      // 건강 점수는 실제 크롤(Firecrawl) 결과로만 채운다 — 데모 상수는 플래그 온일 때만.
      siteHealth: DEMO ? spec.health : null,
      lastRunAt: spec.status === "completed" ? ago(2) : null,
      createdBy: userIds.owner,
      updatedBy: userIds.owner,
      createdAt: ago(40),
      updatedAt: ago(2),
    });
    if (!DEMO) continue;
    const issues = [
      { severity: "error" as const, title: "4xx 상태 코드를 반환하는 페이지", count: 12 },
      { severity: "error" as const, title: "제목 태그가 없는 페이지", count: 4 },
      { severity: "warning" as const, title: "메타 설명이 중복된 페이지", count: 27 },
      { severity: "warning" as const, title: "이미지에 대체 텍스트 없음", count: 63 },
      { severity: "notice" as const, title: "내부 링크가 1개뿐인 페이지", count: 9 },
    ];
    for (const issue of issues) {
      await db.insert(siteAuditIssues).values({
        id: newId("sai"),
        campaignId,
        severity: issue.severity,
        title: issue.title,
        count: issue.count,
        createdAt: ago(2),
        updatedAt: ago(2),
      });
    }
  }

  console.log("[seed] 순위 추적 캠페인 + 키워드");
  const ptSpecs = [
    { folder: 0, name: "Acme 브랜드 추적", device: "desktop" as const, engine: "google" as const, visibility: 42 },
    { folder: 0, name: "Acme AI 검색 추적", device: "desktop" as const, engine: "chatgpt" as const, visibility: 17 },
    { folder: 1, name: "Northwind 모바일 추적", device: "mobile" as const, engine: "google" as const, visibility: 28 },
  ];
  const keywordSeeds = [
    { keyword: "마케팅 자동화 도구", position: 3, prev: 5, volume: 8100, difficulty: 62 },
    { keyword: "seo 분석 사이트", position: 7, prev: 7, volume: 5400, difficulty: 55 },
    { keyword: "키워드 순위 확인", position: 12, prev: 9, volume: 3300, difficulty: 48 },
    { keyword: "백링크 검사", position: 21, prev: 24, volume: 1900, difficulty: 41 },
    { keyword: "경쟁사 트래픽 분석", position: 5, prev: 6, volume: 2400, difficulty: 58 },
  ];
  for (const spec of ptSpecs) {
    const campaignId = newId("ptc");
    await db.insert(positionTrackingCampaigns).values({
      id: campaignId,
      workspaceId,
      folderId: folderIds[spec.folder],
      name: spec.name,
      domain: folderSpecs[spec.folder].domain,
      location: "Seoul, South Korea",
      device: spec.device,
      searchEngine: spec.engine,
      status: "active",
      // 가시성 점수는 실제 순위 수집(TalorData) 결과로만 채운다.
      visibility: DEMO ? spec.visibility : null,
      createdBy: userIds.admin,
      updatedBy: userIds.admin,
      createdAt: ago(35),
      updatedAt: ago(1),
    });
    if (!DEMO) continue;
    for (const kw of keywordSeeds) {
      await db.insert(trackedKeywords).values({
        id: newId("tkw"),
        campaignId,
        keyword: kw.keyword,
        position: kw.position,
        previousPosition: kw.prev,
        volume: kw.volume,
        difficulty: kw.difficulty,
        createdAt: ago(35),
        updatedAt: ago(1),
      });
    }
  }

  console.log("[seed] 키워드 목록");
  const listSpecs = [
    { name: "Acme 핵심 키워드", mode: "domain" as const, seed: "acme.example.com", status: "ready" as const },
    { name: "신규 콘텐츠 후보", mode: "seed" as const, seed: "마케팅 자동화", status: "ready" as const },
    { name: "수동 정리 목록", mode: "manual" as const, seed: null, status: "draft" as const },
  ];
  for (const spec of listSpecs) {
    const listId = newId("kwl");
    await db.insert(keywordLists).values({
      id: listId,
      workspaceId,
      folderId: folderIds[0],
      name: spec.name,
      mode: spec.mode,
      database: "KR",
      seed: spec.seed,
      status: spec.status,
      createdBy: userIds.editor,
      updatedBy: userIds.editor,
      createdAt: ago(28),
      updatedAt: ago(3),
    });
    if (!DEMO) continue;
    const intents = ["informational", "commercial", "transactional", "navigational"] as const;
    for (const [i, kw] of keywordSeeds.entries()) {
      await db.insert(keywordListItems).values({
        id: newId("kwi"),
        listId,
        keyword: kw.keyword,
        volume: kw.volume,
        difficulty: kw.difficulty,
        intent: intents[i % intents.length],
        cluster: i < 2 ? "자동화" : "분석",
        createdAt: ago(28),
        updatedAt: ago(28),
      });
    }
  }

  console.log("[seed] 미디어 리스트 + 연락처");
  const mediaSpecs = [
    { name: "국내 IT 매체", description: "테크 전문 기자 목록" },
    { name: "커머스 트레이드", description: "이커머스 업계지" },
  ];
  const contacts = [
    { name: "정기자", outlet: "테크리뷰", beat: "SaaS", email: "reporter1@example.com", country: "KR" },
    { name: "한기자", outlet: "커머스타임즈", beat: "이커머스", email: "reporter2@example.com", country: "KR" },
    { name: "Alex Kim", outlet: "Global SaaS Weekly", beat: "AI", email: "alex@example.com", country: "US" },
  ];
  for (const spec of mediaSpecs) {
    const listId = newId("mdl");
    await db.insert(mediaLists).values({
      id: listId,
      workspaceId,
      folderId: folderIds[0],
      name: spec.name,
      description: spec.description,
      createdBy: userIds.admin,
      updatedBy: userIds.admin,
      createdAt: ago(20),
      updatedAt: ago(4),
    });
    for (const contact of contacts) {
      await db.insert(mediaContacts).values({
        id: newId("mdc"),
        listId,
        name: contact.name,
        outlet: contact.outlet,
        beat: contact.beat,
        email: `${listId.slice(-4)}.${contact.email}`,
        country: contact.country,
        createdAt: ago(20),
        updatedAt: ago(20),
      });
    }
  }

  console.log("[seed] 보고서 + 일정");
  const reportSpecs = [
    { name: "월간 SEO 성과", template: "monthly_seo" as const, status: "published" as const, widgets: 24 },
    { name: "GA4 트래픽 요약", template: "ga4" as const, status: "draft" as const, widgets: 12 },
    { name: "브랜드 AI 노출", template: "brand_performance" as const, status: "published" as const, widgets: 8 },
  ];
  for (const spec of reportSpecs) {
    const reportId = newId("rpt");
    await db.insert(reports).values({
      id: reportId,
      workspaceId,
      folderId: folderIds[0],
      name: spec.name,
      template: spec.template,
      theme: spec.status === "published" ? "white_label" : "default",
      status: spec.status,
      // 위젯 수는 실제 보고서 편집 결과로만 채운다.
      widgetCount: DEMO ? spec.widgets : 0,
      createdBy: userIds.owner,
      updatedBy: userIds.owner,
      createdAt: ago(15),
      updatedAt: ago(2),
    });
    if (spec.status === "published") {
      await db.insert(reportSchedules).values({
        id: newId("rps"),
        reportId,
        frequency: "monthly",
        dayOfMonth: 1,
        recipients: "owner@example.com,admin@example.com",
        nextRunAt: new Date(now + 7 * DAY),
        createdAt: ago(15),
        updatedAt: ago(15),
      });
    }
  }

  console.log("[seed] 콘텐츠 문서");
  const contentSpecs = [
    { title: "마케팅 자동화 도구 비교 가이드", mode: "create" as const, status: "published" as const, keyword: "마케팅 자동화 도구", words: 2140, score: 82 },
    { title: "SEO 분석 사이트 선택 기준", mode: "optimize" as const, status: "in_review" as const, keyword: "seo 분석 사이트", words: 1580, score: 71 },
    { title: "뉴스레터용 요약 리라이트", mode: "repurpose" as const, status: "draft" as const, keyword: null, words: 640, score: null },
    { title: "백링크 검사 브리프", mode: "brief" as const, status: "draft" as const, keyword: "백링크 검사", words: 320, score: 64 },
  ];
  for (const spec of contentSpecs) {
    await db.insert(contentArticles).values({
      id: newId("cta"),
      workspaceId,
      folderId: folderIds[0],
      title: spec.title,
      mode: spec.mode,
      status: spec.status,
      keyword: spec.keyword,
      // 단어 수/SEO 점수는 실제 분석 결과로만 채운다.
      wordCount: DEMO ? spec.words : 0,
      seoScore: DEMO ? spec.score : null,
      body: `${spec.title}\n\n이 문서는 시드 데이터입니다. 실제 콘텐츠 생성 파이프라인은 구현 범위 밖입니다.`,
      createdBy: userIds.editor,
      updatedBy: userIds.editor,
      createdAt: ago(12),
      updatedAt: ago(1),
    });
  }

  console.log("[seed] 휴지통 샘플 (소프트 삭제 상태)");
  const trashedFolderId = newId("fld");
  await db.insert(folders).values({
    id: trashedFolderId,
    workspaceId,
    name: "종료된 캠페인 폴더",
    domain: "retired.example.com",
    createdBy: userIds.admin,
    updatedBy: userIds.admin,
    deletedAt: ago(3),
    deletedBy: userIds.admin,
    createdAt: ago(70),
    updatedAt: ago(3),
  });
  await db.insert(contentArticles).values({
    id: newId("cta"),
    workspaceId,
    folderId: folderIds[0],
    title: "폐기된 초안",
    mode: "create",
    status: "draft",
    wordCount: 120,
    createdBy: userIds.editor,
    updatedBy: userIds.editor,
    deletedAt: ago(2),
    deletedBy: userIds.editor,
    createdAt: ago(30),
    updatedAt: ago(2),
  });

  console.log("[seed] 감사 로그 샘플");
  const auditSamples = [
    { action: "create" as const, entityType: "folders", label: "Acme 본사", actor: "owner" },
    { action: "update" as const, entityType: "folders", label: "Northwind 리테일", actor: "admin" },
    { action: "create" as const, entityType: "reports", label: "월간 SEO 성과", actor: "owner" },
    { action: "delete" as const, entityType: "folders", label: "종료된 캠페인 폴더", actor: "admin" },
    { action: "delete" as const, entityType: "content", label: "폐기된 초안", actor: "editor" },
    { action: "export" as const, entityType: "position-tracking", label: "15건", actor: "admin" },
  ];
  for (const [i, sample] of auditSamples.entries()) {
    const person = people.find((p) => p.key === sample.actor)!;
    await db.insert(auditLogs).values({
      id: newId("aud"),
      workspaceId,
      actorUserId: userIds[sample.actor],
      actorEmail: person.email,
      action: sample.action,
      entityType: sample.entityType,
      entityId: newId("ref"),
      entityLabel: sample.label,
      ip: "121.143.31.143",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150.0.0.0",
      createdAt: ago(6 - i * 0.5),
    });
  }

  console.log("[seed] API 키");
  await db.insert(apiKeys).values({
    id: newId("key"),
    workspaceId,
    userId: userIds.owner,
    label: "리포팅 파이프라인",
    keyPrefix: "sk_live_4f2a",
    hashedKey: "seed-placeholder-hash",
    permissions: "read",
    apiVersion: "v4",
    status: "active",
    expiresAt: new Date(now + 180 * DAY),
    createdBy: userIds.owner,
    updatedBy: userIds.owner,
    createdAt: ago(50),
    updatedAt: ago(50),
  });
  await db.insert(apiKeys).values({
    id: newId("key"),
    workspaceId,
    userId: userIds.owner,
    label: "폐기된 키",
    keyPrefix: "sk_live_91bd",
    hashedKey: "seed-placeholder-hash-2",
    permissions: "read",
    apiVersion: "v3",
    status: "inactive",
    expiresAt: ago(10),
    createdBy: userIds.owner,
    updatedBy: userIds.owner,
    createdAt: ago(200),
    updatedAt: ago(10),
  });

  console.log("\n[seed] 완료");
  console.log(
    DEMO
      ? "  데모 지표: 삽입됨 (SEED_DEMO_DATA=1)"
      : "  데모 지표: 생략됨 — 순위/검색량/점수는 실제 수집으로 채웁니다 (SEED_DEMO_DATA=1 로 데모 삽입 가능)"
  );
  console.log("  로그인 계정 (비밀번호 공통: password1234)");
  for (const person of people) {
    console.log(`   - ${person.email.padEnd(22)} ${person.role}`);
  }
}

main().catch((error) => {
  console.error("[seed] 실패", error);
  process.exit(1);
});
