// @TASK P2-A1-T1 - Invite-only workspace bootstrap CLI tests
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-가입과-운영자-cli
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resetServerEnvForTests } from "@/lib/env";

import { createInviteThroughAuthService, parseInviteArgs, runInvite } from "./invite";

const NOW = new Date("2026-08-11T03:00:00.000Z");
const EXPIRES_AT = new Date("2026-08-18T03:00:00.000Z");

describe("invite CLI argument parsing", () => {
  it("normalizes the required email and workspace name", () => {
    assert.deepEqual(
      parseInviteArgs([
        "--email",
        "  OWNER@Example.COM ",
        "--workspace-name",
        "  서울   검색 대행사  ",
      ]),
      {
        email: "owner@example.com",
        workspaceName: "서울 검색 대행사",
      },
    );
  });

  it("rejects missing, malformed, duplicate, and unsupported arguments", () => {
    const invalidArguments: readonly (readonly string[])[] = [
      [],
      ["--email", "not-an-email", "--workspace-name", "Agency"],
      ["--email", "owner\u0000@example.com", "--workspace-name", "Agency"],
      ["--email", "owner@example.com", "--workspace-name", "Agency\u0000Hidden"],
      ["--email", "owner@example.com"],
      ["--email", "owner@example.com", "--workspace-name", "Agency", "--role", "viewer"],
      ["--email", "owner@example.com", "--workspace-name", "Agency", "--unknown", "value"],
      [
        "--email",
        "owner@example.com",
        "--workspace-name",
        "Agency",
        "--workspace-id",
        "not-a-uuid",
      ],
      [
        "--email",
        "owner@example.com",
        "--email",
        "other@example.com",
        "--workspace-name",
        "Agency",
      ],
      [
        "--email",
        "admin@example.com",
        "--workspace-name",
        "Agency",
        "--role",
        "admin",
      ],
    ];

    for (const argv of invalidArguments) {
      assert.throws(() => parseInviteArgs(argv));
    }
  });

});

describe("invite CLI execution", () => {
  it("calls the auth service before printing its raw token exactly once", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const events: string[] = [];
    let serviceInput: Record<string, unknown> | undefined;
    const rawToken = "T".repeat(43);

    const exitCode = await runInvite(
      ["--email", "OWNER@EXAMPLE.COM", "--workspace-name", "서울 SEO"],
      {
        now: () => NOW,
        randomBytes: (size) => Buffer.alloc(size, 11),
        createInvite: async (input) => {
          events.push("service");
          serviceInput = { ...input };
          return { token: rawToken, expiresAt: EXPIRES_AT };
        },
        writeStdout: (value) => {
          events.push("stdout");
          stdout.push(value);
        },
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(events, ["service", "stdout"]);
    assert.equal(stdout.length, 1);
    assert.equal(stdout[0], `${rawToken}\n`);
    assert.deepEqual(stderr, []);
    assert.deepEqual(serviceInput, {
      workspaceName: "서울 SEO",
      workspaceSlug: "seo-0b0b0b0b0b0b0b0b0b0b0b0b",
      email: "owner@example.com",
    });
  });

  it("returns a nonzero code without leaking database errors or printing a token", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvite(
      ["--email", "owner@example.com", "--workspace-name", "Agency"],
      {
        randomBytes: (size) => Buffer.alloc(size, 19),
        createInvite: async () => {
          throw new Error("postgres://db-user:super-secret@db/internal-token-hash");
        },
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["초대 생성에 실패했습니다.\n"]);
    assert.equal(stderr.join("").includes("super-secret"), false);
    assert.equal(stderr.join("").includes("postgres://"), false);
  });

  it("rejects a malformed service token without writing any stdout", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvite(
      ["--email", "owner@example.com", "--workspace-name", "Agency"],
      {
        now: () => NOW,
        randomBytes: (size) => Buffer.alloc(size, 23),
        createInvite: async () => ({
          token: `unsafe\n${"X".repeat(43)}`,
          expiresAt: EXPIRES_AT,
        }),
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["초대 생성에 실패했습니다.\n"]);
  });

  it("rejects an invite that expires more than seven days after verification", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvite(
      ["--email", "owner@example.com", "--workspace-name", "Agency"],
      {
        now: () => NOW,
        randomBytes: (size) => Buffer.alloc(size, 29),
        createInvite: async () => ({
          token: "L".repeat(43),
          expiresAt: new Date(EXPIRES_AT.getTime() + 1),
        }),
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["초대 생성에 실패했습니다.\n"]);
  });

  it("requests only the operator database role in the production wiring", async () => {
    const requestedRoles: string[] = [];

    await assert.rejects(() =>
      createInviteThroughAuthService(
        {
          workspaceName: "Agency",
          workspaceSlug: "agency-010101010101010101010101",
          email: "owner@example.com",
        },
        (role) => {
          requestedRoles.push(role);
          throw new Error("stop before opening a database connection");
        },
      ),
    );

    assert.deepEqual(requestedRoles, ["operator"]);
  });

  it("hard-fails without OPERATOR_DATABASE_URL", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOperatorUrl = process.env.OPERATOR_DATABASE_URL;
    const stdout: string[] = [];
    const stderr: string[] = [];

    mutableEnv.NODE_ENV = "test";
    delete mutableEnv.OPERATOR_DATABASE_URL;
    resetServerEnvForTests();

    try {
      const exitCode = await runInvite(
        ["--email", "owner@example.com", "--workspace-name", "Agency"],
        {
          now: () => NOW,
          randomBytes: (size) => Buffer.alloc(size, 31),
          writeStdout: (value) => stdout.push(value),
          writeStderr: (value) => stderr.push(value),
        },
      );

      assert.equal(exitCode, 1);
      assert.deepEqual(stdout, []);
      assert.deepEqual(stderr, ["초대 생성에 실패했습니다.\n"]);
    } finally {
      resetServerEnvForTests();
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
      if (originalOperatorUrl === undefined) delete mutableEnv.OPERATOR_DATABASE_URL;
      else mutableEnv.OPERATOR_DATABASE_URL = originalOperatorUrl;
    }
  });

  it("rejects an existing-workspace invite before calling the service", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let serviceCalled = false;

    const exitCode = await runInvite(
      [
        "--email",
        "owner@example.com",
        "--workspace-name",
        "Agency",
        "--workspace-id",
        "123e4567-e89b-42d3-a456-426614174000",
      ],
      {
        createInvite: async () => {
          serviceCalled = true;
          return { token: "E".repeat(43), expiresAt: EXPIRES_AT };
        },
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 2);
    assert.equal(serviceCalled, false);
    assert.deepEqual(stdout, []);
    assert.equal(stderr.length, 1);
  });
});
