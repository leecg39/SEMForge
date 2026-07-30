import { redirect } from "next/navigation";
import { can, type Capability } from "@/lib/rbac";
import { getAuth, type AuthContext } from "@/lib/session";

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
 * 서버 컴포넌트에서 세션과 권한 맵을 얻는다.
 * 권한 맵은 버튼 표시 여부에만 쓰이고, 실제 차단은 API 계층이 다시 수행한다.
 */
export async function pageSession(): Promise<{
  auth: AuthContext;
  capabilities: Record<string, boolean>;
}> {
  const auth = await getAuth();
  if (!auth) redirect("/app/signin/");
  return {
    auth,
    capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c, can(auth.role, c)])),
  };
}
