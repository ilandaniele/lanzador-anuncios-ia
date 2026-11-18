import { useState } from "react";
import type { ProductDto } from "../../../shared/schemas/products";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { CopyGenerator } from "../ai/CopyGenerator";
import { copyFromProduct, copyFromSaved } from "./draft-copy";
import type { StepProps } from "./step-types";
import { useSavedCopies } from "./use-product-copies";

type CopyPickerProps = Pick<StepProps, "workspaceId" | "update"> & {
  product: ProductDto;
  initialCopyId?: string;
};

export function CopyPicker({
  workspaceId,
  update,
  product,
  initialCopyId,
}: CopyPickerProps) {
  const copies = useSavedCopies(workspaceId, product.id);
  const [selectedIds, setSelectedIds] = useState(
    initialCopyId ? [initialCopyId] : [],
  );
  const [rotate, setRotate] = useState(true);

  function toggle(copyId: string) {
    const next = selectedIds.includes(copyId)
      ? selectedIds.filter((id) => id !== copyId)
      : [...selectedIds, copyId];
    const first = copies.data?.find((copy) => copy.id === next[0]);
    setSelectedIds(next);
    update({
      copy: first
        ? copyFromSaved(first, product.cta)
        : copyFromProduct(product),
    });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">
        {t("launcher.step3.copiesLegend")}
      </legend>
      <p className="text-ink-muted">{t("launcher.step3.copiesHint")}</p>
      {copies.isPending && (
        <SkeletonRegion label={t("common.loading")}>
          <Skeleton className="h-16" />
        </SkeletonRegion>
      )}
      {copies.isError && (
        <div role="alert" className="flex items-center gap-2">
          <p className="text-loss">{t("launcher.step3.copiesFailed")}</p>
          <Button variant="ghost" onClick={() => void copies.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {copies.data?.length === 0 && (
        <p className="text-ink-muted">{t("launcher.step3.copiesEmpty")}</p>
      )}
      {copies.data?.map((copy) => (
        <label
          key={copy.id}
          className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-sm border border-rule-strong bg-surface p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
        >
          <input
            type="checkbox"
            className="mt-1"
            checked={selectedIds.includes(copy.id)}
            onChange={() => toggle(copy.id)}
          />
          <span className="font-medium">{copy.headline}</span>
          <span className="col-start-2 text-ink-muted">{copy.primaryText}</span>
        </label>
      ))}
      {selectedIds.length > 1 && (
        <label className="grid grid-cols-[auto_1fr] items-start gap-x-3">
          <input
            type="checkbox"
            role="switch"
            className="mt-1"
            checked={rotate}
            onChange={(event) => setRotate(event.target.checked)}
          />
          <span className="font-medium">{t("launcher.step3.rotation")}</span>
          <span className="col-start-2 text-ink-muted">
            {t("launcher.step3.rotationHint")}
          </span>
        </label>
      )}
      <CopyGenerator workspaceId={workspaceId} productId={product.id} />
    </fieldset>
  );
}
