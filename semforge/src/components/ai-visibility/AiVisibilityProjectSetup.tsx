"use client";

import { useRef, useState } from "react";
import type { AiVisibilityProvider } from "@/db/schema";
import { api, ClientApiError } from "@/lib/client-api";
import type { AiVisibilitySettingsView } from "@/server/ai-visibility/projects";

export interface AiVisibilityPromptRow {
  id: string;
  prompt: string;
  topic: string;
  source: "manual" | "csv" | "position_tracking" | "legacy";
  enabled: boolean;
}

const PROVIDERS: { key: AiVisibilityProvider; label: string }[] = [
  { key: "google_aio", label: "Google AI 개요" },
  { key: "chatgpt_web", label: "ChatGPT 웹 검색" },
  { key: "gemini_grounded", label: "Gemini 검색 그라운딩" },
];

const CARD = "rounded-[10px] border border-[#e4e6eb] bg-white shadow-[0_1px_2px_rgba(20,28,45,0.03)]";
const BUTTON = "inline-flex h-9 items-center justify-center rounded-[6px] border border-[#d8dbe2] bg-white px-3 text-[13px] font-medium text-[#30343b] transition hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "inline-flex h-9 items-center justify-center rounded-[6px] bg-[#17191c] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b7bac1]";

function message(error: unknown, fallback: string) {
  return error instanceof ClientApiError ? error.message : fallback;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

export function AiVisibilityPromptManager({
  fid,
  prompts,
  limit,
  onChanged,
}: {
  fid: string;
  prompts: AiVisibilityPromptRow[];
  limit: number;
  onChanged: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (rows: { prompt: string; topic?: string }[], source: "manual" | "csv") => {
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`, { mode: "prompts", source, prompts: rows });
      setValue("");
      setTopic("");
      await onChanged();
    } catch (cause) {
      setError(message(cause, "프롬프트를 추가하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
    const parsed = lines.map(splitCsvLine);
    const hasHeader = parsed[0]?.some((cell) => /prompt|프롬프트|topic|주제/i.test(cell));
    const header = hasHeader ? parsed.shift()!.map((cell) => cell.toLocaleLowerCase()) : [];
    const promptIndex = Math.max(0, header.findIndex((cell) => /prompt|프롬프트/.test(cell)));
    const topicIndex = header.findIndex((cell) => /topic|주제/.test(cell));
    await submit(parsed.map((row) => ({
      prompt: row[promptIndex] ?? "",
      topic: topicIndex >= 0 ? row[topicIndex] : undefined,
    })).filter((row) => row.prompt), "csv");
  };

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#292d34]">추적 프롬프트</h2>
          <p className="mt-1 text-[11px] text-[#767d87]">중복을 정규화해 제거하며 프로젝트당 최대 {limit}개입니다. 현재 {prompts.length}개</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={BUTTON} disabled={busy || prompts.length >= limit} onClick={async () => {
            setBusy(true); setError(null);
            try {
              await api.post(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`, { mode: "position_tracking" });
              await onChanged();
            } catch (cause) {
              setError(message(cause, "포지션 추적 키워드를 가져오지 못했습니다."));
            } finally {
              setBusy(false);
            }
          }}>포지션 추적에서 가져오기</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = "";
          }} />
          <button className={BUTTON} disabled={busy || prompts.length >= limit} onClick={() => fileRef.current?.click()}>CSV 업로드</button>
        </div>
      </div>
      {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={2} placeholder="프롬프트를 줄바꿈으로 입력" className="rounded-[6px] border border-[#d9dce2] px-3 py-2 text-[12px] outline-none focus:border-[#6b6de3]" />
        <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="주제 태그 (선택)" className="h-10 rounded-[6px] border border-[#d9dce2] px-3 text-[12px] outline-none focus:border-[#6b6de3]" />
        <button className={PRIMARY} disabled={busy || !value.trim() || prompts.length >= limit} onClick={() => void submit(
          value.split(/\r?\n/).map((prompt) => ({ prompt, topic })).filter((row) => row.prompt.trim()),
          "manual",
        )}>추가</button>
      </div>
      {prompts.length > 0 && (
        <div className="mt-4 max-h-[260px] divide-y divide-[#eceef1] overflow-y-auto border-t border-[#eceef1]">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="flex items-center gap-3 py-2.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-[#3c4149]">{prompt.prompt}</span>
              <span className="rounded bg-[#f0f2f5] px-2 py-0.5 text-[10px] text-[#68707a]">{prompt.topic}</span>
              <span className="hidden text-[10px] text-[#9297a0] sm:inline">{prompt.source}</span>
              <button className="text-[11px] text-[#cc4d4d] hover:underline" onClick={async () => {
                await api.delete(`/api/ai-visibility/prompts/${prompt.id}/?fid=${encodeURIComponent(fid)}`);
                await onChanged();
              }}>삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiVisibilitySettingsPanel({
  settings,
  onSaved,
}: {
  settings: AiVisibilitySettingsView;
  onSaved: () => Promise<void>;
}) {
  const project = settings.project;
  const [brandName, setBrandName] = useState(project?.brandName ?? settings.defaults.brandName);
  const [aliases, setAliases] = useState((project?.brandAliases ?? []).join(", "));
  const [providers, setProviders] = useState<AiVisibilityProvider[]>(project?.providers ?? settings.defaults.providers);
  const [locations, setLocations] = useState<string[]>(project?.locationKeys ?? settings.defaults.locationKeys);
  const [schedule, setSchedule] = useState<"off" | "weekly">(project?.schedule ?? settings.defaults.schedule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleProvider = (provider: AiVisibilityProvider) => {
    setProviders((current) => current.includes(provider)
      ? current.filter((item) => item !== provider)
      : [...current, provider]);
  };
  const toggleLocation = (key: string) => {
    setLocations((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : current.length < settings.limits.scopes ? [...current, key] : current);
  };

  return (
    <div className={`${CARD} p-6`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7770d8]">프로젝트 설정</p>
        <h2 className="mt-1 text-[20px] font-semibold text-[#252930]">{project ? "AI 가시성 설정" : `${settings.folder.name} 측정을 시작하세요`}</h2>
        <p className="mt-1 text-[12px] text-[#737a85]">브랜드, 실제 수집 플랫폼, 대표 국가를 지정합니다. 키가 없는 플랫폼은 선택할 수 없습니다.</p>
      </div>
      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <label className="text-[12px] font-medium text-[#4e555f]">브랜드명
          <input value={brandName} onChange={(event) => setBrandName(event.target.value)} className="mt-1.5 h-10 w-full rounded-[6px] border border-[#d9dce2] px-3 font-normal outline-none focus:border-[#6b6de3]" />
        </label>
        <label className="text-[12px] font-medium text-[#4e555f]">브랜드 별칭 (쉼표 구분, 최대 {settings.limits.aliases}개)
          <input value={aliases} onChange={(event) => setAliases(event.target.value)} className="mt-1.5 h-10 w-full rounded-[6px] border border-[#d9dce2] px-3 font-normal outline-none focus:border-[#6b6de3]" />
        </label>
        <fieldset>
          <legend className="text-[12px] font-medium text-[#4e555f]">AI 플랫폼</legend>
          <div className="mt-2 space-y-2">
            {PROVIDERS.map((provider) => {
              const capability = settings.capabilities.providers[provider.key];
              return (
                <label key={provider.key} className={`flex items-start gap-2 rounded-[6px] border px-3 py-2.5 ${capability.enabled ? "border-[#e0e2e7]" : "border-[#ececee] bg-[#fafafa] text-[#9297a0]"}`}>
                  <input type="checkbox" checked={providers.includes(provider.key)} disabled={!capability.enabled} onChange={() => toggleProvider(provider.key)} className="mt-0.5" />
                  <span className="text-[12px]"><b className="font-medium">{provider.label}</b>{!capability.enabled && <span className="mt-0.5 block text-[10px]">{capability.reason}</span>}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[12px] font-medium text-[#4e555f]">국가 (최대 {settings.limits.scopes}개)</legend>
          <div className="mt-2 max-h-[172px] space-y-1.5 overflow-y-auto rounded-[6px] border border-[#e0e2e7] p-2">
            {settings.locations.map((location) => {
              const sameCountrySelected = locations.some((key) =>
                settings.locations.find((item) => item.key === key)?.countryCode === location.countryCode && key !== location.key
              );
              return (
                <label key={location.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-[#f6f7f9]">
                  <input type="checkbox" checked={locations.includes(location.key)} disabled={!locations.includes(location.key) && (locations.length >= settings.limits.scopes || sameCountrySelected)} onChange={() => toggleLocation(location.key)} />
                  <span>{location.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceef1] pt-4">
        <label className="flex items-center gap-2 text-[12px] text-[#525963]">
          자동 수집
          <select value={schedule} onChange={(event) => setSchedule(event.target.value as "off" | "weekly")} className="h-9 rounded-[6px] border border-[#d9dce2] bg-white px-2">
            <option value="weekly">매주</option><option value="off">사용 안 함</option>
          </select>
        </label>
        <button className={PRIMARY} disabled={busy || !brandName.trim() || providers.length === 0 || locations.length === 0} onClick={async () => {
          setBusy(true); setError(null);
          try {
            await api.put(`/api/ai-visibility/settings/?fid=${encodeURIComponent(settings.folder.id)}`, {
              brandName,
              brandAliases: aliases.split(",").map((item) => item.trim()).filter(Boolean),
              providers,
              locationKeys: locations,
              schedule,
            });
            await onSaved();
          } catch (cause) {
            setError(message(cause, "설정을 저장하지 못했습니다."));
          } finally {
            setBusy(false);
          }
        }}>{busy ? "저장 중…" : project ? "설정 저장" : "프로젝트 설정 완료"}</button>
      </div>
    </div>
  );
}
