import { useEffect, useState } from "react";
import type { ProductListItemDto } from "../../../shared/schemas/products";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { Dialog } from "../../components/Dialog";
import { CopyPicker } from "../../features/launch/CopyPicker";
import { copyFromProduct } from "../../features/launch/draft-copy";
import { ProductLanding } from "../../features/launch/ProductLanding";
import type { StepProps } from "../../features/launch/step-types";
import { ProductForm } from "../../features/products/ProductForm";
import { useProduct, useProducts } from "../../features/products/use-products";
import { t } from "../../i18n/es-AR";

export function Step3Product({
  workspaceId,
  draft,
  update,
  setBlockReason,
}: StepProps) {
  const [creating, setCreating] = useState(false);
  const productId = draft.productId ?? "";
  const products = useProducts(workspaceId, false);
  const product = useProduct(workspaceId, productId);
  const productList = products.data?.pages.flatMap((page) => page.data) ?? [];
  const blockReason =
    product.data?.landingStatus === "error"
      ? t("launcher.step3.landingError")
      : productId && product.isPending
        ? t("launcher.step3.landingChecking")
        : null;

  useEffect(() => {
    setBlockReason(blockReason);
    return () => setBlockReason(null);
  }, [blockReason, setBlockReason]);

  function chooseProduct(item: ProductListItemDto) {
    if (item.id === productId) return;
    update({ productId: item.id, copy: copyFromProduct(item) });
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Combobox
            label={t("launcher.step3.productLabel")}
            required
            emptyText={t("launcher.step3.noProducts")}
            loading={products.isPending}
            loadError={products.isError ? t("combobox.error") : undefined}
            onRetry={() => void products.refetch()}
            options={productList.map(({ id, name }) => ({
              value: id,
              label: name,
            }))}
            value={productId || null}
            onChange={(id) => {
              const item = productList.find((candidate) => candidate.id === id);
              if (item) chooseProduct(item);
            }}
          />
        </div>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          {t("launcher.step3.create")}
        </Button>
      </div>
      {product.data && (
        <>
          <ProductLanding product={product.data} />
          <CopyPicker
            key={product.data.id}
            workspaceId={workspaceId}
            update={update}
            product={product.data}
            initialCopyId={draft.copy?.copyId}
          />
        </>
      )}
      {creating && (
        <Dialog
          title={t("products.form.titleNew")}
          width="wide"
          onClose={() => setCreating(false)}
        >
          <ProductForm
            workspaceId={workspaceId}
            onCancel={() => setCreating(false)}
            onSaved={(created) => {
              chooseProduct(created);
              setCreating(false);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
