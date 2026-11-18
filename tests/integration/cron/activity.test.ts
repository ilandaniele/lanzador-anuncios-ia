import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { session } from "../../../src/api/middleware/session";
import { workspace } from "../../../src/api/middleware/workspace";
import { workspaces } from "../../../src/db/schema/workspaces";
import { api, createUser, createWorkspace } from "../../helpers/factory";

const db = drizzle(env.DB);
const HOUR = 3_600_000;

const app = createApp();
app.get(
  "/w/:wid/probe-activity",
  session({ required: true }),
  workspace(),
  (c) => c.json({ ok: true }),
);

const seed = async (lastActivityAt: number | null) => {
  const member = await createUser();
  const { workspace: seeded } = await createWorkspace({
    members: [{ user: member, role: "viewer" }],
  });
  await db
    .update(workspaces)
    .set({ lastActivityAt })
    .where(eq(workspaces.id, seeded.id));
  return { member, workspaceId: seeded.id };
};

const visit = (
  member: Awaited<ReturnType<typeof seed>>["member"],
  wid: string,
) => api(app, `/api/w/${wid}/probe-activity`, { as: member });

const lastActivityOf = async (workspaceId: string) =>
  (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0]
    ?.lastActivityAt;

describe("workspace middleware activity tracking", () => {
  it("sets last_activity_at on the first request", async () => {
    const { member, workspaceId } = await seed(null);
    const before = Date.now();

    await visit(member, workspaceId);

    expect(await lastActivityOf(workspaceId)).toBeGreaterThanOrEqual(before);
  });

  it("refreshes last_activity_at once it is over an hour old", async () => {
    const { member, workspaceId } = await seed(Date.now() - 2 * HOUR);
    const before = Date.now();

    await visit(member, workspaceId);

    expect(await lastActivityOf(workspaceId)).toBeGreaterThanOrEqual(before);
  });

  it("leaves last_activity_at alone when it is under an hour old", async () => {
    const recent = Date.now() - 10 * 60_000;
    const { member, workspaceId } = await seed(recent);

    await visit(member, workspaceId);

    expect(await lastActivityOf(workspaceId)).toBe(recent);
  });

  it("does not record activity for a non-member", async () => {
    const { workspaceId } = await seed(null);
    const stranger = await createUser();

    const response = await visit(stranger, workspaceId);

    expect(response.status).toBe(404);
    expect(await lastActivityOf(workspaceId)).toBeNull();
  });
});
