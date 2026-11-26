import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_GRACE_MS,
  type BillingState,
  isBillingBlocked,
  RENEWAL_SLACK_MS,
  TRIAL_MS,
  trialDaysLeft,
} from "../../../src/shared/billing";

const AT = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const state = (overrides: Partial<BillingState> = {}): BillingState => ({
  planId: "starter",
  trialEndsAt: null,
  firstAuthorizedAt: null,
  paidUntil: null,
  ...overrides,
});

describe("isBillingBlocked", () => {
  it.each<[string, Partial<BillingState>, boolean]>([
    ["beta without trial", { planId: "beta" }, false],
    [
      "beta with an expired trial",
      { planId: "beta", trialEndsAt: AT - 1 },
      false,
    ],
    ["starter with a future trial", { trialEndsAt: AT + DAY }, false],
    ["starter with a past trial", { trialEndsAt: AT - DAY }, true],
    ["starter whose trial ends right now", { trialEndsAt: AT }, true],
    ["starter without trial or subscription", {}, true],
    [
      "subscription authorized within the grace window",
      {
        firstAuthorizedAt: AT - AUTHORIZATION_GRACE_MS + 1,
        trialEndsAt: AT - DAY,
      },
      false,
    ],
    [
      "pro subscription just authorized",
      { planId: "pro", firstAuthorizedAt: AT },
      false,
    ],
    [
      "subscription authorized exactly at the grace limit",
      { firstAuthorizedAt: AT - AUTHORIZATION_GRACE_MS },
      true,
    ],
    [
      "authorized long ago without a charge",
      { firstAuthorizedAt: AT - 30 * DAY, trialEndsAt: AT - DAY },
      true,
    ],
    [
      "authorized long ago with a paidUntil in the future",
      { firstAuthorizedAt: AT - 30 * DAY, paidUntil: AT + DAY },
      false,
    ],
    ["future paidUntil", { paidUntil: AT + DAY }, false],
    ["paidUntil within the renewal slack", { paidUntil: AT - DAY }, false],
    [
      "paidUntil just inside the renewal slack",
      { paidUntil: AT - RENEWAL_SLACK_MS + 1 },
      false,
    ],
    [
      "paidUntil exactly at the renewal slack limit",
      { paidUntil: AT - RENEWAL_SLACK_MS },
      true,
    ],
    ["paidUntil long past", { paidUntil: AT - 30 * DAY }, true],
    [
      "grace denied once a charge happened",
      { firstAuthorizedAt: AT - DAY, paidUntil: AT - 30 * DAY },
      true,
    ],
    [
      "grace measured from the first authorization, not the latest",
      { firstAuthorizedAt: AT - 10 * DAY, trialEndsAt: AT - DAY },
      true,
    ],
    [
      "pending subscription only",
      { firstAuthorizedAt: null, paidUntil: null },
      true,
    ],
  ])("%s", (_label, overrides, blocked) => {
    expect(isBillingBlocked(state(overrides), AT)).toBe(blocked);
  });
});

describe("trialDaysLeft", () => {
  it("returns 0 without a trial", () => {
    expect(trialDaysLeft(null, AT)).toBe(0);
  });

  it("returns 0 once the trial is over", () => {
    expect(trialDaysLeft(AT - DAY, AT)).toBe(0);
    expect(trialDaysLeft(AT, AT)).toBe(0);
  });

  it("rounds a partial day up", () => {
    expect(trialDaysLeft(AT + 1, AT)).toBe(1);
  });

  it("returns 7 for a fresh trial", () => {
    expect(trialDaysLeft(AT + TRIAL_MS, AT)).toBe(7);
  });
});
