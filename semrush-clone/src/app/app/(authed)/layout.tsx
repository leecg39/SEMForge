import { redirect } from "next/navigation";
import { CrudShell, type SessionInfo } from "@/components/crud/CrudShell";
import { can, ROLE_LABELS, type Capability } from "@/lib/rbac";
import { getAuth } from "@/lib/session";

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

/** 인증이 필요한 CRUD 앱 영역. 세션이 없으면 로그인으로 보낸다. */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuth();
  if (!auth) redirect("/app/signin/");

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
      CAPABILITIES.map((c) => [c, can(auth.role, c)])
    ),
  };

  return <CrudShell session={session}>{children}</CrudShell>;
}
