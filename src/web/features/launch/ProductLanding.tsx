import type { ProductDto } from "../../../shared/schemas/products";
import { t } from "../../i18n/es-AR";
import { LandingStatusChip } from "../products/LandingStatusChip";

export function ProductLanding({ product }: { product: ProductDto }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("launcher.step3.landingLabel")}</span>
        <LandingStatusChip status={product.landingStatus} />
        <span className="break-all text-ink-muted">{product.landingUrl}</span>
      </p>
      {product.landingStatus === "error" && (
        <p
          role="alert"
          className="rounded-sm border border-loss bg-loss-soft p-3 text-loss"
        >
          {t("launcher.step3.landingError")}
        </p>
      )}
      {product.landingStatus === "soft_ok" && (
        <p role="status" className="text-warn">
          {t("launcher.step3.landingSoftOk")}
        </p>
      )}
    </div>
  );
}
