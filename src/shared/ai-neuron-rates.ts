export type NeuronRate = {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type AiCallUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  neurons: number;
};

const TOKENS_PER_MILLION = 1_000_000;

export const AI_NEURON_RATES: Readonly<Record<string, NeuronRate>> = {
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
    inputPerMillionTokens: 26_668,
    outputPerMillionTokens: 204_805,
  },
  "@cf/meta/llama-4-scout-17b-16e-instruct": {
    inputPerMillionTokens: 24_545,
    outputPerMillionTokens: 77_273,
  },
};

const HIGHEST_RATE: NeuronRate = Object.values(AI_NEURON_RATES).reduce(
  (highest, rate) => ({
    inputPerMillionTokens: Math.max(
      highest.inputPerMillionTokens,
      rate.inputPerMillionTokens,
    ),
    outputPerMillionTokens: Math.max(
      highest.outputPerMillionTokens,
      rate.outputPerMillionTokens,
    ),
  }),
);

export const rateFor = (model: string): NeuronRate =>
  AI_NEURON_RATES[model] ?? HIGHEST_RATE;

export function measureAiUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
): AiCallUsage {
  const rate = rateFor(model);
  const neurons = Math.ceil(
    (inputTokens * rate.inputPerMillionTokens +
      outputTokens * rate.outputPerMillionTokens) /
      TOKENS_PER_MILLION,
  );
  return { model, inputTokens, outputTokens, neurons };
}
