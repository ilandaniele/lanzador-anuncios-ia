import { useState, type ChangeEvent, type FormEvent } from "react";
import { COPY_LIMITS, type Cta } from "../../../shared/constants";
import type { ProductDto } from "../../../shared/schemas/products";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/MoneyInput";
import { Select } from "../../components/Select";
import { Input, Textarea } from "../../components/TextField";
import { t } from "../../i18n/es-AR";
import { EconomyPanel } from "./EconomyPanel";
import { ErrorSummary } from "./ErrorSummary";
import { FormGroup } from "./FormGroup";
import { LandingField } from "./LandingField";
import { finalLandingUrl } from "./landing-link";
import { productFieldErrors } from "./product-errors";
import {
  toFormValues,
  toRequest,
  type ProductFormValues,
  type TextFieldKey,
} from "./product-form-values";
import { ctaOptions, currencyOptions } from "./product-options";
import { useSaveProduct } from "./use-products";

type ProductFormProps = {
  workspaceId: string;
  product?: ProductDto;
  onSaved: (product: ProductDto) => void;
  onCancel?: () => void;
};

export function ProductForm({
  workspaceId,
  product,
  onSaved,
  onCancel,
}: ProductFormProps) {
  const [values, setValues] = useState(() => toFormValues(product));
  const save = useSaveProduct(workspaceId, product?.id);
  const errors = productFieldErrors(save.error);
  const hasUnmappedError = save.isError && Object.keys(errors).length === 0;

  function setValue<Key extends keyof ProductFormValues>(
    key: Key,
    value: ProductFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const bind = (key: TextFieldKey) => ({
    value: values[key],
    error: errors[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(key, event.target.value),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(toRequest(values), { onSuccess: onSaved });
  }

  const finalUrl = finalLandingUrl(values.landingUrl, values.utm);

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="grid gap-6 lg:grid-cols-[minmax(0,640px)_320px]"
    >
      <div className="flex flex-col gap-6">
        <ErrorSummary errors={errors} />
        {hasUnmappedError && (
          <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
            {t("errors.generic")}
          </p>
        )}
        <FormGroup legend={t("products.form.groupIdentity")}>
          <Input
            label={t("products.form.name")}
            required
            autoComplete="off"
            {...bind("name")}
          />
        </FormGroup>
        <FormGroup legend={t("products.form.groupLanding")}>
          <LandingField
            workspaceId={workspaceId}
            product={product}
            {...bind("landingUrl")}
          />
        </FormGroup>
        <FormGroup legend={t("products.form.groupCopy")}>
          <Textarea
            label={t("products.form.primaryText")}
            required
            limit={COPY_LIMITS.primaryText}
            {...bind("primaryText")}
          />
          <Input
            label={t("products.form.headline")}
            required
            limit={COPY_LIMITS.headline}
            {...bind("headline")}
          />
          <Input
            label={t("products.form.description")}
            limit={COPY_LIMITS.description}
            {...bind("description")}
          />
          <Select
            label={t("products.form.cta")}
            options={ctaOptions}
            value={values.cta}
            onChange={(event) => setValue("cta", event.target.value as Cta)}
          />
        </FormGroup>
        <FormGroup legend={t("products.form.groupUtm")}>
          <Input
            label={t("products.form.utm")}
            hint={t("products.form.utmHint")}
            autoComplete="off"
            {...bind("utm")}
          />
          {finalUrl && (
            <p className="text-ink-muted">
              {t("products.form.utmPreview")}:{" "}
              <output className="break-all text-ink select-all">
                {finalUrl}
              </output>
            </p>
          )}
        </FormGroup>
        <FormGroup legend={t("products.form.groupEconomy")}>
          <div className="grid gap-4 md:grid-cols-3">
            <MoneyInput
              label={t("products.form.priceMinor")}
              currency={values.currency}
              value={values.priceMinor}
              onChange={(minor) => setValue("priceMinor", minor)}
              error={errors.priceMinor}
            />
            <MoneyInput
              label={t("products.form.costMinor")}
              currency={values.currency}
              value={values.costMinor}
              onChange={(minor) => setValue("costMinor", minor)}
              error={errors.costMinor}
            />
            <Select
              label={t("products.form.currency")}
              options={currencyOptions(values.currency)}
              value={values.currency}
              onChange={(event) => setValue("currency", event.target.value)}
              error={errors.currency}
            />
          </div>
        </FormGroup>
        <div className="sticky bottom-0 flex justify-between gap-2 border-t border-rule bg-paper py-3">
          {onCancel ? (
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={onCancel}
            >
              {t("common.cancel")}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            loading={save.isPending}
            loadingLabel={t("products.form.saving")}
          >
            {t("products.form.save")}
          </Button>
        </div>
      </div>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <EconomyPanel
          priceMinor={values.priceMinor}
          costMinor={values.costMinor}
          currency={values.currency}
        />
      </aside>
    </form>
  );
}
