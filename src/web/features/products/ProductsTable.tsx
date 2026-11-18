import { Link } from "react-router";
import type { ProductListItemDto } from "../../../shared/schemas/products";
import { Button } from "../../components/Button";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { formatRoas } from "../../lib/format-roas";
import { LandingStatusChip } from "./LandingStatusChip";

type ProductsTableProps = {
  workspaceId: string;
  products: ProductListItemDto[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  empty: string;
};

export function ProductsTable({
  workspaceId,
  products,
  loading,
  error,
  onRetry,
  empty,
}: ProductsTableProps) {
  const columns: Column<ProductListItemDto>[] = [
    {
      key: "name",
      header: t("products.colName"),
      rowHeader: true,
      render: ({ id, name }) => (
        <Link
          to={workspacePath(workspaceId, `productos/${id}`)}
          className="text-primary underline"
        >
          {name}
        </Link>
      ),
    },
    {
      key: "landing",
      header: t("products.colLanding"),
      render: ({ landingStatus }) => (
        <LandingStatusChip status={landingStatus} />
      ),
    },
    {
      key: "roas",
      header: t("products.colRoas"),
      numeric: true,
      render: ({ breakEvenRoas }) =>
        breakEvenRoas === null
          ? t("products.noRoas")
          : formatRoas(breakEvenRoas),
    },
    {
      key: "actions",
      header: t("products.colActions"),
      render: () => (
        <Button variant="ghost" disabledReason={t("products.launchDisabled")}>
          {t("products.launch")}
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      caption={t("products.caption")}
      columns={columns}
      rows={products}
      getRowKey={({ id }) => id}
      loading={loading}
      error={error ? t("products.loadError") : undefined}
      onRetry={onRetry}
      empty={empty}
    />
  );
}
