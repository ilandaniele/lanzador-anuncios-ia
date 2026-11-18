import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { ProductsTable } from "../../features/products/ProductsTable";
import { useCanEdit } from "../../features/products/use-can-edit";
import { useProducts } from "../../features/products/use-products";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";

export default function ProductosPage() {
  const { workspaceId = "" } = useParams();
  const [archived, setArchived] = useState(false);
  const products = useProducts(workspaceId, archived);
  const canEdit = useCanEdit(workspaceId);
  const navigate = useNavigate();

  return (
    <section aria-labelledby="productos-titulo">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 id="productos-titulo" className="text-xl font-semibold">
          {t("products.title")}
        </h1>
        {canEdit && (
          <Button
            onClick={() =>
              navigate(workspacePath(workspaceId, "productos/nuevo"))
            }
          >
            {t("products.newProduct")}
          </Button>
        )}
      </div>
      <label className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
        />
        {t("products.showArchived")}
      </label>
      <ProductsTable
        workspaceId={workspaceId}
        products={products.data?.pages.flatMap((page) => page.data) ?? []}
        loading={products.isPending}
        error={products.isError}
        onRetry={() => void products.refetch()}
        empty={t(archived ? "products.emptyArchived" : "products.empty")}
      />
      {products.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={products.isFetchingNextPage}
            loadingLabel={t("common.working")}
            onClick={() => void products.fetchNextPage()}
          >
            {t("products.loadMore")}
          </Button>
        </div>
      )}
    </section>
  );
}
