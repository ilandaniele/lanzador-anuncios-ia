import { useParams } from "react-router";
import { BillingPanel } from "../../features/billing/BillingPanel";
import { t } from "../../i18n/es-AR";

export default function FacturacionPage() {
  const { workspaceId = "" } = useParams();

  return (
    <section
      aria-labelledby="facturacion-titulo"
      className="flex flex-col gap-4"
    >
      <h2 id="facturacion-titulo" className="text-xl font-semibold">
        {t("billing.title")}
      </h2>
      <BillingPanel workspaceId={workspaceId} />
    </section>
  );
}
