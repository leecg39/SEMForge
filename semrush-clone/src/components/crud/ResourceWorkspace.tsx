"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientApiError, api, buildListQuery, type ListMetaShape } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { localizeResourceSpec, translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";
import type { BadgeTone, ColumnSpec, FieldSpec, ResourceSpec } from "@/types/crud";

type Row = Record<string, unknown>;

const TONE_CLASS: Record<BadgeTone, string> = {
  green: "bg-[#e6f5f0] text-[#0a6b57]",
  red: "bg-[#fdecef] text-[#a4002a]",
  orange: "bg-[#fff0e6] text-[#a34c12]",
  gray: "bg-app-bg text-app-text-secondary",
  blue: "bg-app-link-soft text-app-link",
  purple: "bg-[#f2ebfd] text-[#5b32a8]",
};

function SearchGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 text-app-text-secondary"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** 폴더 행 아이콘. 원본은 도메인 파비콘/핀 아이콘을 쓰므로 이모지 대신 SVG 를 사용한다. */
function FolderGlyph({ pinned }: { pinned: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={pinned ? "shrink-0 text-app-orange" : "shrink-0 text-app-text-secondary"}
    >
      {pinned ? (
        <>
          <path d="M12 17v5" />
          <path d="M9 10.5V4h6v6.5l2.5 3.5h-11L9 10.5Z" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
        </>
      )}
    </svg>
  );
}

/**
 * 폴더 행의 지표 스트립.
 * 라벨과 문구는 ko.semrush.com/home/ 실측값 그대로다. 값이 외부 SEO 데이터에 의존하는 항목은
 * 원본이 이 계정에서 보여주는 것과 동일하게 `n/a` 로 둔다 (숫자를 지어내지 않는다).
 */
const FOLDER_METRICS: {
  label: string;
  value?: string;
  hint?: string;
  accent?: boolean;
}[] = [
  { label: "AI 가시성", value: "n/a" },
  { label: "언급", value: "0", accent: true },
  { label: "Site Health", hint: "웹사이트 문제를 확인하세요" },
  { label: "가시성", hint: "키워드 포지션을 추적하세요" },
  { label: "자연검색 트래픽", value: "n/a" },
  { label: "자연 키워드", value: "n/a" },
  { label: "백링크", value: "n/a" },
];

function formatCell(row: Row, column: ColumnSpec, locale: "en" | "ko"): React.ReactNode {
  const value = row[column.key];
  if (value === null || value === undefined || value === "") {
    return <span className="text-app-text-secondary">{column.emptyText ?? "—"}</span>;
  }
  if (column.type === "badge") {
    const entry = column.badgeMap?.[String(value)];
    if (!entry) return String(value);
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-[4px] px-2 py-[2px] text-[12px] font-medium",
          TONE_CLASS[entry.tone]
        )}
      >
        {entry.label}
      </span>
    );
  }
  if (column.type === "date") {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: locale === "en",
    }).format(new Date(String(value)));
  }
  if (column.type === "number") {
    return Number(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-US");
  }
  if (column.type === "primary") {
    return <span className="font-semibold text-app-link">{String(value)}</span>;
  }
  return String(value);
}

function initialFormValues(spec: ResourceSpec, row?: Row): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const current = row?.[field.key];
    if (field.type === "checkbox") values[field.key] = Boolean(current);
    else if (field.type === "number")
      values[field.key] = current === null || current === undefined ? "" : String(current);
    else values[field.key] = current === null || current === undefined ? "" : String(current);
  }
  return values;
}

function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  width?: number;
}) {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="max-h-[90vh] w-full overflow-y-auto rounded-[8px] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={tx("닫기")}
            onClick={onClose}
            className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-app-border px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  readOnly,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  error?: string;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
}) {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const id = `field-${field.key}`;
  const invalid = Boolean(error);
  const inputClass = cn(
    "h-[38px] w-full rounded-[6px] border px-3 text-[14px] outline-none",
    invalid ? "border-app-red" : "border-app-border focus:border-app-link"
  );

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-[16px] w-[16px]"
        />
        {field.label}
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {field.label}
        {!field.required && (
          <span className="ml-1 text-[12px] font-normal text-app-text-secondary">
            ({tx("선택사항")})
          </span>
        )}
      </label>

      {readOnly ? (
        // 원본 규칙 R1 재현: 이미 설정된 도메인은 읽기 전용 텍스트로 표시한다.
        <p className="rounded-[6px] bg-app-bg px-3 py-2 text-[14px] text-app-text-secondary">
          {String(value) || "—"}
        </p>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          aria-invalid={invalid}
          rows={5}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-[6px] border px-3 py-2 text-[14px] outline-none",
            invalid ? "border-app-red" : "border-app-border focus:border-app-link"
          )}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={String(value ?? "")}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}

      {field.hint && !error && (
        <p className="text-[12px] text-app-text-secondary">{field.hint}</p>
      )}
      {error && <p className="text-[12px] text-app-red">{error}</p>}
    </div>
  );
}

export interface ResourceWorkspaceProps {
  spec: ResourceSpec;
  capabilities: Record<string, boolean>;
}

export function ResourceWorkspace({ spec: sourceSpec, capabilities }: ResourceWorkspaceProps) {
  const { locale } = useLocale();
  const tx = useCallback(
    (text: string) => translateAppText(locale, text) ?? text,
    [locale],
  );
  const spec = useMemo(
    () => localizeResourceSpec(sourceSpec, locale),
    [locale, sourceSpec],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<ListMetaShape | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; message: string } | null>(null);
  const [status, setStatus] = useState("");
  /**
   * 로딩 상태는 별도 state 로 두지 않고 "요청 키 != 마지막으로 반영된 키"로 파생한다.
   * effect 안에서 동기적으로 setState 하지 않으므로 연쇄 렌더가 발생하지 않는다.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(spec.sortOptions[0].value);
  const [scope, setScope] = useState<"active" | "trashed">("active");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editorRow, setEditorRow] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<{ row: Row; code: string } | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  // 원본 폴더 목록은 카드 보기가 기본이고 "테이블 보기(SEO 전용)" 스위치로 전환한다 (증거 O)
  const [tableView, setTableView] = useState(spec.view !== "folder");

  // 검색 입력은 400ms 디바운스 후 질의에 반영한다.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const query = useMemo(
    () => buildListQuery({ q, page, sort, scope, filters }),
    [q, page, sort, scope, filters]
  );

  const requestKey = `${query}#${retryToken}`;
  const loading = loadedKey !== requestKey;

  const load = useCallback(async () => {
    try {
      const response = await api.get<Row[]>(`/api/${spec.key}/${query}`);
      setRows(response.data);
      setMeta(response.meta as ListMetaShape);
      setSelected(new Set());
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ClientApiError) {
        setLoadError({ code: caught.code, message: caught.message });
      } else {
        setLoadError({ code: "INTERNAL", message: "목록을 불러오지 못했습니다." });
      }
    } finally {
      setLoadedKey(requestKey);
    }
  }, [spec.key, query, requestKey]);

  useEffect(() => {
    // load() 의 모든 setState 는 첫 await 이후에 실행되므로 동기 연쇄 렌더가 없다.
    // 린트 규칙은 정적 분석으로 이를 구분하지 못한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function openCreate() {
    setCreating(true);
    setEditorRow(null);
    setForm(initialFormValues(spec));
    setFormErrors({});
    setFormError(null);
  }

  function openEdit(row: Row) {
    setCreating(false);
    setEditorRow(row);
    setForm(initialFormValues(spec, row));
    setFormErrors({});
    setFormError(null);
    setMenuRowId(null);
  }

  function closeEditor() {
    setCreating(false);
    setEditorRow(null);
  }

  function buildPayload(isCreate: boolean) {
    const payload: Record<string, unknown> = {};
    for (const field of spec.fields) {
      if (isCreate && field.editOnly) continue;
      if (!isCreate && field.createOnly) continue;
      const raw = form[field.key];
      if (field.type === "checkbox") {
        payload[field.key] = Boolean(raw);
      } else if (field.type === "number") {
        if (raw === "" || raw === null || raw === undefined) continue;
        payload[field.key] = Number(raw);
      } else {
        const text = String(raw ?? "").trim();
        if (text === "" && !field.required) {
          if (!isCreate) payload[field.key] = null;
          continue;
        }
        payload[field.key] = text;
      }
    }
    return payload;
  }

  async function save() {
    setSaving(true);
    setFormErrors({});
    setFormError(null);
    const isCreate = creating;
    try {
      if (isCreate) {
        await api.post(`/api/${spec.key}/`, buildPayload(true));
        setStatus(`${spec.label}을(를) 만들었습니다.`);
      } else if (editorRow) {
        await api.patch(`/api/${spec.key}/${String(editorRow.id)}/`, {
          ...buildPayload(false),
          version: editorRow.version,
        });
        setStatus(`${spec.label} 정보를 저장했습니다.`);
      }
      closeEditor();
      await load();
    } catch (caught) {
      if (caught instanceof ClientApiError) {
        setFormError(caught.message);
        setFormErrors(caught.fields ?? {});
      } else {
        setFormError("저장하지 못했습니다.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmSoftDelete() {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await api.delete(`/api/${spec.key}/${String(deleteTarget.id)}/`);
      setStatus(`${spec.label}을(를) 휴지통으로 옮겼습니다.`);
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      setActionError(
        caught instanceof ClientApiError ? caught.message : "삭제하지 못했습니다."
      );
    }
  }

  async function startPurge(row: Row) {
    setActionError(null);
    setCodeInput("");
    setMenuRowId(null);
    try {
      const response = await api.post<{ code: string }>(
        `/api/${spec.key}/${String(row.id)}/confirm-code/`
      );
      setPurgeTarget({ row, code: response.data.code });
    } catch (caught) {
      setActionError(
        caught instanceof ClientApiError ? caught.message : "확인 코드를 발급하지 못했습니다."
      );
    }
  }

  async function confirmPurge() {
    if (!purgeTarget) return;
    setActionError(null);
    try {
      await api.delete(
        `/api/${spec.key}/${String(purgeTarget.row.id)}/?purge=1&code=${encodeURIComponent(codeInput)}`
      );
      setStatus(`${spec.label}을(를) 영구 삭제했습니다.`);
      setPurgeTarget(null);
      await load();
    } catch (caught) {
      setActionError(
        caught instanceof ClientApiError ? caught.message : "영구 삭제하지 못했습니다."
      );
    }
  }

  async function restore(row: Row) {
    setActionError(null);
    try {
      await api.post(`/api/${spec.key}/${String(row.id)}/restore/`);
      setStatus(`${spec.label}을(를) 복구했습니다.`);
      await load();
    } catch (caught) {
      setActionError(
        caught instanceof ClientApiError ? caught.message : "복구하지 못했습니다."
      );
    }
  }

  async function bulk(action: "delete" | "restore") {
    setActionError(null);
    try {
      const response = await api.post<{ succeeded: string[]; failed: { id: string; message: string }[] }>(
        `/api/${spec.key}/bulk/`,
        { action, ids: Array.from(selected) }
      );
      const { succeeded, failed } = response.data;
      setStatus(
        `${succeeded.length}건 처리 완료${failed.length ? `, ${failed.length}건 실패` : ""}.`
      );
      if (failed.length) setActionError(failed[0].message);
      await load();
    } catch (caught) {
      setActionError(
        caught instanceof ClientApiError ? caught.message : "일괄 작업에 실패했습니다."
      );
    }
  }

  // 생성 다이얼로그는 원본 필드 순서를 따른다.
  const orderedFields = useMemo(() => {
    if (!creating || !spec.createFieldOrder) return spec.fields;
    const order = spec.createFieldOrder;
    return [...spec.fields].sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    });
  }, [creating, spec.createFieldOrder, spec.fields]);

  const isTrash = scope === "trashed";
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const showEmptyFirstRun = !loading && !loadError && rows.length === 0 && !q && activeFilterCount === 0;
  const showNoResults = !loading && !loadError && rows.length === 0 && (Boolean(q) || activeFilterCount > 0);

  return (
    // 폴더 화면은 원본처럼 제목·버튼·목록이 하나의 흰 카드 안에 들어간다 (내부 패딩 20px).
    <div
      className={cn(
        "flex flex-col gap-4",
        spec.view === "folder" &&
          "rounded-[8px] bg-a2-card px-[20px] py-[14px] shadow-[var(--a2-card-shadow)]"
      )}
    >
      {/* 헤더 */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1
            className={cn(
              "leading-[1.3]",
              // 원본 폴더 제목: 16px / 700 / line-height 24px
              spec.view === "folder"
                ? "text-[16px] font-bold leading-[24px]"
                : "text-[20px] font-semibold"
            )}
          >
            {spec.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-app-text-secondary">
            <span
              className={cn(
                "inline-flex items-center rounded-[4px] px-1.5 py-[1px] font-semibold",
                spec.evidence === "O"
                  ? "bg-[#e6f5f0] text-[#0a6b57]"
                  : spec.evidence === "I1"
                    ? "bg-[#fff0e6] text-[#a34c12]"
                    : "bg-app-link-soft text-app-link"
              )}
            >
              {tx("증거")} {spec.evidence}
            </span>
            {spec.evidenceNote}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {capabilities.export && (
            <a
              href={`/api/${spec.key}/export/${query}`}
              className="flex h-[32px] items-center rounded-[6px] border border-app-border bg-white px-3 text-[13px] font-medium hover:bg-app-bg"
            >
              {tx("CSV 내보내기")}
            </a>
          )}
          {capabilities.create && !isTrash && (
            <button
              type="button"
              onClick={openCreate}
              className="flex h-[32px] items-center rounded-[6px] bg-[#1b1f23] px-3 text-[13px] font-medium text-white"
            >
              + {locale === "ko" ? `${spec.label} 만들기` : `Create ${spec.label}`}
            </button>
          )}
        </div>
      </div>

      {/* 필터 행 — 원본 폴더 목록의 필터 바 구성을 따른다 */}
      <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-a2-card px-3 py-2.5 shadow-[var(--a2-card-shadow)]">
        {/* 원본 필터 바의 검색 입력은 전체 폭이 아니라 260px 내외의 고정 폭이다 (증거 O) */}
        <div className="flex h-[32px] w-full max-w-[260px] items-center gap-2 rounded-[6px] border border-app-border px-2.5">
          <SearchGlyph />
          
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={spec.searchPlaceholder}
            aria-label={locale === "ko" ? `${spec.title} 검색` : `Search ${spec.title}`}
            className="h-full w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-app-text-secondary"
          />
        </div>

        {spec.filters?.map((filter) => (
          <label key={filter.key} className="flex items-center gap-1.5 text-[13px]">
            <span className="text-app-text-secondary">{filter.label}</span>
            <select
              value={filters[filter.key] ?? ""}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, [filter.key]: e.target.value }));
                setPage(1);
              }}
              className="h-[32px] rounded-[6px] border border-app-border bg-white px-2 text-[13px] outline-none"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="flex items-center gap-1.5 text-[13px]">
          <span className="text-app-text-secondary">{tx("정렬")}</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="h-[32px] rounded-[6px] border border-app-border bg-white px-2 text-[13px] outline-none"
          >
            {spec.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {spec.view === "folder" && (
          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={tableView}
              onChange={(e) => setTableView(e.target.checked)}
              className="h-[16px] w-[16px]"
            />
            <span className="text-app-text-secondary">{tx("테이블 보기(SEO 전용)")}</span>
          </label>
        )}

        <div className="flex h-[32px] items-center rounded-[6px] border border-app-border p-[2px]">
          {(
            [
              ["active", "활성"],
              ["trashed", "휴지통"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setScope(value);
                setPage(1);
              }}
              className={cn(
                "h-full rounded-[4px] px-2.5 text-[12px] font-medium",
                scope === value ? "bg-[#1b1f23] text-white" : "text-app-text-secondary"
              )}
            >
              {tx(label)}
            </button>
          ))}
        </div>
      </div>

      {/* 상태 메시지 (원본에는 없는 접근성 보강 — 제안) */}
      <p aria-live="polite" role="status" className="sr-only">
        {status}
      </p>
      {status && (
        <div className="rounded-[6px] bg-[#e6f5f0] px-3 py-2 text-[13px] text-[#0a6b57]">
          {status}
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-[6px] bg-[#fdecef] px-3 py-2 text-[13px] text-app-red">
          {actionError}
        </div>
      )}

      {/* 일괄 작업 바 (제안) */}
      {selected.size > 0 && capabilities.bulk && (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-app-link bg-app-link-soft px-3 py-2 text-[13px]">
          <span className="font-medium text-app-link">{selected.size}건 선택됨</span>
          {isTrash ? (
            <button
              type="button"
              onClick={() => bulk("restore")}
              className="rounded-[6px] border border-app-border bg-white px-2.5 py-1 font-medium"
            >
              선택 복구
            </button>
          ) : (
            <button
              type="button"
              onClick={() => bulk("delete")}
              className="rounded-[6px] border border-app-border bg-white px-2.5 py-1 font-medium text-app-red"
            >
              선택 삭제
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-app-text-secondary underline"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 목록 */}
      <div
        className={cn(
          "overflow-hidden rounded-[8px]",
          spec.view === "folder"
            ? "border-t border-black/[0.06]"
            : "bg-a2-card shadow-[var(--a2-card-shadow)]"
        )}
      >
        {loading && (
          <div className="flex flex-col gap-2 p-4">
            <p className="text-[13px] text-app-text-secondary">{tx("데이터 로드 중")}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[44px] animate-pulse rounded-[6px] bg-app-bg" />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="flex flex-col items-start gap-3 p-8">
            <p className="text-[14px] font-semibold">
              {loadError.code === "FORBIDDEN"
                ? tx("이 목록을 볼 권한이 없습니다.")
                : tx("목록을 불러오지 못했습니다.")}
            </p>
            <p className="text-[13px] text-app-text-secondary">{tx(loadError.message)}</p>
            {loadError.code !== "FORBIDDEN" && (
              <button
                type="button"
                onClick={() => setRetryToken((token) => token + 1)}
                className="rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium"
              >
                {tx("다시 시도")}
              </button>
            )}
          </div>
        )}

        {showEmptyFirstRun && (
          <div className="flex flex-col items-start gap-3 p-8">
            <p className="text-[14px] font-semibold">
              {isTrash
                ? tx("휴지통이 비어 있습니다.")
                : locale === "ko"
                  ? `아직 ${spec.label}이(가) 없습니다.`
                  : `No ${spec.label.toLowerCase()} yet.`}
            </p>
            <p className="text-[13px] text-app-text-secondary">
              {isTrash
                ? tx("삭제한 항목이 여기에 30일간 보관됩니다.")
                : locale === "ko"
                  ? `${spec.label}을(를) 만들면 목록과 지표가 표시됩니다.`
                  : `Create ${spec.label.toLowerCase()} to see the list and metrics.`}
            </p>
            {!isTrash && capabilities.create && (
              <button
                type="button"
                onClick={openCreate}
                className="rounded-[6px] bg-[#1b1f23] px-3 py-1.5 text-[13px] font-medium text-white"
              >
                + {locale === "ko" ? `${spec.label} 만들기` : `Create ${spec.label}`}
              </button>
            )}
          </div>
        )}

        {showNoResults && (
          <div className="flex flex-col items-start gap-3 p-8">
            <p className="text-[14px] font-semibold">{tx("검색 결과가 없습니다.")}</p>
            <p className="text-[13px] text-app-text-secondary">
              {tx("다른 검색어를 쓰거나 필터를 해제해 보세요.")}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setFilters({});
              }}
              className="rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium"
            >
              {tx("검색·필터 초기화")}
            </button>
          </div>
        )}

        {/* 카드 보기 — 원본 폴더 행 레이아웃(이름+도메인+kebab / 하단 지표 스트립)을 재현 */}
        {!loading && !loadError && rows.length > 0 && !tableView && (
          <ul>
            {rows.map((row) => {
              const id = String(row.id);
              const metricColumns = spec.columns.slice(2);
              return (
                <li key={id} className="border-b border-app-border last:border-b-0">
                  <div className="flex items-center gap-2 px-4 py-3">
                    {capabilities.bulk && !isTrash && (
                      <input
                        type="checkbox"
                        aria-label={`${String(row.name)} 선택`}
                        checked={selected.has(id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(id);
                          else next.delete(id);
                          setSelected(next);
                        }}
                      />
                    )}
                    <FolderGlyph pinned={Boolean(row.pinned)} />
                    <span className="whitespace-nowrap text-[16px] font-bold text-app-link">
                      {String(row.name)}
                    </span>
                    <span className="text-[13px] text-app-text-secondary">
                      {String(row.domain)}
                    </span>
                    <div className="relative ml-auto flex items-center gap-2">
                      {isTrash ? (
                        <>
                          {capabilities.restore && (
                            <button
                              type="button"
                              onClick={() => restore(row)}
                              className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium"
                            >
                              {tx("복구")}
                            </button>
                          )}
                          {capabilities.purge && (
                            <button
                              type="button"
                              onClick={() => startPurge(row)}
                              className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium text-app-red"
                            >
                              {tx("영구 삭제")}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={tx("설정")}
                            aria-haspopup="menu"
                            onClick={() => setMenuRowId(menuRowId === id ? null : id)}
                            className="h-[28px] w-[28px] rounded-[6px] text-app-text-secondary hover:bg-app-bg"
                          >
                            ⋮
                          </button>
                          {menuRowId === id && (
                            <div
                              role="menu"
                              aria-label={tx("설정")}
                              className="absolute right-0 top-[32px] z-20 w-[160px] overflow-hidden rounded-[8px] border border-app-border bg-white py-1 shadow-lg"
                            >
                              <button
                                role="menuitem"
                                type="button"
                                onClick={() => openEdit(row)}
                                className="block w-full px-3 py-2 text-left text-[13px] hover:bg-app-bg"
                              >
                                {tx("설정")}
                              </button>
                              {capabilities.delete && (
                                <button
                                  role="menuitem"
                                  type="button"
                                  onClick={() => {
                                    setDeleteTarget(row);
                                    setMenuRowId(null);
                                  }}
                                  className="block w-full border-t border-app-border px-3 py-2 text-left text-[13px] text-app-red hover:bg-app-bg"
                                >
                                  {tx("삭제")}
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {/* 지표 스트립 — 원본 8열 구성을 그대로 재현.
                      실제 SEO 데이터는 외부 의존이라 원본과 동일하게 n/a 로 표기한다. */}
                  <div className="grid grid-cols-[repeat(8,minmax(0,1fr))] gap-x-[8px] px-[20px] pb-[20px] pt-[8px] max-lg:flex max-lg:overflow-x-auto">
                    <div className="min-w-[110px]">
                      <Link
                        href="/seo/"
                        className="text-[14px] font-medium text-app-link hover:underline"
                      >
                        SEO
                      </Link>
                    </div>
                    {FOLDER_METRICS.map((metric) => (
                      <div key={metric.label} className="min-w-[110px]">
                        <p className="text-[14px] leading-[20px] text-a2-text">{tx(metric.label)}</p>
                        {metric.hint ? (
                          <p className="mt-[4px] text-[12px] leading-[16px] text-a2-value-muted">
                            {tx(metric.hint)}
                          </p>
                        ) : (
                          <p
                            className={cn(
                              "mt-[4px] text-[20px] leading-[26px]",
                              metric.accent
                                ? "font-bold text-a2-accent-purple"
                                : "font-semibold text-a2-value-muted"
                            )}
                          >
                            {metric.value}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {metricColumns.length > 0 && (
                    <div className="flex flex-wrap items-start gap-x-10 gap-y-2 border-t border-[#eef0f2] px-[20px] py-[10px]">
                      {metricColumns.map((column) => (
                        <div key={column.key} className="min-w-[110px]">
                          <p className="text-[12px] text-app-text-secondary">{column.label}</p>
                          <p className="mt-0.5 text-[13px]">{formatCell(row, column, locale)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !loadError && rows.length > 0 && tableView && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-app-border bg-[#f9fafb]">
                  {capabilities.bulk && (
                    <th className="w-[40px] px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={tx("전체 선택")}
                        checked={selected.size === rows.length && rows.length > 0}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(rows.map((r) => String(r.id)))
                              : new Set()
                          )
                        }
                      />
                    </th>
                  )}
                  {spec.columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-app-text-secondary",
                        column.align === "right" && "text-right"
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="w-[80px] px-4 py-2.5 text-right text-[12px] font-semibold uppercase text-app-text-secondary">
                    {tx("작업")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = String(row.id);
                  return (
                    <tr key={id} className="group hover:bg-[#f9fafb]">
                      {capabilities.bulk && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`${String(row[spec.columns[0].key])} 선택`}
                            checked={selected.has(id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              setSelected(next);
                            }}
                          />
                        </td>
                      )}
                      {spec.columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "border-b border-[#eef0f2] px-4 py-3 text-[13px]",
                            column.align === "right" && "text-right tabular-nums"
                          )}
                        >
                          {formatCell(row, column, locale)}
                        </td>
                      ))}
                      <td className="relative border-b border-[#eef0f2] px-4 py-3 text-right">
                        {isTrash ? (
                          <div className="flex justify-end gap-2">
                            {capabilities.restore && (
                              <button
                                type="button"
                                onClick={() => restore(row)}
                                className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium"
                              >
                                {tx("복구")}
                              </button>
                            )}
                            {capabilities.purge && (
                              <button
                                type="button"
                                onClick={() => startPurge(row)}
                                className="rounded-[6px] border border-app-border px-2 py-1 text-[12px] font-medium text-app-red"
                              >
                                {tx("영구 삭제")}
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label={tx("설정")}
                              aria-haspopup="menu"
                              onClick={() => setMenuRowId(menuRowId === id ? null : id)}
                              className="h-[28px] w-[28px] rounded-[6px] text-app-text-secondary hover:bg-app-bg"
                            >
                              ⋮
                            </button>
                            {menuRowId === id && (
                              // 원본 kebab 메뉴 순서: 공유 / 핀 고정 / 태그 / 설정 / (구분선) / 삭제
                              <div
                                role="menu"
                                aria-label={tx("설정")}
                                className="absolute right-4 top-[44px] z-20 w-[160px] overflow-hidden rounded-[8px] border border-app-border bg-white py-1 text-left shadow-lg"
                              >
                                <button
                                  role="menuitem"
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="block w-full px-3 py-2 text-left text-[13px] hover:bg-app-bg"
                                >
                                  {tx("설정")}
                                </button>
                                {capabilities.delete && (
                                  <button
                                    role="menuitem"
                                    type="button"
                                    onClick={() => {
                                      setDeleteTarget(row);
                                      setMenuRowId(null);
                                    }}
                                    className="block w-full border-t border-app-border px-3 py-2 text-left text-[13px] text-app-red hover:bg-app-bg"
                                  >
                                    {tx("삭제")}
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 페이지네이션 — 원본은 ?page= 를 사용한다 (O) */}
      {meta && meta.total > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-app-text-secondary">
            {locale === "ko"
              ? `전체 ${meta.total.toLocaleString("ko-KR")}건 · ${meta.page}/${meta.totalPages} 페이지`
              : `${meta.total.toLocaleString("en-US")} total · Page ${meta.page} of ${meta.totalPages}`}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-[30px] rounded-[6px] border border-app-border bg-white px-2.5 font-medium disabled:opacity-40"
            >
              {locale === "ko" ? "이전" : "Previous"}
            </button>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-[30px] rounded-[6px] border border-app-border bg-white px-2.5 font-medium disabled:opacity-40"
            >
              {locale === "ko" ? "다음" : "Next"}
            </button>
          </div>
        </div>
      )}

      {/* 생성 / 수정 다이얼로그 */}
      {(creating || editorRow) && (
        <Dialog
          title={
            locale === "ko"
              ? creating
                ? `${spec.label} 만들기`
                : `${spec.label} 설정`
              : creating
                ? `Create ${spec.label}`
                : `${spec.label} settings`
          }
          onClose={closeEditor}
          footer={
            <>
              {!creating && capabilities.delete && editorRow && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(editorRow);
                    closeEditor();
                  }}
                  className="mr-auto rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium text-app-red"
                >
                  {locale === "ko" ? `${spec.label} 삭제` : `Delete ${spec.label}`}
                </button>
              )}
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium"
              >
                {tx("취소")}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-[6px] bg-[#1b1f23] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {saving
                  ? tx("저장 중…")
                  : creating
                    ? locale === "ko" ? "생성" : "Create"
                    : tx("저장")}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {formError && (
              <p role="alert" className="rounded-[6px] bg-[#fdecef] px-3 py-2 text-[13px] text-app-red">
                {tx(formError)}
              </p>
            )}
            {orderedFields
              .filter((field) => (creating ? !field.editOnly : true))
              .map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={form[field.key]}
                  error={formErrors[field.key]}
                  readOnly={!creating && field.createOnly}
                  onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                />
              ))}
          </div>
        </Dialog>
      )}

      {/* 소프트 삭제 확인 (제안: 원본은 즉시 영구 삭제) */}
      {deleteTarget && (
        <Dialog
          title={locale === "ko" ? `${spec.label}을(를) 휴지통으로 이동` : `Move ${spec.label} to trash`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium"
              >
                {tx("취소")}
              </button>
              <button
                type="button"
                onClick={confirmSoftDelete}
                className="rounded-[6px] bg-app-red px-3 py-1.5 text-[13px] font-medium text-white"
              >
                {locale === "ko" ? "휴지통으로 이동" : "Move to trash"}
              </button>
            </>
          }
        >
          <p className="text-[14px]">
            {locale === "ko" ? (
              <><strong>{String(deleteTarget[spec.columns[0].key])}</strong>을(를) 휴지통으로 옮깁니다.</>
            ) : (
              <>Move <strong>{String(deleteTarget[spec.columns[0].key])}</strong> to trash.</>
            )}
          </p>
          <p className="mt-2 text-[13px] text-app-text-secondary">
            {locale === "ko"
              ? "하위 데이터도 함께 휴지통으로 이동하며, 휴지통에서 복구할 수 있습니다. 완전히 지우려면 휴지통에서 영구 삭제하세요."
              : "Related data will also move to trash and can be restored there. To remove it completely, delete it permanently from trash."}
          </p>
        </Dialog>
      )}

      {/* 영구 삭제 확인 — 원본 폴더 삭제의 코드 입력 UX를 재현 (증거 O) */}
      {purgeTarget && (
        <Dialog
          title={locale === "ko" ? `${spec.label} 영구 삭제` : `Delete ${spec.label} permanently`}
          onClose={() => setPurgeTarget(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setPurgeTarget(null)}
                className="rounded-[6px] border border-app-border px-3 py-1.5 text-[13px] font-medium"
              >
                {tx("취소")}
              </button>
              <button
                type="button"
                onClick={confirmPurge}
                disabled={codeInput.trim() !== purgeTarget.code}
                className="rounded-[6px] bg-app-red px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                {tx("삭제")}
              </button>
            </>
          }
        >
          <p className="text-[14px]">
            {locale === "ko" ? (
              <><strong>{String(purgeTarget.row[spec.columns[0].key])}</strong> 및 연결된 모든 데이터가 삭제됩니다.</>
            ) : (
              <><strong>{String(purgeTarget.row[spec.columns[0].key])}</strong> and all related data will be deleted.</>
            )}
          </p>
          <p className="mt-3 text-[13px] text-app-text-secondary">
            {locale === "ko"
              ? "다음 도구에 연결된 데이터가 없는지 확인하세요."
              : "Make sure no data is connected to the following tools."}
          </p>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-app-text-secondary">
            <li>SEO 프로젝트</li>
            <li>{tx("트래픽 & 시장")}</li>
            <li>{tx("소셜")}</li>
            <li>{tx("콘텐츠")}</li>
            <li>{tx("광고")}</li>
          </ul>
          <label className="mt-4 block text-[13px] font-medium">
            {locale === "ko" ? "삭제를 계속 진행하려면 이 코드 입력: " : "Enter this code to continue: "}
            <span className="font-mono text-[15px] tracking-[0.1em]">{purgeTarget.code}</span>
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              inputMode="numeric"
              className="mt-1.5 h-[38px] w-full rounded-[6px] border border-app-border px-3 text-[14px] outline-none focus:border-app-link"
            />
          </label>
        </Dialog>
      )}
    </div>
  );
}
