import type { AssetDto } from "../../../shared/schemas/meta-connections";
import type { StatusTone } from "../../components/Chip";
import type { TextKey } from "../../i18n/es-AR";

const LAUNCH_CURRENCY = "USD";
const ELIGIBLE_STATUSES = [1, 201];
const DISABLED_STATUS = 2;
const PAYMENT_STATUSES = [3, 8, 9];

type BlockedKind = "disabled" | "payment" | "inactive" | "currency";

export type AccountHealth = {
  tone: StatusTone;
  label: TextKey;
  blockReason?: TextKey;
};

const blocked = (kind: BlockedKind): AccountHealth => ({
  tone: "error",
  label: `launcher.account.health.${kind}`,
  blockReason: `launcher.account.blocked.${kind}`,
});

export function accountHealth({ health, currency }: AssetDto): AccountHealth {
  const { accountStatus, fundingOk } = health;
  if (accountStatus === DISABLED_STATUS) return blocked("disabled");
  if (
    fundingOk === false ||
    (accountStatus !== null && PAYMENT_STATUSES.includes(accountStatus))
  )
    return blocked("payment");
  if (accountStatus !== null && !ELIGIBLE_STATUSES.includes(accountStatus))
    return blocked("inactive");
  if (currency !== null && currency !== LAUNCH_CURRENCY)
    return blocked("currency");
  if (accountStatus === null)
    return { tone: "warn", label: "launcher.account.health.unknown" };
  return { tone: "ready", label: "launcher.account.health.ok" };
}
