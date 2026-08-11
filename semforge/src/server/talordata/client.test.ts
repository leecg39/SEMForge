import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";
import {
  fetchSerp,
  parsePaidResults,
  RetryableTalordataError,
  shoppingResponseAvailability,
} from "@/server/talordata/client";

const previousToken = process.env.TALORDATA_API_TOKEN;

before(() => {
  process.env.TALORDATA_API_TOKEN = "test-token";
});

after(() => {
  if (previousToken === undefined) {
    delete process.env.TALORDATA_API_TOKEN;
  } else {
    process.env.TALORDATA_API_TOKEN = previousToken;
  }
});

function successfulResponse(): Response {
  return Response.json({
    code: 0,
    data: {
      search_metadata: {
        id: "request-1",
        status: "Success",
        total_time_taken: 1.25,
      },
      organic: [
        {
          title: "Example",
          link: "https://www.example.com/page",
          display_link: "example.com",
          description: "Result",
        },
      ],
    },
  });
}

test("공식 POST/form 요청 계약과 Bearer 인증을 사용한다", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return successfulResponse();
  };

  await fetchSerp(
    {
      q: "피자 맛집",
      engine: "google",
      num: 20,
      gl: "KR",
      hl: "KO",
      device: "mobile",
    },
    { fetchImpl }
  );

  assert.equal(capturedUrl, "https://serpapi.talordata.net/serp/v1/request");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(capturedInit?.headers, {
    Accept: "application/json",
    Authorization: "Bearer test-token",
    "Content-Type": "application/x-www-form-urlencoded",
  });
  assert.ok(capturedInit?.body instanceof URLSearchParams);
  assert.deepEqual(Object.fromEntries(capturedInit.body), {
    engine: "google",
    q: "피자 맛집",
    num: "20",
    gl: "kr",
    hl: "ko",
    device: "mobile",
    json: "1",
  });
});

test("Google과 Bing에 공급자별 공식 위치 파라미터를 전달한다", async () => {
  const bodies: Record<string, string>[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.ok(init?.body instanceof URLSearchParams);
    bodies.push(Object.fromEntries(init.body));
    return successfulResponse();
  };
  await fetchSerp({
    q: "서울 맛집",
    engine: "google",
    gl: "KR",
    hl: "ko",
    location: "Seoul,South Korea",
    uule: "uule-value",
  }, { fetchImpl });
  await fetchSerp({
    q: "서울 맛집",
    engine: "bing",
    gl: "KR",
    hl: "ko",
    location: "Seoul,South Korea",
    latitude: 37.5665,
    longitude: 126.978,
  }, { fetchImpl });
  assert.equal(bodies[0]?.location, "Seoul,South Korea");
  assert.equal(bodies[0]?.uule, "uule-value");
  assert.equal(bodies[1]?.cc, "kr");
  assert.equal(bodies[1]?.mkt, "ko-KR");
  assert.equal(bodies[1]?.lat, "37.5665");
  assert.equal(bodies[1]?.lon, "126.978");
});

test("일시적인 Collection failed 응답 뒤 성공하면 재시도 결과를 반환한다", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ code: 1, message: "error, Collection failed" });
    }
    return successfulResponse();
  };

  const result = await fetchSerp(
    { q: "pizza" },
    {
      fetchImpl,
      maxAttempts: 3,
      retryBaseDelayMs: 10,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    }
  );

  assert.equal(calls, 2);
  assert.deepEqual(delays, [10]);
  assert.equal(result.organic[0]?.domain, "example.com");
  assert.equal(result.provider.id, "request-1");
});

test("인증 실패는 재시도하지 않고 즉시 토큰 오류로 반환한다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  };

  await assert.rejects(
    () => fetchSerp({ q: "pizza" }, { fetchImpl, maxAttempts: 3 }),
    (error: unknown) =>
      error instanceof ApiError && error.message === "SERP API 토큰이 유효하지 않습니다."
  );
  assert.equal(calls, 1);
});

test("수집 엔진 실패가 계속되면 횟수와 원인을 포함한 안전한 오류를 반환한다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ code: 1, message: "error, Collection failed" });
  };

  await assert.rejects(
    () =>
      fetchSerp(
        { q: "pizza" },
        {
          fetchImpl,
          maxAttempts: 3,
          retryBaseDelayMs: 0,
          sleep: async () => undefined,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.match(error.message, /토큰 승인 문제는 아니며/);
      assert.deepEqual(error.details, {
        attempts: 3,
        kind: "provider",
        reason: "error, Collection failed",
      });
      return true;
    }
  );
  assert.equal(calls, 3);
});

test("검색 광고와 쇼핑 광고 응답 변형을 공급자 중립 형태로 정규화한다", () => {
  const fixture = {
    top_ads: [
      {
        position: 2,
        headline: "상단 검색 광고",
        landing_page: "https://ads.example.com/landing",
        displayed_link: "ads.example.com",
        snippet: "검색 광고 설명",
        advertiser: "Example Ads",
      },
    ],
    bottom_ads: [
      {
        title: "하단 검색 광고",
        link: "https://bottom.example.net/",
      },
    ],
    shopping_results: [
      {
        rank: 3,
        product_title: "테스트 상품",
        product_link: "https://shop.example.org/product/1",
        seller: "Example Shop",
        price: "₩39,000",
        thumbnail: "https://cdn.example.org/product.png",
      },
    ],
  };

  const rows = parsePaidResults(fixture);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => [row.kind, row.placement]), [
    ["search_ad", "top"],
    ["search_ad", "bottom"],
    ["shopping_ad", "shopping"],
  ]);
  assert.equal(rows[0]?.domain, "ads.example.com");
  assert.equal(rows[0]?.advertiser, "Example Ads");
  assert.equal(rows[2]?.title, "테스트 상품");
  assert.equal(rows[2]?.price, "₩39,000");
  assert.equal(shoppingResponseAvailability(fixture), "available");
  assert.equal(shoppingResponseAvailability({ organic: [] }), "unavailable");
});

test("숫자형 쇼핑 가격도 정보 손실 없이 문자열로 보존한다", () => {
  const [row] = parsePaidResults({
    shopping_results: [
      { title: "숫자 가격 상품", link: "https://shop.example.com/1", extracted_price: 39000 },
    ],
  });
  assert.equal(row?.price, "39000");
});

test("중복 광고는 제거하되 상단과 하단 배치는 별개로 보존한다", () => {
  const ad = { title: "같은 광고", link: "https://duplicate.example.com/" };
  const rows = parsePaidResults({
    top_ads: [ad],
    ads_top: [ad],
    bottom_ads: [ad],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.placement), ["top", "bottom"]);
});

test("AIO 키 미존재와 명시적 부재를 구분하고 우선 키의 false를 보존한다", async () => {
  const responses = [
    {
      code: 0,
      data: {
        organic: [{ title: "Example", link: "https://example.com" }],
      },
    },
    {
      code: 0,
      data: {
        organic: [{ title: "Example", link: "https://example.com" }],
        ai_overview: false,
      },
    },
    {
      code: 0,
      data: {
        organic: [{ title: "Example", link: "https://example.com" }],
        ai_overview: null,
      },
    },
    {
      code: 0,
      data: {
        organic: [{ title: "Example", link: "https://example.com" }],
        ai_overview: false,
        google_ai_overview: {
          sources: [{ link: "https://should-not-win.example" }],
        },
      },
    },
  ];
  let index = 0;
  const fetchImpl: typeof fetch = async () => Response.json(responses[index++]);

  const missing = await fetchSerp({ q: "키 미존재" }, { fetchImpl, maxAttempts: 1 });
  const explicitAbsent = await fetchSerp(
    { q: "명시적 부재" },
    { fetchImpl, maxAttempts: 1 },
  );
  const explicitNull = await fetchSerp(
    { q: "명시적 null" },
    { fetchImpl, maxAttempts: 1 },
  );
  const preferredFalse = await fetchSerp(
    { q: "우선 키 보존" },
    { fetchImpl, maxAttempts: 1 },
  );

  assert.deepEqual(missing.aiOverview, {
    present: false,
    presenceAvailable: false,
    citationsAvailable: false,
    citations: [],
  });
  assert.deepEqual(explicitAbsent.aiOverview, {
    present: false,
    presenceAvailable: true,
    citationsAvailable: false,
    citations: [],
  });
  assert.deepEqual(explicitNull.aiOverview, {
    present: false,
    presenceAvailable: true,
    citationsAvailable: false,
    citations: [],
  });
  assert.deepEqual(preferredFalse.aiOverview, {
    present: false,
    presenceAvailable: true,
    citationsAvailable: false,
    citations: [],
  });
});

test("AIO 본문은 있지만 검증 가능한 인용 URL이 없으면 인용 확인 불가로 보존한다", async () => {
  const result = await fetchSerp(
    { q: "인용 없는 AIO", aiOverview: true },
    {
      fetchImpl: async () =>
        Response.json({
          code: 0,
          data: {
            organic: [{ title: "Example", link: "https://example.com" }],
            ai_overview: {
              text: "공급자가 답변 본문만 제공한 경우",
              sources: [],
            },
          },
        }),
      maxAttempts: 1,
    },
  );

  assert.deepEqual(result.aiOverview, {
    present: true,
    presenceAvailable: true,
    citationsAvailable: false,
    citations: [],
  });
});

test("worker abort는 client 내부 재시도나 backoff를 만들지 않고 즉시 전파한다", async () => {
  const controller = new AbortController();
  controller.abort("worker shutdown");
  let calls = 0;
  let sleeps = 0;

  await assert.rejects(
    () =>
      fetchSerp(
        { q: "중단된 수집" },
        {
          signal: controller.signal,
          maxAttempts: 3,
          fetchImpl: async (_input, init) => {
            calls += 1;
            assert.equal(init?.signal?.aborted, true);
            throw new DOMException("aborted", "AbortError");
          },
          sleep: async () => {
            sleeps += 1;
          },
        },
      ),
    (error: unknown) =>
      error instanceof RetryableTalordataError && error.kind === "aborted",
  );
  assert.equal(calls, 1);
  assert.equal(sleeps, 0);
});

test("공식 data.result 봉투를 풀고 AIO 요청을 명시하여 하나의 SERP로 반환한다", async () => {
  let capturedBody: URLSearchParams | undefined;
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.ok(init?.body instanceof URLSearchParams);
    capturedBody = init.body;
    return Response.json({
      code: 0,
      data: {
        task_id: "task-official-1",
        result: {
          organic: [
            {
              position: 37,
              title: "SEMForge",
              link: "https://reports.example.com/weekly",
            },
          ],
          ai_overview: {
            sources: [
              {
                title: "SEMForge 보고서",
                link: "https://reports.example.com/aio",
              },
            ],
          },
        },
      },
    });
  };

  const result = await fetchSerp(
    { q: "SEMForge", num: 100, aiOverview: true },
    { fetchImpl, maxAttempts: 1 },
  );

  assert.equal(capturedBody?.get("num"), "100");
  assert.equal(capturedBody?.get("ai_overview"), "true");
  assert.equal(result.organic[0]?.position, 37);
  assert.equal(result.provider.id, "task-official-1");
  assert.equal(result.aiOverview.presenceAvailable, true);
  assert.equal(result.aiOverview.citations[0]?.domain, "reports.example.com");
});

test("공식 code=400 파라미터 오류는 재시도하지 않는다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ code: 400, data: "Missing query `q` parameter" });
  };

  await assert.rejects(
    () => fetchSerp({ q: "invalid" }, { fetchImpl, maxAttempts: 3 }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "INTERNAL" &&
      /Missing query/.test(error.message),
  );
  assert.equal(calls, 1);
});
