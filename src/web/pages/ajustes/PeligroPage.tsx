import { useState } from "react";
import { useParams } from "react-router";
import { Button } from "../../components/Button";
import { useMe } from "../../features/auth/use-me";
import { DeleteWorkspaceDialog } from "../../features/settings/DeleteWorkspaceDialog";
import { t } from "../../i18n/es-AR";

export default function PeligroPage() {
  const { workspaceId = "" } = useParams();
  const workspace = useMe().data?.workspaces.find(
    ({ id }) => id === workspaceId,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <section
      aria-labelledby="peligro-titulo"
      className="flex flex-col gap-4 rounded-lg border border-loss p-4"
    >
      <h2 id="peligro-titulo" className="text-xl font-semibold">
        {t("settings.danger")}
      </h2>
      <p className="text-ink-muted">{t("danger.description")}</p>
      <div>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {t("danger.delete")}
        </Button>
      </div>
      {confirming && workspace && (
        <DeleteWorkspaceDialog
          workspace={workspace}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
