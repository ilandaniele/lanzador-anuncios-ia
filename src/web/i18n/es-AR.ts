const esAR = {
  nav: {
    hoy: "Hoy",
    lanzador: "Lanzador",
    metricas: "Métricas",
    piloto: "Piloto",
    creativos: "Creativos",
    productos: "Productos",
    historial: "Historial",
    ajustes: "Ajustes",
    more: "Más",
    primaryLabel: "Navegación principal",
    mobileLabel: "Navegación móvil",
    moreLabel: "Más secciones",
  },
  layout: {
    skipToContent: "Saltar al contenido",
    workspace: "Workspace",
    theme: "Tema",
  },
  theme: {
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  },
  roles: {
    owner: "Propietario",
    admin: "Administrador",
    editor: "Editor",
    viewer: "Lector",
  },
  hoy: {
    emptyBody: "Todavía no lanzaste nada. Armá tu primer lanzamiento.",
    newLaunch: "Nuevo lanzamiento",
  },
  login: { title: "Ingresá a Lanzador" },
  confirm: { title: "Confirmá tu ingreso" },
  invitation: { title: "Invitación" },
  onboarding: { title: "Armemos tu workspace" },
  admin: { title: "Administración" },
  settings: {
    general: "General",
    account: "Cuenta",
    members: "Miembros",
    connections: "Conexiones",
    danger: "Peligro",
  },
  notFound: {
    title: "No encontramos esta página",
    body: "El link está mal o no tenés acceso.",
    home: "Volver al inicio",
  },
  errors: {
    generic: "Algo salió mal. Probá de nuevo.",
    retry: "Reintentar",
  },
  common: {
    cancel: "Cancelar",
    close: "Cerrar",
    required: "(obligatorio)",
    working: "Procesando…",
    loading: "Cargando",
  },
  field: {
    limitExceeded: "Superaste el límite recomendado",
  },
  chip: { remove: "Quitar" },
  combobox: {
    empty: "No hay resultados",
    loading: "Cargando opciones",
    error: "No pudimos cargar las opciones",
  },
  dialog: { typeToConfirm: "Escribí el nombre exacto para confirmar" },
  table: { empty: "No hay datos para mostrar" },
  toast: { region: "Notificaciones", undo: "Deshacer" },
};

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

export type TextKey = Leaves<typeof esAR>;

export function t(key: TextKey): string {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      esAR,
    );
  return text as string;
}
