import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { createResource } from "@/server/resource";
import { findResource } from "@/server/resources";
import { validatePublicDomain } from "@/server/siteaudit/domain";
import { listSiteAuditProjects } from "@/server/siteaudit/projects";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page"));
  const pageSize = Number(searchParams.get("pageSize"));
  const result = await listSiteAuditProjects(auth, {
    q: searchParams.get("q") ?? "",
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 10,
    sort: searchParams.get("sort") ?? undefined,
  });
  return jsonOk(result.rows, { meta: result.meta });
});

const createSchema = z.object({
  domain: z.string().min(1).max(300),
  name: z.string().trim().max(100).optional().default(""),
  allowDuplicate: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, createSchema);
  const validation = await validatePublicDomain(auth, input.domain);
  if (validation.duplicateProjects.length > 0 && !input.allowDuplicate) {
    throw new ApiError(
      "DUPLICATE",
      "같은 도메인의 SEO 프로젝트가 이미 있습니다.",
      {
        fields: { domain: "기존 프로젝트를 사용하거나 중복 생성을 확인해 주세요." },
        details: { duplicateProjects: validation.duplicateProjects },
      }
    );
  }
  const config = findResource("folders");
  if (!config) throw new ApiError("INTERNAL", "SEO 프로젝트 리소스를 찾을 수 없습니다.");
  const row = await createResource(config, auth, {
    name: input.name || validation.normalizedDomain.replace(/^www\./, ""),
    domain: validation.normalizedDomain,
  });
  return jsonOk(row, { status: 201, meta: { validation } });
});
