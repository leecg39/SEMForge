export type RouteSearchParams = Record<string, string | string[] | undefined>;

/** 레거시 Content URL의 모든 쿼리(특히 fid)를 새 목적지로 안전하게 전달한다. */
export function contentRedirectHref(
  pathname: string,
  values: RouteSearchParams,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  return `${pathname}${params.size ? `?${params}` : ""}`;
}
