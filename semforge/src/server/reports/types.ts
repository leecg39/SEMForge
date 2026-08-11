// @TASK P3-R1-T1 - Immutable weekly report public contracts
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷

import type { ReportDateRange } from "@/server/reports/schedule";

export const REPORT_SECTION_KEYS = ["rank", "aio", "naver", "gsc"] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];
export type ReportStatus =
  | "collecting"
  | "snapshot_ready"
  | "rendering"
  | "delivered"
  | "partial"
  | "failed";

export interface ReportSectionSnapshot {
  readonly key: ReportSectionKey;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly capturedAt: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface WeeklyReportSnapshot {
  readonly version: 1;
  readonly capturedAt: string;
  readonly schedule: {
    readonly timezone: "Asia/Seoul";
    readonly collectionAt: string;
    readonly retryCutoffAt: string;
    readonly snapshotAt: string;
  };
  readonly period: {
    readonly timezone: "America/Los_Angeles";
    readonly current: ReportDateRange;
    readonly comparison: ReportDateRange;
  };
  readonly brand: {
    readonly name: string;
    readonly logoUrl: string | null;
    readonly accentColor: string;
  };
  readonly sections: Readonly<Record<ReportSectionKey, ReportSectionSnapshot>>;
}

export interface ReportSummary {
  readonly id: string;
  readonly workspaceId: string;
  readonly siteId: string;
  readonly status: ReportStatus;
  readonly period: {
    readonly start: string;
    readonly end: string;
    readonly comparisonStart: string;
    readonly comparisonEnd: string;
  };
  readonly brand: {
    readonly name: string;
    readonly logoUrl: string | null;
    readonly accentColor: string;
  };
  readonly snapshotReadyAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReportDetail extends ReportSummary {
  readonly snapshot: WeeklyReportSnapshot;
  readonly sections: readonly ReportSectionSnapshot[];
}

export interface ReportPage {
  readonly items: readonly ReportSummary[];
  readonly nextCursor: string | null;
}

export interface GenerateWeeklyReportInput {
  readonly workspaceId: string;
  readonly siteId: string;
  readonly cycleMonday: string;
}

export interface WeeklyReportGenerator {
  generate(input: GenerateWeeklyReportInput): Promise<ReportDetail>;
}

