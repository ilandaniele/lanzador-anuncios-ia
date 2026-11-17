import type { InvitableRole } from "../../shared/constants";
import { renderEmail, type EmailContent } from "./layout";

interface InvitationEmailInput {
  appOrigin: string;
  token: string;
  workspaceName: string;
  inviterEmail: string;
  role: InvitableRole;
}

const ROLE_LABELS: Record<InvitableRole, string> = {
  admin: "administrador",
  editor: "editor",
  viewer: "lector",
};

export const buildInvitationEmail = ({
  appOrigin,
  token,
  workspaceName,
  inviterEmail,
  role,
}: InvitationEmailInput): EmailContent =>
  renderEmail({
    subject: `Te invitaron a ${workspaceName} en Lanzador`,
    heading: `Te invitaron a ${workspaceName}`,
    paragraphs: [
      `${inviterEmail} te invitó a sumarte al workspace ${workspaceName} como ${ROLE_LABELS[role]}.`,
      "La invitación vence en 7 días.",
    ],
    action: {
      label: "Aceptar invitación",
      url: `${appOrigin}/invitacion#t=${token}`,
    },
    note: "Si no esperabas esta invitación, ignorá este email.",
  });
