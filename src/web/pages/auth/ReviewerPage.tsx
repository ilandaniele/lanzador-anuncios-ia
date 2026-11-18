import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import {
  AuthColumn,
  RedirectIfSession,
  Strip,
} from "../../features/auth/AuthColumn";
import { t } from "../../i18n/es-AR";
import { ApiError, apiFetch } from "../../lib/api";

function requestReviewerLink(code: string) {
  return apiFetch<{ link: string }>("/api/auth/reviewer", {
    method: "POST",
    body: { code },
  });
}

function failureStrip(error: Error | null) {
  if (!error) return null;
  const invalid = error instanceof ApiError && error.status === 404;
  return (
    <Strip tone="loss">
      {invalid ? t("reviewer.invalidCode") : t("errors.generic")}
    </Strip>
  );
}

export default function ReviewerPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const enter = useMutation({
    mutationFn: requestReviewerLink,
    onSuccess: ({ link }) => {
      const url = new URL(link);
      navigate(`${url.pathname}${url.hash}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) enter.mutate(code.trim());
  }

  return (
    <AuthColumn title={t("reviewer.title")}>
      <RedirectIfSession to="/" />
      {failureStrip(enter.error)}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Input
          type="password"
          label={t("reviewer.code")}
          autoComplete="off"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Button type="submit" loading={enter.isPending}>
          {t("reviewer.submit")}
        </Button>
      </form>
    </AuthColumn>
  );
}
