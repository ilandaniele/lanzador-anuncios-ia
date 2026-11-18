import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import type { AcceptInvitationResponse } from "../../../shared/schemas/invitations";
import { Button } from "../../components/Button";
import { AuthColumn, Strip } from "../../features/auth/AuthColumn";
import { readFragmentToken } from "../../features/auth/link-params";
import { t } from "../../i18n/es-AR";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

function acceptInvitation(token: string) {
  return apiFetch<AcceptInvitationResponse>("/api/invitations/accept", {
    method: "POST",
    body: { token },
  });
}

function failureMessage(error: Error | null): string | null {
  if (!error) return null;
  const emailMismatch = error instanceof ApiError && error.status === 409;
  return t(emailMismatch ? "invitation.emailMismatch" : "errors.generic");
}

const isInvitationExpired = (error: Error | null) =>
  error instanceof ApiError && error.status === 410;

export default function InvitationPage() {
  const token = readFragmentToken(useLocation().hash);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const accept = useMutation({
    mutationFn: acceptInvitation,
    onSuccess: ({ workspaceId }) => {
      queryClient.removeQueries({ queryKey: qk.me() });
      navigate(`/w/${workspaceId}/hoy`, { replace: true });
    },
  });

  if (token === null || isInvitationExpired(accept.error)) {
    return (
      <AuthColumn title={t("invitation.expiredTitle")}>
        <p className="text-ink">{t("invitation.expiredBody")}</p>
      </AuthColumn>
    );
  }

  const failure = failureMessage(accept.error);
  return (
    <AuthColumn title={t("invitation.title")}>
      {failure && <Strip tone="loss">{failure}</Strip>}
      <p className="text-ink">{t("invitation.body")}</p>
      <Button
        loading={accept.isPending}
        loadingLabel={t("invitation.accepting")}
        onClick={() => accept.mutate(token)}
      >
        {t("invitation.accept")}
      </Button>
    </AuthColumn>
  );
}
