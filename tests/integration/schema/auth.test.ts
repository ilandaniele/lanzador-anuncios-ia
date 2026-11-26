import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

interface IndexRow {
  name: string;
  unique: number;
  partial: number;
}

const NOW = 1_700_000_000_000;

async function listIndexes(table: string): Promise<IndexRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT name, "unique", partial FROM pragma_index_list('${table}')`,
  ).all<IndexRow>();
  return results;
}

async function findIndex(table: string, name: string) {
  const indexes = await listIndexes(table);
  return indexes.find((index) => index.name === name);
}

async function uniqueIndexColumns(
  table: string,
  unique: boolean,
): Promise<string[][]> {
  const indexes = (await listIndexes(table)).filter(
    (index) => Boolean(index.unique) === unique,
  );
  return Promise.all(
    indexes.map(async ({ name }) => {
      const { results } = await env.DB.prepare(
        `SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`,
      ).all<{ name: string }>();
      return results.map((column) => column.name);
    }),
  );
}

describe("plans seed", () => {
  it("has beta active with the AI neuron limits", async () => {
    const beta = await env.DB.prepare(
      "SELECT is_active, ai_daily_neurons, ai_monthly_neurons FROM plans WHERE id = 'beta'",
    ).first();

    expect(beta).toEqual({
      is_active: 1,
      ai_daily_neurons: 2000,
      ai_monthly_neurons: 30000,
    });
  });

  it("has starter and pro active with their ARS prices and limits", async () => {
    const { results } = await env.DB.prepare(
      "SELECT id, is_active, price_monthly_minor, currency, max_members, max_ad_accounts FROM plans WHERE id IN ('starter', 'pro') ORDER BY id",
    ).all();

    expect(results).toEqual([
      {
        id: "pro",
        is_active: 1,
        price_monthly_minor: 8000000,
        currency: "ARS",
        max_members: 10,
        max_ad_accounts: 10,
      },
      {
        id: "starter",
        is_active: 1,
        price_monthly_minor: 3000000,
        currency: "ARS",
        max_members: 3,
        max_ad_accounts: 2,
      },
    ]);
  });
});

describe("unique indexes", () => {
  it.each([
    ["users", ["email"]],
    ["sessions", ["token_hash"]],
    ["magic_links", ["token_hash"]],
    ["beta_invites", ["email"]],
    ["memberships", ["workspace_id", "user_id"]],
    ["invitations", ["token_hash"]],
    ["oauth_states", ["state_hash"]],
  ])("%s is unique on %j", async (table, columns) => {
    expect(await uniqueIndexColumns(table, true)).toContainEqual(columns);
  });

  it.each([
    ["memberships", "memberships_one_owner"],
    ["invitations", "invitations_pending_unique"],
  ])("%s has partial unique index %s", async (table, name) => {
    const index = await findIndex(table, name);

    expect(index).toMatchObject({ unique: 1, partial: 1 });
  });

  it.each([
    ["sessions", "sessions_prev_hash_idx"],
    ["sessions", "sessions_user_idx"],
    ["sessions", "sessions_expires_idx"],
    ["magic_links", "magic_links_email_created_idx"],
    ["magic_links", "magic_links_expires_idx"],
    ["beta_invites", "beta_invites_created_idx"],
    ["workspaces", "workspaces_status_created_idx"],
    ["workspaces", "workspaces_owner_idx"],
    ["workspaces", "workspaces_activity_idx"],
    ["memberships", "memberships_user_idx"],
    ["invitations", "invitations_ws_created_idx"],
    ["invitations", "invitations_email_idx"],
    ["oauth_states", "oauth_states_expires_idx"],
  ])("%s has index %s", async (table, name) => {
    expect(await findIndex(table, name)).toMatchObject({
      unique: 0,
      partial: 0,
    });
  });
});

describe("constraints", () => {
  async function insertUser(id: string, email: string) {
    await env.DB.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    )
      .bind(id, email, NOW)
      .run();
  }

  async function insertWorkspace(id: string, ownerUserId: string) {
    await env.DB.prepare(
      "INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at) VALUES (?, 'W', ?, ?, ?)",
    )
      .bind(id, ownerUserId, NOW, NOW)
      .run();
  }

  async function insertMembership(
    id: string,
    workspaceId: string,
    userId: string,
    role: string,
  ) {
    await env.DB.prepare(
      "INSERT INTO memberships (id, workspace_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(id, workspaceId, userId, role, NOW, NOW)
      .run();
  }

  async function insertInvitation(
    id: string,
    workspaceId: string,
    tokenHash: string,
    revokedAt: number | null,
  ) {
    await env.DB.prepare(
      "INSERT INTO invitations (id, workspace_id, email, role, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, 'a@b.test', 'viewer', ?, ?, ?, ?)",
    )
      .bind(id, workspaceId, tokenHash, NOW, NOW, revokedAt)
      .run();
  }

  it("rejects an invalid users.status", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO users (id, email, status, created_at) VALUES ('u-bad', 'bad@x.test', 'banned', ?)",
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects max_scale_percent above 50", async () => {
    await insertUser("u-set", "set@x.test");
    await insertWorkspace("w-set", "u-set");

    await expect(
      env.DB.prepare(
        "INSERT INTO workspace_settings (workspace_id, max_scale_percent, updated_at) VALUES ('w-set', 51, ?)",
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("applies workspace_settings defaults", async () => {
    await env.DB.prepare(
      "INSERT INTO workspace_settings (workspace_id, updated_at) VALUES ('w-set', ?)",
    )
      .bind(NOW)
      .run();

    const row = await env.DB.prepare(
      "SELECT max_campaign_budget_minor, max_scale_percent, default_countries, json_valid(launch_defaults) AS valid FROM workspace_settings WHERE workspace_id = 'w-set'",
    ).first();

    expect(row).toEqual({
      max_campaign_budget_minor: 30000,
      max_scale_percent: 50,
      default_countries: '["AR"]',
      valid: 1,
    });
  });

  it("allows only one owner per workspace", async () => {
    await insertUser("u-own1", "own1@x.test");
    await insertUser("u-own2", "own2@x.test");
    await insertWorkspace("w-own", "u-own1");
    await insertMembership("m-1", "w-own", "u-own1", "owner");

    await expect(
      insertMembership("m-2", "w-own", "u-own2", "owner"),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    await insertMembership("m-3", "w-own", "u-own2", "editor");
  });

  it("allows one pending invitation per workspace and email", async () => {
    await insertInvitation("i-1", "w-own", "hash-1", null);

    await expect(
      insertInvitation("i-2", "w-own", "hash-2", null),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    await insertInvitation("i-3", "w-own", "hash-3", NOW);
  });

  it("cascades workspace delete to its tenant rows", async () => {
    await env.DB.prepare("DELETE FROM workspaces WHERE id = 'w-own'").run();

    const remaining = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM memberships WHERE workspace_id = 'w-own') AS memberships, (SELECT COUNT(*) FROM invitations WHERE workspace_id = 'w-own') AS invitations",
    ).first();

    expect(remaining).toEqual({ memberships: 0, invitations: 0 });
  });
});
