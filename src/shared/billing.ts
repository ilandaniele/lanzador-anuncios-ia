export const FREE_PLAN_ID = "beta";
export const TRIAL_PLAN_ID = "starter";
export const PAID_PLAN_IDS = ["starter", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export const SUBSCRIPTION_STATUSES = [
  "pending",
  "authorized",
  "paused",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_MS = TRIAL_DAYS * DAY_MS;
export const AUTHORIZATION_GRACE_DAYS = 3;
export const AUTHORIZATION_GRACE_MS = AUTHORIZATION_GRACE_DAYS * DAY_MS;
export const RENEWAL_SLACK_DAYS = 2;
export const RENEWAL_SLACK_MS = RENEWAL_SLACK_DAYS * DAY_MS;

export type BillingState = {
  planId: string;
  trialEndsAt: number | null;
  firstAuthorizedAt: number | null;
  paidUntil: number | null;
};

export const isAuthorizationGraceActive = (
  { firstAuthorizedAt, paidUntil }: BillingState,
  at: number,
): boolean =>
  paidUntil === null && (firstAuthorizedAt ?? 0) + AUTHORIZATION_GRACE_MS > at;

export const isBillingBlocked = (state: BillingState, at: number): boolean =>
  state.planId !== FREE_PLAN_ID &&
  !isAuthorizationGraceActive(state, at) &&
  !((state.paidUntil ?? 0) + RENEWAL_SLACK_MS > at) &&
  !((state.trialEndsAt ?? 0) > at);

export const trialDaysLeft = (
  trialEndsAt: number | null,
  at: number,
): number =>
  trialEndsAt === null
    ? 0
    : Math.max(0, Math.ceil((trialEndsAt - at) / DAY_MS));
