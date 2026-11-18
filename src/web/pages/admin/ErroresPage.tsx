import { useState } from "react";
import { ERROR_SOURCES, type ErrorSource } from "../../../shared/constants";
import { Select } from "../../components/Select";
import { AdminHeader } from "../../features/admin/AdminHeader";
import { ErrorsTable } from "../../features/admin/ErrorsTable";
import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { useAdminErrors } from "../../features/admin/use-admin-reports";
import { t } from "../../i18n/es-AR";

const SOURCE_OPTIONS = [
  { value: "", label: t("adminErrors.allSources") },
  ...ERROR_SOURCES.map((source) => ({
    value: source,
    label: t(`adminErrors.source.${source}`),
  })),
];

export default function ErroresPage() {
  const [source, setSource] = useState<ErrorSource | "">("");
  const errors = useAdminErrors(source);

  return (
    <>
      <AdminHeader />
      <main className="p-4">
        <section aria-labelledby="errores-titulo">
          <h1 id="errores-titulo" className="mb-4 text-xl font-semibold">
            {t("adminErrors.title")}
          </h1>
          <div className="mb-4">
            <Select
              label={t("adminErrors.sourceLabel")}
              options={SOURCE_OPTIONS}
              value={source}
              onChange={(event) =>
                setSource(event.target.value as ErrorSource | "")
              }
            />
          </div>
          <ErrorsTable
            errors={errors.data?.pages.flatMap((page) => page.data) ?? []}
            loading={errors.isPending}
            error={errors.isError}
            onRetry={() => void errors.refetch()}
          />
          {errors.hasNextPage && (
            <LoadMoreButton
              loading={errors.isFetchingNextPage}
              onClick={() => void errors.fetchNextPage()}
            />
          )}
        </section>
      </main>
    </>
  );
}
