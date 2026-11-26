import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { buildSubscription } from "../../../src/db/fixtures/builders";
import { subscriptions } from "../../../src/db/schema/billing";
import { auditLog } from "../../../src/db/schema/ops";
import { workspaces } from "../../../src/db/schema/workspaces";
import { api, createWorkspace } from "../../helpers/factory";
import { openLimiter } from "../pipeline/helpers";

export const db = drizzle(env.DB);
export const DAY = 24 * 60 * 60 * 1000;

export const openLimits = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

export const callApi = (
  app: Parameters<typeof api>[0],
  path: string,
  options: Caller = {},
) => api(app, path, { ...options, env: { ...openLimits, ...options.env } });

export async function seedWorkspace(
  billing: Partial<typeof workspaces.$inferInsert> = {},
  members: Parameters<typeof createWorkspace>[0] = {},
) {
  const seeded = await createWorkspace(members);
  if (Object.keys(billing).length > 0) {
    await db
      .update(workspaces)
      .set(billing)
      .where(eq(workspaces.id, seeded.workspace.id));
  }
  return seeded;
}

export const expiredTrial = () => ({
  planId: "starter",
  trialEndsAt: Date.now() - DAY,
});

export async function addSubscription(
  workspaceId: string,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const row = buildSubscription({ workspaceId, ...overrides });
  await db.insert(subscriptions).values(row);
  return row;
}

export const subscriptionRows = (workspaceId: string) =>
  db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));

export const workspaceRow = async (workspaceId: string) => {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return row!;
};

export const auditActions = async (workspaceId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.action, action)),
    );
