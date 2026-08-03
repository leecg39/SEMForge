"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ClientApiError } from "@/lib/client-api";
import type {
  SocialAnalyticsResponse,
  SocialContentInsightRow,
  SocialOverviewResponse,
  SocialPostView,
  SocialRunView,
  SocialSettingsView,
} from "@/types/social";

export type SocialMode =
  "dashboard" | "poster" | "tracker" | "content-insights" | "analytics";

interface Props {
  fid: string;
  mode: SocialMode;
  canEdit: boolean;
  canApprove: boolean;
}
type Competitor = {
  id: string;
  name: string;
  domain: string | null;
  instagramUsername: string | null;
  status: string;
  lastError: string | null;
  latestMetric: {
    followers: number | null;
    posts: number | null;
    capturedAt: string;
  } | null;
};
type GbpLocation = { name: string; title?: string; storeCode?: string };

const CARD =
  "rounded-[12px] border border-[#e3e5e9] bg-white shadow-[0_1px_2px_rgba(20,24,40,.03)]";
const BUTTON =
  "inline-flex h-9 items-center justify-center rounded-[7px] border border-[#d8dbe1] bg-white px-3 text-[13px] font-medium text-[#353942] hover:bg-[#f7f7f9] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "inline-flex h-9 items-center justify-center rounded-[7px] bg-[#17191c] px-3.5 text-[13px] font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b8bbc1]";
const PLATFORM: Record<string, { label: string; color: string }> = {
  facebook_page: { label: "Facebook Page", color: "#1877f2" },
  instagram_professional: { label: "Instagram Professional", color: "#b744a8" },
  google_business_profile: {
    label: "Google Business Profile",
    color: "#34a853",
  },
};

function errorMessage(error: unknown) {
  return error instanceof ClientApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "요청을 처리하지 못했습니다.";
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
}
function compact(value: number | null) {
  return value === null
    ? "측정 불가"
    : new Intl.NumberFormat("ko-KR", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}
async function waitForRun(run: SocialRunView) {
  let current = run;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!new Set(["queued", "running"]).has(current.status)) return current;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    current = (await api.get<SocialRunView>(`/api/social/runs/${run.id}/`))
      .data;
  }
  return current;
}
function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    draft: "초안",
    pending_approval: "승인 대기",
    queued: "예약",
    publishing: "발행 중",
    published: "발행 완료",
    partial: "일부 실패",
    failed: "실패",
    cancelled: "취소",
    active: "연결됨",
    unavailable: "사용 불가",
    reconnect_required: "재연결 필요",
    pending: "확인 대기",
    error: "오류",
  };
  const bad = new Set(["failed", "partial", "error", "reconnect_required"]);
  const good = new Set(["published", "active"]);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${bad.has(value) ? "bg-red-50 text-red-700" : good.has(value) ? "bg-emerald-50 text-emerald-700" : "bg-[#f0f1f4] text-[#666d78]"}`}
    >
      {labels[value] ?? value}
    </span>
  );
}

function canComposeProfile(profile: SocialSettingsView["profiles"][number]) {
  return profile.platform === "instagram_professional"
    ? profile.capabilities.publishImage
    : profile.capabilities.publishText || profile.capabilities.publishImage;
}

function Toolbar({
  fid,
  title,
  description,
  range,
  onRange,
  onSync,
  syncing,
}: {
  fid: string;
  title: string;
  description: string;
  range?: string;
  onRange?: (value: "7d" | "28d" | "90d") => void;
  onSync?: () => void;
  syncing?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e2e4e8] bg-white px-5 py-4 lg:px-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#6a64d9]">
          Social toolkit
        </p>
        <h1 className="mt-1 text-[22px] font-semibold text-[#252930]">
          {title}
        </h1>
        <p className="mt-1 text-[12px] text-[#777e89]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {range && onRange && (
          <select
            value={range}
            onChange={(event) =>
              onRange(event.target.value as "7d" | "28d" | "90d")
            }
            className={BUTTON}
          >
            <option value="7d">7일</option>
            <option value="28d">28일</option>
            <option value="90d">90일</option>
          </select>
        )}
        {onSync && (
          <button
            type="button"
            className={BUTTON}
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? "동기화 중…" : "지금 동기화"}
          </button>
        )}
        <a
          className={BUTTON}
          href={`/api/social/export.csv/?fid=${encodeURIComponent(fid)}&range=${range ?? "28d"}`}
        >
          CSV 내보내기
        </a>
      </div>
    </div>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center px-5 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#655fd8]">
        ＋
      </div>
      <h3 className="mt-3 text-[14px] font-semibold text-[#333740]">{title}</h3>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7a808a]">
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Dashboard({
  fid,
  canEdit,
  canManage,
}: Pick<Props, "fid" | "canEdit"> & { canManage: boolean }) {
  const [range, setRange] = useState<"7d" | "28d" | "90d">("28d");
  const [data, setData] = useState<SocialOverviewResponse | null>(null);
  const [settings, setSettings] = useState<SocialSettingsView | null>(null);
  const [locations, setLocations] = useState<GbpLocation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [overview, settingsResponse] = await Promise.all([
        api.get<SocialOverviewResponse>(
          `/api/social/overview/?fid=${encodeURIComponent(fid)}&range=${range}`,
        ),
        api.get<SocialSettingsView>(
          `/api/social/settings/?fid=${encodeURIComponent(fid)}`,
        ),
      ]);
      setData(overview.data);
      setSettings(settingsResponse.data);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<SocialOverviewResponse>(
        `/api/social/overview/?fid=${encodeURIComponent(fid)}&range=${range}`,
      ),
      api.get<SocialSettingsView>(
        `/api/social/settings/?fid=${encodeURIComponent(fid)}`,
      ),
    ])
      .then(([overview, settingsResponse]) => {
        if (!active) return;
        setData(overview.data);
        setSettings(settingsResponse.data);
        setError("");
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [fid, range]);
  useEffect(() => {
    fetch("/api/gbp/locations/")
      .then((response) => response.json())
      .then((body) => setLocations(body?.data?.locations ?? []))
      .catch(() => setLocations([]));
  }, []);
  const sync = async () => {
    setSyncing(true);
    setNotice("");
    try {
      const queued = await api.post<SocialRunView>(
        `/api/social/sync/?fid=${encodeURIComponent(fid)}`,
      );
      const result = await waitForRun(queued.data);
      setNotice(
        `동기화 ${result.status} · 성공 ${result.succeeded} · 실패 ${result.failed}`,
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  };
  const bindGbp = async (location: GbpLocation) => {
    try {
      await api.post(
        `/api/social/connections/?fid=${encodeURIComponent(fid)}`,
        {
          action: "bind_gbp",
          externalId: location.name,
          displayName: location.title ?? location.storeCode ?? location.name,
        },
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const saveSettings = async (next: SocialSettingsView) => {
    try {
      const response = await api.put<SocialSettingsView>(
        `/api/social/settings/?fid=${encodeURIComponent(fid)}`,
        {
          timezone: next.timezone,
          approvalRequired: next.approvalRequired,
          syncEnabled: next.syncEnabled,
        },
      );
      setSettings(response.data);
      setNotice("설정을 저장했습니다.");
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  if (!data || !settings)
    return (
      <>
        <Toolbar
          fid={fid}
          title="소셜 대시보드"
          description="연결된 공식 API의 실제 게시 활동과 지표를 확인합니다."
        />
        <div className="p-7 text-sm text-[#707680]">
          {error || "실데이터를 불러오는 중입니다…"}
        </div>
      </>
    );
  const maxActivity = Math.max(
    1,
    ...data.activity.map((row) => row.published + row.scheduled + row.failed),
  );
  return (
    <>
      <Toolbar
        fid={fid}
        title={`${data.project.name} 소셜 대시보드`}
        description="게시 공백, 활동 감소, 발행 실패와 인증 상태를 실제 데이터로 안내합니다."
        range={range}
        onRange={setRange}
        onSync={sync}
        syncing={syncing}
      />
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        {(error || notice) && (
          <div
            role="alert"
            className={`rounded-lg border px-4 py-3 text-[12px] ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
          >
            {error || notice}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["발행 완료", data.kpis.published],
            ["예정·승인 대기", data.kpis.scheduled],
            ["최근 실패", data.kpis.failed],
            ["연결 프로필", data.kpis.connectedProfiles],
          ].map(([label, value]) => (
            <div key={label} className={`${CARD} p-4`}>
              <p className="text-[11px] text-[#777d87]">{label}</p>
              <p className="mt-2 text-[27px] font-bold text-[#353845]">
                {value}
              </p>
              <p className="mt-1 text-[10px] text-[#9a9fa7]">
                선택 기간 · 실제 저장 데이터
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.7fr)]">
          <section className={`${CARD} p-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">게시 활동</h2>
              <span className="text-[10px] text-[#8b9098]">
                발행 · 예약 · 실패
              </span>
            </div>
            <div className="mt-5 flex h-[170px] items-end gap-[3px] overflow-hidden border-b border-[#e8e9ed]">
              {data.activity.map((row) => {
                const total = row.published + row.scheduled + row.failed;
                return (
                  <div
                    key={row.date}
                    title={`${row.date} · 발행 ${row.published} · 예약 ${row.scheduled} · 실패 ${row.failed}`}
                    className="group flex h-full min-w-[4px] flex-1 items-end"
                  >
                    <div
                      className={`w-full rounded-t-sm ${row.failed ? "bg-red-400" : row.published ? "bg-[#6b6de3]" : "bg-[#bdeee3]"}`}
                      style={{
                        height: `${Math.max(total ? 8 : 2, (total / maxActivity) * 100)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
          <section className={`${CARD} overflow-hidden`}>
            <div className="border-b border-[#eceef1] bg-[#efedff] px-4 py-3">
              <h2 className="text-[14px] font-semibold text-[#413d87]">
                다음 단계
              </h2>
            </div>
            <div className="divide-y divide-[#eceef1]">
              {data.recommendations.map((row) => (
                <div key={row.id} className="p-4">
                  <h3 className="text-[12px] font-semibold text-[#343840]">
                    {row.title}
                  </h3>
                  <p className="mt-1 text-[11px] leading-5 text-[#707680]">
                    {row.description}
                  </p>
                  <Link
                    href={row.href}
                    className="mt-2 inline-block text-[11px] font-semibold text-[#315be8]"
                  >
                    {row.cta} →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${CARD} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
              <h2 className="text-[14px] font-semibold">오늘·예정 게시물</h2>
              <Link
                href={`/social-media/poster/?fid=${encodeURIComponent(fid)}`}
                className="text-[11px] font-semibold text-[#315be8]"
              >
                포스터 열기
              </Link>
            </div>
            {data.upcoming.length ? (
              <div className="divide-y divide-[#eff0f2]">
                {data.upcoming.map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <Empty
                title="예정된 게시물이 없습니다"
                body="게시물 작성기에서 즉시 게시, 예약 또는 주간 반복 일정을 만드세요."
                action={
                  canEdit && (
                    <Link
                      href={`/social-media/poster/?fid=${encodeURIComponent(fid)}`}
                      className={PRIMARY}
                    >
                      게시물 만들기
                    </Link>
                  )
                }
              />
            )}
          </section>
          <section className={`${CARD} overflow-hidden`}>
            <div className="border-b border-[#eceef1] px-4 py-3">
              <h2 className="text-[14px] font-semibold">최근 실패</h2>
            </div>
            {data.recentFailures.length ? (
              <div className="divide-y divide-[#eff0f2]">
                {data.recentFailures.map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <Empty
                title="최근 발행 실패가 없습니다"
                body="플랫폼별 부분 실패와 재시도 이유가 여기에 표시됩니다."
              />
            )}
          </section>
        </div>
        <section id="connections" className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef1] px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold">연결 프로필</h2>
              <p className="mt-0.5 text-[10px] text-[#858b94]">
                토큰은 서버에서 암호화되며 브라우저에 반환되지 않습니다.
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Link
                  href={`/api/social/connections/meta/auth/start/?fid=${encodeURIComponent(fid)}`}
                  className={BUTTON}
                >
                  Meta 연결
                </Link>
                <Link
                  href={`/api/gbp/auth/start/?fid=${encodeURIComponent(fid)}`}
                  className={BUTTON}
                >
                  Google 연결
                </Link>
              </div>
            )}
          </div>
          <div className="grid gap-2 border-b border-[#eceef1] bg-[#fafafb] p-4 sm:grid-cols-2">
            {settings.connections.map((connection) => (
              <div
                key={connection.provider}
                className="rounded-lg border border-[#e4e6ea] bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold">
                    {connection.provider === "meta"
                      ? "Meta"
                      : "Google Business Profile"}
                  </p>
                  <Status value={connection.status} />
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[#777d87]">
                  {connection.accountName ??
                    connection.reason ??
                    "연결 정보를 확인해 주세요."}
                </p>
              </div>
            ))}
          </div>
          {settings.profiles.length ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {settings.profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-lg border border-[#e4e6ea] p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[12px] font-semibold">
                        {profile.displayName}
                      </p>
                      <p
                        className="mt-1 text-[10px]"
                        style={{ color: PLATFORM[profile.platform].color }}
                      >
                        {PLATFORM[profile.platform].label}
                      </p>
                    </div>
                    <Status
                      value={
                        profile.lastError?.match(/인증|권한/u)
                          ? "reconnect_required"
                          : "active"
                      }
                    />
                  </div>
                  <p className="mt-3 text-[10px] text-[#8b9098]">
                    최근 동기화 {formatDate(profile.lastSyncedAt)}
                  </p>
                  {profile.lastError && (
                    <p className="mt-2 text-[10px] leading-4 text-red-600">
                      {profile.lastError}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="연결된 프로필이 없습니다"
              body="Facebook Page와 연결된 Instagram Professional, 또는 Google Business Profile 위치를 연결하세요."
            />
          )}
          {canManage && locations.length > 0 && (
            <div className="border-t border-[#eceef1] p-4">
              <p className="mb-2 text-[11px] font-semibold">
                연결 가능한 Google Business Profile 위치
              </p>
              <div className="flex flex-wrap gap-2">
                {locations.map((location) => (
                  <button
                    key={location.name}
                    type="button"
                    className={BUTTON}
                    onClick={() => bindGbp(location)}
                  >
                    {location.title ?? location.storeCode ?? location.name} 연결
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-semibold">프로젝트 소셜 설정</h2>
              <p className="mt-1 text-[10px] text-[#858b94]">
                프로젝트 시간대를 기준으로 예약·주간 반복을 실행합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={settings.timezone}
                disabled={!canManage}
                onChange={(event) =>
                  setSettings({ ...settings, timezone: event.target.value })
                }
                className="h-9 rounded-md border border-[#d8dbe1] px-2 text-[12px]"
              />
              <label className="text-[11px]">
                <input
                  type="checkbox"
                  checked={settings.approvalRequired}
                  disabled={!canManage}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      approvalRequired: event.target.checked,
                    })
                  }
                  className="mr-1"
                />
                승인 필요
              </label>
              <label className="text-[11px]">
                <input
                  type="checkbox"
                  checked={settings.syncEnabled}
                  disabled={!canManage}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      syncEnabled: event.target.checked,
                    })
                  }
                  className="mr-1"
                />
                6시간 동기화
              </label>
              {canManage && (
                <button
                  type="button"
                  className={PRIMARY}
                  onClick={() => saveSettings(settings)}
                >
                  설정 저장
                </button>
              )}
            </div>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <section className={`${CARD} p-5 opacity-80`}>
            <Status value="unavailable" />
            <h2 className="mt-3 text-[15px] font-semibold">인플루언서 분석</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#717782]">
              공식 데이터 공급자가 연결되기 전에는 수치 없이 준비 상태로
              제공합니다.
            </p>
          </section>
          <section className={`${CARD} p-5 opacity-80`}>
            <Status value="unavailable" />
            <h2 className="mt-3 text-[15px] font-semibold">미디어 모니터링</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#717782]">
              비공식 스크래핑이나 추정치를 사용하지 않습니다.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function PostRow({ post }: { post: SocialPostView }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-[#353941]">
          {post.text || post.linkUrl || "이미지 게시물"}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[#878c95]">
          <span>{formatDate(post.scheduledAt)}</span>
          <span>·</span>
          <span>
            {post.targets
              .map((target) => PLATFORM[target.platform].label)
              .join(", ")}
          </span>
        </div>
      </div>
      <Status value={post.status} />
    </div>
  );
}

function Poster({
  fid,
  canEdit,
  canApprove,
}: Pick<Props, "fid" | "canEdit" | "canApprove">) {
  const [settings, setSettings] = useState<SocialSettingsView | null>(null);
  const [posts, setPosts] = useState<SocialPostView[]>([]);
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [media, setMedia] = useState<{ id: string; url: string } | null>(null);
  const [mode, setMode] = useState<"draft" | "now" | "scheduled" | "recurring">(
    "draft",
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [settingsResponse, postsResponse] = await Promise.all([
        api.get<SocialSettingsView>(
          `/api/social/settings/?fid=${encodeURIComponent(fid)}`,
        ),
        api.get<SocialPostView[]>(
          `/api/social/posts/?fid=${encodeURIComponent(fid)}`,
        ),
      ]);
      setSettings(settingsResponse.data);
      setPosts(postsResponse.data);
      if (!profileIds.length)
        setProfileIds(
          settingsResponse.data.profiles
            .filter((row) => row.enabled && canComposeProfile(row))
            .map((row) => row.id),
        );
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<SocialSettingsView>(
        `/api/social/settings/?fid=${encodeURIComponent(fid)}`,
      ),
      api.get<SocialPostView[]>(
        `/api/social/posts/?fid=${encodeURIComponent(fid)}`,
      ),
    ])
      .then(([settingsResponse, postsResponse]) => {
        if (!active) return;
        setSettings(settingsResponse.data);
        setPosts(postsResponse.data);
        setProfileIds((current) =>
          current.length
            ? current
            : settingsResponse.data.profiles
                .filter((row) => row.enabled && canComposeProfile(row))
                .map((row) => row.id),
        );
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [fid]);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/social/media/?fid=${encodeURIComponent(fid)}`,
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body?.error?.message ?? "이미지 업로드에 실패했습니다.",
        );
      setMedia(body.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const save = async (submit: boolean) => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        text,
        linkUrl: linkUrl || null,
        utm: utmSource ? { utm_source: utmSource, utm_medium: "social" } : {},
        publishMode: mode,
        scheduledAt:
          mode === "scheduled" || mode === "recurring"
            ? new Date(scheduledAt).toISOString()
            : null,
        recurrence:
          mode === "recurring"
            ? {
                frequency: "weekly" as const,
                weekday: new Date(scheduledAt).getDay(),
                time: scheduledAt.slice(11, 16),
              }
            : {},
        recurrenceEndAt:
          mode === "recurring" && endAt
            ? new Date(`${endAt}T23:59:59`).toISOString()
            : null,
        profileIds,
        mediaAssetId: media?.id ?? null,
      };
      const created = await api.post<SocialPostView>(
        `/api/social/posts/?fid=${encodeURIComponent(fid)}`,
        payload,
      );
      let final = created.data;
      if (submit) {
        final = (
          await api.post<SocialPostView>(
            `/api/social/posts/${created.data.id}/submit/`,
          )
        ).data;
        if (mode === "now" && final.status === "queued")
          await api.post(`/api/social/posts/${created.data.id}/publish/`);
      }
      setNotice(
        submit
          ? final.status === "pending_approval"
            ? "승인을 요청했습니다."
            : "발행 큐에 등록했습니다."
          : "초안을 저장했습니다.",
      );
      setText("");
      setLinkUrl("");
      setMedia(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const action = async (post: SocialPostView, name: string) => {
    try {
      await api.post(
        `/api/social/posts/${post.id}/${name}/`,
        name === "approve" || name === "reject" ? { note: "" } : undefined,
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <>
      <Toolbar
        fid={fid}
        title="소셜 포스터"
        description="텍스트와 단일 이미지를 공식 플랫폼 API로 초안·즉시·예약·주간 반복 발행합니다."
      />
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        {(error || notice) && (
          <div
            role="alert"
            className={`rounded-lg border px-4 py-3 text-[12px] ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
          >
            {error || notice}
          </div>
        )}
        {!settings?.profiles.length ? (
          <section className={CARD}>
            <Empty
              title="먼저 게시 프로필을 연결하세요"
              body="대시보드에서 Meta 또는 Google Business Profile을 연결한 뒤 작성기를 사용할 수 있습니다."
              action={
                <Link
                  className={PRIMARY}
                  href={`/social-media/?fid=${encodeURIComponent(fid)}#connections`}
                >
                  연결 설정
                </Link>
              }
            />
          </section>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
            <section className={`${CARD} p-5`}>
              <h2 className="text-[15px] font-semibold">게시물 작성</h2>
              <fieldset disabled={!canEdit || busy} className="mt-5 space-y-4">
                <div>
                  <label className="text-[11px] font-semibold">
                    게시 프로필
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {settings.profiles.map((profile) => (
                      <label
                        key={profile.id}
                        title={profile.capabilities.reason ?? undefined}
                        className={`cursor-pointer rounded-full border px-3 py-2 text-[11px] ${profileIds.includes(profile.id) ? "border-[#6b6de3] bg-[#f0efff] text-[#4f4ac0]" : "border-[#dddfe4]"}`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          disabled={!canComposeProfile(profile)}
                          checked={profileIds.includes(profile.id)}
                          onChange={(event) =>
                            setProfileIds(
                              event.target.checked
                                ? [...profileIds, profile.id]
                                : profileIds.filter((id) => id !== profile.id),
                            )
                          }
                        />
                        {profile.displayName} ·{" "}
                        {PLATFORM[profile.platform].label}
                        {!canComposeProfile(profile) && " · 비활성"}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold">
                    본문{" "}
                    <span className="font-normal text-[#8b9098]">
                      {text.length}/2,200
                    </span>
                  </label>
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    maxLength={2200}
                    rows={7}
                    placeholder="공유할 내용을 입력하세요"
                    className="mt-2 w-full rounded-lg border border-[#d8dbe1] p-3 text-[13px] outline-none focus:border-[#6b6de3]"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[11px] font-semibold">
                    링크
                    <input
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.target.value)}
                      placeholder="https://"
                      className="mt-2 h-10 w-full rounded-lg border border-[#d8dbe1] px-3 text-[12px]"
                    />
                  </label>
                  <label className="text-[11px] font-semibold">
                    UTM source
                    <input
                      value={utmSource}
                      onChange={(event) => setUtmSource(event.target.value)}
                      placeholder="facebook"
                      className="mt-2 h-10 w-full rounded-lg border border-[#d8dbe1] px-3 text-[12px]"
                    />
                  </label>
                </div>
                <div>
                  <label className="text-[11px] font-semibold">
                    단일 이미지 (JPEG·PNG, 4:5–1.91:1)
                  </label>
                  <label className="mt-2 flex min-h-[90px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#cfd2d9] bg-[#fafafb] text-[12px] text-[#747a84]">
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(file);
                      }}
                    />
                    {media ? "호환 JPEG로 정규화 완료" : "이미지 선택"}
                  </label>
                </div>
                <div>
                  <label className="text-[11px] font-semibold">발행 방식</label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["draft", "초안"],
                      ["now", "즉시 게시"],
                      ["scheduled", "예약"],
                      ["recurring", "주간 반복"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value as typeof mode)}
                        className={`h-10 rounded-lg border text-[11px] font-medium ${mode === value ? "border-[#6b6de3] bg-[#f0efff] text-[#4f4ac0]" : "border-[#d8dbe1]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {(mode === "scheduled" || mode === "recurring") && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-semibold">
                      첫 게시 시각
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(event) => setScheduledAt(event.target.value)}
                        className="mt-2 h-10 w-full rounded-lg border border-[#d8dbe1] px-3 text-[12px]"
                      />
                    </label>
                    {mode === "recurring" && (
                      <label className="text-[11px] font-semibold">
                        반복 종료일 (선택)
                        <input
                          type="date"
                          value={endAt}
                          onChange={(event) => setEndAt(event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-[#d8dbe1] px-3 text-[12px]"
                        />
                      </label>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t border-[#eceef1] pt-4">
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => save(false)}
                    disabled={!profileIds.length}
                  >
                    초안 저장
                  </button>
                  <button
                    type="button"
                    className={PRIMARY}
                    onClick={() => save(true)}
                    disabled={!profileIds.length}
                  >
                    {settings.approvalRequired && !canApprove
                      ? "승인 요청"
                      : mode === "now"
                        ? "지금 게시"
                        : "게시 예약"}
                  </button>
                </div>
              </fieldset>
            </section>
            <section className={`${CARD} overflow-hidden`}>
              <div className="border-b border-[#eceef1] px-4 py-3">
                <h2 className="text-[14px] font-semibold">플랫폼 미리보기</h2>
              </div>
              <div className="space-y-4 p-4">
                {profileIds
                  .map((id) =>
                    settings.profiles.find((profile) => profile.id === id),
                  )
                  .filter(Boolean)
                  .map((profile) => (
                    <div
                      key={profile!.id}
                      className="rounded-xl border border-[#e2e4e8] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-8 w-8 rounded-full"
                          style={{
                            background: PLATFORM[profile!.platform].color,
                          }}
                        />
                        <div>
                          <p className="text-[11px] font-semibold">
                            {profile!.displayName}
                          </p>
                          <p className="text-[9px] text-[#8c9199]">
                            {PLATFORM[profile!.platform].label} 미리보기
                          </p>
                        </div>
                      </div>
                      {media && (
                        <Image
                          src={media.url}
                          alt="업로드 미리보기"
                          width={800}
                          height={600}
                          unoptimized
                          className="mt-3 max-h-[280px] w-full rounded-lg object-cover"
                        />
                      )}
                      <p className="mt-3 whitespace-pre-wrap text-[12px] leading-5 text-[#353941]">
                        {text || "게시물 본문이 여기에 표시됩니다."}
                      </p>
                      {linkUrl && (
                        <p className="mt-2 truncate text-[10px] text-[#315be8]">
                          {linkUrl}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          </div>
        )}
        <section id="calendar" className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
            <h2 className="text-[14px] font-semibold">
              콘텐츠 캘린더와 게시 기록
            </h2>
            <span className="text-[10px] text-[#898e97]">
              프로젝트 시간대 {settings?.timezone}
            </span>
          </div>
          {posts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[11px]">
                <thead className="bg-[#f6f7f8] text-[#737984]">
                  <tr>
                    <th className="px-4 py-3">게시물</th>
                    <th className="px-3 py-3">시각</th>
                    <th className="px-3 py-3">플랫폼</th>
                    <th className="px-3 py-3">상태</th>
                    <th className="px-3 py-3">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef1]">
                  {posts.map((post) => (
                    <tr key={post.id}>
                      <td className="max-w-[420px] truncate px-4 py-3 font-medium">
                        {post.text || post.linkUrl || "이미지 게시물"}
                      </td>
                      <td className="px-3 py-3 text-[#777d87]">
                        {formatDate(post.scheduledAt)}
                      </td>
                      <td className="px-3 py-3">
                        {post.targets
                          .map((target) => PLATFORM[target.platform].label)
                          .join(", ")}
                      </td>
                      <td className="px-3 py-3">
                        <Status value={post.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          {canApprove && post.status === "pending_approval" && (
                            <button
                              className={BUTTON}
                              onClick={() => action(post, "approve")}
                            >
                              승인
                            </button>
                          )}
                          {canApprove && post.status === "pending_approval" && (
                            <button
                              className={BUTTON}
                              onClick={() => action(post, "reject")}
                            >
                              반려
                            </button>
                          )}
                          {canEdit &&
                            (post.status === "failed" ||
                              post.status === "partial") && (
                              <button
                                className={BUTTON}
                                onClick={() => action(post, "retry")}
                              >
                                재시도
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="저장된 게시물이 없습니다"
              body="첫 게시물을 초안으로 저장하거나 실제 발행 큐에 등록하세요."
            />
          )}
        </section>
      </div>
    </>
  );
}

function Tracker({ fid, canEdit }: Pick<Props, "fid" | "canEdit">) {
  const [rows, setRows] = useState<Competitor[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setRows(
        (
          await api.get<Competitor[]>(
            `/api/social/competitors/?fid=${encodeURIComponent(fid)}`,
          )
        ).data,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  useEffect(() => {
    let active = true;
    api
      .get<Competitor[]>(
        `/api/social/competitors/?fid=${encodeURIComponent(fid)}`,
      )
      .then(({ data }) => {
        if (active) setRows(data);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [fid]);
  const add = async () => {
    try {
      await api.post(
        `/api/social/competitors/?fid=${encodeURIComponent(fid)}`,
        { name, instagramUsername: username || null },
      );
      setName("");
      setUsername("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <>
      <Toolbar
        fid={fid}
        title="소셜 트래커"
        description="공식 Instagram Business Discovery로 확인 가능한 경쟁 프로필만 비교합니다."
      />
      <div className="mx-auto max-w-[1300px] space-y-4 p-4 lg:p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
            {error}
          </div>
        )}
        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 text-[11px] font-semibold">
              경쟁사 이름
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-[#d8dbe1] px-3 text-[12px]"
              />
            </label>
            <label className="flex-1 text-[11px] font-semibold">
              Instagram 사용자 이름
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="@username"
                className="mt-2 h-10 w-full rounded-lg border border-[#d8dbe1] px-3 text-[12px]"
              />
            </label>
            <button
              className={PRIMARY}
              disabled={!canEdit || !name.trim() || rows.length >= 10}
              onClick={add}
            >
              경쟁 프로필 추가
            </button>
          </div>
          <p className="mt-2 text-[10px] text-[#8a9099]">
            프로젝트당 최대 10개 · Facebook 공개 페이지와 GBP 경쟁 데이터는 공식
            권한이 없어 비활성화됩니다.
          </p>
        </section>
        <section className={`${CARD} overflow-hidden`}>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[11px]">
                <thead className="bg-[#f6f7f8] text-[#737984]">
                  <tr>
                    <th className="px-4 py-3">경쟁사</th>
                    <th className="px-3 py-3">Instagram</th>
                    <th className="px-3 py-3">팔로워</th>
                    <th className="px-3 py-3">게시물</th>
                    <th className="px-3 py-3">상태</th>
                    <th className="px-3 py-3">최근 확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef1]">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-semibold">{row.name}</td>
                      <td className="px-3 py-3">
                        {row.instagramUsername
                          ? `@${row.instagramUsername}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {compact(row.latestMetric?.followers ?? null)}
                      </td>
                      <td className="px-3 py-3">
                        {compact(row.latestMetric?.posts ?? null)}
                      </td>
                      <td className="px-3 py-3">
                        <Status value={row.status} />
                        {row.lastError && (
                          <p className="mt-1 max-w-[280px] text-[9px] text-red-600">
                            {row.lastError}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(row.latestMetric?.capturedAt ?? null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="등록된 경쟁 프로필이 없습니다"
              body="Instagram Professional 계정 연결 후 공식 Business Discovery 범위에서 비교할 수 있습니다."
            />
          )}
        </section>
      </div>
    </>
  );
}

function ContentInsights({ fid }: Pick<Props, "fid">) {
  const [range, setRange] = useState<"7d" | "28d" | "90d">("28d");
  const [rows, setRows] = useState<SocialContentInsightRow[]>([]);
  const [profiles, setProfiles] = useState<SocialSettingsView["profiles"]>([]);
  const [profile, setProfile] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<{
        rows: SocialContentInsightRow[];
        profiles: SocialSettingsView["profiles"];
      }>(
        `/api/social/content-insights/?fid=${encodeURIComponent(fid)}&range=${range}${profile ? `&profile=${encodeURIComponent(profile)}` : ""}`,
      )
      .then(({ data }) => {
        setRows(data.rows);
        setProfiles(data.profiles);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [fid, range, profile]);
  return (
    <>
      <Toolbar
        fid={fid}
        title="콘텐츠 인사이트"
        description="공식 API에서 동기화한 실제 게시물 반응과 측정 가능 지표를 표시합니다."
        range={range}
        onRange={setRange}
      />
      <div className="mx-auto max-w-[1500px] p-4 lg:p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
            {error}
          </div>
        )}
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center gap-3 border-b border-[#eceef1] px-4 py-3">
            <select
              className={BUTTON}
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
            >
              <option value="">전체 프로필</option>
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[#8a9099]">
              제공되지 않은 값은 0이 아닌 측정 불가로 표시
            </span>
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-[11px]">
                <thead className="bg-[#f6f7f8] text-[#737984]">
                  <tr>
                    <th className="px-4 py-3">게시물</th>
                    <th className="px-3 py-3">프로필</th>
                    <th className="px-3 py-3">발행일</th>
                    <th className="px-3 py-3">좋아요</th>
                    <th className="px-3 py-3">댓글</th>
                    <th className="px-3 py-3">공유</th>
                    <th className="px-3 py-3">도달</th>
                    <th className="px-3 py-3">노출</th>
                    <th className="px-3 py-3">참여율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef1]">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="max-w-[420px] px-4 py-3">
                        <a
                          href={row.externalUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 font-medium text-[#353941] hover:text-[#315be8]"
                        >
                          {row.caption || "본문 없는 게시물"}
                        </a>
                      </td>
                      <td className="px-3 py-3">{row.profileName}</td>
                      <td className="px-3 py-3">
                        {formatDate(row.publishedAt)}
                      </td>
                      <td className="px-3 py-3">{compact(row.likes)}</td>
                      <td className="px-3 py-3">{compact(row.comments)}</td>
                      <td className="px-3 py-3">{compact(row.shares)}</td>
                      <td className="px-3 py-3">{compact(row.reach)}</td>
                      <td className="px-3 py-3">{compact(row.impressions)}</td>
                      <td className="px-3 py-3">
                        {row.engagementRate === null
                          ? "측정 불가"
                          : `${row.engagementRate}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="동기화된 콘텐츠가 없습니다"
              body="연결된 프로필을 지금 동기화하면 공식 API가 제공하는 최근 게시물부터 표시됩니다."
            />
          )}
        </section>
      </div>
    </>
  );
}

function Analytics({ fid }: Pick<Props, "fid">) {
  const [range, setRange] = useState<"7d" | "28d" | "90d">("28d");
  const [data, setData] = useState<SocialAnalyticsResponse | null>(null);
  const [profile, setProfile] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<SocialAnalyticsResponse>(
        `/api/social/analytics/?fid=${encodeURIComponent(fid)}&range=${range}${profile ? `&profile=${encodeURIComponent(profile)}` : ""}`,
      )
      .then(({ data }) => setData(data))
      .catch((err) => setError(errorMessage(err)));
  }, [fid, range, profile]);
  const chartData = useMemo(
    () =>
      data?.trend.map((row) => ({ ...row, label: row.date.slice(5) })) ?? [],
    [data],
  );
  return (
    <>
      <Toolbar
        fid={fid}
        title="소셜 분석"
        description="플랫폼별 팔로워·도달·노출·참여 추이를 실제 스냅샷으로 표시합니다."
        range={range}
        onRange={setRange}
      />
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
            {error}
          </div>
        )}
        {data && (
          <>
            <div className="flex justify-end">
              <select
                className={BUTTON}
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
              >
                <option value="">전체 프로필</option>
                {data.profiles.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(data.summary).map(([key, value]) => (
                <div key={key} className={`${CARD} p-4`}>
                  <p className="text-[10px] uppercase tracking-wide text-[#858b94]">
                    {
                      {
                        followers: "팔로워",
                        reach: "도달",
                        impressions: "노출",
                        interactions: "참여",
                        posts: "게시물",
                      }[key]
                    }
                  </p>
                  <p className="mt-2 text-[24px] font-bold">{compact(value)}</p>
                </div>
              ))}
            </div>
            <section className={`${CARD} p-4`}>
              <h2 className="text-[14px] font-semibold">지표 추이</h2>
              <div className="mt-4 h-[320px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid stroke="#eceef1" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        dataKey="followers"
                        name="팔로워"
                        stroke="#6b6de3"
                        connectNulls={false}
                      />
                      <Line
                        dataKey="reach"
                        name="도달"
                        stroke="#36cfa7"
                        connectNulls={false}
                      />
                      <Line
                        dataKey="impressions"
                        name="노출"
                        stroke="#b66ae0"
                        connectNulls={false}
                      />
                      <Line
                        dataKey="interactions"
                        name="참여"
                        stroke="#f2a72e"
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty
                    title="분석 스냅샷이 없습니다"
                    body="프로필을 연결하고 동기화하면 플랫폼이 실제 제공한 지표만 표시됩니다."
                  />
                )}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-[#858b94]">
                {data.note}
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}

export function SocialToolkit({ fid, mode, canEdit, canApprove }: Props) {
  if (mode === "poster")
    return <Poster fid={fid} canEdit={canEdit} canApprove={canApprove} />;
  if (mode === "tracker") return <Tracker fid={fid} canEdit={canEdit} />;
  if (mode === "content-insights") return <ContentInsights fid={fid} />;
  if (mode === "analytics") return <Analytics fid={fid} />;
  return <Dashboard fid={fid} canEdit={canEdit} canManage={canApprove} />;
}
