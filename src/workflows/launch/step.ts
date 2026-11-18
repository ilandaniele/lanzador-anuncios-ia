import { NonRetryableError } from "cloudflare:workflows";
import { GuardrailError } from "../../api/integrations/meta/write";
import { AppError } from "../../api/lib/errors";
import {
  type MetaStepOptions,
  type MetaStepRunner,
  runMetaStep,
} from "../lib/meta-step";

function stopRetrying(error: unknown): never {
  if (error instanceof AppError) throw new NonRetryableError(error.code);
  if (error instanceof GuardrailError) throw new NonRetryableError("INTERNAL");
  throw error;
}

export function runLaunchStep<T extends Rpc.Serializable<T>>(
  step: MetaStepRunner,
  name: string,
  run: () => Promise<T>,
  options: MetaStepOptions,
): Promise<T> {
  return runMetaStep(step, name, () => run().catch(stopRetrying), options);
}
