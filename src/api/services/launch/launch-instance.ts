import type { Env } from "../../env";

export interface LaunchParams {
  launchId: string;
  workspaceId: string;
  userId: string;
  attempt: number;
  segment: number;
}

export const launchInstanceId = ({
  launchId,
  attempt,
  segment,
}: Pick<LaunchParams, "launchId" | "attempt" | "segment">) =>
  segment === 0
    ? `launch-${launchId}-${attempt}`
    : `launch-${launchId}-${attempt}-${segment}`;

export async function createLaunchInstance(
  env: Pick<Env, "LAUNCH_WF">,
  params: LaunchParams,
): Promise<string> {
  const binding = env.LAUNCH_WF as Workflow<LaunchParams>;
  const id = launchInstanceId(params);
  try {
    await binding.create({ id, params });
  } catch (error) {
    await binding.get(id).catch(() => {
      throw error;
    });
  }
  return id;
}
