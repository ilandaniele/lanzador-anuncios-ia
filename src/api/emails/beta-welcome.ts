import { renderEmail, type EmailContent } from "./layout";

interface BetaWelcomeEmailInput {
  appOrigin: string;
}

export const buildBetaWelcomeEmail = ({
  appOrigin,
}: BetaWelcomeEmailInput): EmailContent =>
  renderEmail({
    subject: "Ya podés usar Lanzador",
    heading: "Bienvenido a la beta de Lanzador",
    paragraphs: [
      "Te dimos acceso a la beta. Entrá con este email, creá tu workspace y conectá Meta para lanzar tus primeros anuncios, siempre en pausa y bajo tu control.",
    ],
    action: { label: "Ir a Lanzador", url: `${appOrigin}/login` },
    note: "Entrás con un link por email: no hace falta contraseña.",
  });
