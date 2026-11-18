import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import type { StatusTone } from "../../components/Chip";
import { t } from "../../i18n/es-AR";

export function proposalTitle({
  action,
  level,
  percent,
}: Pick<PilotProposalDto, "action" | "level" | "percent">): string {
  switch (action) {
    case "pause":
      return t(`pilot.action.pause.${level}`);
    case "scale":
      return `${t("pilot.action.scale")}${percent === null ? "" : ` +${percent} %`}`;
    case "duplicate":
      return t("pilot.action.duplicate");
  }
}

const STATUS_TONE: Record<PilotProposalDto["status"], StatusTone> = {
  pending: "draft",
  executing: "progress",
  executed: "ready",
  dismissed: "paused",
  failed: "error",
  expired: "paused",
};

export const proposalStatusTone = (status: PilotProposalDto["status"]) =>
  STATUS_TONE[status];

export const isApproved = ({ status }: Pick<PilotProposalDto, "status">) =>
  status === "executed";

export const decidedTime = (decidedAt: string | null) =>
  new Date(decidedAt ?? Date.now()).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
