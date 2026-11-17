import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

interface IndexRow {
  name: string;
  unique: number;
  partial: number;
}

interface Fixture {
  workspaceId: string;
  userId: string;
  connectionId: string;
  assetId: string;
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

async function seedFixture(): Promise<Fixture> {
  const key = `c${++fixtureCount}`;
  const fixture: Fixture = {
    workspaceId: `w-${key}`,
    userId: `u-${key}`,
    connectionId: `mc-${key}`,
    assetId: `ma-${key}`,
  };
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    ).bind(fixture.userId, `${key}@x.test`, NOW),
    env.DB.prepare(
      "INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at) VALUES (?, 'W', ?, ?, ?)",
    ).bind(fixture.workspaceId, fixture.userId, NOW, NOW),
    env.DB.prepare(
      "INSERT INTO meta_connections (id, workspace_id, meta_business_id, meta_user_id, token_ciphertext, token_iv, token_key_version, created_at, updated_at) VALUES (?, ?, 'biz-1', 'mu-1', x'0102', x'0304', 1, ?, ?)",
    ).bind(fixture.connectionId, fixture.workspaceId, NOW, NOW),
    env.DB.prepare(
      "INSERT INTO meta_assets (id, workspace_id, connection_id, kind, meta_id, name, created_at, updated_at) VALUES (?, ?, ?, 'ad_account', 'act_1', 'Cuenta', ?, ?)",
    ).bind(
      fixture.assetId,
      fixture.workspaceId,
      fixture.connectionId,
      NOW,
      NOW,
    ),
  ]);
  return fixture;
}

function insertProduct(
  fixture: Fixture,
  id: string,
  overrides: { landingUrl?: string; priceMinor?: number; costMinor?: number },
) {
  const {
    landingUrl = "https://shop.test",
    priceMinor = null,
    costMinor = null,
  } = overrides;
  return env.DB.prepare(
    "INSERT INTO products (id, workspace_id, name, name_normalized, landing_url, primary_text, headline, price_minor, cost_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'texto', 'titulo', ?, ?, ?, ?)",
  )
    .bind(
      id,
      fixture.workspaceId,
      id,
      id,
      landingUrl,
      priceMinor,
      costMinor,
      NOW,
      NOW,
    )
    .run();
}

function insertCreative(fixture: Fixture, id: string, sizeBytes = 1000) {
  return env.DB.prepare(
    "INSERT INTO creatives (id, workspace_id, ad_account_asset_id, kind, original_filename, content_type, size_bytes, source, status, created_at, updated_at) VALUES (?, ?, ?, 'video', 'a.mp4', 'video/mp4', ?, 'browser', 'uploading', ?, ?)",
  )
    .bind(id, fixture.workspaceId, fixture.assetId, sizeBytes, NOW, NOW)
    .run();
}

function insertUpload(
  fixture: Fixture,
  id: string,
  creativeId: string | null,
  status = "uploading",
) {
  return env.DB.prepare(
    "INSERT INTO uploads (id, workspace_id, creative_id, ad_account_asset_id, kind, size_bytes, sha256, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'video', 1000, 'sha', ?, ?, ?)",
  )
    .bind(
      id,
      fixture.workspaceId,
      creativeId,
      fixture.assetId,
      status,
      NOW,
      NOW,
    )
    .run();
}

describe("unique indexes", () => {
  it.each([
    ["meta_connections", ["workspace_id", "meta_business_id"]],
    ["meta_assets", ["workspace_id", "kind", "meta_id"]],
    ["google_connections", ["workspace_id", "user_id"]],
    ["products", ["workspace_id", "name_normalized"]],
    ["uploads", ["creative_id"]],
  ])("%s is unique on %j", async (table, columns) => {
    expect(await uniqueIndexColumns(table)).toContainEqual(columns);
  });
});

describe("indexes", () => {
  it.each([
    ["meta_connections", "meta_connections_user_idx"],
    ["meta_connections", "meta_connections_key_idx"],
    ["meta_assets", "meta_assets_ws_kind_enabled_idx"],
    ["meta_assets", "meta_assets_connection_idx"],
    ["google_connections", "google_connections_key_idx"],
    ["products", "products_ws_archived_updated_idx"],
    ["product_copies", "product_copies_product_status_idx"],
    ["creatives", "creatives_ws_status_created_idx"],
    ["creatives", "creatives_ai_status_idx"],
    ["uploads", "uploads_status_expires_idx"],
  ])("%s has index %s", async (table, name) => {
    expect(await findIndex(table, name)).toMatchObject({
      unique: 0,
      partial: 0,
    });
  });

  it("indexes creatives by (workspace_id, sha256)", async () => {
    const index = await findIndex("creatives", "creatives_ws_sha_idx");

    expect(index).toMatchObject({ unique: 0, partial: 0 });
    expect(await indexColumns("creatives_ws_sha_idx")).toEqual([
      "workspace_id",
      "sha256",
    ]);
  });

  it("indexes creatives by (status, thumbnail_refreshed_at)", async () => {
    const index = await findIndex(
      "creatives",
      "creatives_status_thumbnail_idx",
    );

    expect(index).toMatchObject({ unique: 0, partial: 0 });
    expect(await indexColumns("creatives_status_thumbnail_idx")).toEqual([
      "status",
      "thumbnail_refreshed_at",
    ]);
  });
});

describe("products constraints", () => {
  it("accepts an https landing_url and a cost below the price", async () => {
    const fixture = await seedFixture();

    await insertProduct(fixture, "p-ok", { priceMinor: 1000, costMinor: 400 });
  });

  it.each(["http://shop.test", "ftp://shop.test", "shop.test"])(
    "rejects landing_url %s",
    async (landingUrl) => {
      const fixture = await seedFixture();

      await expect(
        insertProduct(fixture, "p-url", { landingUrl }),
      ).rejects.toThrow(/CHECK constraint failed/);
    },
  );

  it.each([
    [1000, 1000],
    [1000, 1500],
  ])("rejects price %i with cost %i", async (priceMinor, costMinor) => {
    const fixture = await seedFixture();

    await expect(
      insertProduct(fixture, "p-cost", { priceMinor, costMinor }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects a negative cost and a zero price", async () => {
    const fixture = await seedFixture();

    await expect(
      insertProduct(fixture, "p-neg", { priceMinor: 1000, costMinor: -1 }),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      insertProduct(fixture, "p-zero", { priceMinor: 0 }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects a duplicate name_normalized in the same workspace", async () => {
    const fixture = await seedFixture();
    await insertProduct(fixture, "p-dup", {});

    await expect(
      env.DB.prepare(
        "INSERT INTO products (id, workspace_id, name, name_normalized, landing_url, primary_text, headline, created_at, updated_at) VALUES ('p-dup-2', ?, 'DUP', 'p-dup', 'https://x.test', 't', 'h', ?, ?)",
      )
        .bind(fixture.workspaceId, NOW, NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("applies product defaults", async () => {
    const fixture = await seedFixture();
    await insertProduct(fixture, "p-def", {});

    const row = await env.DB.prepare(
      "SELECT cta, currency, archived, landing_status FROM products WHERE id = 'p-def'",
    ).first();

    expect(row).toEqual({
      cta: "SHOP_NOW",
      currency: "USD",
      archived: 0,
      landing_status: "unchecked",
    });
  });
});

describe("product_copies constraints", () => {
  async function insertCopy(
    fixture: Fixture,
    productId: string,
    angle: string,
  ) {
    await env.DB.prepare(
      "INSERT INTO product_copies (id, workspace_id, product_id, angle, primary_text, headline, source, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 'h', 'ai', ?, ?)",
    )
      .bind(
        `copy-${productId}`,
        fixture.workspaceId,
        productId,
        angle,
        NOW,
        NOW,
      )
      .run();
  }

  it("rejects an invalid angle", async () => {
    const fixture = await seedFixture();
    await insertProduct(fixture, "p-angle", {});

    await expect(insertCopy(fixture, "p-angle", "miedo")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("cascades product delete to its copies", async () => {
    const fixture = await seedFixture();
    await insertProduct(fixture, "p-cascade", {});
    await insertCopy(fixture, "p-cascade", "dolor");

    await env.DB.prepare("DELETE FROM products WHERE id = 'p-cascade'").run();

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM product_copies WHERE product_id = 'p-cascade'",
    ).first();
    expect(count).toEqual({ n: 0 });
  });
});

describe("creatives constraints", () => {
  it("rejects a zero size_bytes", async () => {
    const fixture = await seedFixture();

    await expect(insertCreative(fixture, "cr-zero", 0)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejects an unsupported content_type", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare(
        "INSERT INTO creatives (id, workspace_id, ad_account_asset_id, kind, original_filename, content_type, size_bytes, source, status, created_at, updated_at) VALUES ('cr-gif', ?, ?, 'image', 'a.gif', 'image/gif', 10, 'browser', 'ready', ?, ?)",
      )
        .bind(fixture.workspaceId, fixture.assetId, NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("cascades ad account asset delete to its creatives", async () => {
    const fixture = await seedFixture();
    await insertCreative(fixture, "cr-asset");

    await env.DB.prepare("DELETE FROM meta_assets WHERE id = ?")
      .bind(fixture.assetId)
      .run();

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM creatives WHERE id = 'cr-asset'",
    ).first();
    expect(count).toEqual({ n: 0 });
  });
});

describe("uploads constraints", () => {
  it("rejects an invalid status", async () => {
    const fixture = await seedFixture();

    await expect(
      insertUpload(fixture, "up-bad", null, "paused"),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it.each(["uploading", "completed", "aborted", "expired"])(
    "accepts status %s",
    async (status) => {
      const fixture = await seedFixture();

      await insertUpload(fixture, `up-${status}`, null, status);
    },
  );

  it("allows several uploads with a NULL creative_id", async () => {
    const fixture = await seedFixture();

    await insertUpload(fixture, "up-null-1", null);
    await insertUpload(fixture, "up-null-2", null);
  });

  it("allows only one upload per creative", async () => {
    const fixture = await seedFixture();
    await insertCreative(fixture, "cr-one");
    await insertUpload(fixture, "up-one-1", "cr-one");

    await expect(insertUpload(fixture, "up-one-2", "cr-one")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("sets creative_id to NULL when the creative is deleted", async () => {
    const fixture = await seedFixture();
    await insertCreative(fixture, "cr-abort");
    await insertUpload(fixture, "up-abort", "cr-abort");

    await env.DB.prepare("DELETE FROM creatives WHERE id = 'cr-abort'").run();

    const upload = await env.DB.prepare(
      "SELECT creative_id, status FROM uploads WHERE id = 'up-abort'",
    ).first();
    expect(upload).toEqual({ creative_id: null, status: "uploading" });
  });
});

describe("connections", () => {
  it("rejects a second meta connection for the same business", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare(
        "INSERT INTO meta_connections (id, workspace_id, meta_business_id, meta_user_id, token_ciphertext, token_iv, token_key_version, created_at, updated_at) VALUES ('mc-dup', ?, 'biz-1', 'mu-2', x'01', x'02', 1, ?, ?)",
      )
        .bind(fixture.workspaceId, NOW, NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("applies meta connection defaults", async () => {
    const fixture = await seedFixture();

    const row = await env.DB.prepare(
      "SELECT token_type, scopes, status FROM meta_connections WHERE id = ?",
    )
      .bind(fixture.connectionId)
      .first();

    expect(row).toEqual({
      token_type: "system_user",
      scopes: "[]",
      status: "active",
    });
  });

  it("rejects invalid json in meta_connections.scopes", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare("UPDATE meta_connections SET scopes = 'nope' WHERE id = ?")
        .bind(fixture.connectionId)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects an invalid meta_assets.kind", async () => {
    const fixture = await seedFixture();

    await expect(
      env.DB.prepare("UPDATE meta_assets SET kind = 'catalog' WHERE id = ?")
        .bind(fixture.assetId)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("cascades connection delete to assets, creatives and uploads", async () => {
    const fixture = await seedFixture();
    await insertCreative(fixture, "cr-conn");
    await insertUpload(fixture, "up-conn", "cr-conn");

    await env.DB.prepare("DELETE FROM meta_connections WHERE id = ?")
      .bind(fixture.connectionId)
      .run();

    const remaining = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM meta_assets WHERE workspace_id = ?1) AS assets, (SELECT COUNT(*) FROM creatives WHERE workspace_id = ?1) AS creatives, (SELECT COUNT(*) FROM uploads WHERE workspace_id = ?1) AS uploads",
    )
      .bind(fixture.workspaceId)
      .first();
    expect(remaining).toEqual({ assets: 0, creatives: 0, uploads: 0 });
  });

  it("allows one google connection per workspace and user", async () => {
    const fixture = await seedFixture();
    const insertGoogle = (id: string) =>
      env.DB.prepare(
        "INSERT INTO google_connections (id, workspace_id, user_id, google_email, refresh_token_ciphertext, refresh_token_iv, token_key_version, created_at, updated_at) VALUES (?, ?, ?, 'g@x.test', x'01', x'02', 1, ?, ?)",
      )
        .bind(id, fixture.workspaceId, fixture.userId, NOW, NOW)
        .run();
    await insertGoogle("gc-1");

    await expect(insertGoogle("gc-2")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });
});
