import { useState } from "react";
import { Input } from "../../components/TextField";
import { AdminHeader } from "../../features/admin/AdminHeader";
import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { useAdminUsage } from "../../features/admin/use-admin-reports";
import { UsageTable } from "../../features/admin/UsageTable";
import { t } from "../../i18n/es-AR";

export default function UsoPage() {
  const [month, setMonth] = useState("");
  const usage = useAdminUsage(month);
  const neuronsToday = usage.data?.pages[0]?.global.neuronsToday;

  return (
    <>
      <AdminHeader />
      <main className="p-4">
        <section aria-labelledby="uso-titulo">
          <h1 id="uso-titulo" className="mb-4 text-xl font-semibold">
            {t("adminUsage.title")}
          </h1>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <Input
              type="month"
              label={t("adminUsage.month")}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            {neuronsToday !== undefined && (
              <p>
                {t("adminUsage.today")}:{" "}
                <strong className="tabular-nums">
                  {neuronsToday.toLocaleString("es-AR")}
                </strong>
              </p>
            )}
          </div>
          <UsageTable
            workspaces={
              usage.data?.pages.flatMap((page) => page.workspaces) ?? []
            }
            loading={usage.isPending}
            error={usage.isError}
            onRetry={() => void usage.refetch()}
          />
          {usage.hasNextPage && (
            <LoadMoreButton
              loading={usage.isFetchingNextPage}
              onClick={() => void usage.fetchNextPage()}
            />
          )}
        </section>
      </main>
    </>
  );
}
