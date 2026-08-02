"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import type {
  CampaignTagSummary,
  CampaignTagWorkspace,
} from "@/server/position-tracking/tags-store";

interface TagsPanelProps {
  campaignId: string;
  canEdit: boolean;
}

interface MutationState {
  key: string;
  message: string | null;
}

const DEFAULT_COLOR = "#235FE2";
const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${NUMBER_FORMATTER.format(value)}${suffix}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ClientApiError ? error.message : fallback;
}

function TagMetrics({ tag }: { tag: CampaignTagSummary }) {
  const metrics = [
    ["키워드", tag.keywordCount],
    ["순위 있음", tag.rankedCount],
    ["평균 순위", tag.averagePosition],
    ["상위 3", tag.top3],
    ["상위 10", tag.top10],
    ["가시성", tag.visibility, "%"],
  ] as const;

  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {metrics.map(([label, value, suffix]) => (
        <div key={label} className="rounded-[8px] bg-app-bg px-3 py-2">
          <dt className="text-[11px] text-app-text-secondary">{label}</dt>
          <dd className="mt-0.5 text-[16px] font-semibold tabular-nums text-app-text">
            {formatMetric(value, suffix)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TagCard({
  tag,
  workspace,
  canEdit,
  busy,
  disabled,
  onSave,
  onDelete,
}: {
  tag: CampaignTagSummary;
  workspace: CampaignTagWorkspace;
  canEdit: boolean;
  busy: boolean;
  disabled: boolean;
  onSave: (input: {
    tagId: string;
    name: string;
    color: string;
    keywordIds: string[];
  }) => Promise<void>;
  onDelete: (tagId: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [keywordIds, setKeywordIds] = useState(() => new Set(tag.keywordIds));

  const toggleKeyword = (keywordId: string) => {
    setKeywordIds((current) => {
      const next = new Set(current);
      if (next.has(keywordId)) next.delete(keywordId);
      else next.add(keywordId);
      return next;
    });
  };

  return (
    <li className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: tag.color }}
          aria-hidden="true"
        />
        {canEdit ? (
          <>
            <label className="min-w-[180px] flex-1">
              <span className="sr-only">태그 이름</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={30}
                className="h-[36px] w-full rounded-[8px] border border-app-border px-3 text-[13px] font-medium text-app-text"
              />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-app-text-secondary">
              색상
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value.toUpperCase())}
                className="h-[36px] w-[44px] cursor-pointer rounded-[6px] border border-app-border bg-white p-1"
              />
            </label>
            <button
              type="button"
              disabled={disabled || name.trim().length === 0}
              onClick={() =>
                void onSave({
                  tagId: tag.id,
                  name,
                  color,
                  keywordIds: [...keywordIds],
                })
              }
              className="h-[36px] rounded-[8px] bg-app-blue px-4 text-[13px] font-medium text-white hover:bg-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "저장 중…" : "변경사항 저장"}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onDelete(tag.id, tag.name)}
              className="h-[36px] rounded-[8px] border border-[#f5c2cd] px-3 text-[13px] font-medium text-app-red hover:bg-[#fdecef] disabled:cursor-not-allowed disabled:opacity-60"
            >
              삭제
            </button>
          </>
        ) : (
          <h3 className="text-[14px] font-semibold text-app-text">{tag.name}</h3>
        )}
      </div>

      <TagMetrics tag={tag} />

      <fieldset className="mt-4">
        <legend className="text-[12px] font-medium text-app-text-secondary">
          연결 키워드 {keywordIds.size}/{workspace.keywords.length}
        </legend>
        {workspace.keywords.length === 0 ? (
          <p className="mt-2 text-[12px] text-app-text-secondary">
            이 캠페인에 추적 키워드가 없습니다.
          </p>
        ) : (
          <div className="mt-2 grid max-h-[220px] gap-2 overflow-y-auto rounded-[8px] border border-app-border p-3 sm:grid-cols-2 xl:grid-cols-3">
            {workspace.keywords.map((keyword) => (
              <label
                key={keyword.id}
                className="flex min-w-0 items-center gap-2 text-[13px] text-app-text"
              >
                <input
                  type="checkbox"
                  checked={keywordIds.has(keyword.id)}
                  disabled={!canEdit || disabled}
                  onChange={() => toggleKeyword(keyword.id)}
                  className="h-4 w-4 rounded border-app-border text-app-blue"
                />
                <span className="min-w-0 flex-1 truncate">{keyword.keyword}</span>
                <span className="shrink-0 tabular-nums text-[12px] text-app-text-secondary">
                  {keyword.position === null ? "순위권 밖" : `${keyword.position}위`}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </li>
  );
}

/** 캠페인 키워드를 태그로 묶고 실제 순위 기반 그룹 실적을 관리한다. */
export function TagsPanel({ campaignId, canEdit }: TagsPanelProps) {
  const requestId = useRef(0);
  const [workspace, setWorkspace] = useState<CampaignTagWorkspace | null>(null);
  const [loadFailure, setLoadFailure] = useState<{
    campaignId: string;
    message: string;
  } | null>(null);
  const [mutation, setMutation] = useState<MutationState | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const mutating = mutation !== null && mutation.message === null;

  const load = useCallback(async () => {
    const activeRequest = ++requestId.current;
    try {
      const response = await api.get<CampaignTagWorkspace>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/tags/`,
      );
      if (activeRequest !== requestId.current) return;
      setWorkspace(response.data);
      setLoadFailure(null);
    } catch (error) {
      if (activeRequest !== requestId.current) return;
      setWorkspace(null);
      setLoadFailure({
        campaignId,
        message: errorMessage(error, "태그를 불러오지 못했습니다."),
      });
    }
  }, [campaignId]);

  useEffect(() => {
    // load()의 상태 변경은 네트워크 요청의 첫 await 이후에만 실행된다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const createTag = async () => {
    const nextName = name.trim();
    if (!nextName || mutating) return;
    setMutation({ key: "create", message: null });
    try {
      const response = await api.post<CampaignTagWorkspace>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/tags/`,
        { name: nextName, color },
      );
      setWorkspace(response.data);
      setName("");
      setMutation(null);
    } catch (error) {
      setMutation({
        key: "create",
        message: errorMessage(error, "태그를 만들지 못했습니다."),
      });
    }
  };

  const saveTag = async (input: {
    tagId: string;
    name: string;
    color: string;
    keywordIds: string[];
  }) => {
    if (mutating) return;
    setMutation({ key: input.tagId, message: null });
    try {
      const response = await api.patch<CampaignTagWorkspace>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/tags/`,
        input,
      );
      setWorkspace(response.data);
      setMutation(null);
    } catch (error) {
      setMutation({
        key: input.tagId,
        message: errorMessage(error, "태그를 저장하지 못했습니다."),
      });
    }
  };

  const removeTag = async (tagId: string, tagName: string) => {
    if (mutating) return;
    if (!window.confirm(`‘${tagName}’ 태그를 삭제할까요? 키워드는 삭제되지 않습니다.`)) {
      return;
    }
    setMutation({ key: tagId, message: null });
    try {
      const response = await api.delete<CampaignTagWorkspace>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/tags/?tagId=${encodeURIComponent(tagId)}`,
      );
      setWorkspace(response.data);
      setMutation(null);
    } catch (error) {
      setMutation({
        key: tagId,
        message: errorMessage(error, "태그를 삭제하지 못했습니다."),
      });
    }
  };

  const loading = workspace?.campaignId !== campaignId && loadFailure?.campaignId !== campaignId;
  const failure = loadFailure?.campaignId === campaignId ? loadFailure.message : null;

  return (
    <section className="rounded-[10px] border border-app-border bg-app-bg p-4 sm:p-5">
      <div>
        <h2 className="text-[16px] font-semibold text-app-text">키워드 태그</h2>
        <p className="mt-1 text-[13px] leading-5 text-app-text-secondary">
          관련 키워드를 그룹으로 묶고 평균 순위, 상위권 키워드와 가시성을 확인하세요.
        </p>
      </div>

      {canEdit && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2 rounded-[10px] border border-app-border bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createTag();
          }}
        >
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block text-[12px] font-medium text-app-text-secondary">
              새 태그 이름
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={30}
              placeholder="예: 브랜드 키워드"
              className="h-[38px] w-full rounded-[8px] border border-app-border px-3 text-[13px] text-app-text"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-app-text-secondary">
            색상
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value.toUpperCase())}
              className="h-[38px] w-[48px] cursor-pointer rounded-[6px] border border-app-border bg-white p-1"
            />
          </label>
          <button
            type="submit"
            disabled={mutating || name.trim().length === 0}
            className="h-[38px] rounded-[8px] bg-app-blue px-5 text-[13px] font-medium text-white hover:bg-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutating && mutation.key === "create" ? "추가 중…" : "태그 추가"}
          </button>
        </form>
      )}

      {mutation?.message && (
        <p className="mt-3 text-[13px] text-app-red" role="alert">
          {mutation.message}
        </p>
      )}

      {loading && (
        <p className="mt-4 rounded-[10px] border border-app-border bg-white p-5 text-[13px] text-app-text-secondary" role="status">
          태그를 불러오는 중…
        </p>
      )}

      {failure && (
        <div className="mt-4 rounded-[10px] border border-[#f5c2cd] bg-white p-5">
          <p className="text-[13px] text-app-red" role="alert">{failure}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 h-[34px] rounded-[8px] border border-app-border px-3 text-[12px] font-medium text-app-text"
          >
            다시 시도
          </button>
        </div>
      )}

      {workspace?.campaignId === campaignId && workspace.tags.length === 0 && (
        <div className="mt-4 rounded-[10px] border border-dashed border-app-border bg-white px-5 py-10 text-center">
          <h3 className="text-[15px] font-semibold text-app-text">첫 번째 태그 추가하기</h3>
          <p className="mt-2 text-[13px] text-app-text-secondary">
            태그를 사용하면 키워드 그룹의 실적을 추적하는 데 도움됩니다
          </p>
        </div>
      )}

      {workspace?.campaignId === campaignId && workspace.tags.length > 0 && (
        <ul className="mt-4 space-y-3">
          {workspace.tags.map((tag) => (
            <TagCard
              key={`${tag.id}:${tag.name}:${tag.color}:${tag.keywordIds.join(",")}`}
              tag={tag}
              workspace={workspace}
              canEdit={canEdit}
              busy={mutating && mutation.key === tag.id}
              disabled={mutating}
              onSave={saveTag}
              onDelete={removeTag}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
