import { useState, type FormEvent } from "react";
import { workspaceNameRequestSchema } from "../../../shared/schemas/workspaces";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import { ApiError } from "../../lib/api";
import { t } from "../../i18n/es-AR";
import { OnboardingLayout } from "./OnboardingLayout";
import { useCreateWorkspace } from "./use-create-workspace";

function createErrorMessage(error: unknown) {
  const limitReached =
    error instanceof ApiError && error.code === "WORKSPACE_LIMIT";
  return t(limitReached ? "onboarding.errorWorkspaceLimit" : "errors.generic");
}

export function WorkspaceNameStep() {
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const create = useCreateWorkspace();

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = workspaceNameRequestSchema.safeParse({ name });
    setInvalid(!parsed.success);
    if (parsed.success) create.mutate(parsed.data.name);
  }

  return (
    <OnboardingLayout currentIndex={0}>
      {create.isError && (
        <p role="alert" className="rounded-sm bg-loss-soft p-3 text-ink">
          {createErrorMessage(create.error)}
        </p>
      )}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label={t("onboarding.nameLabel")}
          required
          autoComplete="organization"
          value={name}
          error={invalid ? t("onboarding.nameRequired") : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <div>
          <Button
            type="submit"
            loading={create.isPending}
            loadingLabel={t("onboarding.creating")}
          >
            {t("onboarding.createWorkspace")}
          </Button>
        </div>
      </form>
    </OnboardingLayout>
  );
}
