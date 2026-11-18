import type { ComponentType } from "react";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { isAccountStepComplete } from "../../features/launch/step-completion";
import type { StepProps } from "../../features/launch/step-types";
import type { TextKey } from "../../i18n/es-AR";
import { Step1Account } from "./Step1Account";

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
  notBuilt("launcher.steps.structure"),
  notBuilt("launcher.steps.product"),
  notBuilt("launcher.steps.creatives"),
  notBuilt("launcher.steps.budget"),
  notBuilt("launcher.steps.review"),
];
