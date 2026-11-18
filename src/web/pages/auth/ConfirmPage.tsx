import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Me } from "../../../shared/schemas/auth";
import { Button } from "../../components/Button";
import {
  AuthColumn,
  RedirectIfSession,
  Strip,
} from "../../features/auth/AuthColumn";
import { readFragmentToken, safeNext } from "../../features/auth/link-params";
import { forgetLogin, recallLogin } from "../../features/auth/login-memory";
import { t } from "../../i18n/es-AR";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

function verifyToken(token: string) {
  return apiFetch<Me>("/api/auth/verify", {
    method: "POST",
    body: { token },
  });
}

const isLinkExpired = (error: Error | null) =>
  error instanceof ApiError && error.status === 410;

export default function ConfirmPage() {
  const token = readFragmentToken(useLocation().hash);
  const [remembered] = useState(recallLogin);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const verify = useMutation({
    mutationFn: verifyToken,
    onSuccess: (me) => {
      forgetLogin();
      queryClient.setQueryData(qk.me(), me);
    },
  });

  function requestAnother() {
    const params = new URLSearchParams();
    if (remembered) params.set("email", remembered.email);
    if (remembered?.next) params.set("next", remembered.next);
    navigate(`/login?${params}`);
  }

  const expired = token === null || isLinkExpired(verify.error);
  if (expired) {
    return (
      <AuthColumn title={t("confirm.expiredTitle")}>
        <p className="text-ink">{t("confirm.expiredBody")}</p>
        <Button onClick={requestAnother}>{t("confirm.requestAnother")}</Button>
      </AuthColumn>
    );
  }

  return (
    <AuthColumn title={t("confirm.title")}>
      <RedirectIfSession to={safeNext(remembered?.next ?? null) ?? "/"} />
      {verify.isError && <Strip tone="loss">{t("errors.generic")}</Strip>}
      <Button
        loading={verify.isPending}
        loadingLabel={t("confirm.entering")}
        onClick={() => verify.mutate(token)}
      >
        {remembered
          ? `${t("confirm.enterAs")} ${remembered.email}`
          : t("confirm.enter")}
      </Button>
    </AuthColumn>
  );
}
