import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { useAssets } from "./use-meta-connections";

export function EnabledAccounts({ workspaceId }: { workspaceId: string }) {
  const assets = useAssets(workspaceId);
  const accounts = (assets.data ?? []).filter(
    (asset) => asset.kind === "ad_account" && asset.enabled,
  );

  if (!assets.data)
    return (
      <SkeletonRegion label={t("common.loading")}>
        <Skeleton className="h-5 w-48" />
      </SkeletonRegion>
    );
  return (
    <section aria-labelledby="cuentas-habilitadas-titulo">
      <h3
        id="cuentas-habilitadas-titulo"
        className="mb-2 text-lg font-semibold"
      >
        {t("connections.enabledAccounts")}
      </h3>
      {accounts.length === 0 ? (
        <p className="text-ink-muted">{t("connections.noEnabledAccounts")}</p>
      ) : (
        <ul>
          {accounts.map((account) => (
            <li key={account.id}>{account.name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
