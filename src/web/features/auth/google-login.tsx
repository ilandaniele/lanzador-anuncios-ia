import type { GoogleLoginFailure } from "../../../shared/schemas/auth";
import { buttonClass } from "../../components/Button";
import { t, type TextKey } from "../../i18n/es-AR";
import { Strip } from "./AuthColumn";

const GOOGLE_START_PATH = "/api/auth/google/start";

const failureKey: Record<GoogleLoginFailure, TextKey> = {
  STATE_INVALID: "login.googleFailure.STATE_INVALID",
  GOOGLE_DENIED: "login.googleFailure.GOOGLE_DENIED",
  TOKEN_EXCHANGE_FAILED: "login.googleFailure.TOKEN_EXCHANGE_FAILED",
  EMAIL_UNVERIFIED: "login.googleFailure.EMAIL_UNVERIFIED",
  NOT_ALLOWED: "login.googleFailure.NOT_ALLOWED",
  INTERNAL: "login.googleFailure.INTERNAL",
};

const isKnownFailure = (code: string): code is GoogleLoginFailure =>
  Object.hasOwn(failureKey, code);

export function googleFailureStrip(params: URLSearchParams) {
  if (params.get("google") !== "error") return null;
  const code = params.get("motivo") ?? "";
  const key = isKnownFailure(code) ? failureKey[code] : failureKey.INTERNAL;
  return <Strip tone="loss">{t(key)}</Strip>;
}

export function GoogleLoginButton() {
  return (
    <>
      <div className="flex items-center gap-3 text-ink-subtle">
        <hr className="flex-1 border-rule" />
        <span>{t("login.or")}</span>
        <hr className="flex-1 border-rule" />
      </div>
      <a href={GOOGLE_START_PATH} className={buttonClass("secondary")}>
        {t("login.google")}
      </a>
    </>
  );
}
