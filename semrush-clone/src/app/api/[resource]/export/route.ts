import { ApiError, route } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { listResource } from "@/server/resource";
import { findResource } from "@/server/resources";

/** CSV 내보내기. 목록과 동일한 검색·필터·정렬 조건을 그대로 적용한다. */

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET = route(
  async (request: Request, context: { params: Promise<{ resource: string }> }) => {
    const { resource } = await context.params;
    const cfg = findResource(resource);
    if (!cfg) throw new ApiError("NOT_FOUND", "존재하지 않는 리소스입니다.");
    const auth = await requireAuth(request);
    assertCan(auth, "export");

    // 내보내기는 최대 1000행으로 제한한다.
    const url = new URL(request.url);
    url.searchParams.set("pageSize", "100");
    const collected: Record<string, unknown>[] = [];
    for (let page = 1; page <= 10; page += 1) {
      url.searchParams.set("page", String(page));
      const { data, meta } = await listResource(cfg, auth, new Request(url));
      collected.push(...(data as Record<string, unknown>[]));
      if (page >= meta.totalPages) break;
    }

    const headers = collected.length > 0 ? Object.keys(collected[0]) : ["id"];
    const lines = [
      headers.join(","),
      ...collected.map((row) => headers.map((h) => toCsvValue(row[h])).join(",")),
    ];

    writeAudit(auth, {
      action: "export",
      entityType: cfg.key,
      entityLabel: `${collected.length}건`,
    });

    return new Response("\uFEFF" + lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${cfg.key}-${Date.now()}.csv"`,
      },
    });
  }
);
