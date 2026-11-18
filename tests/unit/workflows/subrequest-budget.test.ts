import { describe, expect, it } from "vitest";
import {
  CONTINUATION_THRESHOLD,
  SubrequestBudget,
} from "../../../src/workflows/lib/subrequest-budget";

describe("SubrequestBudget", () => {
  it("asks for continuation at 45 calls", () => {
    const budget = new SubrequestBudget();
    for (let call = 1; call < 45; call++) budget.charge();
    expect(budget.needsContinuation()).toBe(false);
    budget.charge();
    expect(budget.used).toBe(45);
    expect(budget.needsContinuation()).toBe(true);
    expect(CONTINUATION_THRESHOLD).toBe(45);
  });

  it("counts weighted charges", () => {
    const budget = new SubrequestBudget();
    budget.charge(44);
    expect(budget.needsContinuation()).toBe(false);
    budget.charge(1);
    expect(budget.needsContinuation()).toBe(true);
  });
});
