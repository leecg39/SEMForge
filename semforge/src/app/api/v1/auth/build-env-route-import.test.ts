// @TASK P2-A1-T1 - Auth routes must not resolve runtime secrets during Next build module evaluation.
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import assert from "node:assert/strict";
import { after, test } from "node:test";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  SEMFORGE_SERVICE: process.env.SEMFORGE_SERVICE,
  DATABASE_URL: process.env.DATABASE_URL,
};

after(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("auth route modules are import-safe under the build profile even when CI exposes DATABASE_URL", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.SEMFORGE_SERVICE = "build";
  process.env.DATABASE_URL = "postgresql://ci-web-login:secret@localhost:5432/semforge_test";

  const sessionModule = await import("./session/route");
  const postModules = await Promise.all([
    import("./login/route"),
    import("./logout/route"),
    import("./invites/accept/route"),
    import("./password/forgot/route"),
    import("./password/reset/route"),
  ]);

  assert.equal(typeof sessionModule.GET, "function");
  for (const routeModule of postModules) {
    assert.equal(typeof routeModule.POST, "function");
  }
});
