"use client";

import { useEffect, useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { GbpConnectionCard, useGbpStatus } from "@/components/local/GbpConnectionCard";

interface Location {
  name: string;
  title: string;
}

interface Review {
  name: string;
  reviewerName: string;
  starRating: number | null;
  comment: string | null;
  createTime: string | null;
  reviewReply: { comment: string } | null;
}

interface ReviewsResponse {
  status: string;
  reason?: string;
  reviews: Review[];
  averageRating: number | null;
  totalReviewCount: number | null;
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-zinc-400">—</span>;
  return (
    <span className="text-amber-500" aria-label={`별점 ${rating}점`}>
      {"★".repeat(rating)}
      <span className="text-zinc-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewsDashboard() {
  const { status } = useGbpStatus();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!status?.connected) return;
    api
      .get<{ locations: Location[] }>("/api/gbp/locations/")
      .then(({ data }) => {
        setLocations(data.locations);
        if (data.locations[0]) setSelected(data.locations[0].name);
      })
      .catch(() => setLocations([]));
  }, [status?.connected]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
      api
        .get<ReviewsResponse>(`/api/gbp/reviews/?location=${encodeURIComponent(selected)}`)
        .then(({ data }) => setResult(data))
        .catch((cause) =>
          setError(cause instanceof ClientApiError ? cause.message : "리뷰를 불러오지 못했습니다.")
        )
        .finally(() => setLoading(false));
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  const submitReply = async (reviewName: string) => {
    const comment = replyDraft[reviewName]?.trim();
    if (!comment) return;
    setReplyingTo(reviewName);
    setError(null);
    try {
      await api.post("/api/gbp/reviews/reply/", { reviewName, comment });
      setReplyDraft((draft) => ({ ...draft, [reviewName]: "" }));
      const { data } = await api.get<ReviewsResponse>(
        `/api/gbp/reviews/?location=${encodeURIComponent(selected)}`
      );
      setResult(data);
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "답글 등록에 실패했습니다.");
    } finally {
      setReplyingTo(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Local</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">리뷰 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Google Business Profile 리뷰를 조회하고 답글을 등록합니다.
        </p>
      </header>

      <div className="mb-6">
        <GbpConnectionCard status={status} />
      </div>

      {status?.connected && (
        <>
          {locations.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <label className="text-sm text-zinc-500">위치</label>
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="h-9 rounded-lg border border-zinc-300 px-2 text-sm"
              >
                {locations.map((location) => (
                  <option key={location.name} value={location.name}>
                    {location.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
              리뷰를 불러오는 중…
            </div>
          )}

          {!loading && result && (
            <>
              <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <p className="text-xs font-medium text-zinc-500">평균 평점</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900">
                    {result.averageRating?.toFixed(1) ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <p className="text-xs font-medium text-zinc-500">전체 리뷰</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900">
                    {result.totalReviewCount ?? result.reviews.length}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <p className="text-xs font-medium text-zinc-500">미답글</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900">
                    {result.reviews.filter((review) => !review.reviewReply).length}
                  </p>
                </div>
              </section>

              {result.status === "unavailable" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                  {result.reason}
                </div>
              ) : result.reviews.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
                  이 위치에는 아직 리뷰가 없습니다.
                </div>
              ) : (
                <section className="space-y-3">
                  {result.reviews.map((review) => (
                    <article key={review.name} className="rounded-xl border border-zinc-200 bg-white p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900">{review.reviewerName}</span>
                          <Stars rating={review.starRating} />
                        </div>
                        <span className="text-xs text-zinc-400">
                          {review.createTime ? new Date(review.createTime).toLocaleDateString("ko-KR") : ""}
                        </span>
                      </div>
                      {review.comment && <p className="mt-2 text-sm text-zinc-700">{review.comment}</p>}

                      {review.reviewReply ? (
                        <div className="mt-3 rounded-lg bg-zinc-50 p-3">
                          <p className="text-xs font-medium text-zinc-500">사장님 답글</p>
                          <p className="mt-1 text-sm text-zinc-700">{review.reviewReply.comment}</p>
                        </div>
                      ) : (
                        <div className="mt-3 flex gap-2">
                          <input
                            value={replyDraft[review.name] ?? ""}
                            onChange={(event) =>
                              setReplyDraft((draft) => ({ ...draft, [review.name]: event.target.value }))
                            }
                            placeholder="답글을 입력하세요"
                            className="h-9 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
                          />
                          <button
                            type="button"
                            disabled={replyingTo === review.name || !(replyDraft[review.name] ?? "").trim()}
                            onClick={() => submitReply(review.name)}
                            className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                          >
                            {replyingTo === review.name ? "등록 중…" : "답글 등록"}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
