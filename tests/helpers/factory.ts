import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import type { Env } from "../../src/api/env";
import type { Role, WorkspaceStatus } from "../../src/shared/constants";
import type { createApp } from "../../src/api/app";
import {
  createSession,
  SESSION_COOKIE,
} from "../../src/api/services/auth/session";
import { users } from "../../src/db/schema/auth";
import {
  memberships,
  workspaceSettings,
  workspaces,
} from "../../src/db/schema/workspaces";
import {
  buildMembership,
  buildUser,
  buildWorkspace,
} from "../../src/db/fixtures/builders";
import {
  readEnvelope,
  testEnv,
  trustedHeaders,
} from "../integration/pipeline/helpers";

type User = typeof users.$inferInsert;
type Member = { user: User; role: Exclude<Role, "owner"> };

export async function createUser(overrides: Partial<User> = {}) {
  const user = buildUser(overrides);
  await drizzle(env.DB).insert(users).values(user);
  return user;
}

export async function createWorkspace({
  owner,
  members = [],
  status,
}: {
  owner?: User;
  members?: Member[];
  status?: WorkspaceStatus;
} = {}) {
  const ownerUser = owner ?? (await createUser());
  const workspace = buildWorkspace({ ownerUserId: ownerUser.id, status });
  const rows = [{ user: ownerUser, role: "owner" as const }, ...members].map(
    ({ user, role }) =>
      buildMembership({ workspaceId: workspace.id, userId: user.id, role }),
  );
  const db = drizzle(env.DB);
  await db.batch([
    db.insert(workspaces).values(workspace),
    db.insert(memberships).values(rows),
    db
      .insert(workspaceSettings)
      .values({ workspaceId: workspace.id, updatedAt: workspace.updatedAt }),
  ]);
  return { workspace, owner: ownerUser };
}

export async function loginAs(user: User) {
  const { token } = await createSession(env.DB, user.id, {});
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

export async function api(
  app: ReturnType<typeof createApp>,
  path: string,
  {
    as,
    method = "GET",
    body,
    env: envOverrides,
  }: {
    as?: User;
    method?: string;
    body?: unknown;
    env?: Partial<Env>;
  } = {},
) {
  const { cookie } = as ? await loginAs(as) : {};
  return app.request(
    path,
    {
      method,
      headers: {
        ...trustedHeaders,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    testEnv(envOverrides),
  );
}

export async function expectError(
  response: Response,
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect((await readEnvelope(response)).code).toBe(code);
}
