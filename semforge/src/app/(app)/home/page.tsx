import { redirect } from "next/navigation";
import { CrudShell, type SessionInfo } from "@/components/crud/CrudShell";
import { FolderWorkspace } from "@/components/crud/FolderWorkspace";
import { folderSpec } from "@/data/crud/specs";
import { can, ROLE_LABELS, type Capability } from "@/lib/rbac";
import { getAuth } from "@/lib/session";

export const metadata = { title: "SEMForge Folders: Take control of your data" };

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
 * 앱 홈 (폴더).
 *
 * 원본 동작(증거 O): 비로그인 상태로 `/home/` 에 접근하면 공개 홈으로 리다이렉트된다.
 * 로그인 상태에서는 폴더 목록을 보여준다. 이 클론도 같은 경로에서 같은 분기를 수행한다.
 */
export default async function AppHomePage() {
  const auth = await getAuth();
  if (!auth) redirect("/");

  const session: SessionInfo = {
    user: { id: auth.userId, email: auth.email, name: auth.name },
    workspace: {
      id: auth.workspaceId,
      name: auth.workspaceName,
      plan: auth.workspacePlan,
    },
    role: auth.role,
    roleLabel: ROLE_LABELS[auth.role],
    capabilities: Object.fromEntries(
      CAPABILITIES.map((capability) => [capability, can(auth.role, capability)])
    ),
  };

  return (
    <CrudShell session={session}>
      <FolderWorkspace
        spec={folderSpec}
        capabilities={session.capabilities}
      />
    </CrudShell>
  );
}
