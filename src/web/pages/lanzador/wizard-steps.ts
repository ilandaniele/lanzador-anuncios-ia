import type { ComponentType } from "react";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { isBudgetStepComplete } from "../../features/launch/budget-completion";
import { isCreativesStepComplete } from "../../features/launch/creatives-completion";
import { isProductStepComplete } from "../../features/launch/product-completion";
import { isAccountStepComplete } from "../../features/launch/step-completion";
import type { StepProps } from "../../features/launch/step-types";
import { isStructureStepComplete } from "../../features/launch/structure-completion";
import type { TextKey } from "../../i18n/es-AR";
import { Step1Account } from "./Step1Account";
import { Step2Structure } from "./Step2Structure";
import { Step3Product } from "./Step3Product";
import { Step4Creatives } from "./Step4Creatives";
import { Step5Budget } from "./Step5Budget";
import { Step6Review } from "./Step6Review";

export type WizardStep = {
  label: TextKey;
  Component: ComponentType<StepProps> | null;
  isComplete: (draft: PartialLaunchDraft) => boolean;
};

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
  {
    label: "launcher.steps.creatives",
    Component: Step4Creatives,
    isComplete: isCreativesStepComplete,
  },
  {
    label: "launcher.steps.budget",
    Component: Step5Budget,
    isComplete: isBudgetStepComplete,
  },
  {
    label: "launcher.steps.review",
    Component: Step6Review,
    isComplete: () => false,
  },
];
