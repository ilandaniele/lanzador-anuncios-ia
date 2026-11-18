import { INVITABLE_ROLES } from "../../../shared/constants";
import { t } from "../../i18n/es-AR";

export const roleOptions = INVITABLE_ROLES.map((role) => ({
  value: role,
  label: t(`roles.${role}`),
}));
