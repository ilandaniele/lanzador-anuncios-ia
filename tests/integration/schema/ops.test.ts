import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

interface IndexRow {
  name: string;
  unique: number;
  partial: number;
}

interface ForeignKeyRow {
  table: string;
  from: string;
  on_delete: string;
}

interface Fixture {
  workspaceId: string;
  userId: string;
}

const NOW = 1_700_000_000_000;

let fixtureCount = 0;

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

async function indexColumns(name: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`,
  ).all<{ name: string }>();
  return results.map((column) => column.name);
}

async function uniqueIndexColumns(table: string): Promise<string[][]> {
  const indexes = (await listIndexes(table)).filter((index) => index.unique);
  return Promise.all(indexes.map(({ name }) => indexColumns(name)));
}

async function findForeignKey(table: string, from: string) {
  const { results } = await env.DB.prepare(
    `SELECT "table", "from", on_delete FROM pragma_foreign_key_list('${table}')`,
  ).all<ForeignKeyRow>();
  return results.find((key) => key.from === from);
}

async function countRows(table: string, where: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
  ).first<{ n: number }>();
  return row?.n ?? -1;
}

async function seedFixture(): Promise<Fixture> {
  const key = `o${++fixtureCount}`;
  const fixture: Fixture = { workspaceId: `w-${key}`, userId: `u-${key}` };
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    ).bind(fixture.userId, `${key}@x.test`, NOW),
    env.DB.prepare(
      "INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at) VALUES (?, 'W', ?, ?, ?)",
    ).bind(fixture.workspaceId, fixture.userId, NOW, NOW),
  ]);
  return fixture;
}

function insertLaunch(fixture: Fixture, id: string, status = "draft") {
  return env.DB.prepare(
    "INSERT INTO launches (id, workspace_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, fixture.workspaceId, status, NOW, NOW)
    .run();
}

function insertLaunchItem(
  fixture: Fixture,
  launchId: string,
  id: string,
  position: number,
) {
  return env.DB.prepare(
    "INSERT INTO launch_items (id, workspace_id, launch_id, position, source, ad_name, created_at, updated_at) VALUES (?, ?, ?, ?, 'upload', 'ad', ?, ?)",
  )
    .bind(id, fixture.workspaceId, launchId, position, NOW, NOW)
    .run();
}

function insertRun(fixture: Fixture, id: string) {
  return env.DB.prepare(
    "INSERT INTO pilot_runs (id, workspace_id, trigger, started_at) VALUES (?, ?, 'cron', ?)",
  )
    .bind(id, fixture.workspaceId, NOW)
    .run();
}

function insertProposal(
  fixture: Fixture,
  runId: string,
  id: string,
  overrides: { dedupeKey?: string; status?: string; percent?: number | null },
) {
  const { dedupeKey = id, status = "pending", percent = null } = overrides;
  return env.DB.prepare(
    "INSERT INTO pilot_proposals (id, workspace_id, run_id, rule_type, action, ad_account_meta_id, object_level, object_meta_id, object_name, evidence, percent, status, dedupe_key, expires_at, created_at) VALUES (?, ?, ?, 'scale_winner', 'scale', 'act_1', 'campaign', 'c-1', 'Camp', '{}', ?, ?, ?, ?, ?)",
  )
    .bind(id, fixture.workspaceId, runId, percent, status, dedupeKey, NOW, NOW)
    .run();
}

function insertAiUsage(fixture: Fixture, id: string, provider = "workers_ai") {
  return env.DB.prepare(
    "INSERT INTO ai_usage (id, workspace_id, feature, provider, model, status, created_at) VALUES (?, ?, 'copy', ?, '@cf/meta/llama', 'ok', ?)",
  )
    .bind(id, fixture.workspaceId, provider, NOW)
    .run();
}

function insertChatSession(fixture: Fixture, id: string, messageCount = 0) {
  return env.DB.prepare(
    "INSERT INTO chat_sessions (id, workspace_id, user_id, message_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, fixture.workspaceId, fixture.userId, messageCount, NOW, NOW)
    .run();
}

function insertChatMessage(
  fixture: Fixture,
  sessionId: string,
  id: string,
  content: string,
  aiUsageId: string | null = null,
) {
  return env.DB.prepare(
    "INSERT INTO chat_messages (id, workspace_id, session_id, role, content, ai_usage_id, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?)",
  )
    .bind(id, fixture.workspaceId, sessionId, content, aiUsageId, NOW)
    .run();
}

function insertErrorEvent(id: string, message: string) {
  return env.DB.prepare(
    "INSERT INTO error_events (id, source, message, created_at) VALUES (?, 'api', ?, ?)",
  )
    .bind(id, message, NOW)
    .run();
}

describe("unique indexes", () => {
  it.each([
    ["launch_items", ["launch_id", "position"]],
    [
      "insights_cache",
      ["workspace_id", "ad_account_asset_id", "level", "range_key"],
    ],
    ["pilot_rules", ["workspace_id", "rule_type"]],
    ["protected_campaigns", ["workspace_id", "campaign_meta_id"]],
    ["usage_counters", ["scope", "scope_id", "period", "metric"]],
    ["data_deletion_requests", ["confirmation_code"]],
  ])("%s is unique on %j", async (table, columns) => {
    expect(await uniqueIndexColumns(table)).toContainEqual(columns);
  });
});

describe("indexes", () => {
  it.each([
    ["launches", "launches_ws_created_idx"],
    ["launches", "launches_ws_status_created_idx"],
    ["launches", "launches_ws_campaign_idx"],
    ["launch_items", "launch_items_launch_updated_idx"],
    ["launch_items", "launch_items_launch_status_idx"],
    ["launch_items", "launch_items_ws_ad_idx"],
    ["insights_cache", "insights_cache_expires_idx"],
    ["pilot_runs", "pilot_runs_ws_started_idx"],
    ["pilot_proposals", "pilot_proposals_ws_status_created_idx"],
    ["pilot_proposals", "pilot_proposals_expires_idx"],
    ["audit_log", "audit_ws_created_idx"],
    ["audit_log", "audit_ws_origin_created_idx"],
    ["audit_log", "audit_log_actor_idx"],
    ["audit_log", "audit_ws_object_created_idx"],
    ["ai_usage", "ai_usage_ws_created_idx"],
    ["chat_sessions", "chat_sessions_ws_user_updated_idx"],
    ["chat_messages", "chat_messages_session_created_idx"],
    ["error_events", "error_events_created_idx"],
    ["error_events", "error_events_source_created_idx"],
  ])("%s has index %s", async (table, name) => {
    expect(await findIndex(table, name)).toMatchObject({
      unique: 0,
      partial: 0,
    });
  });

  it("keeps the product_copies and oauth_states indexes after the rebuild", async () => {
    expect(
      await findIndex("product_copies", "product_copies_product_status_idx"),
    ).toMatchObject({ unique: 0, partial: 0 });
    expect(
      await findIndex("oauth_states", "oauth_states_state_hash_unique"),
    ).toMatchObject({ unique: 1, partial: 0 });
    expect(
      await findIndex("oauth_states", "oauth_states_expires_idx"),
    ).toMatchObject({ unique: 0, partial: 0 });
  });

  it("makes pilot_proposals_pending_unique a partial unique index", async () => {
    const index = await findIndex(
      "pilot_proposals",
      "pilot_proposals_pending_unique",
    );

    expect(index).toMatchObject({ unique: 1, partial: 1 });
    expect(await indexColumns("pilot_proposals_pending_unique")).toEqual([
      "workspace_id",
      "dedupe_key",
    ]);
  });
});

describe("closed foreign keys", () => {
  it("links oauth_states.launch_id to launches with SET NULL", async () => {
    expect(await findForeignKey("oauth_states", "launch_id")).toMatchObject({
      table: "launches",
      on_delete: "SET NULL",
    });
  });

  it("links product_copies.ai_usage_id to ai_usage with SET NULL", async () => {
    expect(await findForeignKey("product_copies", "ai_usage_id")).toMatchObject(
      { table: "ai_usage", on_delete: "SET NULL" },
    );
  });

  it("keeps the rebuilt tables CHECK constraints", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare(
        "INSERT INTO oauth_states (id, state_hash, provider, workspace_id, user_id, created_at, expires_at) VALUES ('os-bad', 'h-bad', 'tiktok', ?, ?, ?, ?)",
      )
        .bind(fixture.workspaceId, fixture.userId, NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("nulls oauth_states.launch_id when the launch is deleted", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-oauth");
    await env.DB.prepare(
      "INSERT INTO oauth_states (id, state_hash, provider, workspace_id, user_id, launch_id, created_at, expires_at) VALUES ('os-1', 'h-1', 'meta', ?, ?, 'l-oauth', ?, ?)",
    )
      .bind(fixture.workspaceId, fixture.userId, NOW, NOW)
      .run();

    await env.DB.prepare("DELETE FROM launches WHERE id = 'l-oauth'").run();

    const row = await env.DB.prepare(
      "SELECT launch_id FROM oauth_states WHERE id = 'os-1'",
    ).first();
    expect(row).toEqual({ launch_id: null });
  });

  it("rejects an oauth_states.launch_id that points nowhere", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare(
        "INSERT INTO oauth_states (id, state_hash, provider, workspace_id, user_id, launch_id, created_at, expires_at) VALUES ('os-ghost', 'h-ghost', 'meta', ?, ?, 'l-ghost', ?, ?)",
      )
        .bind(fixture.workspaceId, fixture.userId, NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("nulls product_copies.ai_usage_id when the ai_usage row is deleted", async () => {
    const fixture = await seedFixture();
    await insertAiUsage(fixture, "ai-copy");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO products (id, workspace_id, name, name_normalized, landing_url, primary_text, headline, created_at, updated_at) VALUES ('p-ai', ?, 'P', 'p-ai', 'https://shop.test', 't', 'h', ?, ?)",
      ).bind(fixture.workspaceId, NOW, NOW),
      env.DB.prepare(
        "INSERT INTO product_copies (id, workspace_id, product_id, angle, primary_text, headline, source, ai_usage_id, created_at, updated_at) VALUES ('pc-ai', ?, 'p-ai', 'dolor', 't', 'h', 'ai', 'ai-copy', ?, ?)",
      ).bind(fixture.workspaceId, NOW, NOW),
    ]);

    await env.DB.prepare("DELETE FROM ai_usage WHERE id = 'ai-copy'").run();

    const row = await env.DB.prepare(
      "SELECT ai_usage_id FROM product_copies WHERE id = 'pc-ai'",
    ).first();
    expect(row).toEqual({ ai_usage_id: null });
  });
});

describe("launches constraints", () => {
  it("applies launch defaults", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-def");

    const row = await env.DB.prepare(
      "SELECT status, source, draft, items_total, items_done, items_failed, attempt FROM launches WHERE id = 'l-def'",
    ).first();

    expect(row).toEqual({
      status: "draft",
      source: "manual",
      draft: "{}",
      items_total: 0,
      items_done: 0,
      items_failed: 0,
      attempt: 0,
    });
  });

  it("rejects an invalid status", async () => {
    const fixture = await seedFixture();

    await expect(insertLaunch(fixture, "l-bad", "paused")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejects invalid json in launches.draft", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-json");

    await expect(
      env.DB.prepare(
        "UPDATE launches SET draft = 'nope' WHERE id = 'l-json'",
      ).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects a checks_ok outside 0/1", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-ok");

    await expect(
      env.DB.prepare(
        "UPDATE launches SET checks_ok = 2 WHERE id = 'l-ok'",
      ).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("cascades workspace delete to launches and their items", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-ws");
    await insertLaunchItem(fixture, "l-ws", "li-ws", 0);

    await env.DB.prepare("DELETE FROM workspaces WHERE id = ?")
      .bind(fixture.workspaceId)
      .run();

    expect(await countRows("launches", "id = 'l-ws'")).toBe(0);
    expect(await countRows("launch_items", "id = 'li-ws'")).toBe(0);
  });
});

describe("launch_items constraints", () => {
  it("rejects a duplicate position in the same launch", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-pos");
    await insertLaunchItem(fixture, "l-pos", "li-pos-1", 0);

    await expect(
      insertLaunchItem(fixture, "l-pos", "li-pos-2", 0),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects an invalid source", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-src");

    await expect(
      env.DB.prepare(
        "INSERT INTO launch_items (id, workspace_id, launch_id, position, source, ad_name, created_at, updated_at) VALUES ('li-src', ?, 'l-src', 0, 'ftp', 'ad', ?, ?)",
      )
        .bind(fixture.workspaceId, NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe("insights_cache constraints", () => {
  async function insertInsights(fixture: Fixture, payload: string) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO meta_connections (id, workspace_id, meta_business_id, meta_user_id, token_ciphertext, token_iv, token_key_version, created_at, updated_at) VALUES (?, ?, 'biz-1', 'mu-1', x'01', x'02', 1, ?, ?)",
      ).bind(`mc-${fixture.workspaceId}`, fixture.workspaceId, NOW, NOW),
      env.DB.prepare(
        "INSERT OR IGNORE INTO meta_assets (id, workspace_id, connection_id, kind, meta_id, name, created_at, updated_at) VALUES (?, ?, ?, 'ad_account', 'act_1', 'Cuenta', ?, ?)",
      ).bind(
        `ma-${fixture.workspaceId}`,
        fixture.workspaceId,
        `mc-${fixture.workspaceId}`,
        NOW,
        NOW,
      ),
    ]);
    return env.DB.prepare(
      "INSERT INTO insights_cache (id, workspace_id, ad_account_asset_id, level, range_key, date_from, date_to, payload, fetched_at, expires_at) VALUES (?, ?, ?, 'campaign', 'today', '2026-01-01', '2026-01-01', ?, ?, ?)",
    )
      .bind(
        `ic-${crypto.randomUUID()}`,
        fixture.workspaceId,
        `ma-${fixture.workspaceId}`,
        payload,
        NOW,
        NOW,
      )
      .run();
  }

  it("accepts a json array payload", async () => {
    const fixture = await seedFixture();

    await insertInsights(fixture, '[{"id":"c-1"}]');
  });

  it("rejects an invalid json payload", async () => {
    const fixture = await seedFixture();

    await expect(insertInsights(fixture, "nope")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejects a payload with more than 1000 objects", async () => {
    const fixture = await seedFixture();
    const payload = JSON.stringify(Array.from({ length: 1001 }, () => ({})));

    await expect(insertInsights(fixture, payload)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejects a second row for the same (account, level, range)", async () => {
    const fixture = await seedFixture();
    await insertInsights(fixture, "[]");

    await expect(insertInsights(fixture, "[]")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });
});

describe("pilot constraints", () => {
  it("rejects an invalid rule_type", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare(
        "INSERT INTO pilot_rules (id, workspace_id, rule_type, enabled, params, updated_at) VALUES ('pr-bad', ?, 'pause_everything', 1, '{}', ?)",
      )
        .bind(fixture.workspaceId, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("allows one rule per type and workspace", async () => {
    const fixture = await seedFixture();
    const insertRule = (id: string) =>
      env.DB.prepare(
        "INSERT INTO pilot_rules (id, workspace_id, rule_type, enabled, params, updated_at) VALUES (?, ?, 'scale_winner', 0, '{}', ?)",
      )
        .bind(id, fixture.workspaceId, NOW)
        .run();
    await insertRule("pr-1");

    await expect(insertRule("pr-2")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("rejects an invalid run trigger", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare(
        "INSERT INTO pilot_runs (id, workspace_id, trigger, started_at) VALUES ('run-bad', ?, 'webhook', ?)",
      )
        .bind(fixture.workspaceId, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("applies run defaults", async () => {
    const fixture = await seedFixture();
    await insertRun(fixture, "run-def");

    const row = await env.DB.prepare(
      "SELECT status, proposals_created FROM pilot_runs WHERE id = 'run-def'",
    ).first();

    expect(row).toEqual({ status: "running", proposals_created: 0 });
  });

  it.each([0, 51])("rejects a proposal percent of %i", async (percent) => {
    const fixture = await seedFixture();
    await insertRun(fixture, `run-pct-${percent}`);

    await expect(
      insertProposal(fixture, `run-pct-${percent}`, `pp-pct-${percent}`, {
        percent,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it.each([1, 50])("accepts a proposal percent of %i", async (percent) => {
    const fixture = await seedFixture();
    await insertRun(fixture, `run-pct-ok-${percent}`);

    await insertProposal(
      fixture,
      `run-pct-ok-${percent}`,
      `pp-pct-ok-${percent}`,
      {
        percent,
      },
    );
  });

  it("rejects two pending proposals with the same dedupe_key", async () => {
    const fixture = await seedFixture();
    await insertRun(fixture, "run-dup");
    await insertProposal(fixture, "run-dup", "pp-dup-1", {
      dedupeKey: "scale:c-1",
    });

    await expect(
      insertProposal(fixture, "run-dup", "pp-dup-2", {
        dedupeKey: "scale:c-1",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("allows the same dedupe_key once the earlier proposal is not pending", async () => {
    const fixture = await seedFixture();
    await insertRun(fixture, "run-done");
    await insertProposal(fixture, "run-done", "pp-done-1", {
      dedupeKey: "scale:c-1",
      status: "executed",
    });

    await insertProposal(fixture, "run-done", "pp-done-2", {
      dedupeKey: "scale:c-1",
    });
    await insertProposal(fixture, "run-done", "pp-done-3", {
      dedupeKey: "scale:c-1",
      status: "dismissed",
    });
  });

  it("allows the same pending dedupe_key in another workspace", async () => {
    const first = await seedFixture();
    const second = await seedFixture();
    await insertRun(first, "run-ws-1");
    await insertRun(second, "run-ws-2");
    await insertProposal(first, "run-ws-1", "pp-ws-1", {
      dedupeKey: "scale:c-1",
    });

    await insertProposal(second, "run-ws-2", "pp-ws-2", {
      dedupeKey: "scale:c-1",
    });
  });

  it("cascades run delete to its proposals", async () => {
    const fixture = await seedFixture();
    await insertRun(fixture, "run-cascade");
    await insertProposal(fixture, "run-cascade", "pp-cascade", {});

    await env.DB.prepare(
      "DELETE FROM pilot_runs WHERE id = 'run-cascade'",
    ).run();

    expect(await countRows("pilot_proposals", "id = 'pp-cascade'")).toBe(0);
  });

  it("nulls pilot_proposals.launch_id when the launch is deleted", async () => {
    const fixture = await seedFixture();
    await insertRun(fixture, "run-launch");
    await insertProposal(fixture, "run-launch", "pp-launch", {});
    await insertLaunch(fixture, "l-pilot");
    await env.DB.prepare(
      "UPDATE pilot_proposals SET launch_id = 'l-pilot' WHERE id = 'pp-launch'",
    ).run();

    await env.DB.prepare("DELETE FROM launches WHERE id = 'l-pilot'").run();

    const row = await env.DB.prepare(
      "SELECT launch_id FROM pilot_proposals WHERE id = 'pp-launch'",
    ).first();
    expect(row).toEqual({ launch_id: null });
  });

  it("allows one protected row per campaign and workspace", async () => {
    const fixture = await seedFixture();
    const protect = () =>
      env.DB.prepare(
        "INSERT INTO protected_campaigns (workspace_id, campaign_meta_id, ad_account_meta_id, created_at) VALUES (?, 'c-1', 'act_1', ?)",
      )
        .bind(fixture.workspaceId, NOW)
        .run();
    await protect();

    await expect(protect()).rejects.toThrow(/UNIQUE constraint failed/);
  });
});

describe("audit_log constraints", () => {
  function insertAudit(
    workspaceId: string | null,
    id: string,
    overrides: { origin?: string; result?: string; detail?: string | null },
  ) {
    const { origin = "manual", result = "ok", detail = null } = overrides;
    return env.DB.prepare(
      "INSERT INTO audit_log (id, workspace_id, actor_type, origin, action, result, detail, created_at) VALUES (?, ?, 'user', ?, 'meta.campaign.create', ?, ?, ?)",
    )
      .bind(id, workspaceId, origin, result, detail, NOW)
      .run();
  }

  it("accepts a global entry without workspace", async () => {
    await insertAudit(null, "au-global", {});
  });

  it("rejects an invalid origin and result", async () => {
    const fixture = await seedFixture();

    await expect(
      insertAudit(fixture.workspaceId, "au-origin", { origin: "api" }),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      insertAudit(fixture.workspaceId, "au-result", { result: "maybe" }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects invalid json in detail", async () => {
    const fixture = await seedFixture();

    await expect(
      insertAudit(fixture.workspaceId, "au-json", { detail: "nope" }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("nulls audit_log.launch_id when the launch is deleted", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-audit");
    await env.DB.prepare(
      "INSERT INTO audit_log (id, workspace_id, actor_type, origin, action, launch_id, result, created_at) VALUES ('au-launch', ?, 'system', 'system', 'meta.launch.activate', 'l-audit', 'ok', ?)",
    )
      .bind(fixture.workspaceId, NOW)
      .run();

    await env.DB.prepare("DELETE FROM launches WHERE id = 'l-audit'").run();

    const row = await env.DB.prepare(
      "SELECT launch_id FROM audit_log WHERE id = 'au-launch'",
    ).first();
    expect(row).toEqual({ launch_id: null });
  });
});

describe("ai_usage and usage_counters constraints", () => {
  it("applies ai_usage token and neuron defaults", async () => {
    const fixture = await seedFixture();
    await insertAiUsage(fixture, "ai-def");

    const row = await env.DB.prepare(
      "SELECT provider, model, input_tokens, output_tokens, neurons FROM ai_usage WHERE id = 'ai-def'",
    ).first();

    expect(row).toEqual({
      provider: "workers_ai",
      model: "@cf/meta/llama",
      input_tokens: 0,
      output_tokens: 0,
      neurons: 0,
    });
  });

  it("rejects an unknown provider", async () => {
    const fixture = await seedFixture();

    await expect(insertAiUsage(fixture, "ai-bad", "openai")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("accumulates ai_neurons with an upsert on the primary key", async () => {
    const upsert = (value: number) =>
      env.DB.prepare(
        "INSERT INTO usage_counters (scope, scope_id, period, metric, value, updated_at) VALUES ('workspace', 'w-counter', '2026-11', 'ai_neurons', ?1, ?2) ON CONFLICT DO UPDATE SET value = value + ?1",
      )
        .bind(value, NOW)
        .run();
    await upsert(10);
    await upsert(5);

    const row = await env.DB.prepare(
      "SELECT value FROM usage_counters WHERE scope = 'workspace' AND scope_id = 'w-counter' AND period = '2026-11' AND metric = 'ai_neurons'",
    ).first();
    expect(row).toEqual({ value: 15 });
  });

  it("rejects an invalid scope and metric", async () => {
    const insertCounter = (scope: string, metric: string) =>
      env.DB.prepare(
        "INSERT INTO usage_counters (scope, scope_id, period, metric, updated_at) VALUES (?, 'x', '2026-11', ?, ?)",
      )
        .bind(scope, metric, NOW)
        .run();

    await expect(insertCounter("user", "ai_neurons")).rejects.toThrow(
      /CHECK constraint failed/,
    );
    await expect(insertCounter("global", "cpu_time")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });
});

describe("chat constraints", () => {
  it("applies chat session defaults", async () => {
    const fixture = await seedFixture();
    await insertChatSession(fixture, "cs-def");

    const row = await env.DB.prepare(
      "SELECT status, message_count FROM chat_sessions WHERE id = 'cs-def'",
    ).first();

    expect(row).toEqual({ status: "open", message_count: 0 });
  });

  it.each([-1, 61])("rejects a message_count of %i", async (count) => {
    const fixture = await seedFixture();

    await expect(insertChatSession(fixture, "cs-count", count)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejects content over 8000 characters", async () => {
    const fixture = await seedFixture();
    await insertChatSession(fixture, "cs-long");

    await insertChatMessage(fixture, "cs-long", "cm-8000", "a".repeat(8000));
    await expect(
      insertChatMessage(fixture, "cs-long", "cm-8001", "a".repeat(8001)),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("cascades session delete to its messages", async () => {
    const fixture = await seedFixture();
    await insertChatSession(fixture, "cs-cascade");
    await insertChatMessage(fixture, "cs-cascade", "cm-cascade", "hola");

    await env.DB.prepare(
      "DELETE FROM chat_sessions WHERE id = 'cs-cascade'",
    ).run();

    expect(await countRows("chat_messages", "id = 'cm-cascade'")).toBe(0);
  });

  it("nulls chat_messages.ai_usage_id when the ai_usage row is deleted", async () => {
    const fixture = await seedFixture();
    await insertChatSession(fixture, "cs-ai");
    await insertAiUsage(fixture, "ai-chat");
    await insertChatMessage(fixture, "cs-ai", "cm-ai", "hola", "ai-chat");

    await env.DB.prepare("DELETE FROM ai_usage WHERE id = 'ai-chat'").run();

    const row = await env.DB.prepare(
      "SELECT ai_usage_id FROM chat_messages WHERE id = 'cm-ai'",
    ).first();
    expect(row).toEqual({ ai_usage_id: null });
  });

  it("nulls chat_sessions.launch_id when the launch is deleted", async () => {
    const fixture = await seedFixture();
    await insertLaunch(fixture, "l-chat");
    await env.DB.prepare(
      "INSERT INTO chat_sessions (id, workspace_id, user_id, launch_id, created_at, updated_at) VALUES ('cs-launch', ?, ?, 'l-chat', ?, ?)",
    )
      .bind(fixture.workspaceId, fixture.userId, NOW, NOW)
      .run();

    await env.DB.prepare("DELETE FROM launches WHERE id = 'l-chat'").run();

    const row = await env.DB.prepare(
      "SELECT launch_id FROM chat_sessions WHERE id = 'cs-launch'",
    ).first();
    expect(row).toEqual({ launch_id: null });
  });
});

describe("error_events and data_deletion_requests constraints", () => {
  it("rejects a message over 500 characters", async () => {
    await insertErrorEvent("ee-500", "e".repeat(500));

    await expect(insertErrorEvent("ee-501", "e".repeat(501))).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejects an invalid source", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO error_events (id, source, message, created_at) VALUES ('ee-src', 'browser', 'm', ?)",
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("applies data_deletion_requests defaults", async () => {
    await env.DB.prepare(
      "INSERT INTO data_deletion_requests (id, confirmation_code, meta_user_id, created_at) VALUES ('ddr-def', 'code-def', 'mu-1', ?)",
    )
      .bind(NOW)
      .run();

    const row = await env.DB.prepare(
      "SELECT status, connections_affected FROM data_deletion_requests WHERE id = 'ddr-def'",
    ).first();

    expect(row).toEqual({ status: "received", connections_affected: 0 });
  });

  it("rejects a duplicate confirmation_code", async () => {
    const insertRequest = (id: string) =>
      env.DB.prepare(
        "INSERT INTO data_deletion_requests (id, confirmation_code, meta_user_id, created_at) VALUES (?, 'code-dup', 'mu-1', ?)",
      )
        .bind(id, NOW)
        .run();
    await insertRequest("ddr-1");

    await expect(insertRequest("ddr-2")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });
});
