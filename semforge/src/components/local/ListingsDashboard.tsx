"use client";

import { useEffect, useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { GbpConnectionCard, useGbpStatus } from "@/components/local/GbpConnectionCard";

interface Location {
  name: string;
  title: string;
  address: string | null;
  phone: string | null;
  websiteUri: string | null;
  primaryCategory: string | null;
}

interface LocationsResponse {
  status: string;
  reason?: string;
  locations: Location[];
}

export function ListingsDashboard() {
  const { status } = useGbpStatus();
  const [result, setResult] = useState<LocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!status?.connected) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setLoading(true);
      api
        .get<LocationsResponse>("/api/gbp/locations/")
        .then(({ data }) => setResult(data))
        .catch((cause) =>
          setError(cause instanceof ClientApiError ? cause.message : "위치 목록을 불러오지 못했습니다.")
        )
        .finally(() => setLoading(false));
    });
    return () => {
      alive = false;
    };
  }, [status?.connected]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Local</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">리스팅 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Google Business Profile에 등록된 실제 비즈니스 위치 목록입니다.
        </p>
      </header>

      <div className="mb-6">
        <GbpConnectionCard status={status} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {status?.connected && loading && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          위치 목록을 불러오는 중…
        </div>
      )}

      {status?.connected && !loading && result && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          {result.reason && result.locations.length === 0 ? (
            <p className="text-sm text-zinc-500">{result.reason}</p>
          ) : result.locations.length === 0 ? (
            <p className="text-sm text-zinc-500">
              이 계정에 등록된 위치가 없습니다. Google Business Profile에서 위치를 먼저 등록해 주세요.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                    <th className="py-2 pr-4 font-medium">위치명</th>
                    <th className="py-2 pr-4 font-medium">주소</th>
                    <th className="py-2 pr-4 font-medium">전화번호</th>
                    <th className="py-2 pr-4 font-medium">카테고리</th>
                    <th className="py-2 font-medium">웹사이트</th>
                  </tr>
                </thead>
                <tbody>
                  {result.locations.map((location) => (
                    <tr key={location.name} className="border-b border-zinc-100 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-zinc-800">{location.title}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">{location.address ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">{location.phone ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">{location.primaryCategory ?? "—"}</td>
                      <td className="py-2.5">
                        {location.websiteUri ? (
                          <a
                            href={location.websiteUri}
                            target="_blank"
                            rel="noreferrer"
                            className="max-w-48 truncate text-blue-600 hover:underline"
                          >
                            {location.websiteUri}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
