"use client";

import { useCallback, useEffect, useState } from "react";
import { ClientApiError, api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface TrashItem {
  id: string;
  label: string | null;
  deletedAt: string;
  deletedBy: string | null;
  createdBy: string | null;
  resource: string;
  resourceLabel: string;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * 휴지통 (제안 기능).
 * 원본 Semrush 에는 휴지통·복구 UI가 존재하지 않고 폴더 삭제가 곧 영구 삭제였다(증거 I1).
 * 데이터 손실을 막기 위해 재구축에서 추가한 화면이다.
 */
export function TrashWorkspace({
  capabilities,
}: {
  capabilities: Record<string, boolean>;
}) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [type, setType] = useState("");
  /** 로딩은 요청 키와 반영된 키의 차이로 파생한다 (effect 내 동기 setState 회피). */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<{ item: TrashItem; code: string } | null>(null);
  const [codeInput, setCodeInput] = useState("");

  const requestKey = `${type}#${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const load = useCallback(async () => {
    try {
      const response = await api.get<TrashItem[]>(
        `/api/trash/${type ? `?type=${type}` : ""}`
      );
      setItems(response.data);
      const meta = response.meta as { counts?: Record<string, number> } | undefined;
      setCounts(meta?.counts ?? {});
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ClientApiError ? caught.message : "휴지통을 불러오지 못했습니다."
      );
    } finally {
      setLoadedKey(requestKey);
    }
  }, [type, requestKey]);

  useEffect(() => {
    // setState 는 모두 첫 await 이후에 실행된다 (동기 연쇄 렌더 없음).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const reload = () => setReloadToken((token) => token + 1);

  async function restore(item: TrashItem) {
    setError(null);
    try {
      await api.post(`/api/${item.resource}/${item.id}/restore/`);
      setStatus(`${item.resourceLabel} "${item.label}"을(를) 복구했습니다.`);
      reload();
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "복구하지 못했습니다.");
    }
  }

  async function startPurge(item: TrashItem) {
    setError(null);
    setCodeInput("");
    try {
      const response = await api.post<{ code: string }>(
        `/api/${item.resource}/${item.id}/confirm-code/`
      );
      setPurgeTarget({ item, code: response.data.code });
    } catch (caught) {
      setError(
        caught instanceof ClientApiError ? caught.message : "확인 코드를 발급하지 못했습니다."
      );
    }
  }

  async function confirmPurge() {
    if (!purgeTarget) return;
    setError(null);
    try {
      await api.delete(
        `/api/${purgeTarget.item.resource}/${purgeTarget.item.id}/?purge=1&code=${encodeURIComponent(codeInput)}`
      );
      setStatus(`"${purgeTarget.item.label}"을(를) 영구 삭제했습니다.`);
      setPurgeTarget(null);
      reload();
    } catch (caught) {
      setError(
        caught instanceof ClientApiError ? caught.message : "영구 삭제하지 못했습니다."
      );
    }
  }

  const typeOptions = Object.entries(counts).filter(([, count]) => count > 0);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-[20px] font-semibold">휴지통</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-app-link-soft px-1.5 py-[1px] font-semibold text-app-link">
            증거 P
          </span>
          원본에는 없는 기능입니다. 원본 폴더 삭제는 복구 경로 없이 즉시 영구 삭제였습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-app-border bg-white px-3 py-2.5 text-[13px]">
        <span className="text-app-text-secondary">유형</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-[32px] rounded-[6px] border border-app-border bg-white px-2 outline-none"
        >
          <option value="">전체</option>
          {typeOptions.map(([key, count]) => (
            <option key={key} value={key}>
              {key} ({count})
            </option>
          ))}
        </select>
        <span className="ml-auto text-app-text-secondary">{items.length}건</span>
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
        {loading ? (
          <div className="p-4 text-[13px] text-app-text-secondary">데이터 로드 중</div>
        ) : items.length === 0 ? (
          <div className="p-8">
            <p className="text-[14px] font-semibold">휴지통이 비어 있습니다.</p>
            <p className="mt-1 text-[13px] text-app-text-secondary">
              삭제한 항목이 여기에 모입니다.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-app-border bg-[#f9fafb]">
                {["유형", "이름", "삭제 시각", "작업"].map((label, index) => (
                  <th
                    key={label}
                    className={cn(
                      "px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-app-text-secondary",
                      index === 3 && "text-right"
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.resource}-${item.id}`} className="hover:bg-[#f9fafb]">
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] text-app-text-secondary">
                    {item.resourceLabel}
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] font-medium">
                    {item.label ?? "—"}
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                    {dateFormatter.format(new Date(item.deletedAt))}
                  </td>
                  <td className="border-b border-[#eef0f2] px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {capabilities.restore && (
                        <button
                          type="button"
                          onClick={() => restore(item)}
                          className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium"
                        >
                          복구
                        </button>
                      )}
                      {capabilities.purge && (
                        <button
                          type="button"
                          onClick={() => startPurge(item)}
                          className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium text-app-red"
                        >
                          영구 삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {purgeTarget && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPurgeTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="영구 삭제"
            className="w-full max-w-[460px] rounded-[8px] bg-white shadow-xl"
          >
            <div className="border-b border-app-border px-5 py-4">
              <h2 className="text-[16px] font-semibold">영구 삭제</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-[14px]">
                <strong>{purgeTarget.item.label}</strong> 및 연결된 모든 데이터가 삭제됩니다
              </p>
              <p className="mt-2 text-[13px] text-app-text-secondary">
                이 작업은 되돌릴 수 없습니다.
              </p>
              <label className="mt-4 block text-[13px] font-medium">
                삭제를 계속 진행하려면 이 코드 입력:{" "}
                <span className="font-mono text-[15px] tracking-[0.1em]">
                  {purgeTarget.code}
                </span>
                <input
                  type="text"
                  value={codeInput}
                  inputMode="numeric"
                  onChange={(e) => setCodeInput(e.target.value)}
                  className="mt-1.5 h-[38px] w-full rounded-[6px] border border-app-border px-3 text-[14px] outline-none focus:border-app-link"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-app-border px-5 py-4">
              <button
                type="button"
                onClick={() => setPurgeTarget(null)}
                className="rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmPurge}
                disabled={codeInput.trim() !== purgeTarget.code}
                className="rounded-[6px] bg-app-red px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
