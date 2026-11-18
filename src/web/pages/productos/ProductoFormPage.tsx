import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { StatusChip } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { Tabs } from "../../components/Tabs";
import { ToastProvider, useToast } from "../../components/Toast";
import { ProductActions } from "../../features/products/ProductActions";
import { ProductForm } from "../../features/products/ProductForm";
import { useCanEdit } from "../../features/products/use-can-edit";
import { useProduct } from "../../features/products/use-products";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { CopysTab } from "./CopysTab";

const PRODUCT_TABS = [
  { id: "data", label: t("copys.tabData") },
  { id: "copys", label: t("copys.tabCopys") },
] as const;

function ProductFormPageContent({
  workspaceId,
  productId,
}: {
  workspaceId: string;
  productId: string;
}) {
  const [tab, setTab] = useState<(typeof PRODUCT_TABS)[number]["id"]>("data");
  const product = useProduct(workspaceId, productId);
  const canEdit = useCanEdit(workspaceId);
  const navigate = useNavigate();
  const { notify } = useToast();
  const isNew = productId === "";
  const listPath = workspacePath(workspaceId, "productos");

  if (!isNew && product.isPending) {
    return (
      <SkeletonRegion
        label={t("common.loading")}
        className="flex flex-col gap-4"
      >
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40" />
      </SkeletonRegion>
    );
  }
  if (!isNew && product.isError) {
    return (
      <EmptyState
        message={t("products.notFound")}
        action={
          <Link to={listPath} className="text-primary underline">
            {t("products.back")}
          </Link>
        }
      />
    );
  }

  const productForm = (
    <ProductForm
      key={product.data?.id}
      workspaceId={workspaceId}
      product={product.data}
      onSaved={(saved) => {
        if (isNew) {
          navigate(workspacePath(workspaceId, `productos/${saved.id}`), {
            replace: true,
          });
          return;
        }
        notify({ tone: "success", message: t("products.form.saved") });
      }}
    />
  );

  return (
    <section aria-labelledby="producto-titulo" className="flex flex-col gap-4">
      <Link to={listPath} className="text-primary underline">
        {t("products.back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="producto-titulo" className="text-xl font-semibold">
          {t(isNew ? "products.form.titleNew" : "products.form.titleEdit")}
        </h1>
        {product.data?.archived && (
          <StatusChip tone="paused">{t("products.archivedBadge")}</StatusChip>
        )}
        {canEdit && product.data && (
          <ProductActions workspaceId={workspaceId} product={product.data} />
        )}
      </div>
      {isNew ? (
        productForm
      ) : (
        <Tabs
          label={t("copys.tabsLabel")}
          tabs={PRODUCT_TABS}
          selected={tab}
          onSelect={setTab}
        >
          {tab === "data" ? (
            productForm
          ) : (
            <CopysTab workspaceId={workspaceId} productId={productId} />
          )}
        </Tabs>
      )}
    </section>
  );
}

export default function ProductoFormPage() {
  const { workspaceId = "", productId = "" } = useParams();
  return (
    <ToastProvider>
      <ProductFormPageContent workspaceId={workspaceId} productId={productId} />
    </ToastProvider>
  );
}
