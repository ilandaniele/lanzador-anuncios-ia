import { renderEmail, type EmailContent } from "./layout";

interface MagicLinkEmailInput {
  appOrigin: string;
  token: string;
}

export const buildMagicLinkEmail = ({
  appOrigin,
  token,
}: MagicLinkEmailInput): EmailContent =>
  renderEmail({
    subject: "Tu link para entrar a Lanzador",
    heading: "Entrá a Lanzador",
    paragraphs: [
      "Tocá el botón para entrar. El link se puede usar una sola vez y vence en 15 minutos.",
    ],
    action: {
      label: "Entrar",
      url: `${appOrigin}/ingresar/confirmar#t=${token}`,
    },
    note: "Si no pediste este email, ignoralo: nadie puede entrar sin el link.",
  });
