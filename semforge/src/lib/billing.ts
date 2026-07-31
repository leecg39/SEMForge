import type { MemberRole } from "@/db/schema";
import { hasRole } from "@/lib/rbac";

/**
 * 구독·결제 설정 화면의 판정 로직.
 *
 * 이 저장소에는 결제 제공사 연동이 없다. 따라서 청구 금액·결제수단·인보이스·갱신일은
 * 만들어내지 않고 미지원으로 명시한다. 실제로 확인 가능한 값(워크스페이스 플랜, 좌석 사용 수,
 * 역할)만 노출하고, 근거가 없는 값은 null 로 남긴다.
 */

export type WorkspacePlan = "free" | "pro" | "guru" | "business";

export const PLAN_LABELS: Record<WorkspacePlan, string> = {
  free: "무료",
  pro: "Pro",
  guru: "Guru",
  business: "Business",
};

const PLAN_ORDER: readonly WorkspacePlan[] = ["free", "pro", "guru", "business"];

/** 구독 관리에 필요한 최소 역할. 결제는 조직 단위 결정이라 관리자 이상으로 제한한다. */
export const BILLING_MANAGE_MIN_ROLE: MemberRole = "admin";

/** 플랜 비교·업그레이드는 기존 공개 요금제 페이지로 보낸다. */
export const PRICING_HREF = "/pricing/";

export interface PaymentIntegrationStatus {
  /** 결제 제공사 연동이 없으므로 항상 unavailable 이다. */
  status: "unavailable";
  reason: string;
  /** 지금 실제로 동작하는 것. */
  supportedActions: string[];
  /** 연동 전까지 불가능한 것. 화면에 그대로 노출해 오해를 막는다. */
  unsupportedActions: string[];
}

export function describePaymentIntegration(): PaymentIntegrationStatus {
  return {
    status: "unavailable",
    reason:
      "결제 제공사가 연동되어 있지 않습니다. 청구 금액·결제수단·인보이스는 조회할 수 없습니다.",
    supportedActions: ["현재 플랜 확인", "좌석 사용 현황 확인", "요금제 비교 페이지 이동"],
    unsupportedActions: [
      "결제수단 등록·변경",
      "인보이스·영수증 조회",
      "구독 자동 갱신 설정",
      "플랜 즉시 변경·해지",
    ],
  };
}

export interface BillingStateInput {
  plan: WorkspacePlan;
  role: MemberRole;
  /** 워크스페이스의 실제 멤버 수. */
  memberCount: number;
}

export interface BillingState {
  plan: WorkspacePlan;
  planLabel: string;
  isPaidPlan: boolean;
  canManageBilling: boolean;
  upgradeHref: string;
  /** 현재보다 상위인 플랜. 최상위면 빈 배열. */
  upgradeCandidates: WorkspacePlan[];
  seats: {
    used: number;
    /** 플랜별 좌석 한도 정의가 저장소에 없다. 추정치를 채우지 않고 null 로 둔다. */
    limit: null;
  };
  payment: PaymentIntegrationStatus;
}

export function resolveBillingState(input: BillingStateInput): BillingState {
  if (!Number.isInteger(input.memberCount) || input.memberCount < 0) {
    throw new Error(`[billing] 좌석 수는 0 이상의 정수여야 합니다: ${input.memberCount}`);
  }

  const currentIndex = PLAN_ORDER.indexOf(input.plan);
  return {
    plan: input.plan,
    planLabel: PLAN_LABELS[input.plan],
    isPaidPlan: input.plan !== "free",
    canManageBilling: hasRole(input.role, BILLING_MANAGE_MIN_ROLE),
    upgradeHref: PRICING_HREF,
    upgradeCandidates: PLAN_ORDER.slice(currentIndex + 1),
    seats: { used: input.memberCount, limit: null },
    payment: describePaymentIntegration(),
  };
}
