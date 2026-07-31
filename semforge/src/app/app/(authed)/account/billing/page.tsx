import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { resolveBillingState } from "@/lib/billing";
import { ROLE_LABELS } from "@/lib/rbac";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "구독 정보 · SEMForge CRUD 클론" };

/**
 * 계정 설정의 구독 정보.
 *
 * 이 저장소에는 결제 제공사 연동이 없다. 따라서 청구 금액·결제수단·인보이스·갱신일은
 * 만들어 보여주지 않고 미지원으로 명시한다. 실제로 확인 가능한 값(워크스페이스 플랜,
 * 좌석 사용 수, 내 역할)만 노출하고 플랜 변경은 기존 공개 요금제 페이지로 보낸다.
 */
export default async function BillingPage() {
  const { auth } = await pageSession();

  const [seatRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, auth.workspaceId), isNull(memberships.deletedAt)));

  const billing = resolveBillingState({
    plan: auth.workspacePlan,
    role: auth.role,
    memberCount: Number(seatRow?.count ?? 0),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold">구독 정보</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-app-link-soft px-1.5 py-[1px] font-semibold text-app-link">
            증거 P
          </span>
          원본 구독 화면을 확인하지 못해 구성은 제안입니다. 결제 제공사 연동이 없어 실제 청구
          정보는 표시하지 않습니다.
        </p>
      </div>

      <section
        aria-labelledby="billing-plan-heading"
        className="rounded-[8px] border border-app-border bg-white p-5"
      >
        <h2 id="billing-plan-heading" className="text-[15px] font-semibold">
          현재 플랜
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[12px] text-app-text-secondary">플랜</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-[13px]">
              <span className="font-semibold">{billing.planLabel}</span>
              <span className="inline-flex items-center rounded-[4px] bg-app-bg px-1.5 py-[1px] text-[11px] text-app-text-secondary">
                {billing.isPaidPlan ? "유료" : "무료"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-app-text-secondary">워크스페이스</dt>
            <dd className="mt-0.5 text-[13px]">{auth.workspaceName}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-app-text-secondary">내 역할</dt>
            <dd className="mt-0.5 text-[13px]">{ROLE_LABELS[auth.role]}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-[12px] text-app-text-secondary">좌석 사용</dt>
            <dd className="mt-0.5 text-[13px]">
              {billing.seats.used}명 사용 중
              {billing.seats.limit === null ? (
                <span className="ml-2 text-[12px] text-app-text-secondary">
                  플랜별 좌석 한도가 정의되어 있지 않아 한도는 표시하지 않습니다.
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="billing-integration-heading"
        className="rounded-[8px] border border-app-border bg-white p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="billing-integration-heading" className="text-[15px] font-semibold">
            결제 연동 상태
          </h2>
          <span className="inline-flex items-center rounded-[4px] bg-app-bg px-1.5 py-[1px] text-[11px] font-semibold text-app-text-secondary">
            연결 필요
          </span>
        </div>
        <p className="mt-2 text-[13px] text-app-text-secondary">{billing.payment.reason}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-[12px] font-semibold text-app-text-secondary">지금 가능한 것</h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {billing.payment.supportedActions.map((action) => (
                <li key={action} className="text-[13px]">
                  {action}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold text-app-text-secondary">
              연동 전까지 불가능한 것
            </h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {billing.payment.unsupportedActions.map((action) => (
                <li key={action} className="text-[13px] text-app-text-secondary">
                  {action}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="billing-upgrade-heading"
        className="rounded-[8px] border border-app-border bg-white p-5"
      >
        <h2 id="billing-upgrade-heading" className="text-[15px] font-semibold">
          플랜 변경
        </h2>
        {billing.upgradeCandidates.length > 0 ? (
          <p className="mt-2 text-[13px] text-app-text-secondary">
            상위 플랜: {billing.upgradeCandidates.map((plan) => plan.toUpperCase()).join(" · ")}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-app-text-secondary">
            현재 최상위 플랜을 사용 중입니다.
          </p>
        )}
        <p className="mt-2 text-[13px] text-app-text-secondary">
          {billing.canManageBilling
            ? "요금제 비교 페이지에서 플랜 구성을 확인할 수 있습니다. 실제 결제는 제공사 연동 후 가능합니다."
            : `플랜 변경은 관리자 이상만 진행할 수 있습니다. 현재 역할: ${ROLE_LABELS[auth.role]}`}
        </p>
        <Link
          href={billing.upgradeHref}
          className="mt-4 inline-flex items-center rounded-[6px] border border-app-border px-3 py-2 text-[13px] font-semibold text-app-link hover:bg-app-bg"
        >
          요금제 비교 보기
        </Link>
      </section>
    </div>
  );
}
