import { useParams, useSearchParams } from "react-router";
import { ToastProvider } from "../../components/Toast";
import { MetaBlock } from "../../features/meta/MetaBlock";
import { connectFailureMessage } from "../../features/meta/meta-errors";
import { t } from "../../i18n/es-AR";

function ResultBanner({
  result,
  reason,
}: {
  result: string;
  reason: string | null;
}) {
  if (result === "ok")
    return (
      <p role="status" className="rounded-sm bg-gain-soft p-3 text-gain">
        {t("connections.connectedOk")}
      </p>
    );
  return (
    <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
      {connectFailureMessage(reason)}
    </p>
  );
}

export default function ConexionesPage() {
  const { workspaceId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const result = searchParams.get("resultado");

  return (
    <ToastProvider>
      <section
        aria-labelledby="conexiones-titulo"
        className="flex flex-col gap-4"
      >
        <h2 id="conexiones-titulo" className="text-xl font-semibold">
          {t("settings.connections")}
        </h2>
        {(result === "ok" || result === "error") && (
          <ResultBanner result={result} reason={searchParams.get("motivo")} />
        )}
        <h3 className="text-lg font-semibold">{t("connections.metaTitle")}</h3>
        <MetaBlock
          workspaceId={workspaceId}
          initialChoosing={result === "ok"}
        />
      </section>
    </ToastProvider>
  );
}
