// @TASK P2-A1-T1 - Login API
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import { createRuntimeAuthHttpHandlers } from "@/server/auth/runtime";

export function POST(request: Request): Promise<Response> {
  const login = createRuntimeAuthHttpHandlers().login;
  return login(request, undefined);
}
