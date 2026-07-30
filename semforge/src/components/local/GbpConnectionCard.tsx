"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

export interface GbpStatus {
  connected: boolean;
  configured: boolean;
  email: string | null;
  accountName: string | null;
}

export function useGbpStatus() {
  const [status, setStatus] = useState<GbpStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<GbpStatus>("/api/gbp/status/");
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) void refresh();
    });
    return () => {
      alive = false;
    };
  }, []);

  return { status, loading, refresh };
}

/** GBP 연결 상태 카드. 미연결/미설정 시 정직한 안내와 연결 버튼을 제공한다. */
export function GbpConnectionCard({ status }: { status: GbpStatus | null }) {
  const [disconnecting, setDisconnecting] = useState(false);

  if (!status) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
        연결 상태를 확인하는 중…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-medium text-amber-800">Google OAuth 미설정</p>
        <p className="mt-1 text-sm text-amber-700">
          .env.local 에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 을 설정하면 Google Business
          Profile 연결이 활성화됩니다.
        </p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">Google Business Profile 미연결</p>
        <p className="mt-1 text-sm text-zinc-500">
          리스팅과 리뷰의 실데이터를 보려면 Google 계정을 연결하세요.
        </p>
        {/* OAuth 시작은 API 라우트의 302 리다이렉트가 필요해 전체 페이지 이동이 맞다. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/gbp/auth/start"
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Google 계정 연결
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div>
        <p className="text-sm font-medium text-emerald-800">Google Business Profile 연결됨</p>
        <p className="mt-0.5 text-xs text-emerald-600">
          계정 리소스: {status.accountName ?? "확인 중"}
        </p>
      </div>
      <button
        type="button"
        disabled={disconnecting}
        onClick={async () => {
          setDisconnecting(true);
          try {
            await api.post("/api/gbp/disconnect/");
            window.location.reload();
          } finally {
            setDisconnecting(false);
          }
        }}
        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        연결 해제
      </button>
    </div>
  );
}
