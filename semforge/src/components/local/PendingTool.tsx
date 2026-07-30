interface Props {
  toolkit: string;
  title: string;
  reason: string;
}

/** 데이터 소스가 아직 없는 도구의 정직한 준비 중 상태. */
export function PendingTool({ toolkit, title, reason }: Props) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{toolkit}</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-900">{title}</h1>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          데이터 소스 준비 중
        </span>
        <p className="mt-4 text-sm leading-6 text-zinc-600">{reason}</p>
        <p className="mt-3 text-xs text-zinc-400">
          SEMForge는 연결된 실제 데이터 소스가 없는 지표를 가짜 숫자로 채우지 않습니다.
        </p>
      </div>
    </div>
  );
}
