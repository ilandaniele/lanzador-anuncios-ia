import { delay, http, HttpResponse } from "msw";

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";

interface HandlerOptions {
  once?: boolean;
}

const failure = (status: number, options: HandlerOptions = {}) =>
  http.post(
    RESEND_EMAILS_URL,
    () => HttpResponse.json({ name: "error", message: "failure" }, { status }),
    options,
  );

export const resendSuccess = (options: HandlerOptions = {}) =>
  http.post(
    RESEND_EMAILS_URL,
    () => HttpResponse.json({ id: "email_test_id" }),
    options,
  );

export const resendServerError = (options?: HandlerOptions) =>
  failure(500, options);

export const resendRateLimited = (options?: HandlerOptions) =>
  failure(429, options);

export const resendBadRequest = (options?: HandlerOptions) =>
  failure(400, options);

export const resendHang = (options: HandlerOptions = {}) =>
  http.post(
    RESEND_EMAILS_URL,
    async () => {
      await delay("infinite");
      return HttpResponse.json({});
    },
    options,
  );
