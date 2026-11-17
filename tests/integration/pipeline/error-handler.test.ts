import { env } from "cloudflare:workers";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import { AppError } from "../../../src/api/lib/errors";
import { readEnvelope, testEnv, trustedHeaders } from "./helpers";

const DB_SECRET = "hunter2";
const META_TOKEN = "EAABsecretMetaToken123";

const app = createApp();
app.get("/boom", () => {
  throw new Error(`db password=${DB_SECRET} failed`);
});
app.get("/leak", () => {
  throw new Error(
    `GET https://graph.facebook.com/v24.0/act_1/ads?access_token=${META_TOKEN} 500`,
  );
});
app.get("/conflict", () => {
  throw new AppError(409, "NAME_TAKEN", { fields: { name: "taken" } });
});
app.post("/json", async (c) => c.json(await c.req.json()));
app.get("/too-large", () => {
  throw new HTTPException(413);
});
app.get("/upstream", () => {
  throw new HTTPException(503);
});

interface ErrorEventRow {
  source: string;
  route: string;
  status: number;
  code: string;
  message: string;
  stack_hash: string | null;
}

const findErrorEvent = (requestId: string) =>
  env.DB.prepare(
    "SELECT source, route, status, code, message, stack_hash FROM error_events WHERE request_id = ?",
  )
    .bind(requestId)
    .first<ErrorEventRow>();

const get = (path: string, overrides = {}) =>
  app.request(path, {}, testEnv(overrides));

const silenceLog = () => vi.spyOn(console, "log").mockImplementation(() => {});

describe("error handler", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers 500 INTERNAL without stack or internal detail", async () => {
    silenceLog();
    const response = await get("/api/boom");

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain(DB_SECRET);
    expect(body).not.toContain("error-handler.test");
    const error = await readEnvelope(new Response(body));
    expect(error.code).toBe("INTERNAL");
    expect(error.requestId).toBe(response.headers.get("X-Request-Id"));
  });

  it("records a 5xx in error_events without secrets", async () => {
    silenceLog();
    const response = await get("/api/boom");

    const row = await findErrorEvent(response.headers.get("X-Request-Id")!);

    expect(row).toMatchObject({
      source: "api",
      route: "/api/boom",
      status: 500,
      code: "INTERNAL",
    });
    expect(row?.message).toContain("db password=");
    expect(row?.message).not.toContain(DB_SECRET);
    expect(row?.stack_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps a Meta token out of the log line and the error_events row", async () => {
    const log = silenceLog();

    const response = await get("/api/leak");

    const row = await findErrorEvent(response.headers.get("X-Request-Id")!);
    expect(row?.message).toContain(
      "https://graph.facebook.com/v24.0/act_1/ads",
    );
    expect(row?.message).not.toContain(META_TOKEN);
    expect(row?.message).not.toContain("access_token");
    const logged = log.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("request_failed");
    expect(logged).not.toContain(META_TOKEN);
  });

  it("still answers 500 when recording the error fails", async () => {
    silenceLog();
    const brokenDb = {
      prepare: () => {
        throw new Error("D1 down");
      },
    } as unknown as D1Database;

    const response = await get("/api/boom", { DB: brokenDb });

    expect(response.status).toBe(500);
    expect((await readEnvelope(response)).code).toBe("INTERNAL");
  });

  it("still answers 500 and records the row when the logger throws", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink down");
    });

    const response = await get("/api/boom");

    expect(response.status).toBe(500);
    const error = await readEnvelope(response);
    expect(await findErrorEvent(error.requestId)).not.toBeNull();
  });

  it("maps AppError to its status, code and fields without recording it", async () => {
    const response = await get("/api/conflict");

    expect(response.status).toBe(409);
    const error = await readEnvelope(response);
    expect(error).toMatchObject({
      code: "NAME_TAKEN",
      fields: { name: "taken" },
    });
    expect(await findErrorEvent(error.requestId)).toBeNull();
  });

  it("maps malformed JSON to 400 VALIDATION without recording it", async () => {
    const response = await app.request(
      "/api/json",
      {
        method: "POST",
        headers: { ...trustedHeaders, "Content-Type": "application/json" },
        body: "{not json",
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    const error = await readEnvelope(response);
    expect(error.code).toBe("VALIDATION");
    expect(await findErrorEvent(error.requestId)).toBeNull();
  });

  it("maps a client HTTPException to 400 VALIDATION without recording it", async () => {
    const response = await get("/api/too-large");

    expect(response.status).toBe(400);
    const error = await readEnvelope(response);
    expect(error.code).toBe("VALIDATION");
    expect(await findErrorEvent(error.requestId)).toBeNull();
  });

  it("maps a server HTTPException to 500 INTERNAL", async () => {
    silenceLog();
    const response = await get("/api/upstream");

    expect(response.status).toBe(500);
    expect((await readEnvelope(response)).code).toBe("INTERNAL");
  });

  it("logs the 5xx as one JSON line with the request id", async () => {
    const log = silenceLog();

    const response = await get("/api/boom");

    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "INTERNAL",
        requestId: response.headers.get("X-Request-Id"),
        status: 500,
      }),
    );
  });

  it("answers unknown API routes with a NOT_FOUND envelope", async () => {
    const response = await get("/api/does-not-exist");

    expect(response.status).toBe(404);
    const error = await readEnvelope(response);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.requestId).toBe(response.headers.get("X-Request-Id"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
