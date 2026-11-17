import { AppError } from "../../lib/errors";
import type { Env } from "../../env";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailOptions {
  timeoutMs?: number;
}

type ResendEnv = Pick<Env, "RESEND_API_KEY" | "EMAIL_FROM">;

const isRetryable = (status: number) => status === 429 || status >= 500;

const postEmail = (env: ResendEnv, message: EmailMessage, timeoutMs: number) =>
  fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

export async function sendEmail(
  env: ResendEnv,
  message: EmailMessage,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: SendEmailOptions = {},
): Promise<void> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await postEmail(env, message, timeoutMs);
    } catch {
      break;
    }
    if (response.ok) return;
    lastStatus = response.status;
    if (!isRetryable(response.status)) break;
  }

  throw new AppError(503, "EMAIL_SEND_FAILED", {
    details: { providerStatus: lastStatus },
  });
}
