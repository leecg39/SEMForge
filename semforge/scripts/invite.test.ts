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
      releaseTarget: "sandbox",
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

  it("requires a valid operational release attestation before paid production invite creation", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let serviceCalled = false;

    const exitCode = await runInvite(
      [
        "--email",
        "owner@example.com",
        "--workspace-name",
        "Agency",
        "--release-target",
        "paid-production",
      ],
      {
        now: () => NOW,
        randomBytes: (size) => Buffer.alloc(size, 37),
        createInvite: async () => {
          serviceCalled = true;
          return { token: "P".repeat(43), expiresAt: EXPIRES_AT };
        },
        currentGitSha: () => "a".repeat(40),
        readReleaseAttestation: () => undefined,
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 1);
    assert.equal(serviceCalled, false);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["운영 유료 초대 release gate 검증에 실패했습니다.\n"]);
  });

  it("keeps sandbox invites explicit and does not require production attestation", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let serviceInput: Record<string, unknown> | undefined;

    const exitCode = await runInvite(
      [
        "--email",
        "owner@example.com",
        "--workspace-name",
        "Agency",
        "--release-target",
        "sandbox",
      ],
      {
        now: () => NOW,
        randomBytes: (size) => Buffer.alloc(size, 41),
        createInvite: async (input) => {
          serviceInput = { ...input };
          return { token: "S".repeat(43), expiresAt: EXPIRES_AT };
        },
        readReleaseAttestation: () => {
          throw new Error("sandbox must not read production attestation");
        },
        currentGitSha: () => {
          throw new Error("sandbox must not require git");
        },
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(stdout, [`${"S".repeat(43)}\n`]);
    assert.deepEqual(stderr, []);
    assert.equal(serviceInput?.releaseTarget, "sandbox");
  });

  it("keeps non-production release target distinct even if an operator points at a production-like DSN", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOperatorDatabaseUrl = process.env.OPERATOR_DATABASE_URL;
    const stdout: string[] = [];
    const stderr: string[] = [];
    let serviceInput: Record<string, unknown> | undefined;

    mutableEnv.NODE_ENV = "development";
    mutableEnv.OPERATOR_DATABASE_URL = "postgresql://prod.example/semforge";
    try {
      const exitCode = await runInvite(
        [
          "--email",
          "owner@example.com",
          "--workspace-name",
          "Agency",
          "--release-target",
          "staging",
        ],
        {
          now: () => NOW,
          randomBytes: (size) => Buffer.alloc(size, 43),
          createInvite: async (input) => {
            serviceInput = { ...input };
            return { token: "D".repeat(43), expiresAt: EXPIRES_AT };
          },
          writeStdout: (value) => stdout.push(value),
          writeStderr: (value) => stderr.push(value),
        },
      );

      assert.equal(exitCode, 0);
      assert.deepEqual(stdout, [`${"D".repeat(43)}\n`]);
      assert.deepEqual(stderr, []);
      assert.equal(serviceInput?.releaseTarget, "staging");
    } finally {
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
      if (originalOperatorDatabaseUrl === undefined) delete mutableEnv.OPERATOR_DATABASE_URL;
      else mutableEnv.OPERATOR_DATABASE_URL = originalOperatorDatabaseUrl;
    }
  });

  it("does not allow sandbox or staging invite targets from a production runtime", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = process.env.NODE_ENV;

    mutableEnv.NODE_ENV = "production";
    try {
      for (const releaseTarget of ["sandbox", "staging"]) {
        const stdout: string[] = [];
        const stderr: string[] = [];
        let serviceCalled = false;

        const exitCode = await runInvite(
          [
            "--email",
            "owner@example.com",
            "--workspace-name",
            "Agency",
            "--release-target",
            releaseTarget,
          ],
          {
            now: () => NOW,
            createInvite: async () => {
              serviceCalled = true;
              return { token: "N".repeat(43), expiresAt: EXPIRES_AT };
            },
            writeStdout: (value) => stdout.push(value),
            writeStderr: (value) => stderr.push(value),
          },
        );

        assert.equal(exitCode, 1);
        assert.equal(serviceCalled, false);
        assert.deepEqual(stdout, []);
        assert.deepEqual(stderr, ["운영 유료 초대 release gate 검증에 실패했습니다.\n"]);
      }
    } finally {
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
    }
  });
});
