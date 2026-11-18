import { useParams, useSearchParams } from "react-router";
import { ToastProvider } from "../../components/Toast";
import { googleConnectFailureMessage } from "../../features/google/google-errors";
import { GoogleBlock } from "../../features/google/GoogleBlock";
import { useCanUseGoogle } from "../../features/google/use-can-use-google";
import { MetaBlock } from "../../features/meta/MetaBlock";
import { connectFailureMessage } from "../../features/meta/meta-errors";
import { t } from "../../i18n/es-AR";

function ResultBanner({
  result,
  okText,
  errorText,
}: {
  result: string;
  okText: string;
  errorText: string;
}) {
  if (result === "ok")
    return (
      <p role="status" className="rounded-sm bg-gain-soft p-3 text-gain">
        {okText}
      </p>
    );
  return (
    <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
      {errorText}
    </p>
  );
}

export default function ConexionesPage() {
  const { workspaceId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const result = searchParams.get("resultado");
  const googleResult = searchParams.get("google");
  const reason = searchParams.get("motivo");
  const canUseGoogle = useCanUseGoogle(workspaceId);

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
          <ResultBanner
            result={result}
            okText={t("connections.connectedOk")}
            errorText={connectFailureMessage(reason)}
          />
        )}
        <h3 className="text-lg font-semibold">{t("connections.metaTitle")}</h3>
        <MetaBlock
          workspaceId={workspaceId}
          initialChoosing={result === "ok"}
        />
        {canUseGoogle && (
          <>
            <h3 className="text-lg font-semibold">{t("google.title")}</h3>
            {(googleResult === "ok" || googleResult === "error") && (
              <ResultBanner
                result={googleResult}
                okText={t("google.connectedOk")}
                errorText={googleConnectFailureMessage(reason)}
              />
            )}
            <GoogleBlock workspaceId={workspaceId} />
          </>
        )}
      </section>
    </ToastProvider>
  );
}
