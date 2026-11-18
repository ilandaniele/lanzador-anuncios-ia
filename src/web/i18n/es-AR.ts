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
