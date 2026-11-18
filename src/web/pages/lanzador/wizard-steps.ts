import type { ComponentType } from "react";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { isProductStepComplete } from "../../features/launch/product-completion";
import { isAccountStepComplete } from "../../features/launch/step-completion";
import type { StepProps } from "../../features/launch/step-types";
import { isStructureStepComplete } from "../../features/launch/structure-completion";
import type { TextKey } from "../../i18n/es-AR";
import { Step1Account } from "./Step1Account";
import { Step2Structure } from "./Step2Structure";
import { Step3Product } from "./Step3Product";

export type WizardStep = {
  label: TextKey;
  Component: ComponentType<StepProps> | null;
  isComplete: (draft: PartialLaunchDraft) => boolean;
};

const notBuilt = (label: TextKey): WizardStep => ({
  label,
  Component: null,
  isComplete: () => false,
});

export const WIZARD_STEPS: WizardStep[] = [
  {
    label: "launcher.steps.account",
    Component: Step1Account,
    isComplete: isAccountStepComplete,
  },
  {
    label: "launcher.steps.structure",
    Component: Step2Structure,
    isComplete: isStructureStepComplete,
  },
  {
    label: "launcher.steps.product",
    Component: Step3Product,
    isComplete: isProductStepComplete,
  },
  notBuilt("launcher.steps.creatives"),
  notBuilt("launcher.steps.budget"),
  notBuilt("launcher.steps.review"),
];
