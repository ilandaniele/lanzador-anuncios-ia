import type { ChangeEvent } from "react";
import type { ProductDto } from "../../../shared/schemas/products";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";
import { LandingStatusChip } from "./LandingStatusChip";
import { useCheckLanding } from "./use-products";

type LandingFieldProps = {
  workspaceId: string;
  product?: ProductDto;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
};

const APP_HOST_ERROR = "app_host";

function testBlockedReason(product: ProductDto | undefined, value: string) {
  if (!product) return t("products.landing.needsSave");
  if (product.landingUrl !== value)
    return t("products.landing.needsSaveChanges");
  return undefined;
}

export function LandingField({
  workspaceId,
  product,
  value,
  onChange,
  error,
}: LandingFieldProps) {
  const check = useCheckLanding(workspaceId, product?.id ?? "");
  const checkedUrlIsCurrent = product?.landingUrl === value;
  const status = check.data?.status ?? product?.landingStatus ?? "unchecked";
  const detail = check.data ? check.data.error : product?.landingError;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={t("products.form.landingUrl")}
            type="url"
            required
            autoComplete="off"
            value={value}
            onChange={onChange}
            error={error}
          />
        </div>
        <Button
          variant="secondary"
          loading={check.isPending}
          loadingLabel={t("products.landing.testing")}
          disabledReason={testBlockedReason(product, value)}
          onClick={() => check.mutate(undefined)}
        >
          {t("products.landing.test")}
        </Button>
      </div>
      {check.isError && (
        <p role="alert" className="text-loss">
          {t("errors.generic")}
        </p>
      )}
      {checkedUrlIsCurrent && status !== "unchecked" && (
        <p className="flex flex-wrap items-center gap-2" role="status">
          <LandingStatusChip status={status} />
          {detail === APP_HOST_ERROR ? (
            <span className="text-loss">{t("products.landing.appHost")}</span>
          ) : (
            detail && (
              <span className="text-ink-muted">
                {t("products.landing.errorDetail")}: {detail}
              </span>
            )
          )}
        </p>
      )}
    </div>
  );
}
