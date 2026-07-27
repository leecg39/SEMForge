"use client";

import { useCallback, useEffect, useState } from "react";
import { ClientApiError, api } from "@/lib/client-api";

interface Member {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
  lastLoginAt: string | null;
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

const ROLE_OPTIONS: { value: Member["role"]; label: string }[] = [
  { value: "owner", label: "소유자" },
  { value: "admin", label: "관리자" },
  { value: "editor", label: "편집자" },
  { value: "viewer", label: "조회자" },
];

const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
});

export function MembersManager({
  currentRole,
  currentUserId,
}: {
  currentRole: string;
  currentUserId: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  /** 로딩은 요청 키와 반영된 키의 차이로 파생한다 (effect 내 동기 setState 회피). */
  const [loadedToken, setLoadedToken] = useState(-1);
  const [reloadToken, setReloadToken] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Member["role"]>("viewer");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const loading = loadedToken !== reloadToken;

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ members: Member[]; invitations: Invitation[] }>(
        "/api/members/"
      );
      setMembers(response.data.members);
      setInvitations(response.data.invitations);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ClientApiError ? caught.message : "멤버를 불러오지 못했습니다."
      );
    } finally {
      setLoadedToken(reloadToken);
    }
  }, [reloadToken]);

  useEffect(() => {
    // setState 는 모두 첫 await 이후에 실행된다 (동기 연쇄 렌더 없음).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const reload = () => setReloadToken((token) => token + 1);

  async function invite() {
    setInviteError(null);
    setInviteUrl(null);
    try {
      const response = await api.post<{ inviteUrl: string }>("/api/members/", {
        email: inviteEmail,
        role: inviteRole,
      });
      setStatus(`${inviteEmail} 에게 초대를 만들었습니다.`);
      setInviteUrl(response.data.inviteUrl);
      setInviteEmail("");
      reload();
    } catch (caught) {
      setInviteError(
        caught instanceof ClientApiError
          ? (caught.fields?.email ?? caught.message)
          : "초대하지 못했습니다."
      );
    }
  }

  async function changeRole(member: Member, role: Member["role"]) {
    setError(null);
    try {
      await api.patch(`/api/members/${member.id}/`, { role });
      setStatus(`${member.email} 역할을 변경했습니다.`);
      reload();
    } catch (caught) {
      setError(
        caught instanceof ClientApiError ? caught.message : "역할을 변경하지 못했습니다."
      );
    }
  }

  async function remove(member: Member) {
    setError(null);
    try {
      await api.delete(`/api/members/${member.id}/`);
      setStatus(`${member.email} 을(를) 워크스페이스에서 제거했습니다.`);
      reload();
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "제거하지 못했습니다.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[8px] border border-app-border bg-white p-5">
        <h2 className="text-[14px] font-semibold">사용자 초대</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-[13px] font-medium">
              이메일
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              placeholder="teammate@example.com"
              aria-invalid={Boolean(inviteError)}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="h-[38px] rounded-[6px] border border-app-border px-3 text-[14px] outline-none focus:border-app-link"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-role" className="text-[13px] font-medium">
              역할
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Member["role"])}
              className="h-[38px] rounded-[6px] border border-app-border bg-white px-2 text-[14px] outline-none"
            >
              {ROLE_OPTIONS.filter((option) =>
                option.value === "owner" ? currentRole === "owner" : true
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={invite}
            disabled={!inviteEmail}
            className="h-[38px] rounded-[6px] bg-[#1b1f23] px-3 text-[13px] font-medium text-white disabled:opacity-40"
          >
            사용자 초대
          </button>
        </div>
        {inviteError && <p className="mt-2 text-[12px] text-app-red">{inviteError}</p>}
        {inviteUrl && (
          <p className="mt-2 rounded-[6px] bg-app-bg px-3 py-2 text-[12px] text-app-text-secondary">
            메일 발송은 구현 범위 밖입니다. 초대 링크: <code>{inviteUrl}</code>
          </p>
        )}
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {status}
      </p>
      {status && (
        <div className="rounded-[6px] bg-[#e6f5f0] px-3 py-2 text-[13px] text-[#0a6b57]">
          {status}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-[6px] bg-[#fdecef] px-3 py-2 text-[13px] text-app-red">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-[8px] border border-app-border bg-white">
        <h2 className="border-b border-app-border px-5 py-3 text-[14px] font-semibold">
          멤버 {members.length}명
        </h2>
        {loading ? (
          <p className="px-5 py-4 text-[13px] text-app-text-secondary">데이터 로드 중</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-app-border bg-[#f9fafb]">
                {["이름", "이메일", "역할", "가입", "작업"].map((label, index) => (
                  <th
                    key={label}
                    className={`px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-app-text-secondary ${
                      index === 4 ? "text-right" : ""
                    }`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-[#f9fafb]">
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] font-medium">
                    {member.name}
                    {member.userId === currentUserId && (
                      <span className="ml-2 rounded-[4px] bg-app-bg px-1.5 py-[1px] text-[11px] text-app-text-secondary">
                        나
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                    {member.email}
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                    <select
                      value={member.role}
                      aria-label={`${member.email} 역할`}
                      onChange={(e) => changeRole(member, e.target.value as Member["role"])}
                      className="h-[30px] rounded-[6px] border border-app-border bg-white px-2 text-[13px]"
                    >
                      {ROLE_OPTIONS.filter((option) =>
                        option.value === "owner" ? currentRole === "owner" : true
                      ).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] text-app-text-secondary">
                    {formatter.format(new Date(member.joinedAt))}
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(member)}
                      disabled={member.userId === currentUserId}
                      className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium text-app-red disabled:opacity-40"
                    >
                      제거
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invitations.length > 0 && (
        <div className="overflow-hidden rounded-[8px] border border-app-border bg-white">
          <h2 className="border-b border-app-border px-5 py-3 text-[14px] font-semibold">
            대기 중인 초대 {invitations.length}건
          </h2>
          <ul>
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-3 border-b border-[#eef0f2] px-5 py-3 text-[13px] last:border-b-0"
              >
                <span className="font-medium">{invitation.email}</span>
                <span className="text-app-text-secondary">{invitation.role}</span>
                <span className="ml-auto text-[12px] text-app-text-secondary">
                  만료 {formatter.format(new Date(invitation.expiresAt))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
