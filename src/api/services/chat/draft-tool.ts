import { launchDraftSchema } from "../../../shared/schemas/launch";
import { createLaunchDraft } from "../launch/drafts";
import { defineTool, toolError } from "./tool-kit";

export const createLaunchDraftTool = defineTool({
  name: "create_launch_draft",
  description:
    "Crea un borrador de lanzamiento en pausa para que el usuario lo revise. No publica nada en Meta. driveFolderHint guarda la carpeta de Drive que mencionó el usuario.",
  args: launchDraftSchema,
  async run(context, draft) {
    if (context.draftLaunchId) return toolError("draft_already_created");
    const { launch } = await createLaunchDraft(
      context.env.DB,
      context.scope,
      draft,
      "chat",
    );
    context.draftLaunchId = launch.id;
    return { launchId: launch.id, status: launch.status };
  },
});
