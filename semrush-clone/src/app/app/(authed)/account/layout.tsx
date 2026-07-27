import Link from "next/link";
import { accountNav } from "@/data/crud/nav";

/**
 * 계정 설정 셸.
 * 원본 `/accounts/*` 의 좌측 보조 내비게이션(프로필 설정 / 구독 정보 / 사용자 관리 / 알림 /
 * 쿼리 로그 / 활동 로그 / API Keys)을 구현 범위에 맞춰 축약해 재현한다. (증거 O)
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-6 lg:flex-row">
      <nav
        aria-label="계정 설정"
        className="w-full shrink-0 rounded-[8px] border border-app-border bg-white p-2 lg:w-[220px]"
      >
        <p className="px-2 py-1.5 text-[12px] font-semibold text-app-text-secondary">
          내 프로필
        </p>
        <ul className="flex flex-col">
          {accountNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-[6px] px-2 py-2 text-[13px] hover:bg-app-bg"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
