import type { TextKey } from "../i18n/es-AR";

export interface NavItem {
  section: string;
  label: TextKey;
}

export const sidebarItems: NavItem[] = [
  { section: "hoy", label: "nav.hoy" },
  { section: "lanzador", label: "nav.lanzador" },
  { section: "metricas", label: "nav.metricas" },
  { section: "piloto", label: "nav.piloto" },
  { section: "creativos", label: "nav.creativos" },
  { section: "productos", label: "nav.productos" },
  { section: "historial", label: "nav.historial" },
  { section: "ajustes", label: "nav.ajustes" },
];

const BOTTOM_SECTIONS = ["hoy", "metricas", "piloto", "historial"];

export const bottomItems: NavItem[] = sidebarItems.filter(({ section }) =>
  BOTTOM_SECTIONS.includes(section),
);

export const moreItems: NavItem[] = sidebarItems.filter(
  ({ section }) => !BOTTOM_SECTIONS.includes(section),
);

export const workspacePath = (workspaceId: string, section: string) =>
  `/w/${workspaceId}/${section}`;
