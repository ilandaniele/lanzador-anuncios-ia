import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";
import { PageSkeleton } from "../../components/PageSkeleton";
import { t } from "../../i18n/es-AR";
import NotFoundPage from "../../pages/not-found/NotFoundPage";
import { useMe } from "./use-me";

function loginUrl(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <main role="alert">
      <p>{t("errors.generic")}</p>
      <button type="button" onClick={onRetry}>
        {t("errors.retry")}
      </button>
    </main>
  );
}

export function RequireSession() {
  const me = useMe();
  const { pathname, search } = useLocation();

  if (me.isPending) return <PageSkeleton />;
  if (me.isError) return <LoadError onRetry={() => void me.refetch()} />;
  if (!me.data) return <Navigate replace to={loginUrl(pathname + search)} />;
  return <Outlet />;
}

function Allow({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? children : <NotFoundPage />;
}

export function RequireMembership() {
  const { workspaceId } = useParams();
  const me = useMe().data;
  const isMember = me?.workspaces.some(({ id }) => id === workspaceId);
  return (
    <Allow when={Boolean(isMember)}>
      <Outlet />
    </Allow>
  );
}

export function RequireSuperadmin() {
  const me = useMe().data;
  return (
    <Allow when={Boolean(me?.user.isSuperadmin)}>
      <Outlet />
    </Allow>
  );
}

export function HomeRedirect() {
  const firstWorkspace = useMe().data?.workspaces[0];
  return (
    <Navigate
      replace
      to={firstWorkspace ? `/w/${firstWorkspace.id}/hoy` : "/onboarding"}
    />
  );
}
