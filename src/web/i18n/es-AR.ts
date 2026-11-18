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
  login: {
    title: "Ingresá a Lanzador",
    email: "Email",
    submit: "Enviarme el link",
    sending: "Enviando…",
    hint: "Sin contraseñas. Te mandamos un link que vence en 15 minutos.",
    invalidEmail: "Ingresá un email válido",
    rateLimited: "Probá en unos minutos",
    sentTitle: "Revisá tu email",
    sentBody: "Si tenés acceso, te llegó un link a",
    resend: "Reenviar",
    resendIn: "Reenviar en",
    resendWait: "Esperá un momento para reenviar el link",
    resendReady: "Ya podés reenviar el link",
  },
  confirm: {
    title: "Confirmá tu ingreso",
    enter: "Entrar",
    enterAs: "Entrar como",
    entering: "Entrando…",
    expiredTitle: "Link vencido",
    expiredBody: "Los links duran 15 minutos y sirven una vez.",
    requestAnother: "Pedir otro",
  },
  invitation: {
    title: "Invitación",
    body: "Te invitaron a sumarte a un workspace en Lanzador.",
    accept: "Aceptar invitación",
    accepting: "Aceptando…",
    expiredTitle: "Invitación vencida",
    expiredBody:
      "La invitación venció o ya se usó. Pedile a quien te invitó que te mande otra.",
    emailMismatch:
      "Esta invitación es para otro email. Cerrá sesión y abrí el link de nuevo.",
  },
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
  members: {
    caption: "Miembros e invitaciones del workspace",
    colEmail: "Email",
    colName: "Nombre",
    colRole: "Rol",
    colStatus: "Estado",
    colActions: "Acciones",
    roleOf: "Rol de",
    statusActive: "Activo",
    statusPending: "Invitación pendiente",
    statusExpired: "Invitación vencida",
    loadError: "No pudimos cargar los miembros",
    empty: "Todavía no hay miembros.",
    invite: "Invitar",
    inviteTitle: "Invitar miembro",
    inviteEmail: "Email",
    inviteRole: "Rol",
    inviteSubmit: "Enviar invitación",
    rolesHelp: "Qué puede hacer cada rol",
    roleDescription: {
      admin: "Gestiona miembros, conexiones y ajustes, y lanza campañas.",
      editor: "Crea y lanza campañas y creativos. No gestiona miembros.",
      viewer: "Solo mira métricas y campañas. No cambia nada.",
    },
    remove: "Quitar",
    removeTitle: "Quitar miembro",
    removeConsequence: "Pierde el acceso al workspace de inmediato.",
    revoke: "Revocar",
    revokeTitle: "Revocar invitación",
    revokeConsequence: "El link de la invitación deja de funcionar.",
    transfer: "Transferir propiedad",
    transferTitle: "Transferir propiedad",
    transferConfirm: "Transferir",
    transferConsequence:
      "Pasás a ser Administrador y esta persona queda como Propietaria.",
    receiptNewOwner: "Nuevo propietario",
    receiptYourRole: "Tu rol después",
    invited: "Invitación enviada",
    roleChanged: "Rol actualizado",
    removed: "Miembro quitado",
    revoked: "Invitación revocada",
    transferred: "Propiedad transferida",
    errorInvitationPending: "Ya hay una invitación pendiente para ese email.",
    errorAlreadyMember: "Ese email ya es miembro del workspace.",
    errorPlanLimit: "Tu plan llegó al máximo de miembros.",
    errorOwnerCannotLeave:
      "El propietario no se puede quitar. Transferí la propiedad primero.",
    errorCannotChangeOwner:
      "El rol del propietario no se cambia. Transferí la propiedad.",
    errorNotAMember: "Esa persona ya no es miembro del workspace.",
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
