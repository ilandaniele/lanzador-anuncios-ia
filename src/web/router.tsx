import type { ComponentType } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import {
  HomeRedirect,
  RequireMembership,
  RequireSession,
  RequireSuperadmin,
} from "./features/auth/guards";
import { PageSkeleton } from "./components/PageSkeleton";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import AppShell from "./layout/AppShell";
import NotFoundPage from "./pages/not-found/NotFoundPage";

const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const workspaceRoutes: RouteObject[] = [
  { index: true, element: <Navigate replace to="hoy" /> },
  { path: "hoy", ...page(() => import("./pages/hoy/HoyPage")) },
  { path: "lanzador", ...page(() => import("./pages/lanzador/LanzadorPage")) },
  {
    path: "lanzador/:launchId",
    ...page(() => import("./pages/lanzador/LanzadorPage")),
  },
  { path: "metricas", ...page(() => import("./pages/metricas/MetricasPage")) },
  { path: "piloto", ...page(() => import("./pages/piloto/PilotoPage")) },
  {
    path: "creativos",
    ...page(() => import("./pages/creativos/CreativosPage")),
  },
  {
    path: "productos",
    ...page(() => import("./pages/productos/ProductosPage")),
  },
  {
    path: "productos/nuevo",
    ...page(() => import("./pages/productos/ProductoFormPage")),
  },
  {
    path: "productos/:productId",
    ...page(() => import("./pages/productos/ProductoFormPage")),
  },
  {
    path: "historial",
    ...page(() => import("./pages/historial/HistorialPage")),
  },
  {
    path: "ajustes",
    ...page(() => import("./pages/ajustes/AjustesLayout")),
    children: [
      { index: true, element: <Navigate replace to="cuenta" /> },
      { path: "general", ...page(() => import("./pages/ajustes/GeneralPage")) },
      { path: "cuenta", ...page(() => import("./pages/ajustes/CuentaPage")) },
      {
        path: "miembros",
        ...page(() => import("./pages/ajustes/MiembrosPage")),
      },
      {
        path: "conexiones",
        ...page(() => import("./pages/ajustes/ConexionesPage")),
      },
      { path: "ia", ...page(() => import("./pages/ajustes/IaPage")) },
      {
        path: "facturacion",
        ...page(() => import("./pages/ajustes/FacturacionPage")),
      },
      { path: "peligro", ...page(() => import("./pages/ajustes/PeligroPage")) },
    ],
  },
];

export const appRoutes: RouteObject[] = [
  { path: "login", ...page(() => import("./pages/auth/LoginPage")) },
  {
    path: "ingresar/confirmar",
    ...page(() => import("./pages/auth/ConfirmPage")),
  },
  { path: "invitacion", ...page(() => import("./pages/auth/InvitationPage")) },
  { path: "revisor", ...page(() => import("./pages/auth/ReviewerPage")) },
  {
    element: <RequireSession />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        path: "onboarding",
        ...page(() => import("./pages/onboarding/OnboardingPage")),
      },
      {
        path: "w/:workspaceId",
        element: <RequireMembership />,
        children: [{ element: <AppShell />, children: workspaceRoutes }],
      },
      {
        path: "admin",
        element: <RequireSuperadmin />,
        children: [
          { index: true, ...page(() => import("./pages/admin/AdminPage")) },
          { path: "uso", ...page(() => import("./pages/admin/UsoPage")) },
          {
            path: "errores",
            ...page(() => import("./pages/admin/ErroresPage")),
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
];

export const createAppRouter = () =>
  createBrowserRouter([
    {
      errorElement: <RouteErrorFallback />,
      HydrateFallback: PageSkeleton,
      children: appRoutes,
    },
  ]);
