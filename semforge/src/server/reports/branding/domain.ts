// @TASK P4-B1 - Report branding validation and logo SSRF guard
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/server/reports/branding/routes.integration.test.ts
import {
  assertPublicSiteDomain,
  type DomainAddressResolver,
  normalizeSiteDomain,
  SiteDomainError,
} from "@/server/sites/domain";

export interface ReportBranding {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly accentColor: string;
}

export class ReportBrandingValidationError extends Error {
  constructor(
    readonly field: keyof ReportBranding,
    message: string,
  ) {
    super(message);
    this.name = "ReportBrandingValidationError";
  }
}

function normalizeName(value: string): string {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name || name.length > 80) {
    throw new ReportBrandingValidationError("name", "대행사 이름은 1~80자여야 합니다.");
  }
  return name;
}

function normalizeAccentColor(value: string): string {
  const accentColor = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/u.test(accentColor)) {
    throw new ReportBrandingValidationError("accentColor", "강조색은 #RRGGBB 형식이어야 합니다.");
  }
  return accentColor;
}

async function normalizeLogoUrl(
  value: string | null,
  resolveAddresses?: DomainAddressResolver,
): Promise<string | null> {
  if (value === null) return null;
  if (!value || value.length > 2_048) {
    throw new ReportBrandingValidationError("logoUrl", "로고 URL은 2,048자 이하여야 합니다.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ReportBrandingValidationError("logoUrl", "로고 URL이 올바르지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    throw new ReportBrandingValidationError(
      "logoUrl",
      "로고는 인증 정보·포트·fragment가 없는 HTTPS URL만 사용할 수 있습니다.",
    );
  }

  try {
    const hostname = normalizeSiteDomain(url.hostname);
    await assertPublicSiteDomain(hostname, resolveAddresses);
    url.hostname = hostname;
  } catch (error) {
    if (!(error instanceof SiteDomainError)) throw error;
    throw new ReportBrandingValidationError(
      "logoUrl",
      "로고 URL은 공개 인터넷 주소를 가리켜야 합니다.",
    );
  }
  return url.toString();
}

export async function normalizeReportBranding(
  input: ReportBranding,
  resolveLogoAddresses?: DomainAddressResolver,
): Promise<ReportBranding> {
  return {
    name: normalizeName(input.name),
    logoUrl: await normalizeLogoUrl(input.logoUrl, resolveLogoAddresses),
    accentColor: normalizeAccentColor(input.accentColor),
  };
}
