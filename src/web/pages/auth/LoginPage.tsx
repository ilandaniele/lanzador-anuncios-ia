import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { emailSchema } from "../../../shared/schemas/auth";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import {
  AuthColumn,
  RedirectIfSession,
  Strip,
} from "../../features/auth/AuthColumn";
import {
  GoogleLoginButton,
  googleFailureStrip,
} from "../../features/auth/google-login";
import { safeNext } from "../../features/auth/link-params";
import { rememberLogin } from "../../features/auth/login-memory";
import { useCountdown } from "../../features/auth/use-countdown";
import { t } from "../../i18n/es-AR";
import { ApiError, apiFetch } from "../../lib/api";

const RESEND_SECONDS = 60;

function requestMagicLink(email: string) {
  return apiFetch("/api/auth/magic-link", {
    method: "POST",
    body: { email },
  });
}

function failureStrip(error: Error | null) {
  if (!error) return null;
  const rateLimited = error instanceof ApiError && error.status === 429;
  return rateLimited ? (
    <Strip tone="warn">{t("login.rateLimited")}</Strip>
  ) : (
    <Strip tone="loss">{t("errors.generic")}</Strip>
  );
}

type SentProps = {
  email: string;
  resending: boolean;
  onResend: () => void;
};

function Sent({ email, resending, onResend }: SentProps) {
  const { remaining, restart } = useCountdown(RESEND_SECONDS);
  const waiting = remaining > 0;

  function resend() {
    restart();
    onResend();
  }

  return (
    <>
      <p className="text-ink">
        {t("login.sentBody")} <strong>{email}</strong>
      </p>
      <Button
        variant="secondary"
        loading={resending}
        disabledReason={waiting ? t("login.resendWait") : undefined}
        onClick={resend}
      >
        {waiting ? `${t("login.resendIn")} ${remaining} s` : t("login.resend")}
      </Button>
      <p role="status" className="sr-only">
        {waiting ? "" : t("login.resendReady")}
      </p>
    </>
  );
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [invalid, setInvalid] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: requestMagicLink,
    onSuccess: (_data, sent) => {
      rememberLogin({ email: sent, next });
      setSentTo(sent);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    setInvalid(!parsed.success);
    if (parsed.success) send.mutate(parsed.data);
  }

  const strip = failureStrip(send.error);

  return (
    <>
      <RedirectIfSession to={next ?? "/"} />
      {sentTo ? (
        <AuthColumn title={t("login.sentTitle")}>
          {strip}
          <Sent
            email={sentTo}
            resending={send.isPending}
            onResend={() => send.mutate(sentTo)}
          />
        </AuthColumn>
      ) : (
        <AuthColumn title={t("login.title")}>
          {strip ?? googleFailureStrip(params)}
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <Input
              type="email"
              label={t("login.email")}
              autoComplete="email"
              required
              value={email}
              error={invalid ? t("login.invalidEmail") : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button
              type="submit"
              loading={send.isPending}
              loadingLabel={t("login.sending")}
            >
              {t("login.submit")}
            </Button>
          </form>
          <GoogleLoginButton />
          <p className="text-ink-subtle">{t("login.hint")}</p>
        </AuthColumn>
      )}
    </>
  );
}
