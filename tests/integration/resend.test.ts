import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../../src/api/env";
import { AppError } from "../../src/api/lib/errors";
import { sendEmail } from "../../src/api/integrations/resend/client";
import { buildBetaWelcomeEmail } from "../../src/api/emails/beta-welcome";
import { buildInvitationEmail } from "../../src/api/emails/invitation";
import { buildMagicLinkEmail } from "../../src/api/emails/magic-link";
import {
  resendBadRequest,
  resendHang,
  resendRateLimited,
  resendServerError,
  resendSuccess,
} from "../helpers/msw/resend";
import { server } from "../helpers/msw/server";

const API_KEY = "re_test_secret_key";
const env = {
  RESEND_API_KEY: API_KEY,
  EMAIL_FROM: "Lanzador <login@example.com>",
} as Env;
const message = {
  to: "ana@example.com",
  subject: "Hola",
  html: "<p>Hola</p>",
  text: "Hola",
};

const captureRequests = () => {
  const requests: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
};

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject");
};

describe("sendEmail", () => {
  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("posts the message to Resend with bearer key and from", async () => {
    server.use(resendSuccess());
    const requests = captureRequests();

    await expect(sendEmail(env, message)).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(await requests[0]?.json()).toEqual({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it.each([
    ["500", resendServerError],
    ["429", resendRateLimited],
  ])("retries once after %s then succeeds", async (_status, failing) => {
    server.use(failing({ once: true }), resendSuccess());
    const requests = captureRequests();

    await expect(sendEmail(env, message)).resolves.toBeUndefined();

    expect(requests).toHaveLength(2);
  });

  it("throws EMAIL_SEND_FAILED after 2 failures", async () => {
    server.use(resendServerError());
    const requests = captureRequests();

    const error = await rejection(sendEmail(env, message));

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 503, code: "EMAIL_SEND_FAILED" });
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(error)).not.toContain(API_KEY);
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it("does not retry a 400", async () => {
    server.use(resendBadRequest());
    const requests = captureRequests();

    const error = await rejection(sendEmail(env, message));

    expect(error).toMatchObject({ status: 503, code: "EMAIL_SEND_FAILED" });
    expect(requests).toHaveLength(1);
  });

  it("fails with EMAIL_SEND_FAILED when Resend hangs past the timeout", async () => {
    server.use(resendHang());
    const requests = captureRequests();

    const error = await rejection(sendEmail(env, message, { timeoutMs: 50 }));

    expect(error).toMatchObject({ status: 503, code: "EMAIL_SEND_FAILED" });
    expect(requests).toHaveLength(1);
  });
});

describe("email templates", () => {
  const token = "tok_secret_value";
  const appOrigin = "https://app.example.com";

  it("magic link carries the fragment link and 15 minute expiry", () => {
    const { subject, html, text } = buildMagicLinkEmail({ appOrigin, token });
    const link = `${appOrigin}/ingresar/confirmar#t=${token}`;

    expect(subject).toBeTruthy();
    expect(html).toContain(link);
    expect(text).toContain(link);
    expect(text).toContain("15 minutos");
  });

  it("invitation escapes interpolated values in html only", () => {
    const { html, text } = buildInvitationEmail({
      appOrigin,
      token,
      workspaceName: `<script>alert("x")</script>`,
      inviterEmail: "ana@example.com",
      role: "editor",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(text).toContain(`<script>alert("x")</script>`);
    expect(html).toContain(`${appOrigin}/invitacion#t=${token}`);
    expect(text).toContain(`${appOrigin}/invitacion#t=${token}`);
    expect(text).toContain("7 días");
  });

  it("beta welcome links to the login page", () => {
    const { subject, html, text } = buildBetaWelcomeEmail({ appOrigin });

    expect(subject).toBeTruthy();
    expect(html).toContain(`${appOrigin}/login`);
    expect(text).toContain(`${appOrigin}/login`);
  });
});
