import type { Env } from "../../env";
import type { Scope } from "../../repositories/scope";

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

export const firstSegmentParams = (
  { workspaceId, userId }: Scope,
  launchId: string,
  attempt: number,
): LaunchParams => ({ launchId, workspaceId, userId, attempt, segment: 0 });

export async function createInstanceOnce<P>(
  binding: Workflow<P>,
  id: string,
  params: P,
): Promise<string> {
  try {
    await binding.create({ id, params });
  } catch (error) {
    await binding.get(id).catch(() => {
      throw error;
    });
  }
  return id;
}

export const createLaunchInstance = (
  env: Pick<Env, "LAUNCH_WF">,
  params: LaunchParams,
): Promise<string> =>
  createInstanceOnce(
    env.LAUNCH_WF as Workflow<LaunchParams>,
    launchInstanceId(params),
    params,
  );
