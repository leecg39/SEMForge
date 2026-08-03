import { ApiError } from "@/lib/api";
import type { BacklinkScope } from "@/server/backlinks/contracts";

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

function isIpv4Literal(hostname: string): boolean {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

export interface ParsedBacklinkTarget {
  canonical: string;
  scope: BacklinkScope;
}

/** 백링크 API 대상은 도메인 범위에서는 host만, page 범위에서는 정확한 URL을 보존한다. */
export function parseBacklinkTarget(raw: string, scope: BacklinkScope): ParsedBacklinkTarget {
  const input = raw.trim();
  if (!input || input.length > 2000 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인 또는 URL을 입력해 주세요.", {
      fields: { target: "예: example.com 또는 https://example.com/page" },
    });
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인 또는 URL을 입력해 주세요.", {
      fields: { target: "예: example.com 또는 https://example.com/page" },
    });
  }

  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new ApiError("VALIDATION_ERROR", "HTTP 또는 HTTPS 웹사이트만 분석할 수 있습니다.", {
      fields: { target: "사용자 정보가 포함된 URL은 지원하지 않습니다." },
    });
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new ApiError("VALIDATION_ERROR", "포트가 지정된 URL은 지원하지 않습니다.", {
      fields: { target: "기본 HTTP/HTTPS 주소를 입력해 주세요." },
    });
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const labels = hostname.split(".");
  if (
    isIpv4Literal(hostname) ||
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !HOST_LABEL.test(label))
  ) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인 또는 URL을 입력해 주세요.", {
      fields: { target: "예: example.com 또는 https://example.com/page" },
    });
  }

  if (scope !== "page") {
    return {
      canonical: scope === "root_domain" ? hostname.replace(/^www\./, "") : hostname,
      scope,
    };
  }

  url.hash = "";
  url.hostname = hostname;
  return { canonical: url.toString(), scope };
}

export function inferBacklinkScope(raw: string): BacklinkScope {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return url.pathname !== "/" || Boolean(url.search) ? "page" : "root_domain";
  } catch {
    return "root_domain";
  }
}
