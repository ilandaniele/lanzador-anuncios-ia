import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { users } from "../../src/db/schema/auth";
import { api, createUser, expectError } from "../helpers/factory";
import { graphUrl, metaFails } from "../helpers/msw/meta";
import { server } from "../helpers/msw/server";
import { blockedLimiter, openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const APP_ID = "1234567890";
const ROLES_PATH = `${APP_ID}/roles`;
const FACEBOOK_ID = "100012345678";
const baseEnv = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
  META_APP_ID: APP_ID,
  META_APP_SECRET: "app_secret_test",
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const requestTester = (
  as: Caller["as"],
  body: unknown,
  envOverrides: Caller["env"] = {},
) =>
  api(app, "/api/me/meta-tester", {
    as,
    method: "POST",
    body,
    env: { ...baseEnv, ...envOverrides },
  });

const storedFacebookId = (userId: string) =>
  db
    .select({ id: users.metaTesterFacebookId })
    .from(users)
    .where(eq(users.id, userId))
    .then(([row]) => row?.id);

const metaAccepts = (testerIds: (string | null)[] = []) =>
  http.post(graphUrl(ROLES_PATH), ({ request }) => {
    testerIds.push(new URL(request.url).searchParams.get("user"));
    return HttpResponse.json({ success: true });
  });

const metaRejects = () =>
  metaFails(ROLES_PATH, {
    error: { message: "Invalid user id", code: 100, type: "OAuthException" },
  });

describe("POST /api/me/meta-tester", () => {
  it("returns 401 without a session", async () => {
    await expectError(
      await requestTester(undefined, { facebookUserId: FACEBOOK_ID }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 400 for a malformed Facebook ID", async () => {
    const user = await createUser();

    await expectError(
      await requestTester(user, { facebookUserId: "12ab" }),
      400,
      "VALIDATION",
    );
  });

  it("returns 429 when the user is rate limited", async () => {
    const user = await createUser();

    await expectError(
      await requestTester(
        user,
        { facebookUserId: FACEBOOK_ID },
        { RL_EXP: blockedLimiter },
      ),
      429,
      "RATE_LIMITED",
    );
  });

  it("adds the user's own Facebook ID as a tester and stores it", async () => {
    const testerIds: (string | null)[] = [];
    server.use(metaAccepts(testerIds));
    const user = await createUser();

    const response = await requestTester(user, {
      facebookUserId: ` ${FACEBOOK_ID} `,
    });

    expect(response.status).toBe(204);
    expect(testerIds).toEqual([FACEBOOK_ID]);
    expect(await storedFacebookId(user.id)).toBe(FACEBOOK_ID);
  });

  it("returns 409 on a second request without calling Meta", async () => {
    const testerIds: (string | null)[] = [];
    server.use(metaAccepts(testerIds));
    const user = await createUser();
    await requestTester(user, { facebookUserId: FACEBOOK_ID });

    await expectError(
      await requestTester(user, { facebookUserId: "100099999999" }),
      409,
      "META_TESTER_ALREADY_REQUESTED",
    );
    expect(testerIds).toEqual([FACEBOOK_ID]);
  });

  it("returns 422 when Meta rejects and lets the user retry", async () => {
    server.use(metaRejects());
    const user = await createUser();

    await expectError(
      await requestTester(user, { facebookUserId: FACEBOOK_ID }),
      422,
      "META_TESTER_REJECTED",
    );
    expect(await storedFacebookId(user.id)).toBeNull();

    server.use(metaAccepts());
    const retry = await requestTester(user, { facebookUserId: FACEBOOK_ID });
    expect(retry.status).toBe(204);
  });

  it("only touches the caller's own row", async () => {
    server.use(metaAccepts());
    const caller = await createUser();
    const other = await createUser();

    await requestTester(caller, { facebookUserId: FACEBOOK_ID });

    expect(await storedFacebookId(other.id)).toBeNull();
  });
});
