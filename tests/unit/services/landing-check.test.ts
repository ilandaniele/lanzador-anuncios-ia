import { describe, expect, it, vi } from "vitest";
import { checkLanding } from "../../../src/api/services/landing-check";

const LANDING = "https://tienda.example.test/producto";

const reply = (status: number, location?: string) =>
  new Response(null, {
    status,
    headers: location ? { Location: location } : {},
  });

const fetchReturning = (...responses: Response[]) => {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => queue.shift() ?? reply(200));
};

const redirectChain = (count: number, finalStatus = 200) =>
  fetchReturning(
    ...Array.from({ length: count }, (_, index) =>
      reply(302, `https://tienda.example.test/hop-${index + 1}`),
    ),
    reply(finalStatus),
  );

const neverFetch = () =>
  vi.fn<typeof fetch>(async () => {
    throw new Error("fetch must not be called");
  });

describe("checkLanding blocked urls", () => {
  it.each([
    ["http scheme", "http://tienda.example.test/", "not_https"],
    ["unparseable", "not a url", "invalid_url"],
    ["credentials", "https://user:pass@tienda.example.test/", "credentials"],
    ["username only", "https://user@tienda.example.test/", "credentials"],
    ["IPv4", "https://93.184.216.34/", "ip_literal"],
    ["IPv4 loopback", "https://127.0.0.1/", "ip_literal"],
    ["IPv4 decimal", "https://2130706433/", "ip_literal"],
    ["IPv4 hex", "https://0x7f000001/", "ip_literal"],
    ["IPv4 octal", "https://0177.0.0.1/", "ip_literal"],
    ["IPv4 short", "https://127.1/", "ip_literal"],
    ["IPv4 trailing dot", "https://127.0.0.1./", "ip_literal"],
    ["IPv6 loopback", "https://[::1]/", "ip_literal"],
    ["IPv6 mapped", "https://[::ffff:127.0.0.1]/", "ip_literal"],
    ["IPv6 public", "https://[2606:4700::1111]/", "ip_literal"],
    ["localhost", "https://localhost/", "internal_host"],
    ["localhost trailing dot", "https://localhost./", "internal_host"],
    ["localhost uppercase", "https://LOCALHOST/", "internal_host"],
    ["localhost subdomain", "https://app.localhost/", "internal_host"],
    ["local domain", "https://printer.local/", "internal_host"],
    ["internal domain", "https://db.internal/", "internal_host"],
    ["IPv4 double trailing dot", "https://127.0.0.1../", "ip_literal"],
    ["localhost double trailing dot", "https://localhost../", "internal_host"],
    ["explicit port", "https://tienda.example.test:8443/", "port"],
    ["single label host", "https://intranet/", "internal_host"],
    ["empty label", "https://tienda..example.test/", "internal_host"],
    ["svc domain", "https://api.svc/", "internal_host"],
    ["home.arpa domain", "https://nas.home.arpa/", "internal_host"],
    ["nip.io rebinding", "https://127.0.0.1.nip.io/", "internal_host"],
    ["sslip.io rebinding", "https://x.sslip.io/", "internal_host"],
    ["localtest.me rebinding", "https://app.localtest.me/", "internal_host"],
  ])("rejects %s without fetching", async (_name, url, error) => {
    const fetchImpl = neverFetch();

    const result = await checkLanding(url, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "error", httpStatus: null, error });
  });

  it("does not reject hostnames that merely contain a blocked word", async () => {
    const result = await checkLanding(
      "https://localhost-shop.example.test/",
      fetchReturning(reply(200)),
    );

    expect(result.status).toBe("ok");
  });

  it("rejects blocked hosts directly and after a redirect", async () => {
    const blockedHosts = ["app.example.test"];
    const direct = await checkLanding(
      "https://app.example.test/",
      neverFetch(),
      {
        blockedHosts,
      },
    );
    const fetchImpl = fetchReturning(reply(302, "https://APP.example.test./x"));
    const redirected = await checkLanding(LANDING, fetchImpl, { blockedHosts });

    expect(direct).toMatchObject({ status: "error", error: "internal_host" });
    expect(redirected).toMatchObject({
      status: "error",
      error: "internal_host",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("checkLanding request", () => {
  it("sends a manual GET with a browser user agent and cancels the body", async () => {
    const cancel = vi.fn(async () => undefined);
    const body = new ReadableStream({ cancel });
    const fetchImpl = fetchReturning(new Response(body, { status: 200 }));

    await checkLanding(LANDING, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(LANDING);
    expect(init).toMatchObject({ method: "GET", redirect: "manual" });
    expect(new Headers(init?.headers).get("User-Agent")).toMatch(/^Mozilla\//);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(cancel).toHaveBeenCalled();
  });
});

describe("checkLanding status mapping", () => {
  it.each([200, 204, 304])("maps %i to ok", async (status) => {
    const result = await checkLanding(LANDING, fetchReturning(reply(status)));

    expect(result).toMatchObject({
      status: "ok",
      httpStatus: status,
      finalUrl: LANDING,
    });
    expect(result).not.toHaveProperty("error");
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it.each([401, 403, 429])("maps %i to soft_ok", async (status) => {
    const result = await checkLanding(LANDING, fetchReturning(reply(status)));

    expect(result).toMatchObject({ status: "soft_ok", httpStatus: status });
    expect(result).not.toHaveProperty("error");
  });

  it.each([400, 404, 500, 503])("maps %i to error", async (status) => {
    const result = await checkLanding(LANDING, fetchReturning(reply(status)));

    expect(result).toMatchObject({
      status: "error",
      httpStatus: status,
      error: `http_${status}`,
    });
  });

  it("treats a redirect without Location as the final response", async () => {
    const result = await checkLanding(LANDING, fetchReturning(reply(302)));

    expect(result).toMatchObject({ status: "ok", httpStatus: 302 });
  });
});

describe("checkLanding redirects", () => {
  it("follows 5 redirects and reports the final url", async () => {
    const result = await checkLanding(LANDING, redirectChain(5));

    expect(result).toMatchObject({
      status: "ok",
      httpStatus: 200,
      finalUrl: "https://tienda.example.test/hop-5",
    });
  });

  it("fails on 6 redirects", async () => {
    const fetchImpl = redirectChain(6);

    const result = await checkLanding(LANDING, fetchImpl);

    expect(result).toMatchObject({
      status: "error",
      httpStatus: null,
      error: "too_many_redirects",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("resolves relative Location against the current url", async () => {
    const fetchImpl = fetchReturning(
      reply(301, "/nueva/ruta?x=1"),
      reply(302, "../otra"),
      reply(200),
    );

    const result = await checkLanding(LANDING, fetchImpl);

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      LANDING,
      "https://tienda.example.test/nueva/ruta?x=1",
      "https://tienda.example.test/otra",
    ]);
    expect(result.status).toBe("ok");
  });

  it.each([
    ["http", "http://tienda.example.test/", "not_https"],
    ["IP literal", "https://127.0.0.1/admin", "ip_literal"],
    ["decimal IP", "https://2130706433/", "ip_literal"],
    ["IPv6", "https://[::1]/", "ip_literal"],
    ["localhost", "https://localhost/", "internal_host"],
    ["credentials", "https://a:b@tienda.example.test/", "credentials"],
    ["protocol-relative IP", "//169.254.169.254/latest", "ip_literal"],
  ])("rejects a redirect to %s without following it", async (_n, to, error) => {
    const fetchImpl = fetchReturning(reply(302, to), reply(200));

    const result = await checkLanding(LANDING, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "error",
      httpStatus: null,
      error,
      finalUrl: LANDING,
    });
  });
});

describe("checkLanding failures", () => {
  it("reports network failures with a stable code", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("connect ECONNREFUSED 10.0.0.1:443");
    });

    const result = await checkLanding(LANDING, fetchImpl);

    expect(result).toMatchObject({
      status: "error",
      httpStatus: null,
      error: "network",
    });
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
  });

  it("reports timeout when the signal aborts", async () => {
    const hang = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal));
        }),
    );

    const result = await checkLanding(LANDING, hang, { timeoutMs: 20 });

    expect(result).toMatchObject({
      status: "error",
      httpStatus: null,
      error: "timeout",
    });
  });

  it("shares one timeout budget across redirect hops", async () => {
    let calls = 0;
    const slowThenHang = vi.fn<typeof fetch>((_url, init) => {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(reply(302, "/lento")), 30),
        );
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal));
      });
    });

    const result = await checkLanding(LANDING, slowThenHang, {
      timeoutMs: 50,
    });

    expect(result.error).toBe("timeout");
    expect(calls).toBe(2);
  });
});
