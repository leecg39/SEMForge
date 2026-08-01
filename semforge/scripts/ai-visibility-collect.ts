import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, workspaces } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { collectTrackedAnswers } from "@/server/ai-visibility/collect-answers";
import { createPrompt, listPrompts, setPromptTracked } from "@/server/ai-visibility/prompts-store";

/**
 * AI 가시성 답변 수집 러너.
 *
 *   npm run ai:collect -- --domain soverin.cloud --prompt "질문1" --prompt "질문2" [--max 3] [--force]
 *
 * --prompt 로 넘긴 질문은 없으면 등록하고 tracked=true 로 표시한 뒤, tracked 프롬프트를
 * 순차 수집한다. 실과금 동작이므로 기본 상한은 3개다.
 */

const DEFAULT_MAX = 3;

interface RunnerArgs {
  domain: string;
  prompts: string[];
  max: number;
  force: boolean;
}

function parseArgs(argv: string[]): RunnerArgs {
  const prompts: string[] = [];
  let domain = "";
  let max = DEFAULT_MAX;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--domain" && value) {
      domain = value;
      index += 1;
    } else if (flag === "--prompt" && value) {
      prompts.push(value);
      index += 1;
    } else if (flag === "--max" && value) {
      max = Number(value);
      index += 1;
    } else if (flag === "--force") {
      force = true;
    }
  }

  if (!domain) throw new Error("[ai:collect] --domain 이 필요합니다.");
  if (!Number.isInteger(max) || max < 1) throw new Error("[ai:collect] --max 는 1 이상의 정수여야 합니다.");
  return { domain, prompts, max, force };
}

/** 첫 워크스페이스의 owner 로 실행 컨텍스트를 만든다. */
async function resolveAuth(): Promise<AuthContext> {
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("[ai:collect] 워크스페이스가 없습니다. npm run db:seed 를 먼저 실행하세요.");

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.workspaceId, workspace.id))
    .limit(1);
  if (!membership) throw new Error("[ai:collect] 워크스페이스 멤버가 없습니다.");

  return {
    userId: membership.userId,
    email: "cli@local",
    name: "CLI 실행",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspacePlan: workspace.plan,
    role: membership.role,
    sessionId: "cli",
    ip: null,
    userAgent: null,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const auth = await resolveAuth();
  console.log(`[ai:collect] 워크스페이스: ${auth.workspaceName} / 도메인: ${args.domain}`);

  for (const prompt of args.prompts) {
    try {
      const created = await createPrompt(auth, { domain: args.domain, prompt });
      await setPromptTracked(auth, created.id, true);
      console.log(`[ai:collect] 프롬프트 등록: ${prompt}`);
    } catch {
      // 이미 등록된 프롬프트는 건너뛴다.
      console.log(`[ai:collect] 이미 등록됨: ${prompt}`);
    }
  }

  // 기존에 등록만 되고 tracked 가 아닌 것도 이번 실행 대상으로 올린다.
  const existing = await listPrompts(auth, args.domain);
  for (const prompt of existing) {
    if (!prompt.tracked && args.prompts.includes(prompt.prompt)) {
      await setPromptTracked(auth, prompt.id, true);
    }
  }

  console.log(`[ai:collect] 수집 시작 (최대 ${args.max}개, 순차 실행)`);
  const results = await collectTrackedAnswers(auth, {
    domain: args.domain,
    maxPrompts: args.max,
    forceRefresh: args.force,
  });

  let live = 0;
  for (const item of results) {
    const { status, reason, data } = item.result;
    if (status === "live") {
      live += 1;
      const mention =
        data?.brandMentioned === null ? "판정불가" : data?.brandMentioned ? "언급됨" : "언급없음";
      console.log(
        `  [${status}] ${item.prompt}\n      → ${mention} / 인용도메인 ${data?.citedDomains.length ?? 0}개 / 모델 ${data?.model ?? "-"}`,
      );
    } else {
      console.log(`  [${status}] ${item.prompt}\n      → ${reason ?? "사유 없음"}`);
    }
  }

  console.log(`[ai:collect] 완료: ${results.length}건 처리, ${live}건 수집 성공`);
  return live > 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
