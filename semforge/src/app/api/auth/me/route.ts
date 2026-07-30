import { jsonOk, route } from "@/lib/api";
import { can, ROLE_LABELS, type Capability } from "@/lib/rbac";
import { getAuth, listWorkspacesForUser } from "@/lib/session";

const CAPABILITIES: Capability[] = [
  "read",
  "create",
  "update",
  "delete",
  "restore",
  "purge",
  "bulk",
  "manageMembers",
  "viewAudit",
  "export",
];

/**
 * 현재 세션 정보.
 * 클라이언트는 capabilities 로 버튼 표시를 결정하지만, 실제 판정은 서버가 다시 수행한다.
 */
export const GET = route(async (request: Request) => {
  const auth = await getAuth(request);
  if (!auth) return jsonOk(null);

  const workspaces = await listWorkspacesForUser(auth.userId);
  const capabilities = Object.fromEntries(
    CAPABILITIES.map((c) => [c, can(auth.role, c)])
  );

  return jsonOk({
    user: { id: auth.userId, email: auth.email, name: auth.name },
    workspace: {
      id: auth.workspaceId,
      name: auth.workspaceName,
      plan: auth.workspacePlan,
    },
    role: auth.role,
    roleLabel: ROLE_LABELS[auth.role],
    workspaces,
    capabilities,
  });
});
