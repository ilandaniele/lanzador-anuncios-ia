import { describe, expect, it } from "vitest";
import {
  AI_NEURON_RATES,
  measureAiUsage,
  rateFor,
} from "../../../src/shared/ai-neuron-rates";

const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

describe("measureAiUsage", () => {
  it("prices input and output tokens with the model rate", () => {
    expect(measureAiUsage(TEXT_MODEL, 1_000_000, 1_000_000)).toEqual({
      model: TEXT_MODEL,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      neurons: 26_668 + 204_805,
    });
  });

  it("rounds partial neurons up so a call never costs zero", () => {
    expect(measureAiUsage(TEXT_MODEL, 1, 0).neurons).toBe(1);
    expect(measureAiUsage(TEXT_MODEL, 0, 0).neurons).toBe(0);
  });

  it("charges an unknown model the highest input and output rates", () => {
    const usage = measureAiUsage("@cf/unknown/model", 1_000_000, 1_000_000);
    const rates = Object.values(AI_NEURON_RATES);
    expect(usage.neurons).toBe(
      Math.max(...rates.map((rate) => rate.inputPerMillionTokens)) +
        Math.max(...rates.map((rate) => rate.outputPerMillionTokens)),
    );
  });
});

describe("rateFor", () => {
  it("never returns a rate below any known model", () => {
    const unknown = rateFor("@cf/unknown/model");
    for (const rate of Object.values(AI_NEURON_RATES)) {
      expect(unknown.inputPerMillionTokens).toBeGreaterThanOrEqual(
        rate.inputPerMillionTokens,
      );
      expect(unknown.outputPerMillionTokens).toBeGreaterThanOrEqual(
        rate.outputPerMillionTokens,
      );
    }
  });
});
