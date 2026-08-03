const FOLDER_SCOPED_TOOLKITS = new Set([
  "advertising",
  "ai",
  "content",
  "social",
]);

interface ToolkitToolHrefInput {
  toolkitKey: string;
  href: string;
  selectedFolderId?: string;
}

/**
 * 툴킷 도구 링크의 프로젝트 범위를 유지한다. AI 가시성 개요는 사이드바에서
 * 다시 진입할 때 항상 공식 기본 필터로 시작해 이전 화면의 임시 필터를 끌고 오지 않는다.
 */
export function buildToolkitToolHref({
  toolkitKey,
  href,
  selectedFolderId = "",
}: ToolkitToolHrefInput): string {
  const [pathname, rawQuery = ""] = href.split("?", 2);
  const query = new URLSearchParams(rawQuery);

  if (selectedFolderId && FOLDER_SCOPED_TOOLKITS.has(toolkitKey)) {
    query.set("fid", selectedFolderId);
  }

  if (toolkitKey === "ai" && pathname === "/ai-seo/overview/") {
    query.set("range", "1m");
    query.set("tab", "top_topics");
    query.set("page", "1");
  }

  return `${pathname}${query.size > 0 ? `?${query.toString()}` : ""}`;
}
