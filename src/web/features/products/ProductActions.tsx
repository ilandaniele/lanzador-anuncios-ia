import { useState } from "react";
import { useNavigate } from "react-router";
import type { ProductDto } from "../../../shared/schemas/products";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { workspacePath } from "../../layout/nav-items";
import { t } from "../../i18n/es-AR";
import { duplicateErrorMessage } from "./product-errors";
import { useArchiveProduct, useDuplicateProduct } from "./use-products";

type ProductActionsProps = { workspaceId: string; product: ProductDto };

export function ProductActions({ workspaceId, product }: ProductActionsProps) {
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const archive = useArchiveProduct(workspaceId, product.id);
  const duplicate = useDuplicateProduct(workspaceId, product.id);
  const navigate = useNavigate();
  const { notify } = useToast();

  function handleDuplicate() {
    duplicate.mutate(undefined, {
      onSuccess: (copy) =>
        navigate(workspacePath(workspaceId, `productos/${copy.id}`)),
      onError: (error) =>
        notify({ tone: "error", message: duplicateErrorMessage(error) }),
    });
  }

  function handleUnarchive() {
    archive.mutate(false, {
      onSuccess: () =>
        notify({ tone: "success", message: t("products.actions.unarchived") }),
      onError: () => notify({ tone: "error", message: t("errors.generic") }),
    });
  }

  function handleArchive() {
    archive.mutate(true, {
      onSuccess: () => {
        setConfirmingArchive(false);
        notify({ tone: "success", message: t("products.actions.archived") });
      },
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        loading={duplicate.isPending}
        loadingLabel={t("common.working")}
        onClick={handleDuplicate}
      >
        {t("products.actions.duplicate")}
      </Button>
      {product.archived ? (
        <Button
          variant="secondary"
          loading={archive.isPending}
          loadingLabel={t("common.working")}
          onClick={handleUnarchive}
        >
          {t("products.actions.unarchive")}
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setConfirmingArchive(true)}>
          {t("products.actions.archive")}
        </Button>
      )}
      {confirmingArchive && (
        <ConfirmDialog
          title={t("products.actions.archiveTitle")}
          confirmLabel={t("products.actions.archive")}
          rows={[
            {
              label: t("products.actions.archiveReceiptName"),
              value: product.name,
            },
          ]}
          consequence={t("products.actions.archiveConsequence")}
          submitting={archive.isPending}
          errorMessage={archive.isError ? t("errors.generic") : undefined}
          onConfirm={handleArchive}
          onCancel={() => setConfirmingArchive(false)}
        />
      )}
    </div>
  );
}
